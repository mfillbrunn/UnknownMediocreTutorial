// Minimal dependency-free test runner. Each sibling *.test.js exports a
// run() function that throws (via assert) on failure; this just requires
// and calls each one in turn, so `npm test` works without adding a test
// framework dependency to the project. run() may be async (awaited here)
// or plain synchronous (an `await` on its undefined return is a no-op),
// so existing synchronous tests are unaffected.
const fs = require("fs");
const path = require("path");

const dir = __dirname;
const files = fs
  .readdirSync(dir)
  .filter(name => name.endsWith(".test.js"))
  .sort();

async function main() {
  let failed = 0;
  for (const file of files) {
    const mod = require(path.join(dir, file));
    try {
      await mod.run();
    } catch (err) {
      failed++;
      console.error(`FAIL ${file}`);
      console.error(err);
    }
  }

  if (failed) {
    console.error(`\n${failed} of ${files.length} test file(s) failed.`);
    process.exit(1);
  } else {
    console.log(`\nAll ${files.length} test file(s) passed.`);
  }
}

main();
