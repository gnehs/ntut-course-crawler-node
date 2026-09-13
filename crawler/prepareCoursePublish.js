const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const departmentFiles = [
  "main.json",
  "進修部.json",
  "研究所(日間部、進修部、週末碩士班).json",
];

// Build a complete, isolated snapshot. Never delete from a source dataset.
function prepareCoursePublish(year, sem, root = "dist") {
  if (!/^\d+$/.test(String(year)) || !/^[12]$/.test(String(sem))) {
    throw new Error("Invalid semester for course publication");
  }
  const semesterDir = path.join(root, String(year), String(sem));
  const courses = new Map();
  for (const filename of departmentFiles) {
    const data = JSON.parse(fs.readFileSync(path.join(semesterDir, filename), "utf8"));
    if (!Array.isArray(data)) throw new Error(`Invalid course manifest: ${filename}`);
    for (const course of data) {
      if (!/^\d+$/.test(course.id) || !Array.isArray(course.syllabusLinks)) {
        throw new Error(`Invalid course record in ${filename}`);
      }
      const previous = courses.get(course.id);
      courses.set(course.id, {
        ...course,
        syllabusLinks: [...new Set([...(previous?.syllabusLinks || []), ...course.syllabusLinks])],
      });
    }
  }
  if (!courses.size) throw new Error("Refusing to publish an empty semester snapshot");

  // Validate every input before producing a snapshot that could replace published files.
  const records = [];
  for (const course of courses.values()) {
    const filename = `${course.id}.json`;
    let data = [];
    if (course.syllabusLinks.length) {
      data = JSON.parse(fs.readFileSync(path.join(semesterDir, "course", filename), "utf8"));
      if (!Array.isArray(data) || data.length !== course.syllabusLinks.length ||
          data.some((item) => !item || typeof item !== "object" || Array.isArray(item))) {
        throw new Error(`Incomplete syllabus data: ${filename}`);
      }
    }
    records.push([filename, data]);
  }
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ntut-course-publish-"));
  for (const [filename, data] of records) {
    fs.writeFileSync(path.join(directory, filename), JSON.stringify(data, null, 2) + "\n");
  }
  return { directory, count: records.length, destination: `${year}/${sem}/course` };
}

module.exports = { prepareCoursePublish };
