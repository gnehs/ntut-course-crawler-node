const cheerio = require("cheerio");

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

  const covid19 = parseCovid19($, table);
  if (covid19) result.covid19 = covid19;
  return result;
}

module.exports = {
  SYLLABUS_FIELD_MAP,
  normaliseMultiline,
  parseForeignLanguageTextbooks,
  parseSyllabusHtml,
  toOfficeHoursLink,
};
