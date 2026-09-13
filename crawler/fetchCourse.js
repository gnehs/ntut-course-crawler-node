const { fetchSinglePage } = require("./fetchSinglePage");
const jsonfile = require("jsonfile");
const fs = require("fs");
const axios = require("axios").default;
const axiosRetry = require("axios-retry").default;
const pangu = require("./tools/pangu").spacing;
const { parseQueryCourseHtml } = require("./parsers/queryCourse");
const globalRegexParse = /\n|^ | $/g;
axiosRetry(axios, { retries: 3 });
function normaliseDescriptionText(value) {
  return String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .trim()
    .replace(globalRegexParse, "");
}

function findCourseDescriptionTable($) {
  return $("table")
    .toArray()
    .find((table) => {
      const header = normaliseDescriptionText($(table).find("tr").first().text());
      return (
        /課程編碼|Course\s*Code/i.test(header) &&
        /課程名稱|Course\s*Name/i.test(header)
      );
    });
}

async function fetchCourseDescription(
  url = "Curr.jsp?format=-2&code=1400037",
  fetchPage = fetchSinglePage
) {
  if (typeof fetchPage !== "function") {
    throw new TypeError("fetchCourseDescription expects a page fetch function");
  }
  const $ = await fetchPage("https://aps.ntut.edu.tw/course/tw/" + url);
  if (typeof $ !== "function") {
    throw new Error("Course description response is not an HTML document");
  }

  const table = findCourseDescriptionTable($);
  if (!table) {
    throw new Error("Course description table not found");
  }
  const rows = $(table).find("tr").toArray();
  if (rows.length < 2) {
    throw new Error("Course description table has no data row");
  }

  const dataCells = $(rows[1]).children("th,td");
  if (dataCells.length < 3) {
    throw new Error("Course description data row is missing name columns");
  }
  const code = normaliseDescriptionText($(dataCells[0]).text());
  const zhName = normaliseDescriptionText($(dataCells[1]).text());
  const enName = normaliseDescriptionText($(dataCells[2]).text());
  if (!code || !zhName) {
    throw new Error("Course description is missing course code or Chinese name");
  }

  const descriptionCell = (rowIndex) => {
    if (!rows[rowIndex]) return "";
    const cells = $(rows[rowIndex]).children("th,td");
    return normaliseDescriptionText(cells.last().text());
  };
  return {
    code,
    name: {
      zh: pangu(zhName),
      // Some older records use Nil for the English name. Preserve the valid
      // Chinese name while representing the unavailable translation as empty.
      en: enName === "Nil" ? "" : enName,
    },
    description: {
      zh: pangu(descriptionCell(2)),
      en: descriptionCell(3),
    },
  };
}

async function fetchCourse(matricKey = "日間部", year = 109, sem = 2) {
  fs.mkdirSync(`./dist/${year}/${sem}/course`, { recursive: true });
  let matric = {
    日間部: "'1','5','6','7','8','9'",
    進修部: "'4','A','D','C','E','F'",
    "研究所(日間部、進修部、週末碩士班)": "'8','9','A','C','D'",
  };

  console.log(`[fetch] 正在取得${matricKey}課程列表...`);
  let keyword = ""; // '%A4%E9'
  let $ = await fetchSinglePage(
    `https://aps.ntut.edu.tw/course/tw/QueryCourse.jsp`,
    {
      method: "POST",
      data: `stime=0&year=${year}&matric=${encodeURIComponent(
        matric[matricKey]
      )}&sem=${sem}&unit=*&cname=${keyword}&ccode=&tname=&D0=ON&D1=ON&D2=ON&D3=ON&D4=ON&D5=ON&D6=ON&P1=ON&P2=ON&P3=ON&P4=ON&PN=ON&P5=ON&P6=ON&P7=ON&P8=ON&P9=ON&P10=ON&P11=ON&P12=ON&P13=ON`,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    }
  );
  let courseData = parseQueryCourseHtml($);
  if (!Array.isArray(courseData)) {
    throw new Error(`[fetch] ${matricKey} QueryCourse parser did not return a list`);
  }
  if (
    courseData.some(
      (course) =>
        !/^\d+$/.test(String(course.id)) || !course.courseDescriptionLink
    )
  ) {
    throw new Error(`[fetch] ${matricKey} QueryCourse contains an incomplete course row`);
  }
  let result = [];
  let coursesDone;

  console.log(`[fetch] ${matricKey} course description`);
  coursesDone = 0;
  for (let x of courseData) {
    try {
      let courseDescriptionData = await fetchCourseDescription(
        x.courseDescriptionLink
      );
      coursesDone++;
      console.log(
        `[fetch] course description (${coursesDone}/${courseData.length}) ${matricKey} - ${courseDescriptionData.name.zh} done.`
      );
      x.name.en = courseDescriptionData.name.en;
      delete courseDescriptionData.name;
      result.push({ ...courseDescriptionData, ...x });
    } catch (e) {
      console.log(`[error][fetch] course description error.`, e);
      throw new Error(
        `[fetch] ${matricKey} course description failed for ${x.id}`,
        { cause: e }
      );
    }
  }
  console.log(
    `[fetch] ${matricKey == "日間部" ? "main" : matricKey}.json saved.`
  );
  jsonfile.writeFileSync(
    `./dist/${year}/${sem}/${matricKey == "日間部" ? "main" : matricKey}.json`,
    result,
    { spaces: 2, EOL: "\r\n" }
  );

  console.log(`[fetch] ${matricKey} done.`);
  return result;
}

module.exports = { fetchCourse, fetchCourseDescription };
