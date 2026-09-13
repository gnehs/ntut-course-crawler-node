const { fetchSinglePage } = require("./fetchSinglePage");
const jsonfile = require("jsonfile");
const axios = require("axios").default;
const axiosRetry = require("axios-retry").default;
const fs = require("fs");
const { parseSyllabusHtml } = require("./parsers/syllabus");
axiosRetry(axios, { retries: 3 });
async function fetchSyllabus(matricKey = "日間部", year = 109, sem = 2) {
  fs.mkdirSync(`./dist/${year}/${sem}/course`, { recursive: true });
  let result;
  try {
    result = jsonfile.readFileSync(
      `./dist/${year}/${sem}/${matricKey == "日間部" ? "main" : matricKey}.json`
    );
  } catch (e) {
    throw new Error(`[fetch] unable to read ${matricKey} course list`, {
      cause: e,
    });
  }
  if (!Array.isArray(result)) {
    throw new Error(`[fetch] ${matricKey} course list is not an array`);
  }
  console.log(`[fetch] ${matricKey} syllabus`);
  let coursesDone = 0;
  for (let x of result) {
    const id = x && x.id ? x.id : "<unknown>";
    try {
      if (!x || typeof x !== "object" || !Array.isArray(x.syllabusLinks)) {
        throw new Error(`course ${id} has invalid syllabusLinks`);
      }
      if (!/^\d+$/.test(String(id))) {
        throw new Error(`course ${JSON.stringify(id)} has an invalid id`);
      }
      let res = [];
      for (let syllabusLink of x.syllabusLinks) {
        res.push(await fetchSyllabusData(syllabusLink));
      }
      coursesDone++;
      console.log(
        `[fetch] syllabus (${coursesDone}/${result.length}) ${matricKey} - ${x.name?.zh || id} done.`
      );
      writeSyllabusFile(`./dist/${year}/${sem}/course/${id}.json`, res);
    } catch (e) {
      console.log(`[error][fetch] syllabus error.`, e);
      throw new Error(`[fetch] ${matricKey} syllabus failed for ${id}`, {
        cause: e,
      });
    }
  }
  return result;
}

function writeSyllabusFile(filePath, records) {
  if (!Array.isArray(records)) {
    throw new TypeError(`Syllabus records must be an array: ${filePath}`);
  }
  // Always replace the file with this run's records. Keeping a prior run's
  // teachers would make a rerun look complete while its current links were
  // only partially fetched.
  jsonfile.writeFileSync(filePath, records, {
    spaces: 2,
    EOL: "\r\n",
  });
}

async function fetchSyllabusData(
  url = "ShowSyllabus.jsp?snum=305082&code=23885"
) {
  let $ = await fetchSinglePage("https://aps.ntut.edu.tw/course/mobile/" + url);
  let res = parseSyllabusHtml($);
  return res;
}
module.exports = {
  fetchSyllabus,
  fetchSyllabusData,
  writeSyllabusFile,
};
