const cheerio = require("cheerio");
const {
  PDF_CONCURRENCY,
  cleanText,
  toOaaUrl,
  fetchPage,
  fetchPdfBytes,
  extractPdfText,
  readIntro,
  mapWithConcurrency,
  reportMissing,
  writeDocsJson,
} = require("./oaaDocs");

const SOURCE_URL = "https://oaa.ntut.edu.tw/p/412-1008-14809.php?Lang=zh-tw";
const MIN_PROGRAMS = 10;
const OUTPUT_PATH = "./dist/program-docs.json";

const APS_HOSTNAME = "aps.ntut.edu.tw";
const TRAILING_PARENTHETICAL = /\s*[(（][^()（）]*[)）]\s*$/;
const TRAILING_STATUS = /\s*\d+學年度\S*(?:廢止|停止)\S*\s*$/;
const TRAILING_STAR_NOTE = /\s*\*\s*[^*]+$/;

// The name cell mixes the program name with its lifecycle status and notes,
// as "(…)" suffixes, a bare "113學年度始廢止" line or a "*…" remark.
function programName(raw) {
  let text = cleanText(String(raw ?? "").replace(/\u00ad/g, ""));
  for (;;) {
    const match =
      text.match(TRAILING_PARENTHETICAL) ??
      text.match(TRAILING_STATUS) ??
      text.match(TRAILING_STAR_NOTE);
    if (!match || match.index === 0) break;
    text = text.slice(0, match.index).trim();
  }
  // Some cells append the English title after the Chinese name.
  return text.split(/\s+(?=[A-Za-z])/)[0].trim();
}

function apsCode($, cell) {
  for (const anchor of $(cell).find("a[href]").toArray()) {
    let url;
    try {
      url = new URL($(anchor).attr("href"), SOURCE_URL);
    } catch (error) {
      continue;
    }
    const code = url.searchParams.get("code");
    if (url.hostname === APS_HOSTNAME && code) return code;
  }
  return null;
}

function iconLinks($, cell) {
  const urls = $(cell)
    .find("a[href]")
    .toArray()
    .filter((anchor) => $(anchor).find("img").length)
    .map((anchor) => toOaaUrl($(anchor).attr("href"), SOURCE_URL))
    .filter(Boolean);
  return [...new Set(urls)];
}

function findDocsTable($) {
  return $("table")
    .filter((_, table) => {
      const header = cleanText($(table).find("tr").first().text());
      return (
        header.includes("學程名稱") &&
        header.includes("課程規劃表") &&
        header.includes("修畢申請表")
      );
    })
    .first();
}

function parseProgramDocsPage(html) {
  const $ = cheerio.load(String(html ?? ""));
  const table = findDocsTable($);
  if (!table.length) {
    throw new Error("學程文件表格找不到，停止更新 program-docs.json");
  }
  const programs = [];
  table.find("tr").each((_, row) => {
    const cells = $(row).children("td");
    if (cells.length < 5 || !/^\d+$/.test(cleanText(cells.eq(0).text()))) return;
    const name = programName(cells.eq(1).text());
    if (!name) return;
    // The plan column holds one PDF; it is the rules unless the cell lists two.
    const [rules = null, plan = null] = iconLinks($, cells.get(2));
    programs.push({
      order: Number(cleanText(cells.eq(0).text())),
      name,
      code: apsCode($, cells.get(1)),
      rules,
      plan,
      apply: iconLinks($, cells.get(3))[0] ?? null,
    });
  });
  if (programs.length < MIN_PROGRAMS) {
    throw new Error(
      `學程文件表格只解析出 ${programs.length} 筆，停止更新 program-docs.json`
    );
  }
  return programs
    .sort((a, b) => a.order - b.order)
    .map(({ order, ...program }) => program);
}

async function fetchProgramDocs({
  fetchHtml = fetchPage,
  fetchPdf = fetchPdfBytes,
  pdfToText = extractPdfText,
  outputPath = OUTPUT_PATH,
} = {}) {
  console.log("[fetch] 正在取得學程文件列表...");
  const programs = parseProgramDocsPage(await fetchHtml(SOURCE_URL));
  const intros = await mapWithConcurrency(programs, PDF_CONCURRENCY, (program) =>
    readIntro(program.name, program.rules, { fetchPdf, pdfToText })
  );
  const result = {
    source: SOURCE_URL,
    programs: programs.map((program, i) => ({
      ...program,
      intro: intros[i],
    })),
  };
  reportMissing({
    heading: "program-docs",
    noun: "學程",
    entries: result.programs.map((p) => ({ ...p, label: p.name })),
  });
  writeDocsJson(outputPath, result);
  return result;
}

module.exports = { fetchProgramDocs, parseProgramDocsPage };
