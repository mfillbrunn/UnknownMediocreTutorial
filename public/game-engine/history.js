/**
 * Normalize emoji feedback so comparisons are consistent
 */
function normalizeFB(fbArr) {
  return fbArr.map(fb => {
    if (fb === "🟩") return "🟩";
    if (fb === "🟨") return "🟨";
    if (fb == "⬛") return "⬛";
    if (fb == "") return "";
  });
}


/**
 * Browser version of isConsistentWithHistory
 * PURE LOGIC — mirrors server implementation but does NOT use require()
 */
function isConsistentWithHistory(history, proposedSecret, state) {
  proposedSecret = proposedSecret.toUpperCase();
  // Enforce extraConstraints (timeless secret constraints). Mirrors the
  // server's isConsistentWithHistory: GREEN pins a letter to a position,
  // YELLOW only requires the letter to appear somewhere. Both must be
  // checked or the client would let the setter submit a secret the server
  // then rejects (a toast with no shake / no explanation).
  if (state?.extraConstraints?.length) {
    for (const c of state.extraConstraints) {
      if (c.type === "GREEN") {
        if (proposedSecret[c.index] !== c.letter) {
          return false;
        }
      } else if (c.type === "YELLOW") {
        if (!proposedSecret.includes(c.letter)) {
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
      // Mirrors the server: only the originally green/yellow positions of a
      // Confuse Colors guess are unreliable -- a gray position is untouched
      // and still a hard constraint (see server/game-engine/history.js).
      if (entry.confuseIgnoreIndices?.includes(i)) continue;
      if ((expected[i] !== actual[i]) && actual[i] !=="") return false;
    }
  }

  return true;
}

// Make it usable everywhere in the client
window.isConsistentWithHistory = isConsistentWithHistory;
