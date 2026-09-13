const test = require("node:test");
const assert = require("node:assert/strict");
const {
  discoverPrograms,
  parseProgramPage,
} = require("../crawler/fetchPrograms");

test("discovers absolute HTTPS program links and stable ids", () => {
  const programs = discoverPrograms(`
    <a href="SearchProgram.jsp?format=-2&year=115&sem=1&code=A20">創新產業管理學程</a>
    <a href="SearchProgram.jsp?format=-2&year=115&sem=1&code=A20">重複連結</a>
    <a href="https://example.invalid/SearchProgram.jsp?format=-2&code=BAD">外部連結</a>
    <a href="Curr.jsp?format=-2&code=0461006">課程資料</a>
  `);
  assert.deepEqual(programs, [
    {
      id: "A20",
      name: "創新產業管理學程",
      href: "https://aps.ntut.edu.tw/course/tw/SearchProgram.jsp?format=-2&year=115&sem=1&code=A20",
    },
  ]);
});

test("parses and de-duplicates course offering ids without inventing descriptions", () => {
  const parsed = parseProgramPage(`
    <h3>測試學程</h3>
    <table>
      <tr><th>課號</th><th>課程名稱</th><th>備註</th></tr>
      <tr><td>366001</td><td>資料結構</td><td></td></tr>
      <tr><td>366001</td><td>資料結構</td><td></td></tr>
      <tr><td>366002</td><td>網路概論</td><td></td></tr>
    </table>
    <p>備註：此頁由學校課務資料提供。</p>
  `);
  assert.deepEqual(parsed, { courses: ["366001", "366002"] });
});

test("keeps an explicitly labeled program description", () => {
  const parsed = parseProgramPage(`
    <table>
      <tr><th>課號</th><th>課程名稱</th></tr>
      <tr><td>366001</td><td>資料結構</td></tr>
    </table>
    <p>修課規定：需修畢指定核心課程。</p>
  `);
  assert.equal(parsed.description, "需修畢指定核心課程。");
});

test("rejects an unrecognized program page instead of treating it as empty", () => {
  assert.throws(
    () => parseProgramPage("<html><title>登入</title><body>登入</body></html>"),
    /錯誤或登入頁/
  );
  assert.throws(
    () => parseProgramPage("<h3>測試學程</h3><p>頁面格式已變更</p>"),
    /缺少課程表/
  );
  assert.deepEqual(
    parseProgramPage("<h3>測試學程</h3><p>查無本學期課程資料</p>"),
    { courses: [] }
  );
  assert.throws(
    () =>
      parseProgramPage(
        '<table><tr><th>課號</th><th>課程名稱</th></tr><tr><td></td><td>未知</td></tr></table>'
      ),
    /課程列無法解析/
  );
});
