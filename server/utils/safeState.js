function buildSafeStateForPlayer(state, role) {
  const safe = JSON.parse(JSON.stringify(state));

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
  delete safe.powers.revealGreenPos;
  delete safe.powers.revealGreenLetter;
  delete safe.powers.reuseLettersPool;
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
  safe.history = safe.history
  .map(entry => {
    console.log("SERVER SAFE ENTRY BEFORE CLEAN:", entry);
    if (!entry) return null;

    const e = JSON.parse(JSON.stringify(entry));

    // GUESSER sees fbGuesser only
    if (role === state.guesser) {
      delete e.fb;
      if (!Array.isArray(e.fbGuesser) || e.fbGuesser.length !== 5) {
        console.warn("Repairing missing fbGuesser:", e);
        e.fbGuesser = ["?", "?", "?", "?", "?"];
      }
    }

    // SETTER sees fb only
    if (role === state.setter) {
      delete e.fbGuesser;
      if (!Array.isArray(e.fb) || e.fb.length !== 5) {
        console.warn("Repairing missing fb:", e);
        e.fb = ["?", "?", "?", "?", "?"];
      }
    }

    // Delete internal metadata
    delete e.finalSecret;
    delete e.ignoreConstraints;
        
    console.log("SERVER SAFE ENTRY AFTER CLEAN:", e);
    return e;
  })
  .filter(e => e !== null);
  return safe;
}

module.exports = { buildSafeStateForPlayer };
