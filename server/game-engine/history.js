const { scoreGuess } = require("./scoring.js");

/**
 * Normalize emoji-based feedback so comparisons are consistent.
 */
function normalizeFB(fbArr) {
  return fbArr.map(fb => {
    if (fb === "🟩") return "🟩";
    if (fb === "🟨") return "🟨";
    return "⬛"; // includes ⬜ treated as black
  });
}

/**
 * MAIN LOGICAL CHECK FOR SECRET CONSISTENCY.
 * Handles:
 *  - normal scoring
 *  - revealLetter (forcedGreens)
 *  - vowelRefresh erased positions
 */
function isConsistentWithHistory(history, proposedSecret, state) {
  const eff = state?.powers?.vowelRefreshEffect || null;
  const forced = state?.powers?.forcedGreens || {};
  const revealRound = state?.powers?.revealLetterRound ?? Infinity;
  proposedSecret = proposedSecret.toUpperCase();

  // 1 — MUST obey forced green letters
  function applyForcedGreens(expected, entry) {
    if (entry.roundIndex < revealRound) return;   // Do NOT modify past rounds
    for (const pos in forced) {
      const idx = Number(pos);
      expected[idx] = "🟩";
    }
  }

  for (const entry of history) {
    if (entry.ignoreConstraints) continue;

    const guess = entry.guess.toUpperCase();
    const actual = normalizeFB(entry.fb);
     let expected = scoreGuess(proposedSecret, guess);
    applyForcedGreens(expected, entry);

     // 4 — vowelRefresh erases specific positions
    if (eff && entry.roundIndex === eff.guessIndex) {
      for (const pos of eff.indices) {
        expected[pos] = actual[pos];
      }
    }

    // 5 — final comparison
    for (let i = 0; i < 5; i++) {
      // vowelRefresh skip logic
      if (eff && entry.roundIndex === eff.guessIndex && eff.indices.includes(i)) {
        continue;
      }
      if (expected[i] !== actual[i]) return false;
    }
  }

  return true;
}

module.exports = { isConsistentWithHistory };
