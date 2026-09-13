const fs = require("node:fs");
const path = require("node:path");
const {
  hasSyllabusContent,
  parseSdgNumbers,
  splitSyllabusOptions,
} = require("./parsers/syllabus");

const DEFAULT_COURSE_FILES = [
  "main.json",
  "進修部.json",
  "研究所(日間部、進修部、週末碩士班).json",
];

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`Unable to read JSON ${filePath}`, { cause: error });
  }
}

function emptyIndexEntry() {
  return { ai: [], sdgs: [], resources: [], hasSyllabus: false };
}

function addUnique(target, values) {
  for (const value of values) {
    if (!target.includes(value)) target.push(value);
  }
}

function courseId(value, filePath) {
  const id = String(value ?? "").trim();
  if (!id) throw new Error(`Course list contains a row without id: ${filePath}`);
  // Course ids are numeric in APS. Restricting the filename keeps a malformed
  // downloaded value from escaping the semester's course directory.
  if (!/^\d+$/.test(id)) {
    throw new Error(`Invalid APS course id ${JSON.stringify(id)}: ${filePath}`);
  }
  return id;
}

/**
 * Rebuild dist/<year>/<sem>/syllabus-index.json from all three current
 * department lists and their per-course syllabus files.
 *
 * This is deliberately a rebuild rather than an incremental write. The
 * workflow can call it once after all department fetches have completed, so
 * one department cannot overwrite an index produced by another department.
 */
function buildSyllabusIndex(year, sem, root = "dist") {
  if (!/^\d+$/.test(String(year)) || !/^[12]$/.test(String(sem))) {
    throw new Error(`Invalid year/semester: ${year}/${sem}`);
  }
  const semesterDirectory = path.resolve(root, String(year), String(sem));
  const courseDirectory = path.join(semesterDirectory, "course");
  const currentCourses = new Map();

  for (const filename of DEFAULT_COURSE_FILES) {
    const listPath = path.join(semesterDirectory, filename);
    if (!fs.existsSync(listPath)) {
      throw new Error(`Missing current course list: ${listPath}`);
    }
    const courses = readJson(listPath);
    if (!Array.isArray(courses)) {
      throw new Error(`Current course list is not an array: ${listPath}`);
    }
    for (const course of courses) {
      if (!course || typeof course !== "object") {
        throw new Error(`Current course list contains an invalid row: ${listPath}`);
      }
      const id = courseId(course.id, listPath);
      const existing = currentCourses.get(id) || { hasSyllabusLink: false };
      if (Array.isArray(course.syllabusLinks) && course.syllabusLinks.length) {
        existing.hasSyllabusLink = true;
      }
      currentCourses.set(id, existing);
    }
  }

  const index = {};
  for (const [id, currentCourse] of currentCourses) {
    const entry = emptyIndexEntry();
    if (!currentCourse.hasSyllabusLink) {
      index[id] = entry;
      continue;
    }
    const syllabusPath = path.join(courseDirectory, `${id}.json`);
    if (!fs.existsSync(syllabusPath)) {
      if (currentCourse.hasSyllabusLink) {
        throw new Error(`Missing syllabus file for course ${id}: ${syllabusPath}`);
      }
      index[id] = entry;
      continue;
    }

    const syllabi = readJson(syllabusPath);
    if (!Array.isArray(syllabi)) {
      throw new Error(`Syllabus file is not an array: ${syllabusPath}`);
    }
    const sdgs = [];
    for (const syllabus of syllabi) {
      if (!syllabus || typeof syllabus !== "object") continue;
      addUnique(entry.ai, splitSyllabusOptions(syllabus["課程是否導入AI"]));
      addUnique(entry.resources, splitSyllabusOptions(syllabus["延伸教學與資源"]));
      addUnique(sdgs, parseSdgNumbers(syllabus["課程對應SDGs指標"]));
      if (hasSyllabusContent(syllabus)) entry.hasSyllabus = true;
    }
    entry.sdgs = sdgs.sort((a, b) => a - b);
    index[id] = entry;
  }

  fs.mkdirSync(semesterDirectory, { recursive: true });
  const indexPath = path.join(semesterDirectory, "syllabus-index.json");
  const temporaryPath = `${indexPath}.tmp-${process.pid}`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(index, null, 2)}\r\n`, "utf8");
  fs.renameSync(temporaryPath, indexPath);
  return index;
}

module.exports = {
  DEFAULT_COURSE_FILES,
  buildSyllabusIndex,
};
