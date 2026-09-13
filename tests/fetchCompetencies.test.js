const test = require("node:test");
const assert = require("node:assert/strict");
const {
  discoverCompetencyDepartments,
  parseCompetencyPage,
} = require("../crawler/fetchCompetencies");

test("discovers competency departments only from the official entry links", () => {
  const departments = discoverCompetencyDepartments(`
    <a href="CurrCCI.jsp?format=-2&&code=30">機械系</a>
    <a href="CurrCCI.jsp?format=-2&code=30">重複連結</a>
    <a href="https://example.invalid/CurrCCI.jsp?format=-2&code=BAD">外部連結</a>
    <a href="CurrCCI.jsp?format=-3&code=3001011">課程能力</a>
  `);
  assert.deepEqual(departments, [
    {
      id: "30",
      name: "機械系",
      href: "https://aps.ntut.edu.tw/course/tw/CurrCCI.jsp?format=-2&&code=30",
    },
  ]);
});

test("parses ability headers and marked course mappings", () => {
  const parsed = parseCompetencyPage(`
    <h2><img src="ball.gif">測試系 課程能力指標</h2>
    <table>
      <tr>
        <th rowspan="2">序號</th><th rowspan="2">課程編碼</th><th rowspan="2">課程名稱</th>
        <th colspan="2">核心能力</th>
      </tr>
      <tr><th>1.分析能力</th><th>A.實作能力</th></tr>
      <tr><td>1</td><td><a href="CurrCCI.jsp?format=-3&code=C001">C001</a></td><td>資料分析</td><td>※</td><td>　</td></tr>
      <tr><td>2</td><td>C002</td><td>系統實作</td><td>　</td><td>※</td></tr>
      <tr><td>3</td><td>C002</td><td>系統實作</td><td>※</td><td>※</td></tr>
    </table>
  `);
  assert.deepEqual(parsed.abilities, [
    { id: "1", name: "分析能力" },
    { id: "A", name: "實作能力" },
  ]);
  assert.deepEqual(parsed.courses, [
    { code: "C001", name: "資料分析", abilityIds: ["1"] },
    { code: "C002", name: "系統實作", abilityIds: ["A", "1"] },
  ]);
});

test("rejects an unrecognized competency page instead of treating it as empty", () => {
  assert.throws(
    () => parseCompetencyPage("<html><title>登入</title><body>登入</body></html>"),
    /錯誤或登入頁/
  );
  assert.throws(
    () => parseCompetencyPage("<h2>測試系</h2><p>頁面格式已變更</p>"),
    /缺少矩陣表/
  );
  assert.deepEqual(
    parseCompetencyPage("<h2>測試系</h2><p>查無本系能力指標資料</p>"),
    { abilities: [], courses: [], title: "測試系" }
  );
  assert.throws(
    () =>
      parseCompetencyPage(
        '<table><tr><th>序號</th><th>課程編碼</th><th>課程名稱</th></tr><tr><td>1</td><td></td><td>未知</td></tr></table>'
      ),
    /課程列無法解析/
  );
});
