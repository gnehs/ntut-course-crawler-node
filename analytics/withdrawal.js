// 退選率
// 計算各個老師的退選率
const axios = require("axios").default;
const fs = require("fs");
const color = require("colors");
(async () => {
  async function fetchCourse(y, s, department) {
    try {
      let now = new Date();
      let { data: res } = await axios.get(
        `https://gnehs.github.io/ntut-course-crawler-node/${y}/${s}/${encodeURI(
          department
        )}.json`
      );
      console.log(
        `[fetch] ${y}-${s} ${department}` + ` -- ${new Date() - now}ms`.gray
      );
      return res;
    } catch (e) {
      console.error(`[error] ${y}-${s} ${department} ${e.code}`.red);
      return [];
    }
  }
  let { data: main } = await axios.get(
    "https://gnehs.github.io/ntut-course-crawler-node/main.json"
  );
  main = Object.entries(main)
    .map(([y, s]) => s.map((x) => ({ year: y, sem: x })))
    .flat()
    .reverse();
  let departmentItems = [
    "main",
    "進修部",
    "研究所(日間部、進修部、週末碩士班)",
  ];
  let departmentMain = main
    .map(({ year, sem }) =>
      departmentItems.map((department) => ({ year, sem, department }))
    )
    .flat();
  let data;
  data = departmentMain.map(async ({ year, sem, department }) =>
    (await fetchCourse(year, sem, department)).map((x) => ({
      ...x,
      year,
      sem,
      department,
    }))
  );
  data = await Promise.all(data);
  data = data.flat(9);
  console.log(`[info] ${data.length} courses`.green);

  function calcWithdrawalRate(data, filename = "") {
    let calcResult = {};
    let totalPeople = 0,
      totalWithdraw = 0;
    for (let course of data) {
      for (let teacher of course.teacher) {
        let name = teacher.name;
        if (!calcResult[name]) {
          calcResult[name] = {
            name,
            withdraw: 0,
            people: 0,
            course: [],
            rate: -1,
          };
        }
        calcResult[name].withdraw += parseInt(course.peopleWithdraw);
        calcResult[name].people += parseInt(course.people);
        calcResult[name].course.push(course);
        totalPeople += parseInt(course.people);
        totalWithdraw += parseInt(course.peopleWithdraw);
      }
    }
    // calc rate
    for (let name in calcResult) {
      let item = calcResult[name];
      item.rate = item.withdraw / item.people;
      // 四捨五入
      item.rate_percent = (item.rate * 100).toFixed(2);
    }
    let stat = [
      {
        value: ((totalWithdraw / totalPeople) * 100).toFixed(2) + "%",
        title: "平均退選率",
      },
    ];
    let result = Object.values(calcResult)
      .filter((x) => x.people)
      .sort((a, b) => b.rate - a.rate)
      .map((x) => {
        x.course = x.course.map(
          ({
            name,
            id,
            courseType,
            people,
            peopleWithdraw,
            year,
            sem,
            department,
          }) => ({
            name,
            id,
            courseType,
            people,
            peopleWithdraw,
            year,
            sem,
            department,
          })
        );
        return x;
      });
    // calc quartiles
    let rates = result
      .sort()
      .map((x) => x.rate * 100)
      .reverse();
    let quartiles = Math.floor(rates.length / 4);
    let q1 = rates[quartiles];
    let q2 = rates[quartiles * 2];
    let q3 = rates[quartiles * 3];
    stat.push({
      value:
        q1.toFixed(2) + "% - " + q2.toFixed(2) + "% - " + q3.toFixed(2) + "%",
      title: "退選率分位數",
    });
    // save to file
    fs.mkdirSync(`./dist/analytics/`, { recursive: true });
    fs.writeFileSync(
      `./dist/analytics/withdrawal${filename}.json`,
      JSON.stringify({ stat, data: result })
    );
    fs.writeFileSync(
      `./dist/analytics/withdrawal-rate${filename}.json`,
      JSON.stringify(
        result
          .map((x) => ({ name: x.name, rate: x.rate_percent }))
          .reduce((a, b) => ({ ...a, [b.name]: b.rate }), {})
      )
    );
    return result;
  }

  let result = calcWithdrawalRate(data);
  console.log(`[info] save data done`.green);

  function filterPeriod(data, period, name) {
    let periodMain = main
      .slice(0, period)
      .map(({ year, sem }) => `${year}-${sem}`);
    let filteredData = data.filter((x) =>
      periodMain.includes(`${x.year}-${x.sem}`)
    );
    calcWithdrawalRate(filteredData, `-${name}`);
    console.log(`[info] save ${name} done`.green);
  }
  filterPeriod(data, 10 + 1, `recent-5-years`); // 最近五年
  filterPeriod(data, 6 + 1, `recent-3-years`); // 最近三年

  // 推薦博雅課程
  /*
  function getRateByTeachers(teachers) {
    return Math.max(teachers.map(x => result.filter(y => y.name == x.name)[0].rate))
  }
  let mainYearSems = main.map(({ year, sem }) => `${year}-${sem}`)
  for (let yearSem of mainYearSems) {
    let courses = data
      .filter(x => `${x.year}-${x.sem}` === yearSem)
      .filter(x => x.class.some(x => x.name.match(/^博雅/)))
      .sort((a, b) => getRateByTeachers(b.teacher) - getRateByTeachers(a.teacher))
      .slice(0, 100)
    console.log(`[info] ${yearSem} ${courses.length} courses`.green)
    fs.mkdirSync(`./dist/${yearSem.split('-').join('/')}/analytics`, { recursive: true });
    fs.writeFileSync(
      `./dist/${yearSem.split('-').join('/')}/analytics/recommend-general.json`,
      JSON.stringify(courses)
    )
    console.log(`[info] save ${yearSem} done`.green)
  }
  */
})();
