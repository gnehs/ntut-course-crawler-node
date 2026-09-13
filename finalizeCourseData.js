const fs = require("node:fs");
const { buildSyllabusIndex } = require("./crawler/buildSyllabusIndex");
const { prepareCoursePublish } = require("./crawler/prepareCoursePublish");

async function main() {
  const [year, sem] = process.argv.slice(2);
  // Validate completeness before generating an index or replacing published syllabi.
  const snapshot = prepareCoursePublish(year, sem);
  await buildSyllabusIndex(year, sem);
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
