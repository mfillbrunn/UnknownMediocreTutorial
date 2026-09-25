// Rare Word challenge secrets aren't in allowed_secrets.txt, but the Cuddle
// category-hint route must still accept them (answering "No category")
// rather than refusing with a 400 that left every theme hint failing.
const assert = require("assert");
const { loadCuddleRareWords, registerCuddleWordThemeRoutes } = require("../cuddle/wordThemes");

function run() {
  const rare = loadCuddleRareWords();
  assert.ok(rare.length >= 100, `expected the Rare Word list, got ${rare.length} words`);
  assert.ok(rare.every(word => /^[A-Z]{5}$/.test(word)), "rare words are five capital letters");

  let handler = null;
  registerCuddleWordThemeRoutes({ post: (route, fn) => { if (route === "/api/cuddle/category-hint") handler = fn; } }, { allowedSecrets: ["crane"] });
  assert.ok(handler, "category-hint route registered");

  function call(word) {
    const res = { statusCode: 200, body: null, set() {}, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
    handler({ body: { word, knownCategories: [], count: 1 } }, res);
    return res;
  }

  const rareResult = call(rare[0]);
  assert.strictEqual(rareResult.statusCode, 200, "a Rare Word secret is accepted");
  assert.strictEqual(rareResult.body.noCategory, true, "a Rare Word has no category to reveal");

  assert.strictEqual(call("crane").statusCode, 200, "ordinary secrets still work");
  assert.strictEqual(call("zzzzz").statusCode, 400, "unknown words are still refused");

  console.log("PASS cuddleRareWordHints: Rare Word secrets get an honest \"No category\" from the category-hint route instead of a 400, ordinary secrets still work, unknown words are still refused");
}

module.exports = { run };

if (require.main === module) {
  run();
}
