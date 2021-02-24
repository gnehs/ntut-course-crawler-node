const { fetchSinglePage } = require('../fetch/fetchSinglePage')
const puppeteer = require("puppeteer");
const jsonfile = require('jsonfile');
const fs = require('fs');
async function fetchClass(browser, url) {
    let $ = await fetchSinglePage(browser, 'https://aps.ntut.edu.tw/course/tw/' + url)
    let res = []
    for (let $class of $('a')) {
        res.push({
            'name': $($class).text(),
            'href': $($class).attr('href'),
        })
    }
    return res
}


async function fetchDepartment(browser, year = 109, sem = 2) {
    console.log('[fetch] 正在取得系所列表...')
    let url = `https://aps.ntut.edu.tw/course/tw/Subj.jsp?format=-2&year=${year}&sem=${sem}`
    let $ = await fetchSinglePage(browser, url)

    let res = []
    for (let department of $('a')) {
        let name = $(department).text()
        let href = $(department).attr('href')
        console.log(`[fetch] 正在取得 ${name}`)
        res.push({
            name,
            href,
            class: await fetchClass(browser, href)
        })
    }
    return res
}
async function main(year = 109, sem = 2) {
    let browser = await puppeteer.launch()
    let res = await fetchDepartment(browser, year, sem)
    await browser.close()
    fs.mkdirSync(`./dist/${year}/${sem}/`, { recursive: true });
    jsonfile.writeFileSync(`./dist/${year}/${sem}/department.json`, res)
}
main()