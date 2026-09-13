const cheerio = require("cheerio");
const { fetchSinglePage } = require("./fetchSinglePage");
const jsonfile = require("jsonfile");
const fs = require("fs");
const pangu = require("./tools/pangu").spacing;

const BASE_URL = "https://aps.ntut.edu.tw/course/tw/";
const APS_HOSTNAME = "aps.ntut.edu.tw";

function normalizeText(value) {
  return pangu(
    String(value ?? "")
      .replace(/\u00a0/g, " ")
      .replace(/\r/g, "")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n[ \t]+/g, "\n")
      .trim()
  );
}

function asDocument(page) {
  if (typeof page === "function") return page;
  return cheerio.load(String(page ?? ""));
}

function documentText($) {
  return normalizeText($("body").text());
}

function hasErrorPage($) {
  const text = `${normalizeText($("title").text())} ${documentText($)}`;
  return /錯誤訊息|網址格式錯誤|登入|login|unauthori[sz]ed|access denied/i.test(
    text
  );
}

function hasExplicitEmptyState($) {
  return /查無|目前(?:沒有|無)|尚未(?:提供|發布)|尚無|無(?:任何)?(?:資料|課程|微學程)/.test(
    documentText($)
  );
}

function toAbsoluteHttpsUrl(href, base = BASE_URL) {
  if (!href) return null;
  let url;
  try {
    url = new URL(href, base);
  } catch (error) {
    return null;
  }
  if (url.protocol !== "https:" || url.hostname !== APS_HOSTNAME) return null;
  return url.href;
}

function discoverMPrograms(page) {
  const $ = asDocument(page);
  const programs = [];
  const seen = new Set();
  $("a[href]").each((_, anchor) => {
    const absoluteHref = toAbsoluteHttpsUrl($(anchor).attr("href"));
    if (!absoluteHref) return;
    const url = new URL(absoluteHref);
    if (!/\/SearchMProgram\.jsp$/i.test(url.pathname)) return;
    if (url.searchParams.get("format") !== "-2") return;
    const id = url.searchParams.get("code");
    if (!id || seen.has(id)) return;
    seen.add(id);
    programs.push({
      id,
      name: normalizeText($(anchor).text()),
      href: absoluteHref,
    });
  });
  return programs;
}

function assertMProgramEntryPage($) {
  if (hasErrorPage($)) {
    throw new Error("微學程入口回傳錯誤或登入頁，停止更新 mprogram.json");
  }
  const title = normalizeText($("title").text());
  const body = documentText($);
  if (!title.includes("微學程查詢專區")) {
    throw new Error("微學程入口格式無法辨識，停止更新 mprogram.json");
  }
  if (
    !body.includes("微學程開課資料暨上課時間表") &&
    !hasExplicitEmptyState($)
  ) {
    throw new Error("微學程入口格式無法辨識，停止更新 mprogram.json");
  }
}

function findMProgramCourseTable($) {
  return $("table")
    .filter((_, table) => {
      const header = normalizeText($(table).find("tr").first().text());
      return header.includes("課號") && header.includes("課程名稱");
    })
    .first();
}

function assertMProgramDetailPage($, table) {
  if (hasErrorPage($)) {
    throw new Error("微學程明細回傳錯誤或登入頁，停止更新 mprogram.json");
  }
  const title = normalizeText($("title").text());
  if (title && !title.includes("微學程查詢專區")) {
    throw new Error("微學程明細格式無法辨識，停止更新 mprogram.json");
  }
  if (table.length === 0 && !hasExplicitEmptyState($)) {
    throw new Error("微學程明細缺少課程表，停止更新 mprogram.json");
  }
}

function parseMProgramPage(page) {
  const $ = asDocument(page);
  const table = findMProgramCourseTable($);
  assertMProgramDetailPage($, table);
  const courses = [];
  const seen = new Set();
  let malformedRow = false;
  const explicitEmpty = hasExplicitEmptyState($);

  table.find("tr").each((_, row) => {
    if ($(row).find("th").length) return;
    const cells = $(row).children("td");
    if (!cells.length) return;
    const id = normalizeText(cells.first().text());
    if (!id) {
      malformedRow = true;
      return;
    }
    if (explicitEmpty && /查無|目前(?:沒有|無)|尚未(?:提供|發布)|尚無|無(?:任何)?(?:資料|課程|微學程)/.test(id)) {
      return;
    }
    if (!seen.has(id)) {
      seen.add(id);
      courses.push(id);
    }
  });

  const dataRowCount = table
    .find("tr")
    .filter((_, row) => $(row).children("td").length > 0).length;
  if (
    !explicitEmpty &&
    (malformedRow || (dataRowCount > 0 && courses.length === 0))
  ) {
    throw new Error("微學程明細課程列無法解析，停止更新 mprogram.json");
  }
  return courses;
}

async function fetchProgramCourse(href, page) {
  const absoluteHref = toAbsoluteHttpsUrl(href);
  if (!absoluteHref) {
    throw new Error("微學程明細連結不是 APS HTTPS URL");
  }
  const $ =
    page == null ? await fetchSinglePage(absoluteHref) : asDocument(page);
  return parseMProgramPage($);
}

async function fetchMProgram(
  year = 110,
  sem = 2,
  listPage = null,
  programPages = {}
) {
  console.log("[fetch] 正在取得微學程列表...");
  const $ =
    listPage == null
      ? await fetchSinglePage(
          `${BASE_URL}SearchMProgram.jsp?format=-1&year=${year}&sem=${sem}`
        )
      : asDocument(listPage);
  assertMProgramEntryPage($);
  const programs = discoverMPrograms($);
  const result = [];
  let progress = 0;
  for (const program of programs) {
    progress += 1;
    console.log(
      `[fetch] 正在取得 (${progress}/${programs.length}) ${program.name}`
    );
    const injectedPage =
      programPages instanceof Map
        ? programPages.get(program.id) ?? programPages.get(program.href)
        : programPages
          ? programPages[program.id] ?? programPages[program.href]
          : null;
    const course = await fetchProgramCourse(program.href, injectedPage);
    result.push({ ...program, course });
  }

  fs.mkdirSync(`./dist/${year}/${sem}/`, { recursive: true });
  jsonfile.writeFileSync(`./dist/${year}/${sem}/mprogram.json`, result, {
    spaces: 2,
    EOL: "\r\n",
  });
  return result;
}

module.exports = {
  discoverMPrograms,
  fetchMProgram,
  fetchProgramCourse,
  parseMProgramPage,
};
