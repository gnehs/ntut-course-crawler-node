const assert = require("node:assert/strict");
const http = require("node:http");
const test = require("node:test");

const { fetchSinglePage } = require("../crawler/fetchSinglePage");

const EXPECTED_REQUEST_ATTEMPTS = 3;
const EXPECTED_TIMEOUT_MS = 20 * 60 * 1000;

test("fetchSinglePage applies a bounded default timeout", async () => {
  let observedTimeout;
  let observedSignal;
  const page = await fetchSinglePage("https://example.invalid/success", {
    adapter: async (config) => {
      observedTimeout = config.timeout;
      observedSignal = config.signal;
      return {
        config,
        data: "<h1>ok</h1>",
        headers: {},
        status: 200,
        statusText: "OK",
      };
    },
  });

  assert.equal(observedTimeout, EXPECTED_TIMEOUT_MS);
  assert.ok(observedSignal instanceof AbortSignal);
  assert.equal(observedSignal.aborted, false);
  assert.equal(page("h1").text(), "ok");
});

test("fetchSinglePage retries network failures only a bounded number of times", async () => {
  let attempts = 0;
  const expectedError = new Error("connection reset for test");
  expectedError.code = "ECONNRESET";

  await assert.rejects(
    fetchSinglePage("https://example.invalid/failure", {
      adapter: async (config) => {
        attempts += 1;
        expectedError.config = config;
        throw expectedError;
      },
    }),
    (error) => {
      assert.equal(error, expectedError);
      assert.match(error.message, /connection reset for test/);
      return true;
    }
  );

  assert.equal(attempts, EXPECTED_REQUEST_ATTEMPTS);
});

test("fetchSinglePage does not retry POST requests", async () => {
  let attempts = 0;

  await assert.rejects(
    fetchSinglePage("https://example.invalid/post", {
      method: "POST",
      adapter: async (config) => {
        attempts += 1;
        const error = new Error("POST connection reset for test");
        error.code = "ECONNRESET";
        error.config = config;
        throw error;
      },
    }),
    /POST connection reset for test/
  );

  assert.equal(attempts, 1);
});

test("fetchSinglePage enforces a shorter timeout without retrying it", async (t) => {
  let requests = 0;
  const server = http.createServer(() => {
    requests += 1;
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(
    () => new Promise((resolve) => server.close(resolve))
  );
  const { port } = server.address();
  const startedAt = Date.now();

  await assert.rejects(
    fetchSinglePage(`http://127.0.0.1:${port}/timeout`, { timeout: 25 }),
    (error) => {
      assert.equal(error.code, "ERR_CANCELED");
      return true;
    }
  );

  assert.equal(requests, 1);
  assert.ok(Date.now() - startedAt < 1000);
});

test("fetchSinglePage aborts when DNS resolution never completes", async () => {
  let lookupStarted = false;
  const startedAt = Date.now();

  await assert.rejects(
    fetchSinglePage("http://dns-never-completes.test/timeout", {
      timeout: 25,
      proxy: false,
      lookup: () => {
        lookupStarted = true;
      },
    }),
    (error) => {
      assert.equal(error.code, "ERR_CANCELED");
      return true;
    }
  );

  assert.equal(lookupStarted, true);
  assert.ok(Date.now() - startedAt < 1000);
});
