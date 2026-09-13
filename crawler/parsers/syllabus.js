const cheerio = require("cheerio");
const pangu = require("../tools/pangu").spacing;

const SYLLABUS_PAGE_BASE = "https://aps.ntut.edu.tw/course/mobile/";
const APS_HOSTNAME = "aps.ntut.edu.tw";

const SYLLABUS_FIELD_MAP = {
  教師姓名: "name",
  Email: "email",
  最後更新時間: "latestUpdate",
  課程大綱: "objective",
  課程進度: "schedule",
  評量方式與標準: "scorePolicy",
  "使用教材、參考書目或其他": "materials",
  課程諮詢管道: "consultation",
  備註: "remarks",
};

const STANDARD_FIELDS = [
  "name",
  "email",
  "latestUpdate",
  "objective",
  "schedule",
  "scorePolicy",
  "materials",
  "consultation",
  "remarks",
];

const SYLLABUS_CONTENT_KEYS = new Set([
  "objective",
  "schedule",
  "scorePolicy",
  "materials",
  "consultation",
  "remarks",
  "延伸教學與資源",
  "課程對應SDGs指標",
  "課程是否導入AI",
  "課程進度(1-16週)",
  "彈性學習(17-18週)",
  "類別",
  "內容",
  "時數(小時)",
  "學習成果",
  "評量比例",
]);

function normaliseLabel(value) {
  return String(value ?? "")
    .replace(/[\u0009\u000a\u000d\u0020\u00a0\u3000]+/g, "")
    .trim();
}

function normaliseMultiline(value) {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .trim();
}

function getPage(page) {
  if (typeof page === "string" || Buffer.isBuffer(page)) {
    return cheerio.load(page);
  }
  if (typeof page === "function") return page;
  throw new TypeError("Expected syllabus HTML or a Cheerio document");
}

function cellText($, cell) {
  const clone = $(cell).clone();
  clone.find("br").each((_, element) => $(element).replaceWith("\n"));
  return normaliseMultiline(clone.text());
}

function findSyllabusTable($) {
  const tables = $("table").toArray();
  const getLabels = (table) =>
    $(table)
      .find("tr")
      .toArray()
      .map((row) => normaliseLabel($(row).children("th,td").first().text()));
  return (
    tables.find((table) => {
      const labels = getLabels(table);
      return labels.includes("教師姓名") && labels.includes("課程大綱");
    }) || tables.find((table) => getLabels(table).includes("課程大綱"))
  );
}

function toOfficeHoursLink(href) {
  if (!href) return undefined;
  try {
    const url = new URL(href, SYLLABUS_PAGE_BASE);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.hostname !== APS_HOSTNAME
    ) {
      return undefined;
    }
    if (!/\/course\/mobile\/Teach\.jsp$/i.test(url.pathname)) return undefined;
    if (url.searchParams.get("format") !== "-6") return undefined;
    return url.href;
  } catch (error) {
    return undefined;
  }
}

function extractOfficeHoursLink($, row) {
  for (const anchor of $(row).find("a[href]").toArray()) {
    const link = toOfficeHoursLink($(anchor).attr("href"));
    if (link) return link;
  }
  return undefined;
}

function removeOfficeHoursLabel(value) {
  return normaliseMultiline(
    String(value ?? "").replace(
      /教師諮商時間\s*\(\s*Office\s+Hours\s*\)/gi,
      ""
    )
  );
}

function parseForeignLanguageTextbooks(materials) {
  const text = normaliseMultiline(materials);
  const marker = text.match(/使用外文原文書\s*[：:]\s*([^\n]*)/u);
  let value = null;
  if (marker) {
    const answer = marker[1].trim();
    if (/^是(?:$|\s|[（(])/u.test(answer)) value = true;
    if (/^否(?:$|\s|[（(])/u.test(answer)) value = false;
  }
  const cleanedMaterials = marker
    ? normaliseMultiline(text.replace(marker[0], ""))
    : text;
  return { value, materials: cleanedMaterials };
}

function parseCovid19($, table) {
  const remarksRow = $(table)
    .find("tr")
    .toArray()
    .find(
      (row) =>
        normaliseLabel($(row).children("th,td").first().text()) === "備註"
    );
  if (!remarksRow) return undefined;
  const valueCell = $(remarksRow).children("th,td").eq(1);
  const text = cellText($, valueCell);
  if (!text.includes("本學期課程因應疫情警戒等級")) return undefined;

  const covidDatas = $(valueCell)
    .find("div")
    .toArray()
    .map((element) => cellText($, element));
  const result = {
    lv2Description: covidDatas[0] || null,
    courseScoreMethod: covidDatas[1] || null,
    courseInfo: covidDatas[2] || null,
    courseURL: covidDatas[3] || null,
    contactInfo: covidDatas[4] || null,
    additionalInfo: covidDatas[5] || null,
  };
  const method = text.match(/●\s*上課方式：([^\n]*)/u);
  if (method) result.lv2Method = normaliseMultiline(method[1]);
  return result;
}

function parseSyllabusHtml(page) {
  const $ = getPage(page);
  const table = findSyllabusTable($);
  if (!table) {
    throw new Error("Unable to find the APS syllabus table");
  }

  const result = {};
  let officeHoursLink;
  for (const row of $(table).find("tr").toArray()) {
    const cells = $(row).children("th,td");
    if (cells.length < 2) continue;
    const label = normaliseLabel($(cells[0]).text());
    if (!label) continue;
    const value = cellText($, cells[1]);
    const key = SYLLABUS_FIELD_MAP[label] || label;
    result[key] = value;
    if (label === "教師姓名") {
      officeHoursLink = extractOfficeHoursLink($, row);
      result.name = removeOfficeHoursLabel(value);
    }
  }

  for (const field of STANDARD_FIELDS) {
    if (result[field] === undefined) result[field] = "";
  }

  const foreignLanguage = parseForeignLanguageTextbooks(result.materials);
  result.materials = foreignLanguage.materials;
  result.foreignLanguageTextbooks = foreignLanguage.value;
  result.remarks = normaliseMultiline(result.remarks)
    .replace(
      /因應疫情發展，本學期教學及授課方式請依照學校網頁所公布的訊息為準：\s*/u,
      ""
    )
    .replace(/\(https?[^)]*?ntut\.edu\.tw[^)]*\)\s*/giu, "")
    .trim();
  if (officeHoursLink) result.officeHoursLink = officeHoursLink;

  for (const key of Object.keys(result)) {
    if (typeof result[key] === "string") result[key] = pangu(result[key]);
  }

  const covid19 = parseCovid19($, table);
  if (covid19) {
    for (const key of Object.keys(covid19)) {
      if (typeof covid19[key] === "string") covid19[key] = pangu(covid19[key]);
    }
    result.covid19 = covid19;
  }
  return result;
}

function isNoneOption(value) {
  const compact = normaliseMultiline(value)
    .replace(/^●\s*/u, "")
    .replace(/[ \t\n]+/g, " ")
    .trim();
  return /^(?:無|none)(?:\s*[（(]\s*none\s*[)）])?$/iu.test(compact);
}

/**
 * Split the checkbox-style values used by the AI and resource rows.  The
 * bullet is a source separator, so text after it (including the school's
 * bilingual explanation) stays with that option.  The exact None option is
 * omitted; a real option that merely contains the word "None" is retained.
 */
function splitSyllabusOptions(value) {
  if (Array.isArray(value)) value = value.join("\n");
  const text = normaliseMultiline(value);
  if (!text) return [];
  const pieces = text.includes("●") ? text.split("●") : [text];
  return pieces
    .map((piece) => normaliseMultiline(piece))
    .filter((piece) => piece && !isNoneOption(piece));
}

function parseSdgNumbers(value) {
  const numbers = new Set();
  for (const match of String(value ?? "").matchAll(/SDG\s*(\d{1,2})/giu)) {
    const number = Number(match[1]);
    if (number >= 1 && number <= 17) numbers.add(number);
  }
  return [...numbers].sort((a, b) => a - b);
}

function hasMeaningfulSyllabusValue(key, value) {
  if (key === "課程對應SDGs指標") return parseSdgNumbers(value).length > 0;
  if (key === "延伸教學與資源" || key === "課程是否導入AI") {
    return splitSyllabusOptions(value).length > 0;
  }
  let text = normaliseMultiline(value);
  if (key === "materials") {
    text = text
      .replace(/【遵守智慧財產權觀念，請使用正版教科書，不得使用非法影印教科書】/u, "")
      .replace(/使用外文原文書\s*[：:][^\n]*/u, "");
  }
  return Boolean(text) && !isNoneOption(text);
}

function hasSyllabusContent(syllabus) {
  if (!syllabus || typeof syllabus !== "object") return false;
  for (const [key, value] of Object.entries(syllabus)) {
    if (!SYLLABUS_CONTENT_KEYS.has(key)) continue;
    if (typeof value === "string" && hasMeaningfulSyllabusValue(key, value)) {
      return true;
    }
    if (key === "covid19" && value && typeof value === "object") {
      if (Object.values(value).some((item) => hasMeaningfulSyllabusValue(key, item))) {
        return true;
      }
    }
  }
  const metadataKeys = new Set([
    "name",
    "email",
    "officeHoursLink",
    "latestUpdate",
    "foreignLanguageTextbooks",
    "covid19",
  ]);
  for (const [key, value] of Object.entries(syllabus)) {
    if (metadataKeys.has(key) || SYLLABUS_CONTENT_KEYS.has(key)) continue;
    if (typeof value === "string" && hasMeaningfulSyllabusValue(key, value)) {
      return true;
    }
  }
  if (syllabus.covid19 && typeof syllabus.covid19 === "object") {
    return Object.values(syllabus.covid19).some((value) => Boolean(normaliseMultiline(value)));
  }
  return false;
}

module.exports = {
  SYLLABUS_FIELD_MAP,
  hasSyllabusContent,
  normaliseMultiline,
  parseForeignLanguageTextbooks,
  parseSdgNumbers,
  parseSyllabusHtml,
  splitSyllabusOptions,
  toOfficeHoursLink,
};
