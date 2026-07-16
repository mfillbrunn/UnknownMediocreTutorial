const { scoreGuess } = require("./scoring.js");

/**
 * Normalize emoji-based feedback so comparisons are consistent.
 */
function normalizeFB(fbArr) {
  return fbArr.map(fb => {
    if (fb === "🟩") return "🟩";
    if (fb === "🟨") return "🟨";
    if (fb === "⬛") return "⬛"; // includes ⬜ treated as black
    if (fb === "") return "";
  });
}

function isConsistentWithHistory(history, proposedSecret, state) {
  const extra = state?.extraConstraints ?? [];
  const forcedGreens = extra.filter(c => c.type === "GREEN");
  const forcedYellows = extra.filter(c => c.type === "YELLOW");
  proposedSecret = proposedSecret.toUpperCase();
  for (const c of forcedGreens) {
    if (proposedSecret[c.index] !== c.letter) {
      return false;
    }
  }
  // A YELLOW extraConstraint (e.g. from Field Report) promises the letter
  // is somewhere in the secret, position unspecified — any secret the
  // setter picks afterward has to actually contain it, or the promise
  // was a lie. GREEN-only enforcement here was the bug: yellows were
  // recorded but never actually bound the setter's choice.
  for (const c of forcedYellows) {
    if (!proposedSecret.includes(c.letter)) {
      return false;
    }
  }

  for (const entry of history) {
    if (entry.ignoreConstraints) continue;

    const guess = entry.guess.toUpperCase();
    const actual = normalizeFB(entry.fb);
     let expected = scoreGuess(proposedSecret, guess);
    // 5 — final comparison
    for (let i = 0; i < 5; i++) {
      if ((expected[i] !== actual[i]) && actual[i] !=="") return false;
    }
  }

  return true;
}

module.exports = { isConsistentWithHistory };
if (typeof window !== "undefined") {
  window.isConsistentWithHistory = isConsistentWithHistory;
}

