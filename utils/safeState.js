// server side safeState.js

function buildSafeStateForPlayer(state, role) {
  const safe = JSON.parse(JSON.stringify(state));

  // -----------------------------------------------------
  // 1. Hide SECRET from guesser
  // -----------------------------------------------------
  if (role === safe.guesser) {
    safe.secret = "";
  }

  // -----------------------------------------------------
  // 2. Hide GUESS from setter during simultaneous phase
  // -----------------------------------------------------
  if (role === safe.setter && safe.phase === "simultaneous") {
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
  // 5. Filter HISTORY by role
  // -----------------------------------------------------
  safe.history = safe.history.map(entry => {
    const e = JSON.parse(JSON.stringify(entry));

    // NEVER reveal finalSecret to guesser (leaks secret)
    delete e.finalSecret;

    // Remove power metadata that gives away decisions
    delete e.confuseApplied;
    delete e.ignoreConstraints;
    delete e.countOnlyApplied;
    delete e.freezeApplied;
    delete e.hideTileApplied;

    // Reuse letters – setter already knows; guesser should also see?
    // Up to you — but safest is to send only what was sent via powerUsed.
    delete e.reuseLetters;

    // Reveal green – guesser sees via powerUsed event, not here
    delete e.revealGreen;

    // If player is GUESSER → hide true feedback
    if (role === safe.guesser) {
      delete e.fb;              // setter-only info
      // e.fbGuesser is already the modified/obfuscated version
    }

    return e;
  });

  return safe;
}

module.exports = { buildSafeStateForPlayer };
