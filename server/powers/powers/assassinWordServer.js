engine.registerPower("assassinWord", {
  apply(state, action, roomId, io) {

    if (!state.activePowers?.includes("assassinWord")) return;
    if (state.powers.assassinWordUsed) return;
    if (!action.word) return;

    const w = action.word.toUpperCase();

    // --- Validation ---
    if (w.length !== 5) {
      io.to(action.playerId).emit("errorMessage", "5 letters!");
      return;
    }

    if (!/^[A-Z]{5}$/.test(w)) {
      io.to(action.playerId).emit(
        "errorMessage",
        "Assassin word must be exactly 5 letters."
      );
      return;
    }

    if (!ALLOWED_WORDS.has(w)) {
      io.to(action.playerId).emit(
        "errorMessage",
        "Assassin word must be a valid dictionary word."
      );
      return;
    }

    if (state.secret && w === state.secret.toUpperCase()) {
      io.to(action.playerId).emit(
        "errorMessage",
        "Assassin word cannot match current secret."
      );
      return;
    }

    if (state.pendingGuess && w === state.pendingGuess.toUpperCase()) {
      io.to(action.playerId).emit(
        "errorMessage",
        "Assassin word cannot match current guess."
      );
      return;
    }

    // --- VALID → commit ---
    state.powers.assassinWordUsed = true;
    state.powers.assassinWord = w;
    state.powerUsedThisTurn = true;

    // Setter-only confirmation
    io.to(action.playerId).emit("assassinSet", { word: w });

    // Room-level generic signal (NO WORD)
    io.to(roomId).emit("assassinUsed");
  }
});
