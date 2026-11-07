const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { recoverText, findVariants, damagedSpans } = require("../crawler/recoverText");

function corpus(t, files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ntut-recover-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const [name, value] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    fs.writeFileSync(path.join(root, name), JSON.stringify(value, null, 2));
  }
  return root;
}

const read = (root, name) => JSON.parse(fs.readFileSync(path.join(root, name), "utf8"));

test("damagedSpans treats only a ? between Han characters as lost", () => {
  assert.deepEqual(damagedSpans("進而?化"), [{ start: 2, end: 3, lost: "?" }]);
  assert.deepEqual(damagedSpans("Teach.jsp?code=1、誰的? ok"), []);
  assert.deepEqual(damagedSpans("��　Unit 2"), [{ start: 0, end: 2, lost: "��" }]);
});

test("recoverText restores lost characters that intact copies agree on", (t) => {
  const intact = "整體的分析與瞭解能力,進而強化社會適應能力";
  const root = corpus(t, {
    "103/1/course/1.json": [{ outline: "整體的分析與瞭解能力,進而?化社會適應能力\n第二行" }],
    "104/1/course/2.json": [{ outline: intact }],
    "105/1/course/3.json": [{ outline: intact }],
  });

  const result = recoverText(root);
  assert.deepEqual(result.changedFiles, [path.join("103", "1", "course", "1.json")]);
  assert.equal(read(root, "103/1/course/1.json")[0].outline, `${intact}\n第二行`);
  assert.deepEqual(recoverText(root).changedFiles, []);
});

test("recoverText reports lines with one intact copy or disagreeing copies", (t) => {
  const root = corpus(t, {
    "1.json": { a: "討論、上課狀況、上課?與、作業等", b: "��　　30% on final exam" },
    "2.json": { a: "討論、上課狀況、上課汮與、作業等", b: "-　　30% on final exam" },
    "3.json": { b: "●　　30% on final exam" },
  });

  const result = recoverText(root);
  assert.deepEqual(result.changedFiles, []);
  assert.deepEqual(
    result.unresolved.map(({ line, fills }) => [line, fills.map(({ fill }) => fill[0]).sort()]),
    [
      ["討論、上課狀況、上課?與、作業等", ["汮"]],
      ["��　　30% on final exam", ["-", "●"]],
    ]
  );
});

test("recoverText ignores copies that carry a ? where the text was lost", (t) => {
  const root = corpus(t, {
    "1.json": ["��　　學期成績之計算方式"],
    "2.json": ["?　　學期成績之計算方式"],
    "3.json": ["?　　學期成績之計算方式"],
  });

  assert.deepEqual(recoverText(root).changedFiles, []);
});

test("findVariants ranks a character that occurs only in suspect lines first", (t) => {
  const root = corpus(t, {
    "1.json": ["簡勠《誰在銀閃閃的地方 等你》", "第三週：課程簡介與說明"],
    "2.json": ["簡媜《誰在銀閃閃的地方 等你》", "第四週：課程簡介與說明", "文學與媜"],
    "3.json": ["簡媜《誰在銀閃閃的地方 等你》"],
    "4.json": ["簡《誰在銀閃閃的地方 等你》"],
  });

  const { replaced, dropped } = findVariants(root);
  assert.deepEqual([replaced[0].change, replaced[0].share], ["勠→媜", 1]);
  assert.ok(!replaced.some(({ change }) => /[三四]/u.test(change)));
  assert.equal(replaced[0].examples[0].suspect, "簡勠《誰在銀閃閃的地方 ");
  assert.deepEqual(dropped.map(({ change }) => change), ["∅→媜"]);
});
