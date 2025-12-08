function buildSafeStateForPlayer(state, role) {
  // Deep copy
  const safe = JSON.parse(JSON.stringify(state));

  // === 1. Hide secret from guesser ===
  if (role === state.guesser) {
    safe.secret = "";
  }

  // === 2. Hide guess from setter in simultaneous phase ===
  if (role === state.setter && safe.phase === "simultaneous") {
    safe.pendingGuess = "";
  }

  // === 3. Clean power info ===
  safe.powers = safe.powers || {};
  safe.powers.confuseColorsActive = false;  // should not leak active state
  safe.powers.reuseLettersPool = [];        // depends on game design
  safe.powers.revealGreenPos = null;        // hide unless intended

  // === 4. Clean history entries ===
  safe.history = safe.history.map(h => {
    const copy = JSON.parse(JSON.stringify(h));

    // finalSecret must never leak
    delete copy.finalSecret;

    // entry-specific power metadata
    delete copy.ignoreConstraints;
    delete copy.extraInfo;

    // hide setter-only fields if needed
    if (role === state.guesser) {
      // fbGuesser stays (that's the modified feedback they see)
      // fb (true feedback) should NOT be visible to guesser
      delete copy.fb;
    }
    return copy;
  });

  // === 5. Remove internal machine state ===
  delete safe.simultaneousGuessSubmitted;
  delete safe.simultaneousSecretSubmitted;
  delete safe.powerUsedThisTurn;

  return safe;
}

module.exports = { buildSafeStateForPlayer };
