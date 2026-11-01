const assert = require("node:assert/strict");
const test = require("node:test");

const { fetchSinglePage } = require("../crawler/fetchSinglePage");
const { replaceGaiji } = require("../crawler/tools/gaiji");

function pageAdapter(html) {
  return async (config) => ({
    config,
    data: html,
    headers: {},
    status: 200,
    statusText: "OK",
  });
}

test("replaceGaiji maps known gaiji to standard characters", () => {
  assert.equal(replaceGaiji("羅睿"), "羅睿晣");
  assert.equal(replaceGaiji("陳祥、林"), "陳禎祥、林姉");
});

test("replaceGaiji removes gaiji that have no glyph", () => {
  assert.equal(replaceGaiji("王小明"), "王小明");
});

test("replaceGaiji keeps and reports unknown private-use characters", () => {
  const unknown = [];
  assert.equal(
    replaceGaiji("張紹", (gaiji) => unknown.push(gaiji)),
    "張紹"
  );
  assert.deepEqual(unknown, [{ codePoint: "U+E03F", context: "張紹" }]);
});

test("fetchSinglePage normalises gaiji in text, entities and attributes", async (t) => {
  const warn = t.mock.method(console, "warn", () => {});
  const $ = await fetchSinglePage("https://example.invalid/gaiji", {
    adapter: pageAdapter(
      `<a title="羅睿">羅睿</a><p>&#xE046;</p><b>張紹</b>`
    ),
  });

  assert.equal($("a").text(), "羅睿晣");
  assert.equal($("a").attr("title"), "羅睿晣");
  assert.equal($("p").text(), "煒");
  assert.equal($("b").text(), "張紹");
  assert.equal(warn.mock.callCount(), 1);
  assert.match(warn.mock.calls[0].arguments[0], /\[gaiji\] .*\/gaiji: unknown U\+E03F/);
});
