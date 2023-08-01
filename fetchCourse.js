// node fetchCourse.js <m> <year> <sem>
const fetchYearSem = require("./crawler/fetchYearSem");
const { fetchCourse } = require("./crawler/fetchCourse");

(async () => {
  let year, sem;
  let departmentList = [
    "日間部",
    "進修部",
    "研究所(日間部、進修部、週末碩士班)",
  ];
  let department = departmentList[process.argv[2]] || null;
  if (!year || !sem) {
    let { current } = await fetchYearSem();
    year = current.year;
    sem = current.sem;
  }
  if (department) {
    console.log(`[fetch] ${year} ${sem} ${department}`);
    await fetchCourse(department, year, sem);
    console.log(`${department} done!`);
  } else {
    console.log(`[fetch] ${year} ${sem}`);
    await Promise.all([
      fetchCourse("日間部", year, sem),
      fetchCourse("進修部", year, sem),
      fetchCourse("研究所(日間部、進修部、週末碩士班)", year, sem),
    ]);
    console.log("All done!");
  }
})();
