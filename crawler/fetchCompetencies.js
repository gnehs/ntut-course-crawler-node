const cheerio = require("cheerio");
const jsonfile = require("jsonfile");
const fs = require("fs");
const { fetchSinglePage } = require("./fetchSinglePage");
const pangu = require("./tools/pangu").spacing;

const BASE_URL = "https://aps.ntut.edu.tw/course/tw/";
const APS_HOSTNAME = "aps.ntut.edu.tw";
const ENTRY_URL = `${BASE_URL}CurrCCI.jsp?format=-1`;

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
  return /查無|目前(?:沒有|無)|尚未(?:提供|發布)|無(?:任何)?(?:資料|課程|能力指標)/.test(
    documentText($)
  );
}

function assertCompetencyEntryPage($) {
  if (hasErrorPage($)) {
    throw new Error("核心能力入口回傳錯誤或登入頁，停止更新 competencies.json");
  }
  const title = normalizeText($("title").text());
  if (!title.includes("課程能力指標") || $("table").length === 0) {
    throw new Error("核心能力入口格式無法辨識，停止更新 competencies.json");
  }
  if (discoverCompetencyDepartments($).length === 0 && !hasExplicitEmptyState($)) {
    throw new Error("核心能力入口缺少系所連結，停止更新 competencies.json");
  }
}

function assertCompetencyDetailPage($, table) {
  if (hasErrorPage($)) {
    throw new Error("核心能力明細回傳錯誤或登入頁，停止更新 competencies.json");
  }
  if (table.length === 0 && !hasExplicitEmptyState($)) {
    throw new Error("核心能力明細缺少矩陣表，停止更新 competencies.json");
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

function discoverCompetencyDepartments(page) {
  const $ = asDocument(page);
  const departments = [];
  const seen = new Set();

  $("a[href]").each((_, anchor) => {
    const absoluteHref = toAbsoluteHttpsUrl($(anchor).attr("href"));
    if (!absoluteHref) return;
    const url = new URL(absoluteHref);
    if (!/\/CurrCCI\.jsp$/i.test(url.pathname)) return;
    if (url.searchParams.get("format") !== "-2") return;
    const id = url.searchParams.get("code");
    if (!id || seen.has(id)) return;
    seen.add(id);
    departments.push({ id, name: normalizeText($(anchor).text()), href: absoluteHref });
  });
  return departments;
}

function findCompetencyTable($) {
  return $("table")
    .filter((_, table) => {
      const headerText = normalizeText($(table).find("tr").first().text());
      return headerText.includes("課程編碼") && headerText.includes("課程名稱");
    })
    .first();
}

function parseAbilityHeader(text, index) {
  const label = normalizeText(text);
  const match = label.match(/^([A-Za-zＡ-Ｚａ-ｚ]|\d+)\s*[.．、:：]\s*(.+)$/);
  if (match) {
    return { id: match[1], name: normalizeText(match[2]) };
  }
  return { id: String(index + 1), name: label };
}

function isAbilityMarker(value) {
  return normalizeText(value) !== "";
}

function getHeaderRows($, table) {
  const rows = $(table).find("tr").toArray();
  const firstHeaderIndex = rows.findIndex((row) =>
    $(row)
      .find("th")
      .toArray()
      .some((cell) => normalizeText($(cell).text()) === "課程編碼")
  );
  if (firstHeaderIndex < 0) return { rows, firstHeaderIndex: -1, abilityHeader: null };

  const abilityHeader =
    rows.slice(firstHeaderIndex + 1).find((row) => {
      const cells = $(row).find("th").toArray();
      return (
        cells.length > 0 &&
        cells.every((cell) => {
          const text = normalizeText($(cell).text());
          return text !== "序號" && text !== "課程編碼" && text !== "課程名稱";
        })
      );
    }) ?? null;
  return { rows, firstHeaderIndex, abilityHeader };
}

function parseCompetencyPage(page) {
  const $ = asDocument(page);
  const table = findCompetencyTable($);
  assertCompetencyDetailPage($, table);
  const { rows, firstHeaderIndex, abilityHeader } = getHeaderRows($, table);
  if (firstHeaderIndex < 0 && !hasExplicitEmptyState($)) {
    throw new Error("核心能力明細表頭無法解析，停止更新 competencies.json");
  }
  const abilities = [];
  if (abilityHeader) {
    $(abilityHeader)
      .find("th")
      .each((index, cell) => {
        const label = normalizeText($(cell).text());
        if (label) abilities.push(parseAbilityHeader(label, index));
      });
  }

  const courses = [];
  const coursesByCode = new Map();
  for (const row of rows.slice(firstHeaderIndex + 1)) {
    if ($(row).find("th").length) continue;
    const cells = $(row).children("td").toArray();
    if (cells.length < 3) continue;
    const code = normalizeText($(cells[1]).text());
    const name = normalizeText($(cells[2]).text());
    if (!code || !name) continue;
    const abilityIds = abilities
      .map((ability, index) => ({ ability, cell: cells[index + 3] }))
      .filter(({ cell }) => cell && isAbilityMarker($(cell).text()))
      .map(({ ability }) => ability.id);
    const existing = coursesByCode.get(code);
    if (existing) {
      existing.abilityIds = [...new Set([...existing.abilityIds, ...abilityIds])];
      continue;
    }
    const course = { code, name, abilityIds };
    coursesByCode.set(code, course);
    courses.push(course);
  }

  const dataRowCount = table.find("tr").filter((_, row) => $(row).children("td").length > 0).length;
  if (
    dataRowCount > 0 &&
    (abilities.length === 0 || courses.length === 0) &&
    !hasExplicitEmptyState($)
  ) {
    throw new Error("核心能力明細課程列無法解析，停止更新 competencies.json");
  }

  const title = normalizeText($("h2").first().text()).replace(/\s*課程能力指標\s*$/, "");
  return { abilities, courses, title };
}

function getInjectedPage(pages, department) {
  if (!pages) return null;
  if (pages instanceof Map) {
    return pages.get(department.id) ?? pages.get(department.href) ?? null;
  }
  return pages[department.id] ?? pages[department.href] ?? null;
}

async function fetchCompetencies(
  listPage = null,
  departmentPages = {},
  fetchPage = fetchSinglePage
) {
  const entryDocument = listPage == null ? await fetchPage(ENTRY_URL) : asDocument(listPage);
  assertCompetencyEntryPage(entryDocument);
  const discoveredDepartments = discoverCompetencyDepartments(entryDocument);
  const result = [];

  let progress = 0;
  for (const department of discoveredDepartments) {
    progress += 1;
    console.log(
      `[fetch] 正在取得核心能力 (${progress}/${discoveredDepartments.length}) ${department.name}`
    );
    const injectedPage = getInjectedPage(departmentPages, department);
    const detailDocument =
      injectedPage == null ? await fetchPage(department.href) : asDocument(injectedPage);
    const parsed = parseCompetencyPage(detailDocument);
    result.push({
      id: department.id,
      name: department.name || parsed.title,
      href: department.href,
      abilities: parsed.abilities,
      courses: parsed.courses,
    });
  }

  fs.mkdirSync("./dist/", { recursive: true });
  jsonfile.writeFileSync("./dist/competencies.json", result, {
    spaces: 2,
    EOL: "\r\n",
  });
  return result;
}

module.exports = {
  discoverCompetencyDepartments,
  parseCompetencyPage,
  fetchCompetencies,
};
