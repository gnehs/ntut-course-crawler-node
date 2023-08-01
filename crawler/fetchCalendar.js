const fs = require("fs");
const ical = require("node-ical");
const pangu = require("pangu");
let url =
  "https://calendar.google.com/calendar/ical/docfuhim9b22fqvp2tk842ak3c%40group.calendar.google.com/public/basic.ics";

(async () => {
  console.log("fetch calerdar data");
  let data = Object.entries(await ical.async.fromURL(url))
    .filter(([key, value]) => key != "vcalendar")
    .map(([_, x]) => x)
    // short by start
    .sort((a, b) => new Date(a.start) - new Date(b.start))
    .map((x) => {
      console.log(x);
      x.summary = pangu.spacing(x.summary);
      return x;
    });
  fs.mkdirSync("./dist/", { recursive: true });
  fs.writeFileSync("./dist/calendar.json", JSON.stringify(data));
})();
