const cheerio = require("cheerio");
const {
  PDF_CONCURRENCY,
  cleanText,
  cellLink,
  fetchPage,
  fetchPdfBytes,
  extractPdfText,
  readIntro,
  mapWithConcurrency,
  reportMissing,
  writeDocsJson,
} = require("./oaaDocs");

const SOURCE_URL = "https://oaa.ntut.edu.tw/p/412-1008-13057.php?Lang=zh-tw";
const MIN_PROGRAMS = 10;
const OUTPUT_PATH = "./dist/mprogram-docs.json";

const STATUS_SUFFIX = /[(（][^()（）]*學年度[^()（）]*[)）]\s*$/;

// The cell appends a lifecycle note like "(112學年度始廢止)" and the English title.
function programName(raw) {
  const text = cleanText(raw).replace(STATUS_SUFFIX, "").trim();
  return text.split(/\s+(?=[A-Za-z])/)[0].trim();
}

function findDocsTable($) {
  return $("table")
    .filter((_, table) => {
      const header = cleanText($(table).find("tr").first().text());
      return (
        header.includes("施行細則") &&
        header.includes("課程規劃表") &&
        header.includes("修畢申請表")
      );
    })
    .first();
}

function parseMProgramDocsPage(html) {
  const $ = cheerio.load(String(html ?? ""));
  const table = findDocsTable($);
  if (!table.length) {
    throw new Error("微學程文件表格找不到，停止更新 mprogram-docs.json");
  }
  const programs = [];
  const seen = new Set();
  table.find("tr").each((_, row) => {
    const cells = $(row).children("td");
    if (cells.length < 5) return;
    const id = cleanText(cells.eq(0).text()).toUpperCase();
    if (!/^[A-Z0-9]{3}$/.test(id) || seen.has(id)) return;
    seen.add(id);
    programs.push({
      id,
      name: programName(cells.eq(1).text()),
      rules: cellLink($, cells.get(2), SOURCE_URL),
      plan: cellLink($, cells.get(3), SOURCE_URL),
      apply: cellLink($, cells.get(4), SOURCE_URL),
    });
  });
  if (programs.length < MIN_PROGRAMS) {
    throw new Error(
      `微學程文件表格只解析出 ${programs.length} 筆，停止更新 mprogram-docs.json`
    );
  }
  return programs.sort((a, b) => a.id.localeCompare(b.id));
}

async function fetchMProgramDocs({
  fetchHtml = fetchPage,
  fetchPdf = fetchPdfBytes,
  pdfToText = extractPdfText,
  outputPath = OUTPUT_PATH,
} = {}) {
  console.log("[fetch] 正在取得微學程文件列表...");
  const programs = parseMProgramDocsPage(await fetchHtml(SOURCE_URL));
  const intros = await mapWithConcurrency(programs, PDF_CONCURRENCY, (program) =>
    readIntro(program.id, program.rules, { fetchPdf, pdfToText })
  );
  const result = {
    source: SOURCE_URL,
    programs: programs.map((program, i) => ({
      ...program,
      intro: intros[i],
    })),
  };
  reportMissing({
    heading: "mprogram-docs",
    noun: "微學程",
    entries: result.programs.map((p) => ({ ...p, label: p.id })),
  });
  writeDocsJson(outputPath, result);
  return result;
}

module.exports = { fetchMProgramDocs, parseMProgramDocsPage };
