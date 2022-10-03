const { fetchSinglePage } = require('./fetchSinglePage')
const jsonfile = require('jsonfile');
const fs = require('fs')
const iconv = require('iconv-lite');
const axios = require('axios').default;
const axiosRetry = require('axios-retry');
const pangu = require('./tools/pangu').spacing;
const globalRegexParse = /\n|^ | $/g
axiosRetry(axios, { retries: 3 });
async function fetchCourseDescription(url = 'Curr.jsp?format=-2&code=1400037') {
    let $ = await fetchSinglePage('https://aps.ntut.edu.tw/course/tw/' + url)
    let res = {
        code: $('body > table > tbody > tr:nth-child(2) > td:nth-child(1)').text().trim().replace(globalRegexParse, ''),
        name: {
            zh: pangu($('body > table > tbody > tr:nth-child(2) > td:nth-child(2)').text().trim().replace(globalRegexParse, '')),
            en: $('body > table > tbody > tr:nth-child(2) > td:nth-child(3)').text().trim().replace(globalRegexParse, ''),
        },
        description: {
            zh: pangu($('body > table > tbody > tr:nth-child(3) > td').text().trim().replace(globalRegexParse, '')),
            en: $('body > table > tbody > tr:nth-child(4) > td').text().trim().replace(globalRegexParse, '')
        }
    }
    if (res.name.en == 'Nil') {
        res.name = { zh: '', en: '' }
    }
    return res
}

async function fetchCourse(matricKey = '日間部', year = 109, sem = 2) {
    fs.mkdirSync(`./dist/${year}/${sem}/course`, { recursive: true });
    let matric = {
        '日間部': "'1','5','6','7','8','9'",
        '進修部': "'4','A','D','C','E','F'",
        '研究所(日間部、進修部、週末碩士班)': "'8','9','A','C','D'",
    }

    console.log(`[fetch] 正在取得${matricKey}課程列表...`)
    let keyword = ''// '%A4%E9'
    let url = `https://aps.ntut.edu.tw/course/tw/QueryCourse.jsp?stime=101%2C102%2C103%2C104%2C122%2C105%2C106%2C107%2C108%2C109%2C110%2C111%2C112%2C113%2C201%2C202%2C203%2C204%2C222%2C205%2C206%2C207%2C208%2C209%2C210%2C211%2C212%2C213%2C301%2C302%2C303%2C304%2C322%2C305%2C306%2C307%2C308%2C309%2C310%2C311%2C312%2C313%2C401%2C402%2C403%2C404%2C422%2C405%2C406%2C407%2C408%2C409%2C410%2C411%2C412%2C413%2C501%2C502%2C503%2C504%2C522%2C505%2C506%2C507%2C508%2C509%2C510%2C511%2C512%2C513%2C601%2C602%2C603%2C604%2C622%2C605%2C606%2C607%2C608%2C609%2C610%2C611%2C612%2C613&year=${year}&matric=${encodeURI(iconv.encode(matric[matricKey], "big5"))}&sem=${sem}&unit=**&cname=${keyword}&ccode=&tname=&D0=ON&D1=ON&D2=ON&D3=ON&D4=ON&D5=ON&D6=ON&P1=ON&P2=ON&P3=ON&P4=ON&PN=ON&P5=ON&P6=ON&P7=ON&P8=ON&P9=ON&P10=ON&P11=ON&P12=ON&P13=ON&search=%B6%7D%A9l%ACd%B8%DF`
    let $ = await fetchSinglePage(url)
    $('tr:first-child').remove()
    $('tr:last-child').remove()
    $('tr:last-child').remove()
    $('tr:last-child').remove()
    let courseData = $('tr').map(function () {
        function parseLinks(els) {
            let res = []
            for (let el of els)
                res.push({
                    'name': $(el).text().replace(globalRegexParse, ''),
                    'link': $(el).attr('href'),
                    'code': $(el).attr('href').match(/code=(.+)/)[1]
                })
            return res
        }
        function parseSyllabusLinks(els) {
            let res = []
            for (let el of els) res.push($(el).attr('href'))
            return res
        }
        function parseTime(timeString) {
            let splitedArray = timeString.replace(/\n|^ | $|　/g, '').split(' ')
            return splitedArray.filter(x => x.length)
        }
        let notes = $($(this).children('td')[21]).text().replace(globalRegexParse, '')

        if (notes) {
            notes = pangu(notes)
            if (notes.length == 1) notes = ''
        }
        return ({
            id: $($(this).children('td')[0]).text().replace(globalRegexParse, ''),
            name: {
                zh: pangu($($(this).children('td')[1]).text().replace(globalRegexParse, '')),
                en: null
            },
            stage: $($(this).children('td')[2]).text().replace(globalRegexParse, ''),
            credit: $($(this).children('td')[3]).text().replace(globalRegexParse, ''),
            hours: $($(this).children('td')[4]).text().replace(globalRegexParse, ''),
            courseType: $($(this).children('td')[5]).text().replace(globalRegexParse, ''),
            class: parseLinks($($(this).children('td')[6]).children('a')),
            teacher: parseLinks($($(this).children('td')[7]).children('a')),
            time: {
                'sun': parseTime($($(this).children('td')[8]).text()),
                'mon': parseTime($($(this).children('td')[9]).text()),
                'tue': parseTime($($(this).children('td')[10]).text()),
                'wed': parseTime($($(this).children('td')[11]).text()),
                'thu': parseTime($($(this).children('td')[12]).text()),
                'fri': parseTime($($(this).children('td')[13]).text()),
                'sat': parseTime($($(this).children('td')[14]).text()),
            },
            classroom: parseLinks($($(this).children('td')[15]).children('a')).map(y => {
                y.name = y.name.replace(/e$|\(e\)$/, '')
                return y
            }),
            people: $($(this).children('td')[16]).text().replace(globalRegexParse, ''),
            peopleWithdraw: $($(this).children('td')[17]).text().replace(globalRegexParse, ''),
            ta: parseLinks($($(this).children('td')[18]).children('a')),
            language: $($(this).children('td')[19]).text().replace(globalRegexParse, ''),
            notes,
            courseDescriptionLink: $($(this).children('td')[1]).children('a').attr('href'),
            syllabusLinks: parseSyllabusLinks($($(this).children('td')[20]).children('a')),
        })
    }).toArray()
    let result = []
    let coursesDone

    console.log(`[fetch] ${matricKey} course description`)
    coursesDone = 0
    for (let x of courseData) {
        try {
            let courseDescriptionData = await fetchCourseDescription(x.courseDescriptionLink)
            coursesDone++
            console.log(`[fetch] course description (${coursesDone}/${courseData.length}) ${matricKey} - ${courseDescriptionData.name.zh} done.`)
            x.name.en = courseDescriptionData.name.en
            delete courseDescriptionData.name
            result.push({ ...courseDescriptionData, ...x })
        }
        catch (e) {
            console.log(`[error][fetch] course description error.`, e)
        }
    }
    console.log(`[fetch] ${matricKey == '日間部' ? 'main' : matricKey}.json saved.`)
    jsonfile.writeFileSync(`./dist/${year}/${sem}/${matricKey == '日間部' ? 'main' : matricKey}.json`, result, { spaces: 2, EOL: '\r\n' })

    console.log(`[fetch] ${matricKey} done.`)
}

module.exports = { fetchCourse };
