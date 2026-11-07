const fs = require("node:fs");
const { prepareCoursePublish } = require("./crawler/prepareCoursePublish");

async function main() {
  const [year, sem, publishedRoot] = process.argv.slice(2);
  // Validate completeness before replacing published syllabi.
  const snapshot = prepareCoursePublish(year, sem, "dist", publishedRoot);
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT,
      `directory=${snapshot.directory}\ndestination=${snapshot.destination}\n`);
  }
  console.log(`Prepared ${snapshot.count} courses for ${year}/${sem}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
