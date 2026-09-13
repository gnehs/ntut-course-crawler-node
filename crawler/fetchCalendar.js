const fs = require("fs");
const ical = require("node-ical");
const pangu = require("./tools/pangu").spacing;
const REQUEST_TIMEOUT_MS = 30 * 1000;
const url =
  "https://calendar.google.com/calendar/ical/docfuhim9b22fqvp2tk842ak3c%40group.calendar.google.com/public/basic.ics";

function errorCode(error) {
  const candidate =
    typeof error?.code === "string"
      ? error.code
      : typeof error?.name === "string"
        ? error.name
        : "unknown";
  return /^[A-Za-z][A-Za-z0-9_:-]{0,63}$/.test(candidate)
    ? candidate
    : "unknown";
}

async function main() {
  const startedAt = Date.now();
  console.log("[start] calendar data fetch");
  const entries = Object.entries(
    await ical.async.fromURL(url, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  ).filter(([key]) => key != "vcalendar");
  console.log(`[fetch] calendar data received (${entries.length} entries)`);

  let data = entries
    .map(([_, x]) => x)
    // short by start
    .sort((a, b) => new Date(a.start) - new Date(b.start))
    .map((x) => {
      x.summary = pangu(x.summary);
      return x;
    });
  fs.mkdirSync("./dist/", { recursive: true });
  fs.writeFileSync("./dist/calendar.json", JSON.stringify(data));
  console.log(
    `[complete] calendar data saved (${data.length} events, ${
      Date.now() - startedAt
    }ms)`
  );
}

main().catch((error) => {
  console.error(`[error] calendar data fetch failed (${errorCode(error)})`);
  process.exitCode = 1;
});
