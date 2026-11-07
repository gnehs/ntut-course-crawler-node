const fs = require("node:fs");
const path = require("node:path");
const { indentedText } = require("./indentJson");
const { migrateSyllabusRecord } = require("./syllabusFields");
const { jsonFiles } = require("./tools/jsonFiles");

// Renames `from` to `to` in place so key order survives. When a record has
// both spellings the current one wins.
function renameKey(record, from, to) {
  if (record === null || typeof record !== "object" || !(from in record)) return record;
  const renamed = {};
  for (const [key, value] of Object.entries(record)) {
    if (key !== from) renamed[key] = value;
    else if (!(to in record)) renamed[to] = value;
  }
  return renamed;
}

const renameKeys = (record, renames) =>
  Object.entries(renames).reduce((result, [from, to]) => renameKey(result, from, to), record);

const migrateSyllabusFile = (records) => records.map(migrateSyllabusRecord);

const migrateDepartments = (groups) =>
  groups.map((group) => {
    const renamed = renameKey(group, "href", "link");
    return Array.isArray(renamed.class)
      ? { ...renamed, class: renamed.class.map((item) => renameKey(item, "href", "link")) }
      : renamed;
  });

const migrateMPrograms = (programs) =>
  programs.map((program) => renameKeys(program, { href: "link", course: "courses" }));

const migratePrograms = (programs) => programs.map((program) => renameKey(program, "href", "link"));

const migrateCompetencies = (departments) =>
  departments.map((department) => renameKey(department, "href", "link"));

const KINDS = {
  syllabus: migrateSyllabusFile,
  department: migrateDepartments,
  mprogram: migrateMPrograms,
  programs: migratePrograms,
  competencies: migrateCompetencies,
};

function kindOf(relativePath) {
  const segments = relativePath.split(path.sep);
  if (segments.length === 1 && segments[0] === "competencies.json") return "competencies";
  if (segments.length === 3) {
    if (segments[2] === "department.json") return "department";
    if (segments[2] === "mprogram.json") return "mprogram";
    if (segments[2] === "programs.json") return "programs";
  }
  if (segments.length === 4 && segments[2] === "course") return "syllabus";
  return null;
}

// Syllabus keys that moved into `extra`, with how many records carry each.
function countExtraLabels(records, labels) {
  for (const record of records) {
    for (const label of Object.keys(record?.extra ?? {})) {
      labels.set(label, (labels.get(label) ?? 0) + 1);
    }
  }
}

// Rewrites published JSON into the current field names. Files whose data does
// not change keep their bytes, so a second run rewrites nothing.
function migrateFieldNames(root = "dist") {
  const stats = {};
  for (const kind of Object.keys(KINDS)) stats[kind] = { scanned: 0, rewritten: 0 };
  const extraLabels = new Map();
  const changedFiles = [];
  for (const file of jsonFiles(root)) {
    const relativePath = path.relative(root, file);
    const kind = kindOf(relativePath);
    if (!kind) continue;
    stats[kind].scanned += 1;
    const original = fs.readFileSync(file, "utf8");
    const before = JSON.parse(original);
    if (!Array.isArray(before)) continue;
    const after = KINDS[kind](before);
    if (kind === "syllabus") {
      const previously = new Map();
      countExtraLabels(before, previously);
      const now = new Map();
      countExtraLabels(after, now);
      for (const [label, count] of now) {
        const added = count - (previously.get(label) ?? 0);
        if (added > 0) extraLabels.set(label, (extraLabels.get(label) ?? 0) + added);
      }
    }
    if (JSON.stringify(after) === JSON.stringify(before)) continue;
    fs.writeFileSync(file, indentedText(relativePath, after), "utf8");
    stats[kind].rewritten += 1;
    changedFiles.push(relativePath);
  }
  const movedLabels = [...extraLabels]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  return { changedFiles, stats, movedLabels };
}

module.exports = {
  migrateCompetencies,
  migrateDepartments,
  migrateFieldNames,
  migrateMPrograms,
  migratePrograms,
  migrateSyllabusFile,
};
