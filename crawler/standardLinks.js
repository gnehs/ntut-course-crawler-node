const cheerio = require("cheerio");

const APS_HOSTNAME = "aps.ntut.edu.tw";
const STANDARD_PATH = "/course/tw/Cprog.jsp";
const BASE_URL = `https://${APS_HOSTNAME}/course/tw/`;

function normalizeText(value) {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Keep labels byte-for-byte compatible with fetchStandards' existing keys.
// That parser removes line breaks and ASCII spaces from table cells.
function normalizeStandardLabel(value) {
  return String(value ?? "").replace(/\r|\n| /g, "");
}

function asDocument(page) {
  if (typeof page === "function") return page;
  return cheerio.load(String(page ?? ""));
}

/**
 * Parse and validate an APS course-standard link.
 *
 * The URL constructor and URLSearchParams are used here instead of regular
 * expressions so that relative links and query parameters in any order are
 * handled consistently.
 */
function parseStandardLink(href, base = BASE_URL) {
  if (!href) return null;

  let url;
  try {
    url = new URL(href, base);
  } catch {
    return null;
  }

  if (
    url.protocol !== "https:" ||
    url.hostname !== APS_HOSTNAME ||
    url.pathname !== STANDARD_PATH
  ) {
    return null;
  }

  return {
    href: url.href,
    format: url.searchParams.get("format"),
    year: url.searchParams.get("year"),
    matric: url.searchParams.get("matric"),
    division: url.searchParams.get("division"),
  };
}

function parseYearLinks(page) {
  const $ = asDocument(page);
  const years = [];
  const seen = new Set();

  $("a[href]").each((_, anchor) => {
    const parsed = parseStandardLink($(anchor).attr("href"));
    if (!parsed || parsed.format !== "-2" || !parsed.year || seen.has(parsed.year)) {
      return;
    }
    seen.add(parsed.year);
    years.push({
      year: parsed.year,
      href: parsed.href,
      name: normalizeText($(anchor).text()),
    });
  });

  return years;
}

function parseSystemLinks(page, year) {
  const $ = asDocument(page);
  const systems = [];
  const seen = new Set();

  $("a[href]").each((_, anchor) => {
    const parsed = parseStandardLink($(anchor).attr("href"));
    if (
      !parsed ||
      parsed.format !== "-3" ||
      parsed.year !== String(year) ||
      !parsed.matric ||
      seen.has(parsed.matric)
    ) {
      return;
    }

    const name = normalizeStandardLabel($(anchor).text());
    if (!name) return;
    seen.add(parsed.matric);
    systems.push({
      system: name,
      matric: parsed.matric,
      year: parsed.year,
      href: parsed.href,
    });
  });

  return systems;
}

function parseDepartmentLinks(page, { year, matric } = {}) {
  const $ = asDocument(page);
  const departments = [];
  const seen = new Set();

  $("a[href]").each((_, anchor) => {
    const parsed = parseStandardLink($(anchor).attr("href"));
    if (
      !parsed ||
      parsed.format !== "-4" ||
      (year != null && parsed.year !== String(year)) ||
      (matric != null && parsed.matric !== String(matric)) ||
      !parsed.division
    ) {
      return;
    }

    const department = normalizeStandardLabel($(anchor).text());
    if (!department) return;

    const key = `${department}\u0000${parsed.division}\u0000${parsed.matric ?? ""}`;
    if (seen.has(key)) return;
    seen.add(key);
    departments.push({
      department,
      division: parsed.division,
      matric: parsed.matric ?? (matric == null ? undefined : String(matric)),
      year: parsed.year,
      href: parsed.href,
    });
  });

  return departments;
}

function groupStandardDepartments(system, departments) {
  return departments.map((department) => ({
    system: system.system,
    department: department.department,
    division: department.division,
    matric: department.matric ?? system.matric,
  }));
}

module.exports = {
  APS_HOSTNAME,
  BASE_URL,
  STANDARD_PATH,
  asDocument,
  groupStandardDepartments,
  normalizeText,
  normalizeStandardLabel,
  parseDepartmentLinks,
  parseStandardLink,
  parseSystemLinks,
  parseYearLinks,
};
