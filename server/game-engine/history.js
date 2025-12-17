// /game-engine/history.js — SERVER VERSION (CommonJS)

const { scoreGuess } = require("./scoring.js");

/**
 * Verify that a word fits all previous feedback.
 * Used when setter chooses a new secret mid-round.
 */
function isConsistentWithHistory(history, proposedSecret, state){
  for (const entry of history) {
    if (entry.ignoreConstraints) continue;
    const expected = scoreGuess(proposedSecret, entry.guess).join("");
    const actual = entry.fb.join("");
    const eff = state?.powers?.vowelRefreshEffect;

    for (let i = 0; i < 5; i++) {

      // Skip vowel positions of refreshed round
      if (eff && entry.roundIndex === eff.guessIndex && eff.indices.includes(i)) {
        continue;
      }

      if (expected[i] !== actual[i]) return false;
    }
  }
  return true;
}

module.exports = { isConsistentWithHistory };
