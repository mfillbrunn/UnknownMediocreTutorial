window.renderDraftRows = function ({
  state,
  role,
  container,
  localGuesserDraft = ""
}) {
  if (!container) return;

  // ----------------------------
  // Build draft row ONCE
  // ----------------------------
  if (!container.__draftRow) {
    const row = document.createElement("div");
    row.className = "history-row draft-row";
    row.__tiles = [];

    for (let i = 0; i < 5; i++) {
      const tile = document.createElement("div");
      tile.className = "history-tile draft-tile";
      row.__tiles.push(tile);
      row.appendChild(tile);
    }

    container.innerHTML = "";
    container.appendChild(row);
    container.__draftRow = row;
  }

  const row = container.__draftRow;

  // ----------------------------
  // Cache values (ROLE-AWARE)
  // ----------------------------
  const upperGuesserDraft = localGuesserDraft.toUpperCase();
  const upperSetterDraft = (state.setterDraft || "").toUpperCase();
  const upperPending = state.pendingGuess?.toUpperCase() || "";
  const upperSecret = state.secret?.toUpperCase() || "";

  // ----------------------------
  // Skip no-op renders
  // ----------------------------
  if (
    container.__lastPending === upperPending &&
    container.__lastSecret === upperSecret &&
    container.__lastRole === role &&
    container.__lastPhase === state.phase &&
    (
      role === "guesser"
        ? container.__lastGuesserDraft === upperGuesserDraft
        : container.__lastSetterDraft === upperSetterDraft
    )
  ) {
    return;
  }

  container.__lastGuesserDraft = upperGuesserDraft;
  container.__lastSetterDraft = upperSetterDraft;
  container.__lastPending = upperPending;
  container.__lastSecret = upperSecret;
  container.__lastRole = role;
  container.__lastPhase = state.phase;

  // ----------------------------
  // GUESSER
  // ----------------------------
  if (role === "guesser") {
    const canGuess =
      (state.phase === "simultaneous" && !state.simultaneousGuessSubmitted) ||
      (state.phase === "normal" && state.turn === state.guesser);

    if (!canGuess) {
      if (upperPending) {
        updateDraftRow(row, upperPending, "draft-row pending-guess", state);
      }
      return;
    }

    updateDraftRow(row, upperGuesserDraft, "draft-row guesser-draft", state);
    return;
  }

  // ----------------------------
  // SETTER
  // ----------------------------
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

  if (upperPending) {
    updateDraftRow(row, upperPending, "draft-row pending-guess", state);
  }

  if (!setterCanEdit) {
    updateDraftRow(row, upperSecret, "draft-row ghost-secret", state);
    return;
  }

  if (state.phase === "simultaneous") {
    updateDraftRow(row, upperSetterDraft || "", "draft-row setter-draft", state);
    return;
  }

  if (state.phase === "normal") {
    updateDraftRow(
      row,
      upperSetterDraft || upperSecret,
      upperSetterDraft
        ? "draft-row setter-draft"
        : "draft-row ghost-secret",
      state
    );
  }
};

function updateDraftRow(row, word, className, state) {
  const frozen =
    state.turn === state.setter &&
    state.powers?.freezeActive;

  row.className = frozen
    ? "history-row draft-row freeze-draft"
    : `history-row ${className}`;

  for (let i = 0; i < 5; i++) {
    row.__tiles[i].textContent = word[i] || "";
  }
}

function renderDraftRow(word, container, className) {
  const row = document.createElement("div"); 
  if (state.turn === state.setter && state.powers?.freezeActive ) {
      row.className = `history-row draft-row freeze-draft`;
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


