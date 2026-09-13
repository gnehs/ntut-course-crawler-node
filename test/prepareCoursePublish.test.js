const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { prepareCoursePublish } = require("../crawler/prepareCoursePublish");

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ntut-publish-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const dir = path.join(root, "115", "1");
  fs.mkdirSync(path.join(dir, "course"), { recursive: true });
  const write = (name, data) => fs.writeFileSync(path.join(dir, name), JSON.stringify(data));
  write("main.json", [{ id: "101", syllabusLinks: ["example"] }]);
  write("進修部.json", [{ id: "102", syllabusLinks: [] }]);
  write("研究所(日間部、進修部、週末碩士班).json", [{ id: "101", syllabusLinks: ["example"] }]);
  write("course/101.json", [{ objective: "Synthetic syllabus" }]);
  write("course/999.json", [{ objective: "Stale course" }]);
  return { root, dir, write };
}

test("snapshot deduplicates departments and excludes stale courses without changing inputs", (t) => {
  const { root, dir } = fixture(t);
  const result = prepareCoursePublish("115", "1", root);
  t.after(() => fs.rmSync(result.directory, { recursive: true, force: true }));
  assert.equal(result.destination, "115/1/course");
  assert.deepEqual(fs.readdirSync(result.directory).sort(), ["101.json", "102.json"]);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(result.directory, "102.json"))), []);
  assert.ok(fs.existsSync(path.join(dir, "course", "999.json")));
});

test("missing department manifest blocks publication", (t) => {
  const { root, dir } = fixture(t);
  fs.unlinkSync(path.join(dir, "進修部.json"));
  assert.throws(() => prepareCoursePublish("115", "1", root));
});

test("missing or partial required syllabi block publication", (t) => {
  const { root, dir, write } = fixture(t);
  write("course/101.json", []);
  assert.throws(() => prepareCoursePublish("115", "1", root), /Incomplete/);
  fs.unlinkSync(path.join(dir, "course", "101.json"));
  assert.throws(() => prepareCoursePublish("115", "1", root));
});

test("unsafe paths and fully empty manifests cannot replace published courses", (t) => {
  const { root, write } = fixture(t);
  assert.throws(() => prepareCoursePublish("../115", "1", root), /Invalid semester/);
  write("main.json", [{ id: "../101", syllabusLinks: [] }]);
  assert.throws(() => prepareCoursePublish("115", "1", root), /Invalid course record/);
  for (const name of ["main.json", "進修部.json", "研究所(日間部、進修部、週末碩士班).json"]) write(name, []);
  assert.throws(() => prepareCoursePublish("115", "1", root), /empty semester/);
});
