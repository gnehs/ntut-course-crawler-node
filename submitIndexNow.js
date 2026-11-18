const { execFileSync } = require("node:child_process");
const { changedUrls, submitIndexNow } = require("./crawler/indexNow");

// Notify IndexNow about the pages the latest gh-pages commit changed.
// Needs the parent commit, so check out the dataset with fetch-depth: 2.
async function main() {
  const [year, sem, publishedRoot] = process.argv.slice(2);
  if (!/^\d+$/.test(year) || !/^[12]$/.test(sem) || !publishedRoot) {
    throw new Error("Usage: node submitIndexNow.js <year> <sem> <published-root>");
  }
  const git = (...args) => execFileSync("git", ["-C", publishedRoot, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 1024 * 1024 * 1024,
  });
  const revisions = { old: "HEAD~1", new: "HEAD" };
  const read = (revision, path) => {
    try {
      return JSON.parse(git("show", `${revisions[revision]}:${path}`));
    } catch {
      return null;
    }
  };
  const changedFiles = git("diff", "--name-only", "-z", "HEAD~1", "HEAD", "--", `${year}/${sem}`)
    .split("\0")
    .filter(Boolean);
  const urls = changedUrls({ year, sem, changedFiles, read });
  if (!urls.length) {
    console.log("No course or class pages changed.");
    return;
  }
  await submitIndexNow(urls);
  console.log(`Submitted ${urls.length} URLs to IndexNow`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
