function getDraftRowsForRole({ state, role, localGuesserDraft }) {
  const rows = [];

  // =========================
  // GUESSER
  // =========================
  if (role === "guesser") {
    const canGuess =
      (state.phase === "simultaneous" && !state.simultaneousGuessSubmitted) ||
      (state.phase === "normal" &&
        state.turn === state.guesser &&
        !state.pendingGuess);

    // Pending guess (normal phase only)
    if (state.phase === "normal" && state.pendingGuess) {
      rows.push({
        type: "pending-guess",
        word: state.pendingGuess
      });
      return rows;
    }

    // Draft (real or empty)
    if (canGuess) {
      rows.push({
        type: "draft",
        word: localGuesserDraft ?? ""
      });
    }

    return rows;
  }

  // =========================
  // SETTER
  // =========================
  if (role === "setter") {
    const setterCanEdit =
      !state.powers?.freezeActive &&
      (
        // Normal phase
        (state.phase === "normal" &&
          state.turn === state.setter &&
          !!state.pendingGuess) ||

        // Simultaneous phase
        (state.phase === "simultaneous" &&
          !state.secret &&
          !state.simultaneousSecretSubmitted)
      );

    // 1. Pending guess from guesser
    if (state.pendingGuess) {
      rows.push({
        type: "pending-guess",
        word: state.pendingGuess
      });
    }

    // 2. Secret input row
    if (setterCanEdit) {
      if (state.setterDraft) {
        rows.push({
          type: "setter-draft",
          word: state.setterDraft
        });
      } else if (state.secret) {
        rows.push({
          type: "ghost-secret",
          word: state.secret
        });
      } else {
        rows.push({
          type: "setter-draft",
          word: ""
        });
      }
    }

    return rows;
  }

  return rows;
}
