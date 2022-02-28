const { fetchSinglePage } = require('./fetchSinglePage')
const jsonfile = require('jsonfile');
const axios = require('axios').default;
const axiosRetry = require('axios-retry');
const pangu = require('./tools/pangu').spacing;
const fs = require('fs');
const globalRegexParse = /\n|^ | $/g
axiosRetry(axios, { retries: 3 });
async function fetchSyllabus(matricKey = '日間部', year = 109, sem = 2) {
  fs.mkdirSync(`./dist/${year}/${sem}/course`, { recursive: true });
  let result
  try {
    result = jsonfile.readFileSync(`./dist/${year}/${sem}/${matricKey == '日間部' ? 'main' : matricKey}.json`)
  } catch (e) {
    console.error(e)
    return
  }
  console.log(`[fetch] ${matricKey} syllabus`)
  coursesDone = 0
  for (let x of result) {
    try {
      let res = []
      for (let syllabusLink of x.syllabusLinks) {
        res.push(await fetchSyllabusData(syllabusLink))
      }
      coursesDone++
      console.log(`[fetch] syllabus (${coursesDone}/${result.length}) ${matricKey} - ${x.name.zh} done.`)
      jsonfile.writeFileSync(`./dist/${year}/${sem}/course/${x.id}.json`, res, { spaces: 2, EOL: '\r\n' })
    }
    catch (e) {
      console.log(`[error][fetch] syllabus error.`, e)
    }
  }
}

async function fetchSyllabusData(url = 'ShowSyllabus.jsp?snum=292267&code=11710') {
  let $ = await fetchSinglePage('https://aps.ntut.edu.tw/course/tw/' + url)
  let res = {
    name: $('body > p:nth-child(3) > table > tbody > tr:nth-child(1) > th:nth-child(2)').text(),
    email: $('body > p:nth-child(3) > table > tbody > tr:nth-child(2) > th:nth-child(2)').text().trim().replace(globalRegexParse, ''),
    latestUpdate: $('body > p:nth-child(3) > table > tbody > tr:nth-child(3) > th:nth-child(2)').text(),
    objective: pangu($('body > p:nth-child(3) > table > tbody > tr:nth-child(4) > td > textarea').html().replace(/<br\s*[\/]?>/gi, "\n").replace(/\t/gi, "　　")),
    schedule: pangu($('body > p:nth-child(3) > table > tbody > tr:nth-child(5) > td > textarea').html().replace(/<br\s*[\/]?>/gi, "\n").replace(/\t/gi, "　　")),
    scorePolicy: pangu($('body > p:nth-child(3) > table > tbody > tr:nth-child(6) > td > textarea').html().replace(/<br\s*[\/]?>/gi, "\n").replace(/\t/gi, "　　")),
    materials: pangu($('body > p:nth-child(3) > table > tbody > tr:nth-child(7) > td > textarea').html().replace(/<br\s*[\/]?>/gi, "\n").replace(/\t/gi, "　　")),
    foreignLanguageTextbooks: !!$('body > p:nth-child(3) > table > tbody > tr:nth-child(7) > td').text().match(/使用外文原文書：是/),
  }
  // get remarks
  let remarksText = $('body > p:nth-child(3) > table > tbody > tr:nth-child(8) > td').text()
  if (remarksText != '') {
    if (remarksText.match('\n本學期課程因應疫情警戒等級規劃上課方式原則如下，實際實施日期與上課方式')) {
      let remarks = $('body > p:nth-child(3) > table > tbody > tr:nth-child(8) > td').html().replace(/<br\s*[\/]?>/gi, "\n").replace(/\t/gi, "　　")

      let covidDatas = []
      $('body > p:nth-child(3) > table > tbody > tr:nth-child(8) > td > div').each(function (index, element) {
        covidDatas.push($(element).html().replace(/<br\s*[\/]?>/gi, "\n").replace(/\t/gi, "　　"));
      });
      covidDatas = covidDatas.map(x => x == ' ' || x == '' ? null : x)

      let covid19 = {
        // if lv2 
        lv2Description: pangu(covidDatas[0]),
        courseScoreMethod: pangu(covidDatas[1]),
        // If distance learning or triage is implemented at the beginning of the semester
        courseInfo: pangu(covidDatas[2]),
        courseURL: pangu(covidDatas[3]),
        contactInfo: pangu(covidDatas[4]),
        additionalInfo: pangu(covidDatas[5]),
      }
      try {
        covid19.lv2Method = pangu(remarks.match(/<b>●上課方式：<\/b>(.+)\n/)[1])
      } catch (e) {

      }
      res.covid19 = covid19
    }
    else {
      res.remarks = pangu($('body > p:nth-child(3) > table > tbody > tr:nth-child(8) > td').html()
        .replace(/<br\s*[\/]?>/gi, "\n")
        .replace(/color=#ff0000/gi, '')
        .replace(/color=#ff0000/g, '')
        .replace(/style="(.+)"/gi, '')
        .replace(/\t/gi, "　　"))
        // remove <b></b>
        .replace(/<b>/gi, '')
        .replace(/<\/b>/gi, '')
    }

  }
  return res
}

module.exports = { fetchSyllabus };