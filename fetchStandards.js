const fetchStandards = require("./crawler/fetchStandards");

(async () => {
  await fetchStandards();
  console.log("All done!");
})();
