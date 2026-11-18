const SITE_ORIGIN = "https://ntut-course.gnehs.net";
// Hosted by ntut-course-web at /<key>.txt; IndexNow keys are public by design.
const INDEXNOW_KEY = "7ba64516b03538ed9b7560b36476cf2f";
const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";
const MAX_URLS_PER_REQUEST = 10000;

// Same order as ntut-course-web's sitemap: a course links to the first
// department list that contains it.
const DEPARTMENTS = ["main", "進修部", "研究所(日間部、進修部、週末碩士班)"];

// Mirrors ntut-course-web src/lib/contentVisibility.ts.
const hiddenTeachers = new Set(["朴維鎮"]);

function isCourseHidden(course) {
  return (course.teacher || []).some((teacher) => hiddenTeachers.has(teacher.name));
}

function byId(courses) {
  return new Map((courses || []).filter((course) => course.id).map((course) => [course.id, course]));
}

// `read(revision, path)` returns parsed JSON, or null when the file is absent.
function changedUrls({ year, sem, changedFiles, read, origin = SITE_ORIGIN }) {
  const prefix = `${year}/${sem}/`;
  const changed = new Set();
  const syllabusFile = new RegExp(`^${prefix}course/(\\d+)\\.json$`);
  for (const file of changedFiles) {
    const match = syllabusFile.exec(file);
    if (match) changed.add(match[1]);
  }

  const lists = DEPARTMENTS.map((department) => {
    const path = `${prefix}${department}.json`;
    const before = byId(read("old", path));
    const after = byId(read("new", path));
    if (changedFiles.includes(path)) {
      for (const [id, course] of after) {
        if (JSON.stringify(course) !== JSON.stringify(before.get(id))) changed.add(id);
      }
      for (const id of before.keys()) if (!after.has(id)) changed.add(id);
    }
    return { department, before, after };
  });

  const knownClasses = new Set(
    (read("new", `${prefix}department.json`) || [])
      .flatMap((group) => group.class || [])
      .map((classData) => classData.name)
      .filter(Boolean)
  );

  const urls = new Set();
  const linked = new Set();
  for (const { department, before, after } of lists) {
    for (const id of changed) {
      const course = after.get(id);
      if (course && !isCourseHidden(course) && !linked.has(id)) {
        linked.add(id);
        const url = new URL(`/course/${year}/${sem}/${encodeURIComponent(id)}`, origin);
        if (department !== "main") url.searchParams.set("d", department);
        urls.add(url.toString());
      }
      // A class page changes when a course joins, changes, or leaves it.
      for (const record of [before.get(id), course]) {
        for (const classData of record?.class || []) {
          if (!knownClasses.has(classData.name)) continue;
          const url = new URL(
            `/class/${year}/${sem}/${encodeURIComponent(classData.name)}`,
            origin
          );
          url.searchParams.set("d", department);
          urls.add(url.toString());
        }
      }
    }
  }
  return [...urls];
}

async function submitIndexNow(urls, { origin = SITE_ORIGIN, fetchImpl = fetch } = {}) {
  const host = new URL(origin).host;
  for (let start = 0; start < urls.length; start += MAX_URLS_PER_REQUEST) {
    const response = await fetchImpl(INDEXNOW_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        host,
        key: INDEXNOW_KEY,
        keyLocation: `${origin}/${INDEXNOW_KEY}.txt`,
        urlList: urls.slice(start, start + MAX_URLS_PER_REQUEST),
      }),
    });
    // 200 = accepted, 202 = accepted while the key is still being verified.
    if (response.status !== 200 && response.status !== 202) {
      throw new Error(`IndexNow rejected the submission: ${response.status} ${await response.text()}`);
    }
  }
}

module.exports = { changedUrls, submitIndexNow, INDEXNOW_KEY, MAX_URLS_PER_REQUEST };
