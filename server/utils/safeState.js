function buildSafeStateForPlayer(state, role) {
  const safe = JSON.parse(JSON.stringify(state));

  // Preserve externally-visible values explicitly
  safe.activePowers = state.activePowers;
  safe.powerCount = state.powerCount;

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
  // STEALTH GUESS: hide the current pending guess ONLY DURING decision step
  if (role === state.setter && state.powers.stealthGuessActive) {
    if (state.pendingGuess) {
      safe.pendingGuess = "?????";   // placeholder
    }
  }

  // -----------------------------------------------------
  // 3. Clean INTERNAL power state (never exposed)
  // -----------------------------------------------------

  // DO NOT delete freezeActive — client needs this!
  delete safe.powers.confuseColorsActive;
  delete safe.powers.countOnlyActive;
  delete safe.powers.currentHiddenIndices;
  delete safe.powers.hideTilePendingCount;

  if (role === state.guesser) {
    delete safe.powers.assassinWord;
  }

  // -----------------------------------------------------
  // 4. Clean internal machine flags
  // -----------------------------------------------------
  delete safe.powerUsedThisTurn;

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

        // --------------------------------------------------
        // GUESSER VIEW — masked feedback logic
        // --------------------------------------------------
        if (role === state.guesser) {
          delete e.fb;

          // Ensure fbGuesser exists
          if (!Array.isArray(e.fbGuesser) || e.fbGuesser.length !== 5) {
            e.fbGuesser = ["?", "?", "?", "?", "?"];
          } else {
            // APPLY VOWEL REFRESH MASK FOR CONSTRAINTS ONLY
            const eff = state.powers?.vowelRefreshEffect;

            if (eff && e.roundIndex === eff.guessIndex) {
              e.fbGuesser = e.fbGuesser.map((tile, pos) =>
                eff.indices.includes(pos) ? "?" : tile
              );
            }
          }
        }

        // --------------------------------------------------
        // STEALTH GUESS masking
        // --------------------------------------------------
        if (
          role === state.setter &&
          state.powers.stealthGuessActive &&
          e.stealthApplied
        ) {
          e.guess = "?????";
          if (Array.isArray(e.fb)) {
            e.fb = ["?", "?", "?", "?", "?"];
          }
        }

        // --------------------------------------------------
        // Tag applied powers
        // --------------------------------------------------
        if (e.blindSpotApplied != null) {
          e.powerUsed = (e.powerUsed || "") + " BlindSpot";
        }
        if (e.revealedOldSecret) {
          e.powerUsed =
            (e.powerUsed || "") +
            ` Reveal(${e.revealedOldSecret.toUpperCase()})`;
        }

        // --------------------------------------------------
        // SETTER VIEW — always sees true feedback
        // --------------------------------------------------
        if (role === state.setter) {
          if (!Array.isArray(e.fb) || e.fb.length !== 5) {
            if (Array.isArray(e.fbGuesser)) {
              e.fb = e.fbGuesser;
            } else {
              e.fb = ["?", "?", "?", "?", "?"];
            }
          }
        }

        // Hide finalSecret until after gameOver
        delete e.finalSecret;
      }

      // ================================================
      // AFTER GAME OVER → true reveal
      // ================================================
      else {
        // Everyone sees true fb now; fbGuesser no longer needed
        delete e.fbGuesser;

        // keep fb, guess, finalSecret
      }

      delete e.ignoreConstraints;

      return e;
    })
    .filter(e => e !== null);

  return safe;
}

module.exports = { buildSafeStateForPlayer };
