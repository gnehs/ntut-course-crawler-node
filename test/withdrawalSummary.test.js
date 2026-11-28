const assert = require("node:assert/strict");
const test = require("node:test");

const { teacherSummaries } = require("../analytics/withdrawal");

test("teacherSummaries keeps the stats and each course name once, in order", () => {
  const course = (zh) => ({ name: { zh, en: "" }, id: "1", people: "10" });
  const [summary] = teacherSummaries([
    {
      name: "王",
      withdraw: 3,
      people: 30,
      rate: 0.1,
      rate_percent: "10.00",
      course: [course("微積分"), course("物理"), course("微積分"), { name: null }],
    },
  ]);
  assert.deepEqual(summary, {
    name: "王",
    withdraw: 3,
    people: 30,
    rate_percent: "10.00",
    courseCount: 4,
    courseNames: ["微積分", "物理"],
  });
});
