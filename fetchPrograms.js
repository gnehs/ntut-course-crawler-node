// node fetchPrograms.js <year> <sem>
const fetchYearSem = require("./crawler/fetchYearSem");
const { fetchPrograms } = require("./crawler/fetchPrograms");

(async () => {
  let year = process.argv[2] || null;
  let sem = process.argv[3] || null;
  if (!year || !sem) {
    const { current } = await fetchYearSem();
    year = current.year;
    sem = current.sem;
  }
  await fetchPrograms(year, sem);
  console.log("All done!");
})().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
