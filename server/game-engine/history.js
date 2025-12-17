// /game-engine/history.js — SERVER VERSION (CommonJS)

const { scoreGuess } = require("./scoring.js");

/**
 * Verify that a word fits all previous feedback.
 * Used when setter chooses a new secret mid-round.
 */
function isConsistentWithHistory(history, proposedSecret) {
  for (const entry of history) {
    if (entry.ignoreConstraints) continue;
    const expected = scoreGuess(proposedSecret, entry.guess).join("");
    const actual = entry.fb.join("");
    const eff = state?.powers?.vowelRefreshEffect;

    if (eff && eff.guessIndex === entry.roundIndex) {
        // Ignore vowel-constrained positions for consistency
        for (const pos of eff.indices) {
            continue; // do not enforce constraint for this position
        }
    }

    if (expected !== actual) return false;
  }
  return true;
}

module.exports = { isConsistentWithHistory };
