const { fetchSinglePage } = require("./fetchSinglePage");
const jsonfile = require("jsonfile");
const cheerioTableparser = require("cheerio-tableparser");
const axios = require("axios").default;
const axiosRetry = require("axios-retry");
const pangu = require("./tools/pangu").spacing;
const fs = require("fs");
const globalRegexParse = /\n|^ | $/g;
axiosRetry(axios, { retries: 3 });
async function fetchSyllabus(matricKey = "日間部", year = 109, sem = 2) {
  fs.mkdirSync(`./dist/${year}/${sem}/course`, { recursive: true });
  let result;
  try {
    result = jsonfile.readFileSync(
      `./dist/${year}/${sem}/${matricKey == "日間部" ? "main" : matricKey}.json`
    );
  } catch (e) {
    console.error(e);
    return;
  }
  console.log(`[fetch] ${matricKey} syllabus`);
  coursesDone = 0;
  for (let x of result) {
    try {
      let res = [];
      for (let syllabusLink of x.syllabusLinks) {
        res.push(await fetchSyllabusData(syllabusLink));
      }
      coursesDone++;
      console.log(
        `[fetch] syllabus (${coursesDone}/${result.length}) ${matricKey} - ${x.name.zh} done.`
      );
      jsonfile.writeFileSync(`./dist/${year}/${sem}/course/${x.id}.json`, res, {
        spaces: 2,
        EOL: "\r\n",
      });
    } catch (e) {
      console.log(`[error][fetch] syllabus error.`, e);
    }
  }
}

async function fetchSyllabusData(
  url = "ShowSyllabus.jsp?snum=305082&code=23885"
) {
  let $ = await fetchSinglePage("https://aps.ntut.edu.tw/course/tw/" + url);
  cheerioTableparser($);
  let data = $(`body > p:nth-child(3) > table`).parsetable(true, true, true);
  let dataKeyMap = {
    教師姓名: `name`,
    Email: `email`,
    最後更新時間: `latestUpdate`,
    課程大綱: `objective`,
    課程進度: `schedule`,
    評量方式與標準: `scorePolicy`,
    "使用教材、參考書目或其他": `materials`,
    課程諮詢管道: `consultation`,
    備註: `remarks`,
  };
  let res = {};
  for (let key of data[0]) {
    let index = data[0].indexOf(key);
    let remappingKey = dataKeyMap[key] ?? key;
    res[remappingKey] = data[1][index];
  }
  res.name = res.name.replace(/　教師諮商時間\(Office Hours\)/, "");
  res.foreignLanguageTextbooks = !!res.materials.match(/使用外文原文書：是/);
  res.materials = res.materials.replace(/(.+)使用外文原文書：(.+)\n/, "");
  res.remarks = res.remarks.replace(
    /因應疫情發展，本學期教學及授課方式請依照學校網頁所公布之訊息為準：\n/,
    ""
  );
  res.remarks = res.remarks.replace(/\(https(.+)tw\)\n/, "");

  for (let key of Object.keys(res)) {
    if (typeof res[key] == "string") {
      res[key] = pangu(res[key].replace(/^ +/g, ""));
    }
  }

  // 110 年上學期
  let remarksText = $(
    "body > p:nth-child(3) > table > tbody > tr:nth-child(8) > td"
  ).text();
  if (
    remarksText != "" &&
    remarksText.match(
      "\n本學期課程因應疫情警戒等級規劃上課方式原則如下，實際實施日期與上課方式"
    )
  ) {
    let remarks = $(
      "body > p:nth-child(3) > table > tbody > tr:nth-child(8) > td"
    )
      .html()
      .replace(/<br\s*[\/]?>/gi, "\n")
      .replace(/\t/gi, "　　");

    let covidDatas = [];
    $(
      "body > p:nth-child(3) > table > tbody > tr:nth-child(8) > td > div"
    ).each(function (index, element) {
      covidDatas.push(
        $(element)
          .html()
          .replace(/<br\s*[\/]?>/gi, "\n")
          .replace(/\t/gi, "　　")
      );
    });
    covidDatas = covidDatas.map((x) => (x == " " || x == "" ? null : x));

    let covid19 = {
      // if lv2
      lv2Description: pangu(covidDatas[0]),
      courseScoreMethod: pangu(covidDatas[1]),
      // If distance learning or triage is implemented at the beginning of the semester
      courseInfo: pangu(covidDatas[2]),
      courseURL: pangu(covidDatas[3]),
      contactInfo: pangu(covidDatas[4]),
      additionalInfo: pangu(covidDatas[5]),
    };
    try {
      covid19.lv2Method = pangu(remarks.match(/<b>●上課方式：<\/b>(.+)\n/)[1]);
    } catch (e) {}
    res.covid19 = covid19;
  }
  return res;
}
module.exports = { fetchSyllabus };
