const { fetchSinglePage } = require("./fetchSinglePage");
const jsonfile = require("jsonfile");
const fs = require("fs");
const pangu = require("./tools/pangu").spacing;
const {
  parseStandardLink,
  parseSystemLinks,
  parseYearLinks,
} = require("./standardLinks");

async function main() {
  const $ = await fetchSinglePage(
    "https://aps.ntut.edu.tw/course/tw/Cprog.jsp?format=-1"
  );
  const years = parseYearLinks($).map(({ year }) => year);
  if (years.length === 0) {
    throw new Error("The APS course-standard year page has no valid year links");
  }
  // 儲存各年份課程標準
  for (let yr of years) {
    await parseYear(yr);
  }
  jsonfile.writeFileSync(`./dist/standards.json`, years, {
    spaces: 2,
    EOL: "\r\n",
  });
}
async function parseYear(year) {
  fs.mkdirSync(`./dist/${year}/`, { recursive: true });
  const $ = await fetchSinglePage(
    `https://aps.ntut.edu.tw/course/tw/Cprog.jsp?format=-2&year=${year}`
  );
  const systems = parseSystemLinks($, year);
  if (systems.length === 0) {
    throw new Error(`The APS course-standard page has no systems for year ${year}`);
  }
  const result = {};
  for (const system of systems) {
    console.log("[fetch]", year, system.system);
    result[system.system] = await parseSystem(system.href);
  }
  const standardDepartments = buildStandardDepartmentIndex(result);
  if (standardDepartments.length === 0) {
    throw new Error(`The APS course-standard page has no departments for year ${year}`);
  }

  jsonfile.writeFileSync(`./dist/${year}/standard.json`, result, {
    spaces: 2,
    EOL: "\r\n",
  });
  jsonfile.writeFileSync(
    `./dist/${year}/standard-departments.json`,
    standardDepartments,
    {
      spaces: 2,
      EOL: "\r\n",
    }
  );
  return result;
}
function getChildText($, tr, i) {
  return $(tr).children("td").eq(i).text().replace(/\n| /g, "");
}

function extractDepartmentMetadata(href) {
  const parsed = parseStandardLink(href);
  if (!parsed || parsed.format !== "-4") return null;
  return {
    href: parsed.href,
    ...(parsed.division ? { division: parsed.division } : {}),
    ...(parsed.matric ? { matric: parsed.matric } : {}),
  };
}

async function parseSystem(
  url = "https://aps.ntut.edu.tw/course/tw/Cprog.jsp?format=-3&year=109&matric=7"
) {
  const $ = await fetchSinglePage(url);
  const result = {};
  //parse table title
  const tableTitle = [];
  for (let th of $("table tr th")) {
    tableTitle.push($(th).text().replace(/\n| /g, ""));
  }
  $("tr:first-child").remove();
  //parse table body
  const trs = $("table tr");
  for (let tr of trs) {
    //parseCredit
    const credits = {};
    for (let i = 1; i < 9; i++) {
      credits[tableTitle[i]] = getChildText($, tr, i);
    }
    // data
    // body > table > tbody > tr:nth-child(2) > td:nth-child(1) > p > a
    const departmentLink = $(tr).find("a[href]").first();
    const department = extractDepartmentMetadata(departmentLink.attr("href"));
    if (!department) continue;
    const departmentUrl = department.href;
    const departmentTitle = getChildText($, tr, 0);
    if (!departmentTitle) continue;
    result[departmentTitle] = {
      credits,
      ...(department.division ? { division: department.division } : {}),
      ...(department.matric ? { matric: department.matric } : {}),
      ...(await parseDeaprtment(departmentUrl)),
    };
  }
  return result;
}

function buildStandardDepartmentIndex(standard) {
  const result = [];
  for (const [system, departments] of Object.entries(standard)) {
    for (const [department, data] of Object.entries(departments ?? {})) {
      if (!system || !department || !data?.division || !data?.matric) {
        throw new Error(
          `Course-standard department metadata is incomplete: ${system}/${department}`
        );
      }
      result.push({
        system,
        department,
        division: data.division,
        matric: data.matric,
      });
    }
  }
  return result;
}

async function parseDeaprtment(
  url = "https://aps.ntut.edu.tw/course/tw/Cprog.jsp?format=-4&year=109&matric=7&division=340"
) {
  let $ = await fetchSinglePage(url);
  let result = {
    courses: [],
    rules: [],
  };
  $("body > table:nth-child(5) tr:first-child").remove();
  let trs = $("body > table:nth-child(5) tr");
  for (let tr of trs) {
    result.courses.push({
      year: getChildText($, tr, 0),
      sem: getChildText($, tr, 1),
      type: getChildText($, tr, 2),
      name: getChildText($, tr, 4),
      credit: getChildText($, tr, 5),
      hours: getChildText($, tr, 6),
      stage: getChildText($, tr, 7),
    });
  }
  result.rules = pangu(
    $("body > table:nth-child(9) > tbody > tr > td > font").html()
  );
  result.rules = result.rules
    ? result.rules.split("<br>").map((x) => x.replace(/(.+)\.|\n/g, ""))
    : null;
  return result;
}
module.exports = main;
module.exports.buildStandardDepartmentIndex = buildStandardDepartmentIndex;
module.exports.extractDepartmentMetadata = extractDepartmentMetadata;
module.exports.parseDeaprtment = parseDeaprtment;
module.exports.parseSystem = parseSystem;
module.exports.parseYear = parseYear;
