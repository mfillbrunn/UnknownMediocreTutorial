/**
 * Normalize emoji feedback so comparisons are consistent
 */
function normalizeFB(fbArr) {
 if (!Array.isArray(fbArr)) return null;
  return fbArr.map(fb => {
    if (fb === "🟩") return "🟩";
    if (fb === "🟨") return "🟨";
    if (fb === "?") return "?";
    return "⬛";
  });
}


/**
 * Browser version of isConsistentWithHistory
 * PURE LOGIC — mirrors server implementation but does NOT use require()
 */
function isConsistentWithHistory(history, proposedSecret, state) {
  const eff = state?.powers?.vowelRefreshEffect || null;
  const forced = state?.powers?.forcedGreens || {};
  const revealRound = state?.powers?.revealLetterRound ?? Infinity;

  proposedSecret = proposedSecret.toUpperCase();

  function applyForcedGreens(expected, entry) {
    if (entry.roundIndex < revealRound) return;
    for (const pos in forced) {
      const idx = Number(pos);
      expected[idx] = "🟩";
    }
  }

  for (const entry of history) {
    if (entry.ignoreConstraints) continue;

    const guess = entry.guess.toUpperCase();
    const rawFb =  entry.fb ?? entry.fbGuesser;
    const actual = normalizeFB(entry.rawFb);

    // IMPORTANT: browser scoreGuess comes from scoring.js (already loaded)
    let expected = window.scoreGuess(proposedSecret, guess);

    applyForcedGreens(expected, entry);

    if (eff && entry.roundIndex === eff.guessIndex) {
      for (const pos of eff.indices) {
        expected[pos] = actual[pos];
      }
    }

    for (let i = 0; i < 5; i++) {
      if (eff &&
          entry.roundIndex === eff.guessIndex &&
          eff.indices.includes(i)) {
        continue;
      }
      if (actual[i] === "?") continue;
      if (expected[i] !== actual[i]) return false;
    }
  }

  return true;
}

// Make it usable everywhere in the client
window.isConsistentWithHistory = isConsistentWithHistory;
