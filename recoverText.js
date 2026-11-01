// node recoverText.js [dir] [report.json] [--dry-run]
// Restores characters the school's Big5 storage lost ("?" and U+FFFD) from
// intact copies of the same line in other files. The report lists the lines no
// intact copy settles, and lines one Han character away from another copy.
const jsonfile = require("jsonfile");
const { recoverText, findVariants } = require("./crawler/recoverText");

const args = process.argv.slice(2);
const write = !args.includes("--dry-run");
const [root = "./dist", reportPath] = args.filter((arg) => arg !== "--dry-run");
const { changedFiles, recovered, unresolved } = recoverText(root, { write });
console.log(
  `[recover] ${recovered.length} lines recovered, ${unresolved.length} unresolved, ${changedFiles.length} files updated under ${root}.`
);
if (reportPath) {
  const variants = findVariants(root);
  console.log(
    `[recover] ${variants.replaced.length} replaced and ${variants.dropped.length} dropped one-character variants reported.`
  );
  jsonfile.writeFileSync(
    reportPath,
    { changedFiles: changedFiles.length, recovered, unresolved, variants },
    { spaces: 2 }
  );
}
