// node fetchDepartment.js <year> <sem>
const fetchYearSem = require("./crawler/fetchYearSem");
const { fetchDepartment } = require("./crawler/fetchDepartment");

(async () => {
  let year = process.argv[2] || null,
    sem = process.argv[3] || null;
  if (!year || !sem) {
    let { current } = await fetchYearSem();
    year = current.year;
    sem = current.sem;
  }
  await fetchDepartment(year, sem);
  console.log("All done!");
})();
