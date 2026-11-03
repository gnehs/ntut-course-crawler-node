const fs = require("fs");
const path = require("path");
const jsonfile = require("jsonfile");
const { getResp } = require("./fetchSinglePage");
const { parseIntro } = require("./parsers/programRules");

const OAA_HOSTNAME = "oaa.ntut.edu.tw";
const DEAD_OAA_HOSTNAME = "oaa.rpage.ntut.edu.tw";
const PDF_TIMEOUT_MS = 2 * 60 * 1000;
const PDF_CONCURRENCY = 4;

function cleanText(value) {
  return String(value ?? "")
    .replace(/ /g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toOaaUrl(href, baseUrl) {
  let url;
  try {
    url = new URL(href, baseUrl);
  } catch (error) {
    return null;
  }
  if (url.hostname === DEAD_OAA_HOSTNAME) url.hostname = OAA_HOSTNAME;
  if (url.hostname !== OAA_HOSTNAME) return null;
  url.protocol = "https:";
  return url.href;
}

// Some cells carry an invisible duplicate link before the visible icon link,
// and the two can point at different revisions. The icon is what visitors click.
function cellLink($, cell, baseUrl) {
  const anchors = $(cell).find("a[href]").toArray();
  if (!anchors.length) return null;
  const visible =
    anchors.find((anchor) => $(anchor).find("img").length) ??
    anchors[anchors.length - 1];
  return toOaaUrl($(visible).attr("href"), baseUrl);
}

async function fetchPage(url) {
  const resp = await getResp(url);
  return String(resp.data);
}

async function fetchPdfBytes(url) {
  const resp = await getResp(url, {
    responseType: "arraybuffer",
    timeout: PDF_TIMEOUT_MS,
  });
  return new Uint8Array(resp.data);
}

async function extractPdfText(bytes) {
  const { extractText, getDocumentProxy } = require("unpdf");
  const pdf = await getDocumentProxy(bytes, { verbosity: 0 });
  const { text } = await extractText(pdf, { mergePages: true });
  return text;
}

async function readIntro(label, url, { fetchPdf, pdfToText }) {
  if (!url) return null;
  try {
    return parseIntro(await pdfToText(await fetchPdf(url)));
  } catch (error) {
    console.warn(`[warn] ${label} 施行細則無法讀取: ${error.message}`);
    return null;
  }
}

async function mapWithConcurrency(items, limit, task) {
  const results = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await task(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

// entries: [{ label, intro }]
function reportMissing({ heading, noun, entries }) {
  const missingIntro = entries.filter((e) => e.intro == null).map((e) => e.label);
  const lines = [
    `${noun}文件：共 ${entries.length} 筆`,
    `缺少 intro：${missingIntro.join(", ") || "無"}`,
  ];
  console.log(lines.join("\n"));
  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `### ${heading}\n\n${lines.map((line) => `- ${line}`).join("\n")}\n`
    );
  }
}

function writeDocsJson(outputPath, result) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  jsonfile.writeFileSync(outputPath, result, { spaces: 2, EOL: "\r\n" });
}

module.exports = {
  PDF_CONCURRENCY,
  cleanText,
  toOaaUrl,
  cellLink,
  fetchPage,
  fetchPdfBytes,
  extractPdfText,
  readIntro,
  mapWithConcurrency,
  reportMissing,
  writeDocsJson,
};
