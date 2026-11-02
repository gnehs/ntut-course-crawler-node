// node indentJson.js [dir]
// Indents every minified JSON file under dir (default ./dist), such as a
// gh-pages checkout, so its history reads as line-by-line diffs on GitHub.
const { indentJson } = require("./crawler/indentJson");

const [root = "./dist"] = process.argv.slice(2);
const { changedFiles } = indentJson(root);
console.log(`[indent] ${changedFiles.length} files indented under ${root}.`);
