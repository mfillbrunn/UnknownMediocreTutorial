function normalizeLetterSet(letters) {
  const source =
    letters instanceof Set
      ? [...letters]
      : Array.isArray(letters)
        ? letters
        : [letters];

  return new Set(
    source
      .map(value => String(value || "").trim().toUpperCase())
      .filter(value => /^[A-Z]$/.test(value))
  );
}

function hasLetterKnowledge(state, letter) {
  const targets = normalizeLetterSet(letter);
  if (!targets.size) return false;
  for (const entry of state?.history || []) {
    const guess = String(entry?.guess || "").toUpperCase();
    for (let index = 0; index < guess.length; index++) {
      if (!targets.has(guess[index])) continue;
      if (
        (Array.isArray(entry.fb) && entry.fb[index]) ||
        (Array.isArray(entry.fbGuesser) && entry.fbGuesser[index])
      ) {
        return true;
      }
    }
  }
  return (state?.extraConstraints || []).some(constraint => {
    const type = String(constraint?.type || "").toUpperCase();
    const constraintLetter = String(constraint?.letter || "").toUpperCase();
    return (
      ["GREEN", "YELLOW", "ABSENT", "YELLOW_NOT_AT", "LETTER_COUNT"].includes(type) &&
      targets.has(constraintLetter)
    );
  });
}

function eraseLetterKnowledge(state, letters) {
  const targets = normalizeLetterSet(letters);

  const result = {
    letters: [...targets],
    erasedFeedback: 0,
    removedConstraints: 0
  };

  if (!state || !targets.size) return result;

  /*
   * Power Choice's locked-out / ruled-out letters are just another kind of
   * knowledge about a letter, so any power that wipes a letter's feedback
   * has to lift its block too -- otherwise a "reset" left the Inspector
   * still barred from typing a letter nobody knows anything about anymore.
   * Done here rather than at each reset power's call site so every path
   * through this helper (Vowel Refresh, Hide Evidence, the Spy's charge
   * reset, and the Power Choice reward resets) picks it up automatically.
   */
  const pc = state.powerChoice;
  if (pc) {
    if (Array.isArray(pc.eliminatedLetters)) {
      pc.eliminatedLetters = pc.eliminatedLetters.filter(
        letter => !targets.has(letter)
      );
    }
    if (Array.isArray(pc.ruledOutLetters)) {
      pc.ruledOutLetters = pc.ruledOutLetters.filter(
        letter => !targets.has(letter)
      );
    }
  }

  for (const entry of state.history || []) {
    const guess = String(entry?.guess || "").toUpperCase();
    const erasedIndices = new Set();

    for (let index = 0; index < guess.length; index++) {
      if (!targets.has(guess[index])) continue;

      let erased = false;

      if (Array.isArray(entry.fb) && entry.fb[index]) {
        entry.fb[index] = "";
        erased = true;
      }

      if (Array.isArray(entry.fbGuesser) && entry.fbGuesser[index]) {
        entry.fbGuesser[index] = "";
        erased = true;
      }

      if (erased) {
        erasedIndices.add(index);
        result.erasedFeedback++;
      }
    }

    /*
     * Older Vowel Refresh states tagged reset positions separately.
     * Remove those tags for positions now using the shared erased-tile
     * presentation, so reconnecting clients do not revive the old icon.
     */
    if (Array.isArray(entry.vowelRefreshCleared)) {
      entry.vowelRefreshCleared = entry.vowelRefreshCleared.filter(
        index => !erasedIndices.has(index)
      );

      if (!entry.vowelRefreshCleared.length) {
        delete entry.vowelRefreshCleared;
      }
    }
  }

  if (Array.isArray(state.extraConstraints)) {
    const before = state.extraConstraints.length;

    state.extraConstraints = state.extraConstraints.filter(constraint => {
      const type = String(constraint?.type || "").toUpperCase();
      const constraintLetter = String(constraint?.letter || "").toUpperCase();

      return !(
        (type === "GREEN" || type === "YELLOW" || type === "ABSENT") &&
        targets.has(constraintLetter)
      );
    });

    result.removedConstraints = before - state.extraConstraints.length;
  }

  // POWER CHOICE REWARD TIERS V1: RESET CLEANUP START
  if (Array.isArray(state.extraConstraints)) {
    const before = state.extraConstraints.length;
    state.extraConstraints = state.extraConstraints.filter(constraint => {
      const type = String(constraint?.type || "").toUpperCase();
      const constraintLetter = String(constraint?.letter || "").toUpperCase();
      return !(
        ["ABSENT", "YELLOW_NOT_AT", "LETTER_COUNT"].includes(type) &&
        targets.has(constraintLetter)
      );
    });
    result.removedConstraints += before - state.extraConstraints.length;
  }
  if (state.powerChoice) {
    for (const field of ["eliminatedLetters", "ruledOutLetters"]) {
      if (Array.isArray(state.powerChoice[field])) {
        state.powerChoice[field] = state.powerChoice[field].filter(
          value => !targets.has(String(value || "").toUpperCase())
        );
      }
    }
    if (Array.isArray(state.powerChoice.inspectorIntel)) {
      state.powerChoice.inspectorIntel = state.powerChoice.inspectorIntel.filter(item => {
        const itemLetters = new Set(
          (item?.letters || []).map(value => String(value || "").toUpperCase())
        );
        return ![...targets].some(target => itemLetters.has(target));
      });
    }
  }
  // POWER CHOICE REWARD TIERS V1: RESET CLEANUP END
  return result;
}

module.exports = {
  hasLetterKnowledge,
  eraseLetterKnowledge
};
