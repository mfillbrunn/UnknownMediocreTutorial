// Rare Word challenge secrets aren't in allowed_secrets.txt, but the Cuddle
// category-hint route must still accept them, and every one has themes of
// its own to reveal.
const assert = require("assert");
const { loadCuddleRareWords, registerCuddleWordThemeRoutes, getRevealableCategories } = require("../cuddle/wordThemes");

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
  assert.strictEqual(rareResult.body.noCategory, false, "a Rare Word has a category to reveal");
  assert.strictEqual(rareResult.body.categories.length, 1, "one category is revealed");
  const untagged = rare.filter(word => getRevealableCategories(word).length === 0);
  assert.deepStrictEqual(untagged, [], "every Rare Word has at least one theme");

  assert.strictEqual(call("crane").statusCode, 200, "ordinary secrets still work");
  assert.strictEqual(call("zzzzz").statusCode, 400, "unknown words are still refused");

  console.log("PASS cuddleRareWordHints: every Rare Word secret has themes and gets a real category hint, ordinary secrets still work, unknown words are still refused");
}

module.exports = { run };

if (require.main === module) {
  run();
}
