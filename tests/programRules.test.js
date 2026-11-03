const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { parseIntro } = require("../crawler/parsers/programRules");

const fixture = (id) =>
  fs.readFileSync(
    path.join(__dirname, "fixtures", "mprogram", `${id}.txt`),
    "utf8"
  );

test("AV2 intro keeps only the purpose clause", () => {
  assert.equal(
    parseIntro(fixture("AV2")),
    "本微學程主要以顯示面板領域作為跨領域之課程組合。"
  );
});

test("AV3 intro drops the minimum-credit clause", () => {
  const intro = parseIntro(fixture("AV3"));
  assert.equal(
    intro,
    "創業家精神微學程主要以微型創業概念作為跨領域之課程組合，讓學生有組織的進行跨領域多元學習。"
  );
  assert.doesNotMatch(intro, /學分|以下簡稱/);
});

test("AVS intro starts at the purpose article, skipping the legal basis article", () => {
  const intro = parseIntro(fixture("AVS"));
  assert.ok(intro.startsWith("本微學程為資訊工程系(簡稱資工系)為因應國家發展之資安人力需求"));
  assert.doesNotMatch(intro, /依據|訂定/);
});

test("AVW and AVK intros come from their purpose articles", () => {
  assert.ok(parseIntro(fixture("AVW")).startsWith("本微學程為培養教育與數據分析核心能力兼具之專業人才"));
  assert.ok(parseIntro(fixture("AVK")).startsWith("本微學程為資訊工程系(資工系)為培育跨系所數據分析人才"));
});

test("AZF intro is its single purpose sentence", () => {
  assert.equal(
    parseIntro(fixture("AZF")),
    "本微學程的主要目標是以培養學生具有金融科技創新與應用的專業知識與實務跨域能力。"
  );
});

test("AZ9 keeps a multi-clause purpose sentence", () => {
  const intro = parseIntro(fixture("AZ9"));
  assert.ok(
    intro.startsWith("本微學程為配合國家政策培養電動車與自駕車產業領域之專業人才，")
  );
  assert.ok(intro.endsWith("。"));
  assert.doesNotMatch(intro, /。。/);
});

test("line breaks and spaces inside CJK text do not change the result", () => {
  const spaced = fixture("AV2").replace(/([一-鿿])/g, "$1 ");
  assert.equal(parseIntro(spaced), parseIntro(fixture("AV2")));
});

const planFixture = (name) =>
  fs.readFileSync(path.join(__dirname, "fixtures", "program", `${name}.txt`), "utf8");

test("a plan's purpose section becomes the intro", () => {
  assert.equal(
    parseIntro(planFixture("AX0")),
    "本學程為訓練學生具備人工智慧的知識，培養學生具備數學演算法的使用能力、數據分析能力、演算法實現能力、系統設計與整合能力之四大核心能力。"
  );
  assert.equal(
    parseIntro(planFixture("B40")),
    "訓練學生以資料主權、算力主權與系統治理主權為核心之智慧醫療跨域學程。"
  );
});

test("a plan without a purpose section has no intro", () => {
  assert.equal(parseIntro(planFixture("I40")), null);
  assert.equal(parseIntro(planFixture("ENERGY")), null);
});

test("empty extracted text (a scanned PDF) has no intro", () => {
  assert.equal(parseIntro(""), null);
});
