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
      // Skip malformed entries entirely
      if (!entry || (!entry.fb && !entry.fbGuesser)) {
        console.warn("Dropping malformed history entry:", entry);
        return null;
      }

      const e = JSON.parse(JSON.stringify(entry));

      // Never reveal final secret
      delete e.finalSecret;

      // Remove internal power metadata
      delete e.confuseApplied;
      delete e.ignoreConstraints;
      delete e.countOnlyApplied;
      delete e.freezeApplied;
      delete e.hideTileApplied;
      delete e.reuseLetters;
      delete e.revealGreen;

      // If GUESSER → hide true fb
      if (role === state.guesser) {
        delete e.fb;

        // Ensure fbGuesser is always valid
        if (!Array.isArray(e.fbGuesser) || e.fbGuesser.length !== 5) {
          console.warn("Repairing missing fbGuesser:", e);
          e.fbGuesser = ["?", "?", "?", "?", "?"];
        }
      }

      return e;
    })
    .filter(e => e !== null);

  return safe;
}

module.exports = { buildSafeStateForPlayer };
