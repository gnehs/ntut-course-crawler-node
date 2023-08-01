const { fetchSinglePage } = require("./fetchSinglePage");
const jsonfile = require("jsonfile");
const pangu = require("./tools/pangu").spacing;
const fs = require("fs");
const cheerioTableparser = require("cheerio-tableparser");
const globalRegexParse = /\n|^ | $/g;
async function fetchClass(page) {
  let url = "https://aps.ntut.edu.tw/course/tw/" + page;
  let $ = await fetchSinglePage(url);
  let res = [];
  for (let $class of $("a")) {
    let urlParser = new URL(
      "https://aps.ntut.edu.tw/course/tw/" + $($class).attr("href")
    );
    res.push({
      id: urlParser.searchParams.get("code"),
      name: $($class).text(),
      href: $($class).attr("href"),
    });
  }
  return res;
}

async function fetchDepartment(year = 110, sem = 2) {
  console.log("[fetch] 正在取得系所列表...");
  let url = `https://aps.ntut.edu.tw/course/tw/Subj.jsp?format=-2&year=${year}&sem=${sem}`;
  let $ = await fetchSinglePage(url);

  let res = [];
  let departments = $("a");
  let progress = 0;
  for (let department of departments) {
    let name = pangu($(department).text());
    let href = $(department).attr("href");
    progress++;
    console.log(`[fetch] 正在取得 (${progress}/${departments.length}) ${name}`);
    res.push({
      name,
      href,
      class: await fetchClass(href),
    });
  }

  cheerioTableparser($);
  data = rotation2DArray($("table").parsetable(false, true, true));
  for (let col of data) {
    let college = col[0].replace(/\n| /g, "");
    if (college == "") college = "校院級";
    for (let i = 1; i < col.length; i++) {
      let name = col[i];
      if (!name || name == "") continue;
      let c = res.find((x) => x.name == name);
      c.category = college;
    }
  }

  fs.mkdirSync(`./dist/${year}/${sem}/`, { recursive: true });
  jsonfile.writeFileSync(`./dist/${year}/${sem}/department.json`, res, {
    spaces: 2,
    EOL: "\r\n",
  });
}
function rotation2DArray(data) {
  //二維陣列旋轉
  let result = [];
  for (let i = 0; i < data[0].length; i++) {
    let temp = [];
    for (let j = 0; j < data.length; j++) {
      temp.push(data[j][i]);
    }
    result.push(temp);
  }
  return result;
}
module.exports = { fetchDepartment };
fetchDepartment();
