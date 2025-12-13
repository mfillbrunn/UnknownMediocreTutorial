function buildSafeStateForPlayer(state, role) {
  const safe = JSON.parse(JSON.stringify(state));

  if (state.revealGreenInfo) {
    safe.revealGreenInfo = state.revealGreenInfo;
    } else {
    delete safe.revealGreenInfo;
  }
  
  // -----------------------------------------------------
  // 1. Hide SECRET from guesser
  // -----------------------------------------------------
  if (role === state.guesser) {
    safe.secret = "";
  }

  // -----------------------------------------------------
  // 2. Hide GUESS from setter during simultaneous phase
  // -----------------------------------------------------
  if (role === state.setter && state.phase === "simultaneous") {
    safe.pendingGuess = "";
  }

  // -----------------------------------------------------
  // 3. Clean INTERNAL power state (never exposed)
  // -----------------------------------------------------
  delete safe.powers.confuseColorsActive;
  delete safe.powers.countOnlyActive;
  delete safe.powers.freezeActive;
  delete safe.powers.currentHiddenIndices;
  if (role !== state.guesser) {
    delete safe.powers.reuseLettersPool;
  }
  delete safe.powers.hideTilePendingCount;
  

  // -----------------------------------------------------
  // 4. Clean internal machine flags
  // -----------------------------------------------------
  delete safe.simultaneousGuessSubmitted;
  delete safe.simultaneousSecretSubmitted;
  delete safe.powerUsedThisTurn;
  delete safe.firstSecretSet;

  // -----------------------------------------------------
  // 5. Filter & sanitize HISTORY
  // -----------------------------------------------------
// -----------------------------------------------------
// 5. Filter & sanitize HISTORY
// -----------------------------------------------------
safe.history = safe.history
  .map(entry => {
    console.log("SERVER SAFE ENTRY BEFORE CLEAN:", entry);
    if (!entry) return null;

    const e = JSON.parse(JSON.stringify(entry));

    // ================================================
    // DURING MATCH (NOT gameOver)
    // ================================================
    if (!state.gameOver) {
      if (role === state.guesser) {
        delete e.fb;   // Guesser sees masked feedback only
        if (!Array.isArray(e.fbGuesser) || e.fbGuesser.length !== 5) {
          e.fbGuesser = ["?", "?", "?", "?", "?"];
        }
      }

      if (role === state.setter) {
        delete e.fbGuesser;   // Setter sees full fb
        if (!Array.isArray(e.fb) || e.fb.length !== 5) {
          e.fb = ["?", "?", "?", "?", "?"];
        }
      }

      // Hide secret during gameplay
      delete e.finalSecret;
    }

    // ================================================
    // AFTER GAME OVER → Reveal secret + full feedback
    // ================================================
    else {
      delete e.fbGuesser;   // Everyone sees real fb
      // Keep:
      //   e.fb
      //   e.finalSecret
    }

    // Remove other internal-only fields
    delete e.ignoreConstraints;

    console.log("SERVER SAFE ENTRY AFTER CLEAN:", e);
    return e;
  })
  .filter(e => e !== null);


  return safe;
}

module.exports = { buildSafeStateForPlayer };
