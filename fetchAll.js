const fetchYearSem = require("./crawler/fetchYearSem");
const { fetchCourse } = require("./crawler/fetchCourse");
const { fetchDepartment } = require("./crawler/fetchDepartment");
const { fetchMProgram } = require("./crawler/fetchMProgram");
const { fetchPrograms } = require("./crawler/fetchPrograms");
const { fetchCompetencies } = require("./crawler/fetchCompetencies");

(async () => {
  let { years } = await fetchYearSem();
  for (let year of Object.keys(years)) {
    for (let sem of years[year]) {
      await Promise.all([
        fetchDepartment(year, sem),
        fetchMProgram(year, sem),
        fetchPrograms(year, sem),
        fetchCourse("日間部", year, sem),
        fetchCourse("進修部", year, sem),
        fetchCourse("研究所(日間部、進修部、週末碩士班)", year, sem),
      ]);
    }
  }
  await fetchCompetencies();
  console.log("All done!");
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
