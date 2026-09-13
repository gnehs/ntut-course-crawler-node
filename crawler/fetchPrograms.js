const cheerio = require("cheerio");
const jsonfile = require("jsonfile");
const fs = require("fs");
const { fetchSinglePage } = require("./fetchSinglePage");
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
  return /錯誤訊息|網址格式錯誤|登入|login|unauthori[sz]ed|access denied/i.test(text);
}

function hasExplicitEmptyState($) {
  return /查無|目前(?:沒有|無)|尚未(?:提供|發布)|無(?:任何)?(?:資料|課程|學程)/.test(
    documentText($)
  );
}

function assertProgramListPage($) {
  if (hasErrorPage($)) {
    throw new Error("一般學程入口回傳錯誤或登入頁，停止更新 programs.json");
  }
  const title = normalizeText($("title").text());
  const body = documentText($);
  if (
    !title.includes("學程查詢專區") ||
    !body.includes("開課資料暨上課時間表")
  ) {
    throw new Error("一般學程入口格式無法辨識，停止更新 programs.json");
  }
  if (discoverPrograms($).length === 0 && !hasExplicitEmptyState($)) {
    throw new Error("一般學程入口缺少學程連結，停止更新 programs.json");
  }
}

function assertProgramDetailPage($, table) {
  if (hasErrorPage($)) {
    throw new Error("一般學程明細回傳錯誤或登入頁，停止更新 programs.json");
  }
  if (table.length === 0 && !hasExplicitEmptyState($)) {
    throw new Error("一般學程明細缺少課程表，停止更新 programs.json");
  }
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

function findProgramCourseTable($) {
  return $("table")
    .filter((_, table) => {
      const headerText = normalizeText($(table).find("tr").first().text());
      return headerText.includes("課號") && headerText.includes("課程名稱");
    })
    .first();
}

function extractProgramDescription($) {
  const directSelectors = [
    "[data-description]",
    "#description",
    ".description",
    ".program-description",
  ];
  for (const selector of directSelectors) {
    const description = normalizeText($(selector).first().text());
    if (description) return description;
  }

  let description = "";
  $("table tr").each((_, row) => {
    if (description) return;
    const cells = $(row).children("td,th").toArray();
    if (cells.length < 2) return;
    const label = normalizeText($(cells[0]).text()).replace(/[：:]$/, "");
    if (/^(?:學程)?(?:說明|簡介|目標|修課規定)$/.test(label)) {
      description = normalizeText(cells.slice(1).map((cell) => $(cell).text()).join(" "));
    }
  });
  if (description) return description;

  $("p, li").each((_, element) => {
    if (description) return;
    const text = normalizeText($(element).text());
    const match = text.match(/^(?:學程)?(?:說明|簡介|目標|修課規定)[：:]\s*(.+)$/);
    if (match) description = normalizeText(match[1]);
  });
  return description || undefined;
}

function parseProgramPage(page) {
  const $ = asDocument(page);
  const table = findProgramCourseTable($);
  assertProgramDetailPage($, table);
  const courses = [];
  const seen = new Set();

  table.find("tr").each((_, row) => {
    if ($(row).find("th").length) return;
    const cells = $(row).children("td").toArray();
    if (!cells.length) return;
    const courseCode = normalizeText($(cells[0]).text());
    if (!courseCode || seen.has(courseCode)) return;
    seen.add(courseCode);
    courses.push(courseCode);
  });

  const dataRowCount = table.find("tr").filter((_, row) => $(row).children("td").length > 0).length;
  if (dataRowCount > 0 && courses.length === 0 && !hasExplicitEmptyState($)) {
    throw new Error("一般學程明細課程列無法解析，停止更新 programs.json");
  }

  const result = { courses };
  const description = extractProgramDescription($);
  if (description) result.description = description;
  return result;
}

function discoverPrograms(page) {
  const $ = asDocument(page);
  const programs = [];
  const seen = new Set();

  $("a[href]").each((_, anchor) => {
    const href = $(anchor).attr("href");
    const absoluteHref = toAbsoluteHttpsUrl(href);
    if (!absoluteHref) return;
    const url = new URL(absoluteHref);
    if (!/\/SearchProgram\.jsp$/i.test(url.pathname)) return;
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

function getInjectedPage(pages, program) {
  if (!pages) return null;
  if (pages instanceof Map) {
    return pages.get(program.id) ?? pages.get(program.href) ?? null;
  }
  return pages[program.id] ?? pages[program.href] ?? null;
}

async function fetchPrograms(
  year = 110,
  sem = 2,
  listPage = null,
  programPages = {},
  fetchPage = fetchSinglePage
) {
  const listUrl = `${BASE_URL}SearchProgram.jsp?format=-1&year=${year}&sem=${sem}`;
  const listDocument = listPage == null ? await fetchPage(listUrl) : asDocument(listPage);
  assertProgramListPage(listDocument);
  const discoveredPrograms = discoverPrograms(listDocument);
  const result = [];

  let progress = 0;
  for (const program of discoveredPrograms) {
    progress += 1;
    console.log(`[fetch] 正在取得 (${progress}/${discoveredPrograms.length}) ${program.name}`);
    const injectedPage = getInjectedPage(programPages, program);
    const detailDocument =
      injectedPage == null ? await fetchPage(program.href) : asDocument(injectedPage);
    const parsed = parseProgramPage(detailDocument);
    result.push({ ...program, ...parsed });
  }

  const outputDirectory = `./dist/${year}/${sem}/`;
  fs.mkdirSync(outputDirectory, { recursive: true });
  jsonfile.writeFileSync(`${outputDirectory}programs.json`, result, {
    spaces: 2,
    EOL: "\r\n",
  });
  return result;
}

module.exports = {
  discoverPrograms,
  parseProgramPage,
  fetchPrograms,
};
