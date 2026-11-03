const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  fetchProgramDocs,
  parseProgramDocsPage,
} = require("../crawler/fetchProgramDocs");

const pageHtml = fs.readFileSync(
  path.join(__dirname, "fixtures", "program", "docs-page.html"),
  "utf8"
);
const FILES = "https://oaa.ntut.edu.tw/var/file/8/1008/img";

const byName = () =>
  Object.fromEntries(parseProgramDocsPage(pageHtml).map((p) => [p.name, p]));

test("parses a plain row with absolute links", () => {
  const program = byName()["人工智慧科技學程"];
  assert.deepEqual(program, {
    name: "人工智慧科技學程",
    code: null,
    rules: `${FILES}/4321/AX0_.pdf`,
    plan: null,
    apply: `${FILES}/547267148.docx`,
  });
});

test("keeps the page's 序號 order", () => {
  const names = parseProgramDocsPage(pageHtml).map((p) => p.name);
  assert.equal(names[0], "人工智慧科技學程");
  assert.equal(names[1], "智慧感測與應用學程");
  assert.equal(names.at(-1), "主權AI智慧醫療學程");
  assert.equal(names.length, 26);
});

test("takes the APS code from the name link and strips the status from the name", () => {
  const programs = byName();
  assert.equal(programs["智慧感測與應用學程"].code, "2407");
  assert.equal(programs["節能科技學程"].code, "AF0");
  assert.equal(programs["半導體科技學程"].code, "690");
  assert.equal(programs["科技法律學程"].code, null);
});

test("a name's inner parenthetical stays, a trailing status is stripped", () => {
  assert.ok(byName()["無線射頻辨識(RFID)基礎應用技術學程"]);
});

test("starred remarks and revision announcements are stripped from names", () => {
  const programs = byName();
  assert.equal(programs["教育學程"].rules, null);
  assert.equal(programs["教育學程"].apply, null);
  assert.ok(programs["光電智慧製造學程"]);
  assert.equal(programs["工業4.0_電資學程"].name, "工業4.0_電資學程");
});

test("uses the icon link of the apply cell, not the page link beside it", () => {
  const program = byName()["智慧感測與應用學程"];
  assert.equal(program.apply, `${FILES}/149285833.docx`);
});

test("a row without a rules file keeps a null link", () => {
  const programs = byName();
  assert.equal(programs["奈米科技學程"].rules, null);
});

test("throws when the table is missing or too small", () => {
  assert.throws(() => parseProgramDocsPage("<html><body>nothing</body></html>"), /停止更新/);
  const tiny = `<table><tr><td>序號</td><td>學程名稱</td><td>課程規劃表</td><td>修畢申請表</td><td>學程設置負責人</td></tr>
    <tr><td>1</td><td>測試學程</td><td></td><td></td><td></td></tr></table>`;
  assert.throws(() => parseProgramDocsPage(tiny), /停止更新/);
});

test("a PDF failure keeps the program with a null intro", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "program-docs-"));
  const outputPath = path.join(dir, "program-docs.json");
  const rulesText =
    "宗旨 教學目標 培育跨域人才。 課程規劃 備註 應至少修畢 18 學分";
  const result = await fetchProgramDocs({
    outputPath,
    fetchHtml: async () => pageHtml,
    fetchPdf: async (url) => {
      if (url.endsWith("AX0_.pdf")) throw new Error("boom");
      return url;
    },
    pdfToText: async () => rulesText,
  });
  const programs = Object.fromEntries(result.programs.map((p) => [p.name, p]));
  assert.equal(programs["人工智慧科技學程"].intro, null);
  assert.equal(programs["科技法律學程"].intro, "培育跨域人才。");
  assert.equal(programs["奈米科技學程"].intro, null);
  assert.deepEqual(JSON.parse(fs.readFileSync(outputPath, "utf8")), result);
});

test("a failed page fetch publishes nothing", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "program-docs-"));
  const outputPath = path.join(dir, "program-docs.json");
  await assert.rejects(
    fetchProgramDocs({
      outputPath,
      fetchHtml: async () => {
        throw new Error("offline");
      },
    }),
    /offline/
  );
  assert.equal(fs.existsSync(outputPath), false);
});
