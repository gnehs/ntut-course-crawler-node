// node migrateFieldNames.js <dir>
// Rewrites already published JSON under dir, such as a gh-pages checkout, to
// English camelCase field names: syllabus keys (unknown row labels move into
// `extra`), `href` to `link` in department, mprogram, programs and
// competencies, and mprogram `course` to `courses`. A second run changes
// nothing.
const { migrateFieldNames } = require("./crawler/migrateFieldNames");

const [root] = process.argv.slice(2);
if (!root) {
  console.error("usage: node migrateFieldNames.js <dir>");
  process.exit(1);
}
const { stats, movedLabels } = migrateFieldNames(root);
for (const [kind, { scanned, rewritten }] of Object.entries(stats)) {
  console.log(`[migrate] ${kind}: ${scanned} scanned, ${rewritten} rewritten`);
}
console.log(`[migrate] ${movedLabels.length} labels moved into syllabus extra`);
for (const { label, count } of movedLabels) {
  console.log(`[migrate] extra ${JSON.stringify(label)} ×${count}`);
}
