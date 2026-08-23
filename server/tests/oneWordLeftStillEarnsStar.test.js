// Regression test: when only one legal secret word remains, the
// Secretkeeper's Keep decision (their only real option at that point)
// must still earn at least one star -- same "legal Keep earns >=1 base
// star" floor as the general case (see spyChargeServer.js's
// STAR FLOOR + ARCHIVE BEST WORD wrapper), just confirmed specifically
// for the single-candidate edge case the "Only one word is left" UI state
// (remaining-words.js) covers.
const assert = require("assert");
const spyChargeServer = require("../powers/powers/spyChargeServer");
const { isConsistentWithHistory } = require("../game-engine/history");

function run() {
  const allowedSecrets = ["APPLE", "GRAPE", "MANGO", "PEACH", "LEMON"];

  const state = {
    phase: "normal",
    setter: "S",
    guesser: "G",
    turn: "S",
    secret: "APPLE",
    pendingGuess: "MANGO",
    // Feedback that only APPLE itself satisfies -- everything else in
    // allowedSecrets is eliminated, matching the "Only one word is left"
    // state.
    history: [{ fb: ["🟩", "🟩", "🟩", "🟩", "🟩"], guess: "APPLE" }],
    extraConstraints: [],
    simultaneousAllWrong: false,
    powers: { spyCharge: { enabled: true, total: 0, resetsUsed: 0 } }
  };

  const feasible = allowedSecrets.filter(word =>
    isConsistentWithHistory(state.history, word, state)
  );
  assert.deepStrictEqual(feasible, ["APPLE"], "test setup: exactly one word must be feasible");

  const award = spyChargeServer.evaluateSecretChange(state, "APPLE", allowedSecrets);
  assert.ok(award.baseStars >= 1, `Keep with only one legal word must earn >=1 base star, got ${award.baseStars}`);
  assert.ok(award.earnedStars >= 1, `Keep with only one legal word must earn >=1 total star, got ${award.earnedStars}`);

  console.log("PASS oneWordLeftStillEarnsStar: Keep with a single legal word still earns a star");
}

module.exports = { run };

if (require.main === module) {
  run();
}
