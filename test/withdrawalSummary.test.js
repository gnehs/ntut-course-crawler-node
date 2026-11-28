const assert = require("node:assert/strict");
const test = require("node:test");

const {
  teacherSummaries,
  teacherFileName,
  teacherFiles,
} = require("../analytics/withdrawal");

const course = (zh, id) => ({ name: { zh, en: "" }, id, people: "10" });
const teacher = {
  name: "王",
  withdraw: 3,
  people: 30,
  rate: 0.1,
  rate_percent: "10.00",
  course: [course("微積分", "1"), course("物理", "2"), course("微積分", "3"), { name: null, id: "1" }],
};

test("teacherSummaries keeps the stats, each course name and each course id once, in order", () => {
  assert.deepEqual(teacherSummaries([teacher])[0], {
    name: "王",
    withdraw: 3,
    people: 30,
    rate_percent: "10.00",
    courseCount: 4,
    courseNames: ["微積分", "物理"],
    courseIds: ["1", "2", "3"],
  });
});

test("teacherFileName encodes characters artifact uploads reject", () => {
  assert.equal(teacherFileName("陳?諭"), "%E9%99%B3%3F%E8%AB%AD.json");
  assert.equal(teacherFileName("A*(B)"), "A%2A%28B%29.json");
  assert.equal(decodeURIComponent(teacherFileName("鄭英喆")), "鄭英喆.json");
});

test("teacherFiles gives each teacher its courses and every period's rate", () => {
  const [file] = teacherFiles(
    [teacher],
    [{ ...teacher, rate_percent: "20.00" }],
    []
  );
  assert.equal(file.fileName, "%E7%8E%8B.json");
  assert.deepEqual(file.data.rates, { all: "10.00", recent5Years: "20.00", recent3Years: null });
  assert.equal(file.data.course, teacher.course);
  assert.equal(file.data.withdraw, 3);
});
