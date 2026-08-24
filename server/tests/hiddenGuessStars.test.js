// Regression test for Hidden Guess (state.powers.doubleGuessPending):
// while a Hidden Guess decision is pending, a valid setter submission
// (Keep OR Change) must earn exactly 1 total star -- no base-star scaling,
// no bonus star, even for an objectively best switch with a matching
// bonus target. Invalid submissions still earn nothing. Once the flag
// clears, normal rules resume.
const assert = require("assert");
const spyChargeServer = require("../powers/powers/spyChargeServer");
const coverStrength = require("../utils/coverStrength");

function run() {
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
    powers: {
      spyCharge: { enabled: true, total: 0, resetsUsed: 0, hint: null },
      doubleGuessPending: true
    }
  };

  const analysis = coverStrength.getCoverAnalysis(state, allowedSecrets);
  const bestWord = analysis.feasibleWords.find(word => {
    if (word === analysis.currentSecret || word === analysis.pendingGuess) return false;
    return coverStrength.getCandidateRemainingCount(analysis, word) === analysis.bestCount;
  });
  assert.ok(bestWord, "test setup: at least one candidate must achieve bestCount");

  // hidden + change + otherwise 2-star (best) switch -> 1
  const changeAward = spyChargeServer.evaluateSecretChange(state, bestWord, allowedSecrets);
  assert.strictEqual(changeAward.baseStars, 1, `Hidden Guess change must earn base 1, got ${changeAward.baseStars}`);
  assert.strictEqual(changeAward.bonusStars, 0, "Hidden Guess must suppress the bonus star");
  assert.strictEqual(changeAward.earnedStars, 1, `Hidden Guess change must total exactly 1, got ${changeAward.earnedStars}`);

  // hidden + change + otherwise 3-star (best + a hint the draft matches)
  // -> still 1. The hint wouldn't really be set during a real Hidden
  // Guess turn (rollHintForTurn stays gated the same as before), but
  // injecting one directly here proves evaluateSecretChange itself
  // suppresses the bonus rather than merely relying on the hint being
  // absent.
  state.powers.spyCharge.hint = { letter: bestWord[2], position: 2 };
  const changeWithHintAward = spyChargeServer.evaluateSecretChange(state, bestWord, allowedSecrets);
  assert.strictEqual(changeWithHintAward.earnedStars, 1, `Hidden Guess change with a matching hint must still total 1, got ${changeWithHintAward.earnedStars}`);
  state.powers.spyCharge.hint = null;

  // hidden + keep + otherwise 1-star (any legal decision's floor) -> 1
  const keepAward = spyChargeServer.evaluateSecretChange(state, state.secret, allowedSecrets);
  assert.strictEqual(keepAward.baseStars, 1, `Hidden Guess keep must earn base 1, got ${keepAward.baseStars}`);
  assert.strictEqual(keepAward.bonusStars, 0);
  assert.strictEqual(keepAward.earnedStars, 1, `Hidden Guess keep must total exactly 1, got ${keepAward.earnedStars}`);

  // hidden + invalid submission -> 0
  const invalidAward = spyChargeServer.evaluateSecretChange(state, "ZZZZZ", allowedSecrets);
  assert.strictEqual(invalidAward.earnedStars, 0, `an invalid submission must still earn 0, got ${invalidAward.earnedStars}`);

  // next normal setter decision after Hidden Guess cleanup -> normal rules
  // (the same objectively-best switch now earns the usual base 2, proving
  // the flag doesn't leak into a later decision).
  state.powers.doubleGuessPending = false;
  const normalAward = spyChargeServer.evaluateSecretChange(state, bestWord, allowedSecrets);
  assert.strictEqual(normalAward.baseStars, 2, `after Hidden Guess cleanup, normal rules must resume (base 2), got ${normalAward.baseStars}`);

  console.log("PASS hiddenGuessStars: Hidden Guess floors every valid decision to exactly 1 star and cleans up correctly");
}

module.exports = { run };

if (require.main === module) {
  run();
}
