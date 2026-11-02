const fs = require("node:fs");
const path = require("node:path");

// Every JSON file under directory, skipping dot entries such as .git.
function* jsonFiles(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) yield* jsonFiles(entryPath);
    else if (entry.name.endsWith(".json")) yield entryPath;
  }
}

module.exports = { jsonFiles };
