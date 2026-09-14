const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const cheerio = require("cheerio");

const { fetchCourseDescription } = require("../crawler/fetchCourse");
const { writeSyllabusFile } = require("../crawler/fetchSyllabus");
const { parseQueryCourseHtml } = require("../crawler/parsers/queryCourse");
const {
  hasSyllabusContent,
  parseForeignLanguageTextbooks,
  parseSdgNumbers,
  parseSyllabusHtml,
  splitSyllabusOptions,
} = require("../crawler/parsers/syllabus");
const { buildSyllabusIndex } = require("../crawler/buildSyllabusIndex");

test("QueryCourse parser follows headings when columns are reordered", () => {
  const html = `
    <table>
      <tr>
        <th>課號</th><th>授課<BR>語言</th><th>課程名稱</th><th>備註</th>
        <th>撤</th><th>教學大綱<BR>與進度表</th><th>教師</th><th>人</th>
        <th>隨班<BR>附讀</th><th>實驗<BR>實習</th><th>跨領域</th><th>日</th>
        <th>一</th><th>二</th><th>三</th><th>四</th><th>五</th><th>六</th>
        <th>學分</th><th>時數</th><th>階段</th><th>修</th><th>班級</th>
        <th>教室</th><th>助教</th>
      </tr>
      <tr>
        <td>123456</td>
        <td>英語</td>
        <td><a href="Curr.jsp?format=-2&amp;code=ABC123">測試課程</a></td>
        <td>保留備註</td><td>2</td>
        <td><a href="ShowSyllabus.jsp?snum=123456&amp;code=42">查詢</a></td>
        <td><a href="Teach.jsp?format=-3&amp;code=42">測試教師</a></td>
        <td>7</td><td>可隨班</td><td>是</td><td>跨域標記</td><td>3 4</td>
        <td></td><td></td><td></td><td></td><td></td><td></td>
        <td>3.0</td><td>3</td><td>1</td><td>▲</td>
        <td><a href="Subj.jsp?format=-4&amp;code=99">測試班</a></td>
        <td><a href="Croom.jsp?format=-3&amp;code=88">教室(e)</a></td>
        <td><a href="Teach.jsp?format=-3&amp;code=43">測試助教</a></td>
      </tr>
    </table>`;

  const [course] = parseQueryCourseHtml(html);
  assert.equal(course.id, "123456");
  assert.equal(course.name.zh, "測試課程");
  assert.equal(course.language, "英語");
  assert.equal(course.audit, "可隨班");
  assert.equal(course.lab, "是");
  assert.equal(course.interdisciplinary, "跨域標記");
  assert.equal(course.people, "7");
  assert.equal(course.peopleWithdraw, "2");
  assert.deepEqual(course.time.sun, ["3", "4"]);
  assert.equal(course.classroom[0].name, "教室");
  assert.equal(course.ta[0].code, "43");
  assert.equal(course.syllabusLinks[0], "ShowSyllabus.jsp?snum=123456&code=42");
  assert.equal(course.courseDescriptionLink, "Curr.jsp?format=-2&code=ABC123");
});

function queryCourseHtml(headers, cells) {
  return `<table><tr>${headers.map((header) => `<th>${header}</th>`).join("")}</tr><tr>${cells.map((cell) => `<td>${cell}</td>`).join("")}</tr></table>`;
}

const requiredQueryHeaders = [
  "課號",
  "課程名稱",
  "階段",
  "學分",
  "時數",
  "修",
  "班級",
  "教師",
  "日",
  "一",
  "二",
  "三",
  "四",
  "五",
  "六",
  "教室",
  "人",
  "撤",
  "教學大綱與進度表",
  "備註",
];

const requiredQueryCells = [
  "654321",
  '<a href="Curr.jsp?format=-2&amp;code=654321">課程</a>',
  "1",
  "2",
  "2",
  "▲",
  "班級",
  "教師",
  "",
  "<br>3<br>4",
  "",
  "",
  "",
  "",
  "",
  "教室",
  "20",
  "0",
  '<a href="ShowSyllabus.jsp?snum=654321&amp;code=1">課綱</a>',
  "備註",
];

test("QueryCourse accepts old semesters without newer optional columns", () => {
  const course = parseQueryCourseHtml(
    queryCourseHtml(requiredQueryHeaders, requiredQueryCells)
  )[0];
  assert.equal(course.id, "654321");
  assert.equal(course.language, "");
  assert.equal(course.audit, "");
  assert.equal(course.lab, "");
  assert.equal(course.interdisciplinary, "");
  assert.deepEqual(course.ta, []);
  assert.deepEqual(course.time.mon, ["3", "4"]);
});

test("QueryCourse rejects a table missing the syllabus column", () => {
  const headers = requiredQueryHeaders.filter((header) => header !== "教學大綱與進度表");
  const cells = requiredQueryCells.filter((_, index) => requiredQueryHeaders[index] !== "教學大綱與進度表");
  assert.throws(
    () => parseQueryCourseHtml(queryCourseHtml(headers, cells)),
    /missing required columns: .*syllabusLinks/
  );
});

test("QueryCourse rejects a table missing a time column", () => {
  const headers = requiredQueryHeaders.filter((header) => header !== "一");
  const cells = requiredQueryCells.filter((_, index) => requiredQueryHeaders[index] !== "一");
  assert.throws(
    () => parseQueryCourseHtml(queryCourseHtml(headers, cells)),
    /missing required columns: .*mon/
  );
});

test("QueryCourse rejects a short course row instead of filling missing cells", () => {
  assert.throws(
    () => parseQueryCourseHtml(queryCourseHtml(requiredQueryHeaders, requiredQueryCells.slice(0, -1))),
    /row for 654321 is shorter than its header/
  );
});

test("course description parser rejects an HTTP-success error page", async () => {
  const errorPage = async () => cheerio.load("<html><body><h1>查無此課程</h1></body></html>");
  await assert.rejects(
    fetchCourseDescription("Curr.jsp?format=-2&code=missing", errorPage),
    /Course description table not found/
  );
});

test("course description parser validates code and preserves Chinese name for Nil English", async () => {
  const html = `
    <table>
      <tr><th>課程編碼Course Code</th><th>中文課程名稱Course Name (Chinese)</th><th>英文課程名稱Course Name (English)</th><th>總學分數Credits</th><th>總時數Hours</th></tr>
      <tr><td>654321</td><td>測試課程</td><td>Nil</td><td>2</td><td>2</td></tr>
      <tr><td>中文概述Chinese Description</td><td>課程描述</td></tr>
      <tr><td>英文概述English Description</td><td>Course description</td></tr>
    </table>`;
  const result = await fetchCourseDescription(
    "Curr.jsp?format=-2&code=654321",
    async () => cheerio.load(html)
  );
  assert.equal(result.code, "654321");
  assert.equal(result.name.zh, "測試課程");
  assert.equal(result.name.en, "");
  assert.equal(result.description.zh, "課程描述");
  assert.equal(result.description.en, "Course description");
});

test("course description parser rejects a data row without code or name", async () => {
  const html = `
    <table>
      <tr><th>課程編碼Course Code</th><th>中文課程名稱Course Name (Chinese)</th><th>英文課程名稱Course Name (English)</th></tr>
      <tr><td></td><td></td><td>Missing</td></tr>
    </table>`;
  await assert.rejects(
    fetchCourseDescription("Curr.jsp?format=-2&code=654321", async () => cheerio.load(html)),
    /missing course code or Chinese name/
  );
});

test("writeSyllabusFile replaces stale teachers and supports an empty rerun", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ntut-crawler-syllabus-"));
  const filePath = path.join(root, "654321.json");
  try {
    writeSyllabusFile(filePath, [{ name: "舊教師", objective: "舊課綱" }]);
    writeSyllabusFile(filePath, [{ name: "新教師", objective: "新課綱" }]);
    assert.deepEqual(JSON.parse(fs.readFileSync(filePath, "utf8")), [
      { name: "新教師", objective: "新課綱" },
    ]);
    writeSyllabusFile(filePath, []);
    assert.deepEqual(JSON.parse(fs.readFileSync(filePath, "utf8")), []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("syllabus parser keeps optional fields and extracts structured values", () => {
  const html = `
    <table>
      <tr><th>教師姓名</th><th>測試教師 <a href="Teach.jsp?format=-6&amp;year=115&amp;sem=1&amp;code=42">教師諮商時間(Office Hours)</a></th></tr>
      <tr><th>Email</th><td>teacher@example.invalid</td></tr>
      <tr><th>最後更新時間</th><td>2026-01-01 12:00:00</td></tr>
      <tr><th>課程大綱</th><td>測試課程大綱</td></tr>
      <tr><th>課程進度</th><td>第一週<br>第二週</td></tr>
      <tr><th>評量方式與標準</th><td>作業 100%</td></tr>
      <tr><th>使用教材、參考書目或其他</th><td>使用外文原文書：是<br><textarea>測試教材</textarea></td></tr>
      <tr><th>課程諮詢管道</th><td>請透過系統留言</td></tr>
      <tr><th>延伸教學與資源</th><td>● 資源甲（Resource A）<br>說明甲<br>● 無 (None)<br>● 資源乙</td></tr>
      <tr><th>課程對應SDGs指標</th><td>SDG3：健康<br>SDG18：應忽略<br>SDG 5：平等<br>SDG3：重複</td></tr>
      <tr><th>課程是否導入AI</th><td>● AI 選項甲<br>● AI 選項乙</td></tr>
      <tr><th>備註</th><td>測試備註</td></tr>
      <tr><th>未來欄位</th><td>保留欄位</td></tr>
    </table>`;

  const syllabus = parseSyllabusHtml(html);
  assert.equal(
    syllabus.officeHoursLink,
    "https://aps.ntut.edu.tw/course/mobile/Teach.jsp?format=-6&year=115&sem=1&code=42"
  );
  assert.equal(syllabus.foreignLanguageTextbooks, true);
  assert.equal(syllabus.materials, "測試教材");
  assert.equal(syllabus["未來欄位"], "保留欄位");
  assert.deepEqual(parseSdgNumbers(syllabus["課程對應SDGs指標"]), [3, 5]);
  assert.deepEqual(splitSyllabusOptions(syllabus["延伸教學與資源"]), [
    "資源甲（Resource A）\n說明甲",
    "資源乙",
  ]);
  assert.deepEqual(splitSyllabusOptions(syllabus["課程是否導入AI"]), [
    "AI 選項甲",
    "AI 選項乙",
  ]);
  assert.equal(hasSyllabusContent(syllabus), true);
});

test("syllabus parser preserves encoded and query-string URLs while spacing text", () => {
  const encodedUrl =
    "https://ithelp.ithome.com.tw/tags/articles/%E4%BC%81%E6%A5%AD%E8%B3%87%E6%96%99%E9%80%9A%E8%A8%8A";
  const queryUrl =
    "https://learn.saylor.org/mod/page/view.php?id=27461&forceview=1";
  const html = `
    <table>
      <tr><th>教師姓名</th><td>測試教師</td></tr>
      <tr><th>課程大綱</th><td>網路API課程</td></tr>
      <tr><th>使用教材、參考書目或其他</th><td>其他：1.${encodedUrl} 2.${queryUrl}</td></tr>
    </table>`;

  const syllabus = parseSyllabusHtml(html);

  assert.equal(syllabus.objective, "網路 API 課程");
  assert.equal(
    syllabus.materials,
    `其他：1.${encodedUrl} 2.${queryUrl}`
  );
  assert.equal(syllabus.materials.includes("% E4"), false);
  assert.equal(syllabus.materials.includes("id = 27461"), false);
  assert.equal(syllabus.materials.includes("forceview = 1"), false);
});

test("foreign textbook parsing distinguishes yes, no, and unfilled", () => {
  assert.deepEqual(parseForeignLanguageTextbooks("使用外文原文書：是\n教材"), {
    value: true,
    materials: "教材",
  });
  assert.deepEqual(parseForeignLanguageTextbooks("使用外文原文書：否\n教材"), {
    value: false,
    materials: "教材",
  });
  assert.deepEqual(parseForeignLanguageTextbooks("使用外文原文書：\n"), {
    value: null,
    materials: "",
  });
});

test("an unfilled syllabus stays unlisted even when office hours exist", () => {
  const html = `
    <table>
      <tr><th>教師姓名</th><th><a href="Teach.jsp?format=-6&amp;year=115&amp;sem=1&amp;code=7">教師諮商時間(Office Hours)</a></th></tr>
      <tr><th>最後更新時間</th><td>　</td></tr>
      <tr><th>課程大綱</th><td>　</td></tr>
      <tr><th>課程進度</th><td>　</td></tr>
      <tr><th>評量方式與標準</th><td>　</td></tr>
      <tr><th>使用教材、參考書目或其他</th><td>使用外文原文書：　<br><textarea>　</textarea></td></tr>
      <tr><th>課程諮詢管道</th><td>　</td></tr>
      <tr><th>延伸教學與資源</th><td>● 無（None）</td></tr>
      <tr><th>課程對應SDGs指標</th><td></td></tr>
      <tr><th>課程是否導入AI</th><td>● 無 (None)</td></tr>
      <tr><th>備註</th><td>　</td></tr>
    </table>`;
  const syllabus = parseSyllabusHtml(html);
  assert.equal(syllabus.officeHoursLink.includes("Teach.jsp?format=-6"), true);
  assert.equal(syllabus.foreignLanguageTextbooks, null);
  assert.equal(hasSyllabusContent(syllabus), false);
});

test("syllabus index rebuilds all departments and unions teacher data", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ntut-crawler-index-"));
  try {
    const semester = path.join(root, "115", "1");
    const courseDirectory = path.join(semester, "course");
    fs.mkdirSync(courseDirectory, { recursive: true });
    fs.writeFileSync(
      path.join(semester, "main.json"),
      JSON.stringify([
        { id: "100", syllabusLinks: ["ShowSyllabus.jsp?snum=100&code=1"] },
        { id: "200", syllabusLinks: [] },
      ])
    );
    fs.writeFileSync(path.join(semester, "進修部.json"), JSON.stringify([{ id: "300", syllabusLinks: [] }]));
    fs.writeFileSync(
      path.join(semester, "研究所(日間部、進修部、週末碩士班).json"),
      JSON.stringify([{ id: "100", syllabusLinks: ["another-teacher"] }])
    );
    fs.writeFileSync(
      path.join(courseDirectory, "100.json"),
      JSON.stringify([
        {
          name: "教師甲",
          objective: "有課綱",
          "課程是否導入AI": "● AI 甲",
          "延伸教學與資源": "● 資源甲",
          "課程對應SDGs指標": "SDG3：健康",
        },
        {
          name: "教師乙",
          objective: "另一份課綱",
          "課程是否導入AI": "● AI 乙",
          "延伸教學與資源": "● 資源乙",
          "課程對應SDGs指標": "SDG5：平等",
        },
      ])
    );
    // This is intentionally stale and must not leak into an entry whose
    // current course list has no syllabus link.
    fs.writeFileSync(
      path.join(courseDirectory, "200.json"),
      JSON.stringify([{ objective: "過期課綱", "課程是否導入AI": "● 過期選項" }])
    );

    const index = buildSyllabusIndex(115, 1, root);
    assert.deepEqual(index["100"], {
      ai: ["AI 甲", "AI 乙"],
      sdgs: [3, 5],
      resources: ["資源甲", "資源乙"],
      hasSyllabus: true,
    });
    assert.deepEqual(index["200"], {
      ai: [],
      sdgs: [],
      resources: [],
      hasSyllabus: false,
    });
    assert.deepEqual(index["300"], {
      ai: [],
      sdgs: [],
      resources: [],
      hasSyllabus: false,
    });
    assert.deepEqual(
      JSON.parse(fs.readFileSync(path.join(semester, "syllabus-index.json"), "utf8")),
      index
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
