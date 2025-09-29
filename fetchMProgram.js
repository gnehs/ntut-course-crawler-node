// node fetchMProgram.js <year> <sem>
const fetchYearSem = require("./crawler/fetchYearSem");
const { fetchMProgram } = require("./crawler/fetchMProgram");

(async () => {
  let year = process.argv[2] || null,
    sem = process.argv[3] || null;
  if (!year || !sem) {
    let { current } = await fetchYearSem();
    year = current.year;
    sem = current.sem;
  }
  await fetchMProgram(year, sem);
  console.log("All done!");
})();
