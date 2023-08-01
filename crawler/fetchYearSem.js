const { fetchSinglePage } = require("./fetchSinglePage");
const jsonfile = require("jsonfile");
const fs = require("fs");
async function main() {
  let url = "https://aps.ntut.edu.tw/course/tw/QueryCurrPage.jsp";
  let $ = await fetchSinglePage(url);

  let result = {
    years: {},
    current: {
      year: $('select[name="year"] option:selected').text(),
      sem: $('select[name="sem"] option:selected').text() == "上學期" ? 1 : 2,
    },
  };

  $('select[name="year"] option')
    .map(function () {
      return $(this).text();
    })
    .toArray()
    .map((x) => {
      if (x == result.current.year && 1 == result.current.sem) {
        result.years[x] = [1];
      } else {
        result.years[x] = [1, 2];
      }
    });
  fs.mkdirSync(`./dist/`, { recursive: true });
  jsonfile.writeFileSync(`./dist/main.json`, result.years, {
    spaces: 2,
    EOL: "\r\n",
  });
  return result;
}
module.exports = main;
