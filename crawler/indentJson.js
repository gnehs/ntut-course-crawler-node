const fs = require("node:fs");
const path = require("node:path");
const { jsonFiles } = require("./tools/jsonFiles");

// The crawler once published minified JSON, which GitHub shows as one changed
// line however little changed. This rewrites those files the way the crawler
// writes each path today, so a later crawl of the same data leaves no diff:
// syllabi are published with LF, analytics and the calendar without a final
// newline, and everything else through jsonfile with CRLF.
function indentedText(relativePath, data) {
  const text = JSON.stringify(data, null, 2);
  const segments = relativePath.split(path.sep);
  if (segments.includes("course")) return `${text}\n`;
  if (segments[0] === "analytics" || relativePath === "calendar.json") return text;
  return `${text.replace(/\n/g, "\r\n")}\r\n`;
}

// Only files on a single line are touched, so indented files keep their bytes
// and a second run changes nothing.
function indentJson(root = "dist") {
  const changedFiles = [];
  for (const file of jsonFiles(root)) {
    const original = fs.readFileSync(file, "utf8");
    if (original.trimEnd().includes("\n")) continue;
    const relativePath = path.relative(root, file);
    const indented = indentedText(relativePath, JSON.parse(original));
    if (indented === original) continue;
    fs.writeFileSync(file, indented, "utf8");
    changedFiles.push(relativePath);
  }
  return { changedFiles };
}

module.exports = { indentJson };
