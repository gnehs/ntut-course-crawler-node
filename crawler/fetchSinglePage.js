
const cheerio = require('cheerio');
const axios = require('axios').default;
const iconv = require('iconv-lite');
const axiosRetry = require('axios-retry');
axiosRetry(axios, { retries: 3 });
async function fetchSinglePage(url) {
    const resp = await axios.request({
        method: 'GET',
        url,
        responseType: 'arraybuffer',
        reponseEncoding: 'binary'
    });
    const html = iconv.decode((await resp.data), "big5");
    return cheerio.load(html);
}

module.exports = { fetchSinglePage };

