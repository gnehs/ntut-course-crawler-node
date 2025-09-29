const cheerio = require("cheerio");
const { fetchSinglePage } = require("./fetchSinglePage");
const jsonfile = require("jsonfile");
const fs = require("fs");
const pangu = require("./tools/pangu").spacing;

const globalRegexParse = /\n|^ | $/g;

async function fetchProgramCourse(href, page) {
  let $;
  if (page) {
    $ = typeof page === "string" ? cheerio.load(page) : page;
  } else {
    const url = "https://aps.ntut.edu.tw/course/tw/" + href;
    $ = await fetchSinglePage(url);
  }
  const table = $("table").first();
  const rows = table.find("tr").slice(1);
  const courses = [];
  for (const tr of rows) {
    const id = $(tr)
      .children("td")
      .first()
      .text()
      .replace(globalRegexParse, "");
    if (id) courses.push(id);
  }
  return courses;
}

async function fetchMProgram(year = 110, sem = 2, listPage = null, programPages = {}) {
  console.log("[fetch] 正在取得微學程列表...");
  let $;
  if (listPage) {
    $ = typeof listPage === "string" ? cheerio.load(listPage) : listPage;
  } else {
    const url = `https://aps.ntut.edu.tw/course/tw/SearchMProgram.jsp?format=-1&year=${year}&sem=${sem}`;
    $ = await fetchSinglePage(url);
  }
  const programs = $("a[href^='SearchMProgram.jsp?format=-2']");
  const res = [];
  let progress = 0;
  for (const program of programs) {
    const name = pangu($(program).text());
    const href = $(program).attr("href");
    const urlParser = new URL("https://aps.ntut.edu.tw/course/tw/" + href);
    const id = urlParser.searchParams.get("code");
    progress++;
    console.log(`[fetch] 正在取得 (${progress}/${programs.length}) ${name}`);
    const course = await fetchProgramCourse(href, programPages[id]);
    res.push({ id, name, href, course });
  }
  fs.mkdirSync(`./dist/${year}/${sem}/`, { recursive: true });
  jsonfile.writeFileSync(`./dist/${year}/${sem}/mprogram.json`, res, {
    spaces: 2,
    EOL: "\r\n",
  });
}

module.exports = { fetchMProgram };
