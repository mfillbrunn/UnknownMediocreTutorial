window.renderDraftRows = function ({
  state,
  role,
  container,
  localGuesserDraft = ""
}) {
  container.innerHTML = "";
  /* ============================
   * GUESSER
   * ============================ */
  if (role === "guesser") {
    const canGuess =     (state.phase === "simultaneous" &&   !state.simultaneousGuessSubmitted) ||
      (state.phase === "normal" &&   state.turn === state.guesser);
    if (!canGuess) {
    // Submitted → show pending guess (static)
    if (state.pendingGuess) {
      renderDraftRow(        state.pendingGuess.toUpperCase(),        container,        "draft-row pending-guess"      );
    }
    return;
  }
  // Actively typing → show typed letters
  renderDraftRow( localGuesserDraft.toUpperCase(),   container,    "draft-row guesser-draft"  );
  return;
}
  /* ============================
   * SETTER
   * ============================ */
  if (role === "setter") {    
    const setterCanEdit =!state.powers?.freezeActive &&((state.phase === "simultaneous" &&!state.secret && !state.simultaneousSecretSubmitted) ||
        (state.phase === "normal" && state.turn === state.setter && !!state.pendingGuess));
    if (state.pendingGuess) {renderDraftRow(state.pendingGuess.toUpperCase(),container,"draft-row pending-guess"); }
    if (!setterCanEdit) {renderDraftRow(state.secret.toUpperCase(),container,"draft-row ghost-secret"); return;}
    if (setterCanEdit) {
      if (state.phase === "simultaneous"){ 
        if (state.setterDraft) {renderDraftRow(state.setterDraft.toUpperCase(),container,"draft-row setter-draft");} 
          else {renderDraftRow("",container,"draft-row setter-draft");}
      }
      if (state.phase === "normal"){
          if (state.setterDraft) {renderDraftRow(state.setterDraft.toUpperCase(),container,"draft-row setter-draft");} 
          else {renderDraftRow(state.secret.toUpperCase(),container,"draft-row ghost-secret");}
        }
      }
    }
};
function renderDraftRow(word, container, className) {
  const row = document.createElement("div"); 
  if (state.powers?.freezeActive ) {
      row.className = `history-row ${className} freeze-draft`;
    } else{    
    row.className = `history-row ${className}`;
  }
  for (let i = 0; i < 5; i++) { 
    const tile = document.createElement("div"); 
    tile.className = "history-tile draft-tile"; 
    tile.textContent = word[i] || ""; 
    row.appendChild(tile); 
  } 
  container.appendChild(row); 
};
