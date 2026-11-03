// node fetchProgramDocs.js
const { fetchProgramDocs } = require("./crawler/fetchProgramDocs");

(async () => {
  await fetchProgramDocs();
  console.log("All done!");
})().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
