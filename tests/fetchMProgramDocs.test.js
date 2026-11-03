const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  fetchMProgramDocs,
  parseMProgramDocsPage,
} = require("../crawler/fetchMProgramDocs");

const pageHtml = fs.readFileSync(
  path.join(__dirname, "fixtures", "mprogram", "docs-page.html"),
  "utf8"
);
const FILES = "https://oaa.ntut.edu.tw/var/file/8/1008/img/2880";

test("parses programs with rewritten links and clean names", () => {
  const programs = parseMProgramDocsPage(pageHtml);
  assert.ok(programs.length >= 10);
  assert.deepEqual(
    programs.map((p) => p.id),
    [...programs.map((p) => p.id)].sort()
  );
  const byId = Object.fromEntries(programs.map((p) => [p.id, p]));

  assert.deepEqual(byId.AV2, {
    id: "AV2",
    name: "面板微學程",
    rules: `${FILES}/AV002.pdf`,
    plan: `${FILES}/AV2.pdf`,
    apply: `${FILES}/AV2_apply.odt`,
  });
  assert.equal(byId.AV1.name, "大腦科學工程微學程");
  assert.equal(byId.AV1.apply, null);
  assert.equal(byId.AV1.rules, `${FILES}/AV001.pdf`);
});

test("picks the visible duplicate link of a cell", () => {
  const byId = Object.fromEntries(
    parseMProgramDocsPage(pageHtml).map((p) => [p.id, p])
  );
  assert.equal(byId.AV4.plan, `${FILES}/AV4_.pdf`);
});

test("never emits links on the retired host", () => {
  for (const program of parseMProgramDocsPage(pageHtml)) {
    for (const url of [program.rules, program.plan, program.apply]) {
      if (url) assert.match(url, /^https:\/\/oaa\.ntut\.edu\.tw\//);
    }
  }
});

test("throws when the table is missing or too small", () => {
  assert.throws(() => parseMProgramDocsPage("<html><body>nothing</body></html>"), /停止更新/);
  const tiny = `<table><tr><td>施行細則</td><td>課程規劃表</td><td>修畢申請表</td></tr>
    <tr><td>AV2</td><td>面板微學程</td><td></td><td></td><td></td></tr></table>`;
  assert.throws(() => parseMProgramDocsPage(tiny), /停止更新/);
});

test("a PDF failure keeps the program with a null intro", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mprogram-docs-"));
  const outputPath = path.join(dir, "mprogram-docs.json");
  const rulesText =
    "一、本微學程主要培養跨域人才。\n二、應至少修畢本微學程規劃之課程八學分。";
  const result = await fetchMProgramDocs({
    outputPath,
    fetchHtml: async () => pageHtml,
    fetchPdf: async (url) => {
      if (url.endsWith("AV002.pdf")) throw new Error("boom");
      return url;
    },
    pdfToText: async () => rulesText,
  });
  const byId = Object.fromEntries(result.programs.map((p) => [p.id, p]));
  assert.equal(byId.AV2.intro, null);
  assert.equal(byId.AV3.intro, "本微學程主要培養跨域人才。");
  assert.deepEqual(JSON.parse(fs.readFileSync(outputPath, "utf8")), result);
});

test("a failed page fetch publishes nothing", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mprogram-docs-"));
  const outputPath = path.join(dir, "mprogram-docs.json");
  await assert.rejects(
    fetchMProgramDocs({
      outputPath,
      fetchHtml: async () => {
        throw new Error("offline");
      },
    }),
    /offline/
  );
  assert.equal(fs.existsSync(outputPath), false);
});
