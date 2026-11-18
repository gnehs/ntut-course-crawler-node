const { test } = require("node:test");
const assert = require("node:assert/strict");
const { changedUrls, submitIndexNow, INDEXNOW_KEY } = require("../crawler/indexNow");

const origin = "https://example.test";
const evening = "進修部";

function reader(files) {
  return (revision, path) => files[revision][path] ?? null;
}

const departments = [{ class: [{ name: "資工一" }, { name: "資工二" }, { name: "電機一" }] }];

test("submits only courses whose record or syllabus changed, with their classes", () => {
  const read = reader({
    old: {
      "115/1/main.json": [
        { id: "1", name: "A", class: [{ name: "資工一" }] },
        { id: "2", name: "B", class: [{ name: "電機一" }] },
      ],
    },
    new: {
      "115/1/main.json": [
        { id: "1", name: "A2", class: [{ name: "資工二" }] },
        { id: "2", name: "B", class: [{ name: "電機一" }] },
        { id: "3", name: "C", class: [{ name: "不存在班" }] },
      ],
      "115/1/department.json": departments,
    },
  });
  const urls = changedUrls({
    year: "115",
    sem: "1",
    origin,
    read,
    changedFiles: ["115/1/main.json"],
  });
  assert.deepEqual(urls.sort(), [
    `${origin}/class/115/1/${encodeURIComponent("資工一")}?d=main`,
    `${origin}/class/115/1/${encodeURIComponent("資工二")}?d=main`,
    `${origin}/course/115/1/1`,
    `${origin}/course/115/1/3`,
  ].sort());
});

test("links a syllabus change to the first department that lists the course", () => {
  const course = { id: "9", class: [] };
  const read = reader({
    old: {},
    new: { [`115/1/${evening}.json`]: [course], "115/1/department.json": departments },
  });
  const urls = changedUrls({
    year: "115",
    sem: "1",
    origin,
    read,
    changedFiles: ["115/1/course/9.json"],
  });
  assert.deepEqual(urls, [`${origin}/course/115/1/9?d=${encodeURIComponent(evening)}`]);
});

test("leaves out courses of hidden teachers and removed courses", () => {
  const read = reader({
    old: { "115/1/main.json": [{ id: "5", class: [] }] },
    new: {
      "115/1/main.json": [{ id: "4", teacher: [{ name: "朴維鎮" }], class: [] }],
      "115/1/department.json": departments,
    },
  });
  const urls = changedUrls({ year: "115", sem: "1", origin, read, changedFiles: ["115/1/main.json"] });
  assert.deepEqual(urls, []);
});

test("posts the key and splits large submissions", async () => {
  const bodies = [];
  const fetchImpl = async (url, init) => {
    bodies.push(JSON.parse(init.body));
    return { status: 202, text: async () => "" };
  };
  const urls = Array.from({ length: 10001 }, (_, index) => `${origin}/course/115/1/${index}`);
  await submitIndexNow(urls, { origin, fetchImpl });
  assert.equal(bodies.length, 2);
  assert.equal(bodies[0].urlList.length, 10000);
  assert.equal(bodies[1].urlList.length, 1);
  assert.equal(bodies[0].host, "example.test");
  assert.equal(bodies[0].keyLocation, `${origin}/${INDEXNOW_KEY}.txt`);
});

test("fails loudly when IndexNow rejects the key", async () => {
  const fetchImpl = async () => ({ status: 403, text: async () => "Forbidden" });
  await assert.rejects(submitIndexNow([`${origin}/`], { origin, fetchImpl }), /403/);
});
