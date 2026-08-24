// Regression test for the v5 star normalization:
//   old base 0 -> new base 0
//   old base 1 -> new base 1
//   old base 2 -> new base 2
//   old base 3 -> new base 2
//   total = min(3, new base + eligible bonus star)
// i.e. a base switch alone tops out at 2 stars; the bonus star is the
// only way a turn can reach 3.
const assert = require("assert");
const spyChargeServer = require("../powers/powers/spyChargeServer");
const coverStrength = require("../utils/coverStrength");

function run() {
  // ---- 1. starsForCandidate is the single source of truth for the base
  // tier mapping -- exercise it directly against synthetic gap
  // percentages standing in for each of the old tiers.
  const cases = [
    // [candidateCount, bestCount, expectedNewBase, label]
    [0, 0, 0, "degenerate/invalid (old base 0)"],
    [40, 100, 1, "gap 60% -- old base 1 (gap >= 25%)"],
    [80, 100, 2, "gap 20% -- old base 2 (10% <= gap < 25%)"],
    [98, 100, 2, "gap 2% -- old base 3 (gap < 10%), now normalized to 2"]
  ];
  for (const [candidateCount, bestCount, expected, label] of cases) {
    const got = spyChargeServer.starsForCandidate(candidateCount, bestCount);
    assert.strictEqual(got, expected, `starsForCandidate(${candidateCount}, ${bestCount}) [${label}]: expected ${expected}, got ${got}`);
  }

  // ---- 2. End-to-end through evaluateSecretChange with a real word
  // scenario: find the objectively best switch (the one whose bucket
  // count equals analysis.bestCount, i.e. gapPct 0 -- old base 3
  // territory) and confirm it now normalizes to base 2, and that adding
  // a matching bonus target is the only way it reaches 3 total.
  const allowedSecrets = ["APPLE", "AMPLY", "ANGLE", "ANKLE", "MANGO", "GRAPE"];
  const state = {
    phase: "normal",
    setter: "S",
    guesser: "G",
    turn: "S",
    secret: "APPLE",
    pendingGuess: "MANGO",
    history: [],
    extraConstraints: [],
    simultaneousAllWrong: false,
    powers: { spyCharge: { enabled: true, total: 0, resetsUsed: 0, hint: null }, doubleGuessPending: false }
  };

  const analysis = coverStrength.getCoverAnalysis(state, allowedSecrets);
  assert.ok(analysis && analysis.bestCount != null, "test setup: analysis must resolve a bestCount");

  const bestWord = analysis.feasibleWords.find(word => {
    if (word === analysis.currentSecret || word === analysis.pendingGuess) return false;
    return coverStrength.getCandidateRemainingCount(analysis, word) === analysis.bestCount;
  });
  assert.ok(bestWord, "test setup: at least one candidate must achieve bestCount");

  const bestAward = spyChargeServer.evaluateSecretChange(state, bestWord, allowedSecrets);
  assert.strictEqual(bestAward.baseStars, 2, `the objectively best switch must earn base 2 (not 3), got ${bestAward.baseStars}`);
  assert.strictEqual(bestAward.bonusStars, 0, "no hint set yet -- bonus must be 0");
  assert.strictEqual(bestAward.earnedStars, 2, `total without a bonus must be 2, got ${bestAward.earnedStars}`);

  // Give it a hint matching a real letter/position in the best word --
  // this is the ONLY way the same switch can reach 3.
  const bonusPosition = 2;
  state.powers.spyCharge.hint = { letter: bestWord[bonusPosition], position: bonusPosition };
  const bestPlusBonus = spyChargeServer.evaluateSecretChange(state, bestWord, allowedSecrets);
  assert.strictEqual(bestPlusBonus.baseStars, 2);
  assert.strictEqual(bestPlusBonus.bonusStars, 1, "a draft matching the hint must earn the bonus star");
  assert.strictEqual(bestPlusBonus.earnedStars, 3, `base 2 + bonus 1 must total exactly 3, got ${bestPlusBonus.earnedStars}`);

  console.log("PASS starNormalization: base tiers merge to {0,1,2}, and only base+bonus reaches 3");
}

module.exports = { run };

if (require.main === module) {
  run();
}
