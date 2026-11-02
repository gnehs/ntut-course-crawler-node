const fs = require("node:fs");
const path = require("node:path");
const { replaceGaiji } = require("./tools/gaiji");
const { jsonFiles } = require("./tools/jsonFiles");

const EXAMPLES_PER_CODE_POINT = 3;

// Rewrites gaiji in already published JSON without re-crawling. Private-use
// characters can only occur inside JSON strings, so replacing them in the raw
// text keeps the structure and formatting of every file byte-for-byte, and a
// second run changes nothing.
function fixGaiji(root = "dist") {
  const unknown = new Map();
  const changedFiles = [];
  for (const file of jsonFiles(root)) {
    const original = fs.readFileSync(file, "utf8");
    const relativePath = path.relative(root, file);
    const fixed = replaceGaiji(original, ({ codePoint, context }) => {
      if (!unknown.has(codePoint)) unknown.set(codePoint, { count: 0, examples: [] });
      const entry = unknown.get(codePoint);
      entry.count += 1;
      if (entry.examples.length < EXAMPLES_PER_CODE_POINT) {
        entry.examples.push({ file: relativePath, context });
      }
    });
    if (fixed === original) continue;
    JSON.parse(fixed);
    fs.writeFileSync(file, fixed, "utf8");
    changedFiles.push(relativePath);
  }
  const unknownList = [...unknown]
    .map(([codePoint, entry]) => ({ codePoint, ...entry }))
    .sort((a, b) => b.count - a.count);
  return { changedFiles, unknown: unknownList };
}

module.exports = { fixGaiji };
