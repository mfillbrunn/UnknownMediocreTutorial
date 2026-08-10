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
      (type === "GREEN" || type === "YELLOW") &&
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
        (type === "GREEN" || type === "YELLOW") &&
        targets.has(constraintLetter)
      );
    });

    result.removedConstraints = before - state.extraConstraints.length;
  }

  return result;
}

module.exports = {
  hasLetterKnowledge,
  eraseLetterKnowledge
};
