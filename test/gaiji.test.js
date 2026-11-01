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
  assert.equal(replaceGaiji("羅睿\uE26C"), "羅睿晣");
  assert.equal(replaceGaiji("陳\uE136祥、林\uE1B7"), "陳禎祥、林姉");
});

test("replaceGaiji reads school gaiji by the glyph in the school's webfont", () => {
  assert.equal(replaceGaiji("簡\uE058，《水問》"), "簡媜，《水問》");
  assert.equal(replaceGaiji("陳奎\uE122主編"), "陳奎憙主編");
  assert.equal(replaceGaiji("聚丙烯\uE1EC纖維"), "聚丙烯腈纖維");
});

test("replaceGaiji reads U+E188 as 啟, which the webfont now draws as 塲", () => {
  assert.equal(replaceGaiji("進而\uE188發學生"), "進而啟發學生");
});

test("replaceGaiji maps Word symbol-font characters by their context", () => {
  assert.equal(replaceGaiji("\uF06C　　財務管理"), "●　　財務管理");
  assert.equal(replaceGaiji("由畫菌開始\uF0E020cc\uF0E0200cc"), "由畫菌開始→20cc→200cc");
  assert.equal(replaceGaiji("Using MATLAB\uF0D2 and Simulink"), "Using MATLAB® and Simulink");
  assert.equal(replaceGaiji("Y接與\uF044接"), "Y接與Δ接");
  assert.equal(replaceGaiji("\uF0FE考試：30%"), "☑考試：30%");
});

test("replaceGaiji decodes Big5 extension characters as Big5-HKSCS", () => {
  assert.equal(
    replaceGaiji("筋膜\uF793\uF793\uF6F3\uF762"),
    "筋膜リリース"
  );
  assert.equal(replaceGaiji("Folies-Berg\uF332re"), "Folies-Bergère");
  assert.equal(replaceGaiji("\uF6B1憲法\uF6B2刑法"), "①憲法②刑法");
});

test("replaceGaiji corrects 簡媜 where the source text misspells or drops it", () => {
  assert.equal(replaceGaiji("簡勠〈母者〉"), "簡媜〈母者〉");
  assert.equal(replaceGaiji("簡《誰在銀閃閃的地方 等你》"), "簡媜《誰在銀閃閃的地方 等你》");
  assert.equal(replaceGaiji("簡媜《誰在銀閃閃的地方 等你》"), "簡媜《誰在銀閃閃的地方 等你》");
  assert.equal(replaceGaiji("繁為簡。《論語》"), "繁為簡。《論語》");
});

test("replaceGaiji removes gaiji that have no glyph", () => {
  assert.equal(replaceGaiji("王\uEF0D小明"), "王小明");
  assert.equal(replaceGaiji("色彩原論／\uF87F全華科技圖書"), "色彩原論／全華科技圖書");
});

test("replaceGaiji keeps and reports unknown private-use characters", () => {
  const unknown = [];
  assert.equal(
    replaceGaiji("謝永\uE049", (gaiji) => unknown.push(gaiji)),
    "謝永\uE049"
  );
  assert.deepEqual(unknown, [{ codePoint: "U+E049", context: "謝永\uE049" }]);
});

test("fetchSinglePage normalises gaiji in text, entities and attributes", async (t) => {
  const warn = t.mock.method(console, "warn", () => {});
  const $ = await fetchSinglePage("https://example.invalid/gaiji", {
    adapter: pageAdapter(
      `<a title="羅睿\uE26C">羅睿\uE26C</a><p>&#xE046;</p><b>謝永\uE049</b>`
    ),
  });

  assert.equal($("a").text(), "羅睿晣");
  assert.equal($("a").attr("title"), "羅睿晣");
  assert.equal($("p").text(), "煒");
  assert.equal($("b").text(), "謝永\uE049");
  assert.equal(warn.mock.callCount(), 1);
  assert.match(warn.mock.calls[0].arguments[0], /\[gaiji\] .*\/gaiji: unknown U\+E049/);
});

test("fixGaiji rewrites published JSON in place and is idempotent", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ntut-gaiji-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, "115", "1"), { recursive: true });
  const coursePath = path.join(root, "115", "1", "main.json");
  const untouchedPath = path.join(root, "main.json");
  fs.writeFileSync(
    coursePath,
    '[\r\n  {\r\n    "teacher": "羅睿\uE26C",\r\n    "notes": "王\uEF0D小明\uF024"\r\n  }\r\n]\r\n'
  );
  fs.writeFileSync(untouchedPath, '{"year":115}');

  const first = fixGaiji(root);
  assert.deepEqual(first.changedFiles, [path.join("115", "1", "main.json")]);
  assert.equal(
    fs.readFileSync(coursePath, "utf8"),
    '[\r\n  {\r\n    "teacher": "羅睿晣",\r\n    "notes": "王小明\uF024"\r\n  }\r\n]\r\n'
  );
  assert.equal(fs.readFileSync(untouchedPath, "utf8"), '{"year":115}');
  assert.equal(first.unknown.length, 1);
  assert.equal(first.unknown[0].codePoint, "U+F024");
  assert.equal(first.unknown[0].count, 1);
  assert.equal(first.unknown[0].examples[0].file, path.join("115", "1", "main.json"));
  assert.match(first.unknown[0].examples[0].context, /小明\uF024"/);

  const second = fixGaiji(root);
  assert.deepEqual(second.changedFiles, []);
  assert.deepEqual(
    second.unknown.map(({ codePoint, count }) => [codePoint, count]),
    [["U+F024", 1]]
  );
});
