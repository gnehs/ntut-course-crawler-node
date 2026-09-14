const fs = require("node:fs");
const path = require("node:path");
const jsonfile = require("jsonfile");

const { fetchSinglePage } = require("./fetchSinglePage");
const {
  BASE_URL,
  groupStandardDepartments,
  parseDepartmentLinks,
  parseSystemLinks,
  parseYearLinks,
} = require("./standardLinks");

const INDEX_FILENAME = "standard-departments.json";
const YEARS_URL = `${BASE_URL}Cprog.jsp?format=-1`;

function normalizeRequestedYears(years) {
  if (years == null) return null;

  const values = (Array.isArray(years) ? years : [years])
    .flatMap((value) => String(value).split(","))
    .map((value) => value.trim())
    .filter(Boolean);

  if (values.length === 0) return null;

  const result = [];
  const seen = new Set();
  for (const year of values) {
    if (!/^\d{2,3}$/.test(year)) {
      throw new Error(`Invalid NTUT course-standard year: ${year}`);
    }
    if (seen.has(year)) continue;
    seen.add(year);
    result.push(year);
  }
  return result;
}

function dedupeStandardDepartments(departments) {
  const result = [];
  const seen = new Set();

  for (const department of departments) {
    const key = [
      department.system,
      department.department,
      department.division,
      department.matric,
    ].join("\u0000");
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(department);
  }

  return result;
}

async function discoverYears(fetchPage) {
  const $ = await fetchPage(YEARS_URL);
  const years = parseYearLinks($).map(({ year }) => year);
  if (years.length === 0) {
    throw new Error("The APS course-standard year page has no valid year links");
  }
  return years;
}

async function fetchYearStandardDepartments(year, fetchPage) {
  const systemsUrl = `${BASE_URL}Cprog.jsp?format=-2&year=${encodeURIComponent(year)}`;
  const systemsPage = await fetchPage(systemsUrl);
  const systems = parseSystemLinks(systemsPage, year);
  if (systems.length === 0) {
    throw new Error(`The APS course-standard page has no systems for year ${year}`);
  }

  const departments = [];
  for (const system of systems) {
    const departmentPage = await fetchPage(system.href);
    const parsedDepartments = parseDepartmentLinks(departmentPage, {
      year,
      matric: system.matric,
    });
    departments.push(...groupStandardDepartments(system, parsedDepartments));
  }

  const result = dedupeStandardDepartments(departments);
  if (result.length === 0) {
    throw new Error(`The APS course-standard page has no departments for year ${year}`);
  }
  return result;
}

function writeStandardDepartments(outputRoot, year, departments) {
  const directory = path.join(outputRoot, String(year));
  fs.mkdirSync(directory, { recursive: true });
  const outputPath = path.join(directory, INDEX_FILENAME);
  jsonfile.writeFileSync(outputPath, departments, {
    spaces: 2,
    EOL: "\r\n",
  });
  return outputPath;
}

/**
 * Fetch only the year, system, and department index pages.
 *
 * Requests are deliberately sequential. The index is small, and avoiding
 * parallel requests keeps the legacy APS server load predictable.
 */
async function fetchStandardDepartments(years = null, options = {}) {
  const fetchPage = options.fetchPage ?? fetchSinglePage;
  const outputRoot = options.outputRoot ?? path.resolve(process.cwd(), "dist");
  const requestedYears = normalizeRequestedYears(years);
  const selectedYears = requestedYears ?? (await discoverYears(fetchPage));
  const snapshots = [];

  for (const year of selectedYears) {
    console.log(`[fetch] course-standard department index ${year}`);
    const departments = await fetchYearStandardDepartments(year, fetchPage);
    const outputPath = writeStandardDepartments(outputRoot, year, departments);
    snapshots.push({ year, departments, outputPath });
  }

  return snapshots;
}

module.exports = {
  INDEX_FILENAME,
  YEARS_URL,
  dedupeStandardDepartments,
  discoverYears,
  fetchStandardDepartments,
  fetchYearStandardDepartments,
  normalizeRequestedYears,
  writeStandardDepartments,
};
