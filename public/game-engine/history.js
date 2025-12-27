/**
 * Normalize emoji feedback so comparisons are consistent
 */
function normalizeFB(fbArr) {
  if (!Array.isArray(fbArr)) {
    // Treat missing feedback as all black tiles
    return ["⬛","⬛","⬛","⬛","⬛"];
  }
  return fbArr.map(fb => {
    if (fb === "🟩") return "🟩";
    if (fb === "🟨") return "🟨";
    return "⬛";
  });
}


/**
 * Browser version of isConsistentWithHistory
 * PURE LOGIC — mirrors server implementation but does NOT use require()
 */
function isConsistentWithHistory(history, proposedSecret, state) {
  proposedSecret = proposedSecret.toUpperCase();
  // Enforce extraConstraints (timeless secret constraints)
  if (state?.extraConstraints?.length) {
    for (const c of state.extraConstraints) {
      if (c.type === "GREEN") {
        if (proposedSecret[c.index] !== c.letter) {
          return false;
        }
      }
    }
  }

  for (const entry of history) {
    if (entry.ignoreConstraints) continue;
    const guess = entry.guess.toUpperCase();
    const rawFb =  entry.fb ?? entry.fbGuesser;
    const actual = normalizeFB(rawFb);

    // IMPORTANT: browser scoreGuess comes from scoring.js (already loaded)
    let expected = window.scoreGuess(proposedSecret, guess);
 

    for (let i = 0; i < 5; i++) {
      if (expected[i] !== actual[i]) return false;
    }
  }

  return true;
}

// Make it usable everywhere in the client
window.isConsistentWithHistory = isConsistentWithHistory;
