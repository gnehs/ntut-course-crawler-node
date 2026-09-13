const cheerio = require("cheerio");
const pangu = require("../tools/pangu").spacing;

const COURSE_PAGE_BASE = "https://aps.ntut.edu.tw/course/tw/";

/**
 * The query page has changed its column order over time.  Keep the aliases
 * here in one place and resolve every value by its visible table heading.
 * Headings are normalised before lookup because APS uses <br> and a mixture
 * of ASCII/full-width whitespace in different semesters.
 */
const HEADER_ALIASES = {
  id: ["課號"],
  name: ["課程名稱"],
  stage: ["階段"],
  credit: ["學分"],
  hours: ["時數"],
  courseType: ["修", "課程標準"],
  class: ["班級"],
  teacher: ["教師"],
  sun: ["日"],
  mon: ["一"],
  tue: ["二"],
  wed: ["三"],
  thu: ["四"],
  fri: ["五"],
  sat: ["六"],
  classroom: ["教室"],
  people: ["人"],
  peopleWithdraw: ["撤"],
  ta: ["助教", "助教姓名"],
  language: ["授課語言", "語言"],
  syllabusLinks: ["教學大綱與進度表", "教學大綱與進度"],
  notes: ["備註"],
  audit: ["隨班附讀"],
  lab: ["實驗實習"],
  interdisciplinary: ["跨領域"],
};

const KNOWN_HEADERS = new Set(Object.values(HEADER_ALIASES).flat());

// These are the columns needed to produce a trustworthy course row.  The
// newer language/audit/lab/interdisciplinary columns are deliberately absent:
// older APS semesters do not always publish them.
const REQUIRED_FIELDS = [
  "id",
  "name",
  "stage",
  "credit",
  "hours",
  "courseType",
  "class",
  "teacher",
  "sun",
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
  "classroom",
  "people",
  "peopleWithdraw",
  "syllabusLinks",
  "notes",
];

function normaliseHeading(value) {
  return String(value ?? "")
    .replace(/[\u0009\u000a\u000d\u0020\u00a0\u3000]+/g, "")
    .trim();
}

function normaliseCell(value) {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .trim();
}

function cellText($, cell) {
  const clone = $(cell).clone();
  clone.find("br").each((_, element) => $(element).replaceWith("\n"));
  return normaliseCell(clone.text());
}

function getPage(page) {
  if (typeof page === "string" || Buffer.isBuffer(page)) {
    return cheerio.load(page);
  }
  if (typeof page === "function") return page;
  throw new TypeError("Expected QueryCourse HTML or a Cheerio document");
}

function getCode(href) {
  if (!href) return undefined;
  try {
    return new URL(href, COURSE_PAGE_BASE).searchParams.get("code") || undefined;
  } catch (error) {
    const match = String(href).match(/[?&]code=([^&#]+)/i);
    return match ? decodeURIComponent(match[1]) : undefined;
  }
}

function parseLinks($, cell) {
  return $(cell)
    .find("a")
    .toArray()
    .map((element) => {
      const href = $(element).attr("href") || "";
      const item = {
        name: normaliseCell($(element).text()),
        link: href,
      };
      const code = getCode(href);
      if (code !== undefined) item.code = code;
      return item;
    });
}

function parseTime(value) {
  return normaliseCell(value)
    .replace(/[\u3000]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function findHeaderRow($, table) {
  return $(table)
    .find("tr")
    .toArray()
    .find((row) => {
      const labels = $(row)
        .children("th,td")
        .toArray()
        .map((cell) => normaliseHeading($(cell).text()));
      return labels.includes("課號") && labels.includes("課程名稱");
    });
}

function findQueryTable($) {
  return $("table")
    .toArray()
    .map((table) => ({ table, headerRow: findHeaderRow($, table) }))
    .find(({ headerRow }) => headerRow);
}

function buildColumnMap($, headerRow) {
  const headings = $(headerRow)
    .children("th,td")
    .toArray()
    .map((cell) => normaliseHeading($(cell).text()));
  const columns = new Map();
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    const index = headings.findIndex((heading) => aliases.includes(heading));
    if (index >= 0) columns.set(field, index);
  }
  return { headings, columns };
}

function cellAt($, row, columns, field) {
  const index = columns.get(field);
  if (index === undefined) return $([]);
  return $(row).children("th,td").eq(index);
}

function parseQueryCourseHtml(page) {
  const $ = getPage(page);
  const queryTable = findQueryTable($);
  if (!queryTable) {
    throw new Error("Unable to find the QueryCourse course table");
  }

  const { table, headerRow } = queryTable;
  const { headings, columns } = buildColumnMap($, headerRow);
  const missingFields = REQUIRED_FIELDS.filter((field) => !columns.has(field));
  if (missingFields.length) {
    throw new Error(
      `QueryCourse table is missing required columns: ${missingFields.join(", ")}`
    );
  }

  const rows = $(table)
    .find("tr")
    .toArray()
    .filter((row) => row !== headerRow);

  return rows
    .map((row) => {
      const rowCells = $(row).children("th,td");
      const id = cellText($, cellAt($, row, columns, "id"));
      if (!id) return null;
      if (rowCells.length < headings.length) {
        throw new Error(
          `QueryCourse row for ${id} is shorter than its header ` +
            `(${rowCells.length}/${headings.length} cells)`
        );
      }

      const nameCell = cellAt($, row, columns, "name");
      const teacherCell = cellAt($, row, columns, "teacher");
      const classroomCell = cellAt($, row, columns, "classroom");
      const courseType = cellText($, cellAt($, row, columns, "courseType"));
      const notes = pangu(cellText($, cellAt($, row, columns, "notes")));
      const classroom = parseLinks($, classroomCell).map((item) => ({
        ...item,
        name: item.name.replace(/e$|\(e\)$/i, ""),
      }));
      const extras = {};

      // Keep a future heading available to the frontend instead of silently
      // discarding it. Known fields use the stable English keys below.
      for (let index = 0; index < headings.length; index += 1) {
        const heading = headings[index];
        if (!heading || KNOWN_HEADERS.has(heading)) {
          continue;
        }
        extras[heading] = cellText($, rowCells.eq(index));
      }

      const course = {
        id,
        name: {
          zh: pangu(cellText($, nameCell)),
          en: null,
        },
        stage: cellText($, cellAt($, row, columns, "stage")),
        credit: cellText($, cellAt($, row, columns, "credit")),
        hours: cellText($, cellAt($, row, columns, "hours")),
        courseType,
        class: parseLinks($, cellAt($, row, columns, "class")),
        teacher: parseLinks($, teacherCell),
        time: {
          sun: parseTime(cellText($, cellAt($, row, columns, "sun"))),
          mon: parseTime(cellText($, cellAt($, row, columns, "mon"))),
          tue: parseTime(cellText($, cellAt($, row, columns, "tue"))),
          wed: parseTime(cellText($, cellAt($, row, columns, "wed"))),
          thu: parseTime(cellText($, cellAt($, row, columns, "thu"))),
          fri: parseTime(cellText($, cellAt($, row, columns, "fri"))),
          sat: parseTime(cellText($, cellAt($, row, columns, "sat"))),
        },
        classroom,
        people: cellText($, cellAt($, row, columns, "people")),
        peopleWithdraw: cellText($, cellAt($, row, columns, "peopleWithdraw")),
        ta: parseLinks($, cellAt($, row, columns, "ta")),
        language: cellText($, cellAt($, row, columns, "language")),
        audit: cellText($, cellAt($, row, columns, "audit")),
        lab: cellText($, cellAt($, row, columns, "lab")),
        interdisciplinary: cellText(
          $,
          cellAt($, row, columns, "interdisciplinary")
        ),
        notes,
        courseDescriptionLink: nameCell.find("a").first().attr("href") || "",
        syllabusLinks: cellAt($, row, columns, "syllabusLinks")
          .find("a")
          .toArray()
          .map((element) => $(element).attr("href"))
          .filter(Boolean),
      };

      return Object.assign(course, extras);
    })
    .filter(Boolean);
}

module.exports = {
  HEADER_ALIASES,
  REQUIRED_FIELDS,
  cellText,
  normaliseCell,
  normaliseHeading,
  parseQueryCourseHtml,
};
