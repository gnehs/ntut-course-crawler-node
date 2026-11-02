const fs = require("node:fs");
const path = require("node:path");
const { jsonFiles } = require("./tools/jsonFiles");

// The school stores syllabi in Big5, so a character Big5 cannot hold comes
// back as "?" (one per lost character) or as U+FFFD (one per lost byte, often
// a Word bullet). The same syllabus is usually copied across many semesters,
// so a damaged line can be recovered from an intact copy elsewhere.
const ANCHOR_LENGTH = 8;
const HAN = /\p{Script=Han}/u;
const EXAMPLES = 3;
// One intact copy can itself be wrong (課堂?與 has a lone copy reading 課堂汮與),
// so a recovery needs this many copies that agree.
const MIN_COPIES = 2;

function* stringsIn(value) {
  if (typeof value === "string") yield value;
  else if (Array.isArray(value)) for (const item of value) yield* stringsIn(item);
  else if (value && typeof value === "object") {
    for (const item of Object.values(value)) yield* stringsIn(item);
  }
}

function* linesIn(file) {
  for (const text of stringsIn(JSON.parse(fs.readFileSync(file, "utf8")))) {
    yield* text.split("\n");
  }
}

// Returns the lost spans of a line: runs of U+FFFD, and runs of "?" between
// two Han characters. A "?" elsewhere is ordinary punctuation.
function damagedSpans(line) {
  const spans = [];
  for (const match of line.matchAll(/\uFFFD+|\?+/gu)) {
    const start = match.index;
    const end = start + match[0].length;
    if (match[0][0] === "?") {
      const before = line[start - 1];
      const after = line[end];
      if (!before || !after || !HAN.test(before) || !HAN.test(after)) continue;
    }
    spans.push({ start, end, lost: match[0] });
  }
  return spans;
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

// A "?" run stands for 1–n characters and a U+FFFD run for 0–n, since a
// bullet's two bytes may decode to two U+FFFD or vanish.
function matcherFor(line, spans) {
  let pattern = "^";
  let cursor = 0;
  for (const { start, end, lost } of spans) {
    pattern += escapeRegExp(line.slice(cursor, start));
    pattern += lost[0] === "?" ? `([^]{1,${lost.length}}?)` : `([^]{0,${lost.length}}?)`;
    cursor = end;
  }
  return new RegExp(`${pattern}${escapeRegExp(line.slice(cursor))}$`, "u");
}

function anchorsOf(line, spans) {
  const anchors = [];
  if (spans[0].start >= ANCHOR_LENGTH) anchors.push(`^${line.slice(0, ANCHOR_LENGTH)}`);
  if (line.length - spans.at(-1).end >= ANCHOR_LENGTH) {
    anchors.push(`$${line.slice(-ANCHOR_LENGTH)}`);
  }
  return anchors;
}

function recordExample(entry, file) {
  entry.count += 1;
  if (entry.files.length < EXAMPLES && !entry.files.includes(file)) entry.files.push(file);
}

// Pass 1 collects damaged lines, pass 2 matches every intact line against
// them through a fixed-length prefix or suffix, and pass 3 rewrites the files.
// A line is recovered only when every intact copy agrees on the lost text;
// anything else is reported for a person to decide.
function recoverText(root = "dist", { write = true } = {}) {
  const files = [...jsonFiles(root)];
  const damaged = new Map();
  const byAnchor = new Map();
  const damagedLinesByFile = new Map();
  for (const file of files) {
    const relativePath = path.relative(root, file);
    for (const line of linesIn(file)) {
      const spans = damagedSpans(line);
      if (spans.length === 0) continue;
      if (!damaged.has(line)) {
        const entry = { line, spans, count: 0, files: [], fills: new Map() };
        entry.matcher = matcherFor(line, spans);
        for (const anchor of anchorsOf(line, spans)) {
          if (!byAnchor.has(anchor)) byAnchor.set(anchor, []);
          byAnchor.get(anchor).push(entry);
        }
        damaged.set(line, entry);
      }
      recordExample(damaged.get(line), relativePath);
      if (!damagedLinesByFile.has(file)) damagedLinesByFile.set(file, new Set());
      damagedLinesByFile.get(file).add(line);
    }
  }

  for (const file of files) {
    for (const line of linesIn(file)) {
      if (line.length <= ANCHOR_LENGTH || damagedSpans(line).length > 0) continue;
      const candidates = new Set([
        ...(byAnchor.get(`^${line.slice(0, ANCHOR_LENGTH)}`) ?? []),
        ...(byAnchor.get(`$${line.slice(-ANCHOR_LENGTH)}`) ?? []),
      ]);
      for (const entry of candidates) {
        const match = entry.matcher.exec(line);
        if (!match || match.slice(1).some((fill) => /[?\uFFFD]/u.test(fill))) continue;
        const key = JSON.stringify(match.slice(1));
        entry.fills.set(key, (entry.fills.get(key) ?? 0) + 1);
      }
    }
  }

  const recovered = new Map();
  const unresolved = [];
  for (const entry of damaged.values()) {
    const fills = [...entry.fills].sort((a, b) => b[1] - a[1]);
    if (fills.length === 1 && fills[0][1] >= MIN_COPIES) {
      const parts = JSON.parse(fills[0][0]);
      let fixed = "";
      let cursor = 0;
      entry.spans.forEach(({ start, end }, index) => {
        fixed += entry.line.slice(cursor, start) + parts[index];
        cursor = end;
      });
      fixed += entry.line.slice(cursor);
      recovered.set(entry.line, { fixed, copies: fills[0][1], count: entry.count, files: entry.files });
    } else {
      unresolved.push({
        line: entry.line,
        count: entry.count,
        files: entry.files,
        fills: fills.map(([key, copies]) => ({ fill: JSON.parse(key), copies })),
      });
    }
  }

  const changedFiles = [];
  if (write && recovered.size > 0) {
    // Lines sit between a string's quotes or its \n escapes, so the lookarounds
    // keep a damaged line from matching inside a longer one.
    const jsonText = (text) => JSON.stringify(text).slice(1, -1);
    const replacementFor = (line) =>
      new RegExp(`(?<=[^\\\\]"|\\\\n)${escapeRegExp(jsonText(line))}(?=\\\\n|")`, "gu");
    for (const [file, lines] of damagedLinesByFile) {
      const original = fs.readFileSync(file, "utf8");
      let fixed = original;
      for (const line of lines) {
        if (!recovered.has(line)) continue;
        const replacement = jsonText(recovered.get(line).fixed);
        fixed = fixed.replace(replacementFor(line), () => replacement);
      }
      if (fixed === original) continue;
      JSON.parse(fixed);
      fs.writeFileSync(file, fixed, "utf8");
      changedFiles.push(path.relative(root, file));
    }
  }

  return {
    changedFiles,
    recovered: [...recovered].map(([line, entry]) => ({ line, ...entry })),
    unresolved: unresolved.sort((a, b) => b.count - a.count),
  };
}

// The two lines differ by exactly one Han character replaced, added or
// dropped, or null otherwise.
function hanChange(a, b) {
  const x = [...a];
  const y = [...b];
  if (Math.abs(x.length - y.length) > 1) return null;
  let prefix = 0;
  while (prefix < x.length && prefix < y.length && x[prefix] === y[prefix]) prefix += 1;
  let suffix = 0;
  while (
    suffix < x.length - prefix &&
    suffix < y.length - prefix &&
    x[x.length - 1 - suffix] === y[y.length - 1 - suffix]
  ) {
    suffix += 1;
  }
  const from = x.slice(prefix, x.length - suffix);
  const to = y.slice(prefix, y.length - suffix);
  if (from.length > 1 || to.length > 1 || from.length + to.length === 0) return null;
  if (![...from, ...to].every((char) => HAN.test(char) && !NUMERALS.has(char))) return null;
  return { from: from.join(""), to: to.join(""), offset: x.slice(0, prefix).join("").length };
}

const VARIANT_MIN_LENGTH = ANCHOR_LENGTH + 1;
// Week and chapter numbers change between copies on purpose.
const NUMERALS = new Set("〇零一二三四五六七八九十百千兩");
const VARIANT_MAX_GROUP = 200;

// A wrong but valid character (簡勠 for 簡媜) or a dropped one leaves no
// marker, but shows up as a line one Han character away from another copy.
// The rarer line is taken as the suspect. Teachers also edit their syllabi, so
// these are only reported, grouped by the change, for a person to judge. A
// replaced character that occurs almost only in suspect lines, like 勠, ranks
// first; dropped characters are listed apart.
function findVariants(root = "dist") {
  const counts = new Map();
  const charCounts = new Map();
  for (const file of jsonFiles(root)) {
    for (const line of linesIn(file)) {
      for (const char of line) charCounts.set(char, (charCounts.get(char) ?? 0) + 1);
      if (line.length < VARIANT_MIN_LENGTH || damagedSpans(line).length > 0) continue;
      counts.set(line, (counts.get(line) ?? 0) + 1);
    }
  }
  const groups = new Map();
  for (const line of counts.keys()) {
    for (const key of [`^${line.slice(0, ANCHOR_LENGTH)}`, `$${line.slice(-ANCHOR_LENGTH)}`]) {
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(line);
    }
  }
  const changes = new Map();
  const seen = new Set();
  for (const lines of groups.values()) {
    if (lines.length < 2 || lines.length > VARIANT_MAX_GROUP) continue;
    for (let i = 0; i < lines.length; i += 1) {
      for (let j = i + 1; j < lines.length; j += 1) {
        const [suspect, intact] =
          counts.get(lines[i]) <= counts.get(lines[j]) ? [lines[i], lines[j]] : [lines[j], lines[i]];
        const pairKey = `${suspect}\0${intact}`;
        if (seen.has(pairKey)) continue;
        seen.add(pairKey);
        const change = hanChange(suspect, intact);
        if (!change) continue;
        const key = `${change.from || "∅"}→${change.to || "∅"}`;
        if (!changes.has(key)) changes.set(key, { change: key, lines: 0, suspects: 0, intact: 0, examples: [] });
        const entry = changes.get(key);
        entry.lines += 1;
        entry.suspects += counts.get(suspect) * Math.max(1, suspect.split(change.from).length - 1);
        entry.intact += counts.get(intact);
        if (entry.examples.length < EXAMPLES) {
          const start = Math.max(0, change.offset - 10);
          entry.examples.push({
            suspect: suspect.slice(start, change.offset + 11),
            intact: intact.slice(start, change.offset + 11),
          });
        }
      }
    }
  }
  const replaced = [];
  const dropped = [];
  for (const entry of changes.values()) {
    const [from] = entry.change.split("→");
    if (from === "∅") {
      dropped.push(entry);
    } else {
      entry.share = Math.min(1, entry.suspects / charCounts.get(from));
      replaced.push(entry);
    }
  }
  return {
    replaced: replaced.sort((a, b) => b.share - a.share || b.lines - a.lines),
    dropped: dropped.sort((a, b) => b.lines - a.lines),
  };
}

module.exports = { recoverText, findVariants, damagedSpans, hanChange };
