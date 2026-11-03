// node fetchMProgramDocs.js
const { fetchMProgramDocs } = require("./crawler/fetchMProgramDocs");

(async () => {
  await fetchMProgramDocs();
  console.log("All done!");
})().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
