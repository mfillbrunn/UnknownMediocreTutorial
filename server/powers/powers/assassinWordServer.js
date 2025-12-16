const engine = require("../powerEngineServer.js");

engine.registerPower("assassinWord", {
  apply(state, action, roomId, io) {

    // Do NOT block if the previous attempt was invalid
    // Only block if assassinWord was actually SET
    if (state.powers.assassinWordUsed) return;

    if (!action.word) return;

    const w = action.word.toUpperCase();

    // Reject: cannot equal current secret
    if (state.secret && w === state.secret.toUpperCase()) {
      io.to(action.playerId).emit(
        "errorMessage",
        "Assassin word cannot match current secret."
      );
      return; // IMPORTANT: DO NOT mark power used
    }

    // Reject: cannot equal current guess
    if (state.pendingGuess && w === state.pendingGuess.toUpperCase()) {
      io.to(action.playerId).emit(
        "errorMessage",
        "Assassin word cannot match current guess."
      );
      return; // IMPORTANT: DO NOT mark power used
    }

    // VALID → now lock it in
    state.powers.assassinWordUsed = true;
    state.powers.assassinWord = w;

    // Optional: confirm success
    io.to(action.playerId).emit("assassinSet", { word: w });
  }
});

