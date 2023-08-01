const fetchYearSem = require("./crawler/fetchYearSem");
const { fetchCourse } = require("./crawler/fetchCourse");
const { fetchDepartment } = require("./crawler/fetchDepartment");

(async () => {
  let { years } = await fetchYearSem();
  for (let year of Object.keys(years)) {
    for (let sem of years[year]) {
      await Promise.all([
        fetchDepartment(year, sem),
        fetchCourse("日間部", year, sem),
        fetchCourse("進修部", year, sem),
        fetchCourse("研究所(日間部、進修部、週末碩士班)", year, sem),
      ]);
    }
  }
  console.log("All done!");
})();
