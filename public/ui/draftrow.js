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
    const canGuess =
      (state.phase === "simultaneous" &&
        !state.simultaneousGuessSubmitted) ||
      (state.phase === "normal" &&
        state.turn === state.guesser);
    if (!canGuess){
      renderDraftRow(state.pendingGuess, container, "draft-row guesser-draft");  
    }
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

    if (setterCanEdit) {
      if (state.phase === "simultaneous"){
      renderDraftRow("",container,"draft-row setter-draft");
    }
      if (state.phase === "normal"){
          if (state.setterDraft) {
            renderDraftRow(state.setterDraft.toUpperCase(),container,"draft-row setter-draft");
          } else if (state.secret) {
            renderDraftRow(state.secret.toUpperCase(),container,"draft-row ghost-secret");
          }
        }
      }
    if (!setterCanEdit) {
      renderDraftRow("",container,"draft-row setter-draft"); 
                         return;
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
