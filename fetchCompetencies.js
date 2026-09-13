// node fetchCompetencies.js
const { fetchCompetencies } = require("./crawler/fetchCompetencies");

(async () => {
  await fetchCompetencies();
  console.log("All done!");
})();
