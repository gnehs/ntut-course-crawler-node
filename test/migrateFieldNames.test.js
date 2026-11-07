const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { migrateSyllabusRecord } = require("../crawler/syllabusFields");
const {
  migrateDepartments,
  migrateFieldNames,
  migrateMPrograms,
} = require("../crawler/migrateFieldNames");

const legacySyllabus = {
  name: "測試教師",
  email: "t@example.invalid",
  officeHoursLink: "https://aps.ntut.edu.tw/course/mobile/Teach.jsp?format=-6",
  latestUpdate: "2026-01-01",
  objective: "大綱",
  schedule: "進度",
  scorePolicy: "作業",
  materials: "教材",
  consultation: "留言",
  remarks: "",
  foreignLanguageTextbooks: true,
  延伸教學與資源: "● 資源甲",
  課程對應SDGs指標: "SDG3",
  課程是否導入AI: "● 甲",
  未來欄位: "保留",
};

test("a legacy syllabus record becomes the target shape in order", () => {
  const migrated = migrateSyllabusRecord(legacySyllabus);
  assert.deepEqual(Object.keys(migrated), [
    "teacher", "email", "officeHoursLink", "latestUpdate", "outline", "schedule",
    "scorePolicy", "materials", "consultation", "remarks", "resources", "sdgs",
    "aiUsage", "foreignLanguageTextbooks", "extra",
  ]);
  assert.equal(migrated.teacher, "測試教師");
  assert.equal(migrated.outline, "大綱");
  assert.equal(migrated.resources, "● 資源甲");
  assert.equal(migrated.sdgs, "SDG3");
  assert.equal(migrated.aiUsage, "● 甲");
  assert.deepEqual(migrated.extra, { 未來欄位: "保留" });
});

test("a legacy record without the three optional rows gets empty strings", () => {
  const migrated = migrateSyllabusRecord({ name: "王", objective: "大綱" });
  assert.equal(migrated.resources, "");
  assert.equal(migrated.sdgs, "");
  assert.equal(migrated.aiUsage, "");
  assert.equal("extra" in migrated, false);
});

test("syllabus migration is idempotent and merges mixed old and new keys", () => {
  const once = migrateSyllabusRecord(legacySyllabus);
  assert.deepEqual(migrateSyllabusRecord(once), once);
  assert.equal(JSON.stringify(migrateSyllabusRecord(once)), JSON.stringify(once));

  const mixed = migrateSyllabusRecord({
    teacher: "新",
    name: "舊",
    outline: "新大綱",
    extra: { 甲: "1" },
    乙: "2",
  });
  assert.equal(mixed.teacher, "新");
  assert.equal("name" in mixed, false);
  assert.deepEqual(mixed.extra, { 甲: "1", 乙: "2" });
});

test("an empty extra is dropped and covid19 stays after the standard fields", () => {
  const migrated = migrateSyllabusRecord({ name: "王", covid19: { lv2Description: "x" }, extra: {} });
  assert.equal("extra" in migrated, false);
  assert.deepEqual(Object.keys(migrated).slice(-1), ["covid19"]);
});

test("department, mprogram and competency records rename keys in place", () => {
  assert.deepEqual(
    migrateDepartments([
      { name: "系", href: "a", class: [{ id: "1", name: "班", href: "b" }], category: "院" },
    ]),
    [{ name: "系", link: "a", class: [{ id: "1", name: "班", link: "b" }], category: "院" }]
  );
  const migrated = migrateMPrograms([{ id: "A", name: "學程", href: "u", course: ["1"] }]);
  assert.deepEqual(migrated, [{ id: "A", name: "學程", link: "u", courses: ["1"] }]);
  assert.deepEqual(migrateMPrograms(migrated), migrated);
});

test("migrateFieldNames rewrites by path, reports extra labels, and converges", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ntut-migrate-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const write = (relativePath, data, eol = "\r\n") => {
    const file = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${JSON.stringify(data, null, 2).replace(/\n/g, eol)}${eol}`);
  };
  const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
  write("113/1/course/1.json", [legacySyllabus], "\n");
  write("113/1/department.json", [{ name: "系", href: "a", class: [] }]);
  write("113/1/mprogram.json", [{ id: "A", name: "學程", href: "u", course: [] }]);
  write("113/1/programs.json", [{ id: "B", name: "學程", href: "u", courses: [] }]);
  write("competencies.json", [{ id: "30", name: "機械系", href: "u", abilities: [], courses: [] }]);
  write("113/1/main.json", [{ id: "1", href: "untouched" }]);

  const first = migrateFieldNames(root);
  assert.equal(first.changedFiles.length, 5);
  assert.deepEqual(first.movedLabels, [{ label: "未來欄位", count: 1 }]);
  assert.equal(first.stats.syllabus.rewritten, 1);
  assert.equal(JSON.parse(read("113/1/course/1.json"))[0].teacher, "測試教師");
  assert.ok(read("113/1/course/1.json").endsWith("}\n]\n"));
  assert.ok(!read("113/1/course/1.json").includes("\r"));
  assert.ok(read("113/1/mprogram.json").includes('"courses": []\r\n'));
  assert.equal(JSON.parse(read("competencies.json"))[0].link, "u");
  assert.equal(JSON.parse(read("113/1/main.json"))[0].href, "untouched");

  const second = migrateFieldNames(root);
  assert.equal(second.changedFiles.length, 0);
  assert.deepEqual(second.movedLabels, []);
});
