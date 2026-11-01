const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { fetchSinglePage } = require("../crawler/fetchSinglePage");
const { fixGaiji } = require("../crawler/fixGaiji");
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

test("fixGaiji rewrites published JSON in place and is idempotent", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ntut-gaiji-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, "115", "1"), { recursive: true });
  const coursePath = path.join(root, "115", "1", "main.json");
  const untouchedPath = path.join(root, "main.json");
  fs.writeFileSync(
    coursePath,
    '[\r\n  {\r\n    "teacher": "羅睿\uE26C",\r\n    "notes": "王\uEF0D小明\uF06C"\r\n  }\r\n]\r\n'
  );
  fs.writeFileSync(untouchedPath, '{"year":115}');

  const first = fixGaiji(root);
  assert.deepEqual(first.changedFiles, [path.join("115", "1", "main.json")]);
  assert.equal(
    fs.readFileSync(coursePath, "utf8"),
    '[\r\n  {\r\n    "teacher": "羅睿晣",\r\n    "notes": "王小明\uF06C"\r\n  }\r\n]\r\n'
  );
  assert.equal(fs.readFileSync(untouchedPath, "utf8"), '{"year":115}');
  assert.equal(first.unknown.length, 1);
  assert.equal(first.unknown[0].codePoint, "U+F06C");
  assert.equal(first.unknown[0].count, 1);
  assert.equal(first.unknown[0].examples[0].file, path.join("115", "1", "main.json"));
  assert.match(first.unknown[0].examples[0].context, /小明\uF06C"/);

  const second = fixGaiji(root);
  assert.deepEqual(second.changedFiles, []);
  assert.deepEqual(
    second.unknown.map(({ codePoint, count }) => [codePoint, count]),
    [["U+F06C", 1]]
  );
});
