const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  discoverMPrograms,
  fetchMProgram,
  parseMProgramPage,
} = require("../crawler/fetchMProgram");

const entryStart =
  '<html><head><title>微學程查詢專區</title></head><body>' +
  "<h2>115 學年度第 1 學期 各類微學程開課資料暨上課時間表</h2>";

test("discovers only APS HTTPS micro-program links and de-duplicates ids", () => {
  const programs = discoverMPrograms(`
    ${entryStart}
    <a href="SearchMProgram.jsp?format=-2&year=115&sem=1&code=AV2">面板微學程</a>
    <a href="SearchMProgram.jsp?format=-2&year=115&sem=1&code=AV2">重複連結</a>
    <a href="https://example.invalid/SearchMProgram.jsp?format=-2&code=BAD">外部連結</a>
    <a href="javascript:void(0)">無效連結</a>
  `);
  assert.deepEqual(programs, [
    {
      id: "AV2",
      name: "面板微學程",
      href: "https://aps.ntut.edu.tw/course/tw/SearchMProgram.jsp?format=-2&year=115&sem=1&code=AV2",
    },
  ]);
});
test("accepts a valid empty micro-program table and explicit no-data page", () => {
  assert.deepEqual(
    parseMProgramPage(`
      <title>微學程查詢專區</title>
      <h3>115 學年度第 1 學期 【空白微學程】開課資料暨上課時間表</h3>
      <table><tr><th>課號</th><th>課程名稱</th></tr></table>
    `),
    []
  );
  assert.deepEqual(
    parseMProgramPage(
      "<title>微學程查詢專區</title><p>查無本學期微學程開課資料</p>"
    ),
    []
  );
});

test("rejects login and changed micro-program pages", () => {
  assert.throws(
    () => parseMProgramPage("<title>登入</title><body>登入</body>"),
    /錯誤或登入頁/
  );
  assert.throws(
    () => parseMProgramPage("<title>微學程查詢專區</title><p>頁面格式已變更</p>"),
    /缺少課程表/
  );
  assert.throws(
    () =>
      parseMProgramPage(
        '<table><tr><th>課號</th><th>課程名稱</th></tr><tr><td></td><td>未知</td></tr></table>'
      ),
    /課程列無法解析/
  );
});

test("does not replace an existing snapshot when a micro-program detail fails", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ntut-mprogram-test-"));
  const previous = process.cwd();
  const outputPath = path.join(root, "dist", "115", "1", "mprogram.json");
  const oldData = [{ id: "OLD", name: "舊資料", href: "https://aps.ntut.edu.tw/old", course: [] }];
  try {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(oldData));
    process.chdir(root);
    await assert.rejects(
      fetchMProgram(
        115,
        1,
        `${entryStart}<a href="SearchMProgram.jsp?format=-2&code=AV2">面板微學程</a>`,
        { AV2: "<title>登入</title><body>登入</body>" }
      ),
      /錯誤或登入頁/
    );
    assert.deepEqual(JSON.parse(fs.readFileSync(outputPath, "utf8")), oldData);
  } finally {
    process.chdir(previous);
    fs.rmSync(root, { recursive: true, force: true });
  }
});
