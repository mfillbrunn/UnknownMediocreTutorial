window.renderDraftRows = function ({
  state,
  role,
  container
}) {
  container.innerHTML = "";

  /* ============================
   * GUESSER
   * ============================ */
  if (role === "guesser") {
    // No draft once submitted
    if (state.pendingGuess) return;

    const canGuess =
      (state.phase === "simultaneous" &&
        !state.simultaneousGuessSubmitted) ||
      (state.phase === "normal" &&
        state.turn === state.guesser);

    if (canGuess) {
      renderDraftRow("", container, "draft-row guesser-draft");
    }

    return;
  }

  /* ============================
   * SETTER
   * ============================ */
  if (role === "setter") {
    const setterCanEdit =
      !state.powers?.freezeActive &&
      (
        (state.phase === "simultaneous" &&
          !state.secret &&
          !state.simultaneousSecretSubmitted) ||
        (state.phase === "normal" &&
          state.turn === state.setter &&
          !!state.pendingGuess)
      );

    // Pending guess is NOT draft → render separately if you want
    if (state.pendingGuess) {
      renderDraftRow(
        state.pendingGuess.toUpperCase(),
        container,
        "draft-row pending-guess"
      );
    }

    if (!setterCanEdit) return;

    // Simultaneous: empty tiles
    if (state.phase === "simultaneous") {
      renderDraftRow("", container, "draft-row setter-draft");
      return;
    }

    // Normal: ghost or real draft
    if (state.setterDraft) {
      renderDraftRow(
        state.setterDraft.toUpperCase(),
        container,
        "draft-row setter-draft"
      );
    } else if (state.secret) {
      renderDraftRow(
        state.secret.toUpperCase(),
        container,
        "draft-row ghost-secret"
      );
    }
  }
};
function renderDraftRow(word, container, className) {
  const row = document.createElement("div"); 
  row.className = `history-row ${className}`;
  for (let i = 0; i < 5; i++) { 
    const tile = document.createElement("div"); 
    tile.className = "history-tile draft-tile"; 
    tile.textContent = word[i] || ""; 
    row.appendChild(tile); 
  } 
  container.appendChild(row); 
};
