// node fetchStandardDepartments.js [year ...]
// Omit years to fetch every year listed by APS. Multiple years may be separated
// by spaces or commas, for example: node fetchStandardDepartments.js 109 115.
const { fetchStandardDepartments } = require("./crawler/fetchStandardDepartments");

(async () => {
  const years = process.argv.slice(2);
  await fetchStandardDepartments(years.length ? years : null);
  console.log("All done!");
})().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
