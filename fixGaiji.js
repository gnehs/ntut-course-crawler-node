// node fixGaiji.js [dir] [report.json]
// Replaces known gaiji in every JSON file under dir (default ./dist), such as
// a gh-pages checkout, and lists the private-use characters still unknown.
const jsonfile = require("jsonfile");
const { fixGaiji } = require("./crawler/fixGaiji");

const [root = "./dist", reportPath] = process.argv.slice(2);
const { changedFiles, unknown } = fixGaiji(root);
console.log(`[gaiji] ${changedFiles.length} files updated under ${root}.`);
for (const { codePoint, count, examples } of unknown) {
  console.log(`[gaiji] unknown ${codePoint} ×${count}, e.g. ${JSON.stringify(examples[0].context)} in ${examples[0].file}`);
}
if (reportPath) {
  jsonfile.writeFileSync(reportPath, { changedFiles: changedFiles.length, unknown }, { spaces: 2 });
}
