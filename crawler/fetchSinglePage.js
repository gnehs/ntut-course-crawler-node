const cheerio = require("cheerio");
const axios = require("axios").default;
const axiosRetry = require("axios-retry").default;

// APS is a legacy server and can legitimately take well over ten seconds to
// produce a page. Keep a generous per-request deadline; GitHub Actions applies
// a separate dataset-level timeout so one permanently stuck request still
// cannot block publishing indefinitely.
const REQUEST_TIMEOUT_MS = 20 * 60 * 1000;
const REQUEST_RETRIES = 2;
const REQUEST_HEARTBEAT_MS = 60 * 1000;
const http = axios.create();

function isCanceledError(error) {
  return error?.code === "ERR_CANCELED" || axios.isCancel(error);
}

axiosRetry(http, {
  retries: REQUEST_RETRIES,
  retryDelay: axiosRetry.exponentialDelay,
  retryCondition: (error) =>
    !isCanceledError(error) && axiosRetry.isSafeRequestError(error),
  shouldResetTimeout: false,
  onRetry: (retryCount, error, requestConfig) => {
    console.warn(
      `[retry] ${requestConfig.url} (${retryCount}/${REQUEST_RETRIES}): ${error.message}`
    );
  },
});

const delay = (s) => new Promise((resolve) => setTimeout(resolve, s));

async function fetchSinglePage(url, options) {
  await delay(100 + Math.random() * 500);
  const resp = await getResp(url, options);
  return cheerio.load(resp.data);
}
async function getResp(url, options = {}) {
  const now = new Date();
  const requestedTimeout = options.timeout;
  const timeout =
    Number.isFinite(requestedTimeout) && requestedTimeout > 0
      ? Math.min(requestedTimeout, REQUEST_TIMEOUT_MS)
      : REQUEST_TIMEOUT_MS;
  const timeoutSignal = AbortSignal.timeout(timeout);
  const signal = options.signal
    ? AbortSignal.any([options.signal, timeoutSignal])
    : timeoutSignal;

  console.log(`[fetch] ${url} start (deadline ${timeout}ms).`);
  const heartbeat = setInterval(() => {
    console.log(`[fetch] ${url} still waiting (${new Date() - now}ms).`);
  }, REQUEST_HEARTBEAT_MS);
  heartbeat.unref?.();
  try {
    const result = await http.request({
      method: "GET",
      url,
      ...options,
      timeout,
      signal,
    });
    console.log(`[fetch] ${url} done. (${new Date() - now}ms)`);
    return result;
  } catch (e) {
    console.error(`[error] ${url}: ${e.message} (${new Date() - now}ms)`);
    throw e;
  } finally {
    clearInterval(heartbeat);
  }
}

module.exports = { fetchSinglePage };
