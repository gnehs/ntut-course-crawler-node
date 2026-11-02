const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { indentJson } = require("../crawler/indentJson");

test("indentJson indents minified JSON the way the crawler writes each path", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ntut-indent-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const write = (relativePath, text) => {
    fs.mkdirSync(path.dirname(path.join(root, relativePath)), { recursive: true });
    fs.writeFileSync(path.join(root, relativePath), text);
  };
  const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
  write("99/1/main.json", '[{"id":"1"}]');
  write("99/1/course/1.json", '[{"name":"王"}]');
  write("analytics/withdrawal-rate.json", '{"王":"1.00"}');
  write("calendar.json", '[{"summary":"開學"}]');
  const indented = '[\r\n  {\r\n    "id": "2"\r\n  }\r\n]\r\n';
  write("115/1/main.json", indented);

  const first = indentJson(root);
  assert.deepEqual(first.changedFiles.sort(), [
    path.join("99", "1", "course", "1.json"),
    path.join("99", "1", "main.json"),
    path.join("analytics", "withdrawal-rate.json"),
    "calendar.json",
  ].sort());
  assert.equal(read("99/1/main.json"), '[\r\n  {\r\n    "id": "1"\r\n  }\r\n]\r\n');
  assert.equal(read("99/1/course/1.json"), '[\n  {\n    "name": "王"\n  }\n]\n');
  assert.equal(read("analytics/withdrawal-rate.json"), '{\n  "王": "1.00"\n}');
  assert.equal(read("calendar.json"), '[\n  {\n    "summary": "開學"\n  }\n]');
  assert.equal(read("115/1/main.json"), indented);

  assert.deepEqual(indentJson(root).changedFiles, []);
});
