const { fetchSinglePage } = require("./fetchSinglePage");
const jsonfile = require("jsonfile");
const fs = require("fs");
const pangu = require("./tools/pangu").spacing;
async function main() {
  let $ = await fetchSinglePage(
    "https://aps.ntut.edu.tw/course/tw/Cprog.jsp?format=-1"
  );
  let years = [];
  for (let yr of $("a")) {
    years.push(
      $(yr)
        .attr("href")
        .match(/\&year=(.+)$/)[1]
    );
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
  let $ = await fetchSinglePage(
    `https://aps.ntut.edu.tw/course/tw/Cprog.jsp?format=-2&year=${year}`
  );
  let martics = $("a");
  let result = {};
  for (let martic of martics) {
    let title = $(martic).text();
    let url = $(martic).attr("href").replace(".", "");
    url = `https://aps.ntut.edu.tw/course/tw/${url}`;
    console.log("[fetch]", year, title);
    result[title] = await parseSystem(url);
  }
  jsonfile.writeFileSync(`./dist/${year}/standard.json`, result, {
    spaces: 2,
    EOL: "\r\n",
  });
}
function getChildText($, tr, i) {
  return $($(tr).children("td")[i]).text().replace(/\n| /g, "");
}
async function parseSystem(
  url = "https://aps.ntut.edu.tw/course/tw/Cprog.jsp?format=-3&year=109&matric=7"
) {
  let $ = await fetchSinglePage(url);
  let result = {};
  //parse table title
  let tableTitle = [];
  for (let th of $("table tr th")) {
    tableTitle.push($(th).text().replace(/\n| /g, ""));
  }
  $("tr:first-child").remove();
  //parse table body
  let trs = $("table tr");
  for (let tr of trs) {
    //parseCredit
    let credits = {};
    for (let i = 1; i < 9; i++) {
      credits[tableTitle[i]] = getChildText($, tr, i);
    }
    // data
    // body > table > tbody > tr:nth-child(2) > td:nth-child(1) > p > a
    let departmentUrl = $(tr).find("a").attr("href").replace(".", "");
    departmentUrl = `https://aps.ntut.edu.tw/course/tw${departmentUrl}`;
    let departmentTitle = getChildText($, tr, 0);
    result[departmentTitle] = {
      credits,
      ...(await parseDeaprtment(departmentUrl)),
    };
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
