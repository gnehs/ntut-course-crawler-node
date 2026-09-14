// node fetchCompetencies.js
const { fetchCompetencies } = require("./crawler/fetchCompetencies");

(async () => {
  await fetchCompetencies();
  console.log("All done!");
})().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
