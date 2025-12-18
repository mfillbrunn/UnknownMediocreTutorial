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

  proposedSecret = proposedSecret.toUpperCase();

  // 1 — MUST obey forced green letters
  for (const pos in forced) {
    const idx = Number(pos);
    if (proposedSecret[idx] !== forced[pos]) return false;
  }

  for (const entry of history) {
    if (entry.ignoreConstraints) continue;

    const guess = entry.guess.toUpperCase();
    const actual = normalizeFB(entry.fb);

    // 2 — raw scoring result from canonical Wordle logic
    const expected = scoreGuess(proposedSecret, guess);

    // 3 — apply forced greens to scoring
    for (const pos in forced) {
      const idx = Number(pos);
      if (!(eff && entry.roundIndex === eff.guessIndex && eff.indices.includes(idx))) {
    expected[idx] = "🟩";
}
    }

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
