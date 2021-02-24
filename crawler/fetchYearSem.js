const { fetchSinglePage } = require('./fetchSinglePage')
const jsonfile = require('jsonfile');
const fs = require('fs');
async function main() {
    let url = 'https://aps.ntut.edu.tw/course/tw/QueryCurrPage.jsp'
    let $ = await fetchSinglePage(url)

    let result = { years: {}, current: { year: 0, sem: 0 } }
    $('select[name="year"] option')
        .map(function () { return $(this).text() })
        .toArray()
        .map(x => { result.years[x] = [1, 2] })
    result.current = {
        year: $('select[name="year"] option:selected').text(),
        sem: $('select[name="sem"] option:selected').text() == '上學期' ? 1 : 2
    }
    console.log('::set-output name=matrix::', JSON.stringify({ years: Object.keys(result.years) }))
    fs.mkdirSync(`./dist/`, { recursive: true });
    jsonfile.writeFileSync(`./dist/main.json`, result.years)
    return result
}
module.exports = main;