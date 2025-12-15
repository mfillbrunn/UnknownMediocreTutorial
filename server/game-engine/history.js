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
    if (expected !== actual) return false;
  }
  return true;
}

module.exports = { isConsistentWithHistory };
