

const cheerio = require('cheerio')

async function fetchSinglePage(browser, url) {
    const page = await browser.newPage();
    await page.goto(url);
    const html = await page.content()
    const $ = cheerio.load(html);
    await page.close()
    return $
}

module.exports = { fetchSinglePage };

