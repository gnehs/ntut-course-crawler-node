
const cheerio = require('cheerio');
const axios = require('axios').default;
const iconv = require('iconv-lite');
const axiosRetry = require('axios-retry');
axiosRetry(axios, { retries: 10, shouldResetTimeout: true });
const delay = (s) => {
    return new Promise(resolve => {
        setTimeout(resolve, s);
    });
};
async function fetchSinglePage(url) {
    await delay(500 + Math.random() * 1500);
    const resp = await getResp(url)
    const html = iconv.decode((await resp.data), "big5");
    return cheerio.load(html);
}
async function getResp(url, retry = 0) {
    try {
        return await axios.request({
            method: 'GET',
            url,
            responseType: 'arraybuffer',
            reponseEncoding: 'binary'
        })
    }
    catch (e) {
        if (retry < 10) {
            retry += 1
            await delay(1000 * retry * retry);
            return getResp(url, retry)
        } else {
            console.log(`[error] ${url}`)
        }
    }
}

module.exports = { fetchSinglePage };

