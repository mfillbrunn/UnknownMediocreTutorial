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

function isConsistentWithHistory(history, proposedSecret, state) {
  const extra = state?.extraConstraints ?? [];
  const forcedGreens = extra.filter(c => c.type === "GREEN");
  for (const c of forcedGreens) {
    if (proposedSecret[c.index] !== c.letter) {
      return false;
    }
  }
  const eff = state?.powers?.vowelRefreshEffect || null;
  proposedSecret = proposedSecret.toUpperCase();

  for (const entry of history) {
    if (entry.ignoreConstraints) continue;

    const guess = entry.guess.toUpperCase();
    const actual = normalizeFB(entry.fb);
     let expected = scoreGuess(proposedSecret, guess);

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
if (typeof window !== "undefined") {
  window.isConsistentWithHistory = isConsistentWithHistory;
}

