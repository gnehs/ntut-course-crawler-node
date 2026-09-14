const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const cheerio = require("cheerio");

const {
  BASE_URL,
  groupStandardDepartments,
  parseDepartmentLinks,
  parseStandardLink,
  parseSystemLinks,
  parseYearLinks,
} = require("../crawler/standardLinks");
const {
  YEARS_URL,
  fetchStandardDepartments,
} = require("../crawler/fetchStandardDepartments");
const {
  buildStandardDepartmentIndex,
  extractDepartmentMetadata,
} = require("../crawler/fetchStandards");

test("parses relative APS year and system links with URLSearchParams", () => {
  assert.deepEqual(
    parseYearLinks(`
      <a href="./Cprog.jsp?format=-2&year=109">109 學年度入學</a>
      <a href="https://aps.ntut.edu.tw/course/tw/Cprog.jsp?year=115&format=-2">115 學年度入學</a>
      <a href="https://example.invalid/Cprog.jsp?format=-2&year=999">外部</a>
      <a href="./Cprog.jsp?format=-3&year=109&matric=7">錯誤格式</a>
    `),
    [
      {
        year: "109",
        href: `${BASE_URL}Cprog.jsp?format=-2&year=109`,
        name: "109 學年度入學",
      },
      {
        year: "115",
        href: `${BASE_URL}Cprog.jsp?year=115&format=-2`,
        name: "115 學年度入學",
      },
    ]
  );

  assert.deepEqual(
    parseSystemLinks(
      `
        <a href="./Cprog.jsp?format=-3&year=109&matric=7">四技</a>
        <a href="./Cprog.jsp?matric=A&year=109&format=-3">ＥＭＢＡ</a>
        <a href="./Cprog.jsp?format=-3&year=110&matric=8">不同年度</a>
        <a href="./Cprog.jsp?format=-2&year=109">不同格式</a>
        <a href="./Cprog.jsp?format=-3&year=109">缺少學制</a>
      `,
      "109"
    ),
    [
      {
        system: "四技",
        matric: "7",
        year: "109",
        href: `${BASE_URL}Cprog.jsp?format=-3&year=109&matric=7`,
      },
      {
        system: "ＥＭＢＡ",
        matric: "A",
        year: "109",
        href: `${BASE_URL}Cprog.jsp?matric=A&year=109&format=-3`,
      },
    ]
  );
});

test("normalizes department labels to the same keys used by standard.json", () => {
  const departments = parseDepartmentLinks(
    `
      <a href="./Cprog.jsp?format=-4&year=115&matric=7&division=331">材資系 【材料組】</a>
      <a href="./Cprog.jsp?format=-4&year=115&matric=7&division=332">材資系 【資源組】</a>
      <a href="./Cprog.jsp?format=-4&year=115&matric=7&division=450">能源冷凍空調系</a>
      <a href="./Cprog.jsp?format=-4&year=115&matric=7">缺少 division</a>
      <a href="./Cprog.jsp?format=-3&year=115&matric=7&division=999">錯誤格式</a>
      <a href="https://example.invalid/course/tw/Cprog.jsp?format=-4&year=115&matric=7&division=999">外部連結</a>
      <a href="./Cprog.jsp?format=-4&year=114&matric=7&division=999">不同年度</a>
    `,
    { year: 115, matric: 7 }
  );

  assert.deepEqual(
    departments.map(({ department, division, matric }) => ({
      department,
      division,
      matric,
    })),
    [
      { department: "材資系【材料組】", division: "331", matric: "7" },
      { department: "材資系【資源組】", division: "332", matric: "7" },
      { department: "能源冷凍空調系", division: "450", matric: "7" },
    ]
  );
  assert.equal(parseStandardLink("not a url"), null);
  assert.equal(
    parseStandardLink("http://aps.ntut.edu.tw/course/tw/Cprog.jsp?format=-4"),
    null
  );
});

test("groups a system's parsed links into the public flat index shape", () => {
  assert.deepEqual(
    groupStandardDepartments(
      { system: "四技", matric: "7" },
      [{ department: "資財系", division: "AB0", matric: "7" }]
    ),
    [{ system: "四技", department: "資財系", division: "AB0", matric: "7" }]
  );
});

test("builds standard-departments.json metadata from the existing standard shape", () => {
  assert.deepEqual(
    buildStandardDepartmentIndex({
      四技: {
        "材資系【材料組】": {
          credits: { 必修: "1" },
          division: "331",
          matric: "7",
          courses: [],
          rules: [],
        },
      },
      ＥＭＢＡ: {
        資財系: {
          credits: {},
          division: "AB0",
          matric: "D",
          courses: [],
          rules: [],
        },
      },
    }),
    [
      { system: "四技", department: "材資系【材料組】", division: "331", matric: "7" },
      { system: "ＥＭＢＡ", department: "資財系", division: "AB0", matric: "D" },
    ]
  );
});

test("extracts optional standard.json department metadata from official URLs", () => {
  assert.deepEqual(
    extractDepartmentMetadata(
      "./Cprog.jsp?format=-4&year=109&matric=7&division=AB0"
    ),
    {
      href: `${BASE_URL}Cprog.jsp?format=-4&year=109&matric=7&division=AB0`,
      division: "AB0",
      matric: "7",
    }
  );
  assert.equal(
    extractDepartmentMetadata("./Cprog.jsp?format=-3&year=109&matric=7"),
    null
  );
  assert.equal(extractDepartmentMetadata("invalid"), null);
});

test("rejects incomplete metadata instead of writing an unusable index", () => {
  assert.throws(
    () =>
      buildStandardDepartmentIndex({
        四技: {
          資財系: { credits: {}, courses: [], rules: [], matric: "7" },
        },
      }),
    /metadata is incomplete/
  );
});

test("light index crawler only requests format -1, -2, and -3 pages", async () => {
  const pages = new Map([
    [
      YEARS_URL,
      `<a href="./Cprog.jsp?format=-2&year=109">109 學年度入學</a>`,
    ],
    [
      `${BASE_URL}Cprog.jsp?format=-2&year=109`,
      `<a href="./Cprog.jsp?format=-3&year=109&matric=7">四技</a>`,
    ],
    [
      `${BASE_URL}Cprog.jsp?format=-3&year=109&matric=7`,
      `<a href="./Cprog.jsp?format=-4&year=109&matric=7&division=AB0">資財系</a>
       <a href="./Cprog.jsp?format=-4&year=109&matric=7&division=590">資工系</a>`,
    ],
  ]);
  const calls = [];
  const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ntut-standard-index-"));

  try {
    const snapshots = await fetchStandardDepartments(null, {
      outputRoot,
      fetchPage: async (url) => {
        calls.push(url);
        const html = pages.get(url);
        assert.ok(html, `unexpected request: ${url}`);
        return cheerio.load(html);
      },
    });

    assert.deepEqual(snapshots[0].departments, [
      { system: "四技", department: "資財系", division: "AB0", matric: "7" },
      { system: "四技", department: "資工系", division: "590", matric: "7" },
    ]);
    assert.deepEqual(
      JSON.parse(
        fs.readFileSync(
          path.join(outputRoot, "109", "standard-departments.json"),
          "utf8"
        )
      ),
      snapshots[0].departments
    );
    assert.deepEqual(calls, [
      YEARS_URL,
      `${BASE_URL}Cprog.jsp?format=-2&year=109`,
      `${BASE_URL}Cprog.jsp?format=-3&year=109&matric=7`,
    ]);
    assert.ok(calls.every((url) => /[?&]format=-[123](?:&|$)/.test(url)));
  } finally {
    fs.rmSync(outputRoot, { recursive: true, force: true });
  }
});

test("light index crawler refuses to write when every system has no departments", async () => {
  const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ntut-standard-empty-"));
  try {
    await assert.rejects(
      fetchStandardDepartments(["109"], {
        outputRoot,
        fetchPage: async (url) => {
          if (url === `${BASE_URL}Cprog.jsp?format=-2&year=109`) {
            return cheerio.load(
              `<a href="./Cprog.jsp?format=-3&year=109&matric=7">四技</a>`
            );
          }
          return cheerio.load("<p>此學制目前沒有系所</p>");
        },
      }),
      /no departments for year 109/
    );
    assert.equal(
      fs.existsSync(path.join(outputRoot, "109", "standard-departments.json")),
      false
    );
  } finally {
    fs.rmSync(outputRoot, { recursive: true, force: true });
  }
});
