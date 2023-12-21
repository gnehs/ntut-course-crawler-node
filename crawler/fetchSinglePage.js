const cheerio = require("cheerio");
const axios = require("axios").default;
const axiosRetry = require("axios-retry");
axiosRetry(axios, { retries: 10, shouldResetTimeout: true });
const delay = (s) => new Promise((resolve) => setTimeout(resolve, s));

async function fetchSinglePage(url, options) {
  await delay(100 + Math.random() * 500);
  const resp = await getResp(url, options);
  return cheerio.load(resp.data);
}
async function getResp(url, options = {}, retry = 0) {
  try {
    let now = new Date();
    let result = await axios.request({
      method: "GET",
      url,
      timeout: 10 * 60 * 1000, // 10 minutes,
      ...options,
    });
    console.log(`[fetch] ${url} done. (${new Date() - now}ms)`);
    return result;
  } catch (e) {
    if (retry < 10) {
      retry += 1;
      await delay(1000 * retry * retry);
      return getResp(url, options, retry);
    } else {
      console.log(`[error] ${url}`);
    }
  }
}

module.exports = { fetchSinglePage };
