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
  // STEALTH GUESS — hide guess from setter in NORMAL phase
if (role === state.setter && state.powers.stealthGuessActive) {
  safe.pendingGuess = "";
}


  // -----------------------------------------------------
  // 3. Clean INTERNAL power state (never exposed)
  // -----------------------------------------------------
 // 3. Clean INTERNAL power state (never exposed)
// DO NOT delete freezeActive — client needs this!
delete safe.powers.confuseColorsActive;
delete safe.powers.countOnlyActive;
delete safe.powers.currentHiddenIndices;
delete safe.powers.hideTilePendingCount;

if (role !== state.guesser) {
  delete safe.powers.reuseLettersPool;
}

// freezeActive is intentionally kept

  

  // -----------------------------------------------------
  // 4. Clean internal machine flags
  // -----------------------------------------------------
  delete safe.powerUsedThisTurn;
  delete safe.firstSecretSet;

  // -----------------------------------------------------
// 5. Filter & sanitize HISTORY
// -----------------------------------------------------
safe.history = safe.history
  .map(entry => {
    if (!entry) return null;

    const e = JSON.parse(JSON.stringify(entry));

    // ================================================
    // DURING GAMEPLAY (NOT gameOver)
    // ================================================
    if (!state.gameOver) {

      // Guesser sees masked feedback only
      if (role === state.guesser) {
        delete e.fb;
        if (!Array.isArray(e.fbGuesser) || e.fbGuesser.length !== 5) {
          e.fbGuesser = ["?", "?", "?", "?", "?"];
        }
      }
      if (role === state.setter && e.stealthApplied) {
        e.guess = "?????";
      }
      if (e.blindSpotApplied != null) {
        e.powerUsed = (e.powerUsed || "") + " BlindSpot";
      }
      if (e.revealedOldSecret) {
        e.powerUsed = (e.powerUsed || "") + ` Reveal(${e.revealedOldSecret.toUpperCase()})`;
      }
      // Setter sees real feedback only
      if (role === state.setter) {
        delete e.fbGuesser;
        if (!Array.isArray(e.fb) || e.fb.length !== 5) {
          e.fb = ["?", "?", "?", "?", "?"];
        }
      }

      // Always hide finalSecret during gameplay
      delete e.finalSecret;
    }

    // ================================================
    // AFTER GAME OVER → REVEAL SECRET & TRUE FEEDBACK
    // ================================================
    else {

      // Everyone sees true feedback
      delete e.fbGuesser;

      // KEEP:
      //  e.fb
      //  e.finalSecret
      // do NOT delete finalSecret here
    }

    delete e.ignoreConstraints;
    return e;
  })
  .filter(e => e !== null);



  return safe;
}

module.exports = { buildSafeStateForPlayer };
