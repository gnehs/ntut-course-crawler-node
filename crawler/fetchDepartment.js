const { fetchSinglePage } = require('./fetchSinglePage')
const jsonfile = require('jsonfile');
const fs = require('fs');
async function fetchClass(url) {
    let $ = await fetchSinglePage('https://aps.ntut.edu.tw/course/tw/' + url)
    let res = []
    for (let $class of $('a')) {
        res.push({
            'name': $($class).text(),
            'href': $($class).attr('href'),
        })
    }
    return res
}


async function fetchDepartment(year = 109, sem = 2) {
    console.log('[fetch] 正在取得系所列表...')
    let url = `https://aps.ntut.edu.tw/course/tw/Subj.jsp?format=-2&year=${year}&sem=${sem}`
    let $ = await fetchSinglePage(url)

    let res = []
    let departments = $('a')
    let progress = 0
    for (let department of departments) {
        let name = $(department).text()
        let href = $(department).attr('href')
        progress++
        console.log(`[fetch] 正在取得 (${progress}/${departments.length}) ${name}`)
        res.push({
            name,
            href,
            class: await fetchClass(href)
        })
    }
    fs.mkdirSync(`./dist/${year}/${sem}/`, { recursive: true });
    jsonfile.writeFileSync(`./dist/${year}/${sem}/department.json`, res)
}
module.exports = { fetchDepartment };