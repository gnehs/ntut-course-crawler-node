const fetchStandards = require("./crawler/fetchStandards");

(async () => {
  await fetchStandards();
  console.log("All done!");
})().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
