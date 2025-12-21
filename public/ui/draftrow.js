/**
 * Draft row resolution
 * -------------------
 * Decides which "input-like" rows should be rendered
 * WITHOUT mutating state or touching the DOM.
 *
 * Output is declarative and consumed by renderHistory().
 */

window.getDraftRows = function ({
  state,
  role,
  localGuesserDraft = ""
}) {
  const rows = [];

  /* ============================
   * GUESSER
   * ============================ */
  if (role === "guesser") {
    // Once submitted, guess is no longer a draft
    if (state.pendingGuess) {
      return rows; // no draft row
    }

    // Always show empty tiles when guessing is allowed
    const canGuess =
      (state.phase === "simultaneous" &&
        !state.simultaneousGuessSubmitted) ||
      (state.phase === "normal" &&
        state.turn === state.guesser);

    if (canGuess) {
      rows.push({
        type: "guesser-draft",
        word: "" // always empty tiles
      });
    }

    return rows;
  }

  /* ============================
   * SETTER
   * ============================ */
  if (role === "setter") {
    const setterCanEdit =
      !state.powers?.freezeActive &&
      (
        // Simultaneous: setter has not submitted yet
        (state.phase === "simultaneous" &&
          !state.secret &&
          !state.simultaneousSecretSubmitted) ||

        // Normal: setter responding to a guess
        (state.phase === "normal" &&
          state.turn === state.setter &&
          !!state.pendingGuess)
      );

    if (!setterCanEdit) {
      return rows;
    }

    // --- SIMULTANEOUS PHASE ---
    if (state.phase === "simultaneous") {
      rows.push({
        type: "setter-draft",
        word: "" // empty tiles
      });
      return rows;
    }

    // --- NORMAL PHASE ---
    if (state.setterDraft) {
      // Actively typing → real draft
      rows.push({
        type: "setter-draft",
        word: state.setterDraft
      });
    } else if (state.secret) {
      // Default: ghost current secret
      rows.push({
        type: "ghost-secret",
        word: state.secret
      });
    }

    return rows;
  }

  return rows;
};
