const engine = require("../powerEngineServer.js");

engine.registerPower("assassinWord", {
  apply(state, action, roomId, io) {
    if (state.powers.assassinWordUsed) return;
    if (!action.word) return;

    const w = action.word.toUpperCase();

    // Reject: cannot equal current secret
    if (state.secret && w === state.secret.toUpperCase()) {
      io.to(action.playerId).emit(
        "errorMessage",
        "Assassin word cannot be the current secret."
      );
      return;
    }

    // Reject: cannot equal current guess
    if (state.pendingGuess && w === state.pendingGuess.toUpperCase()) {
      io.to(action.playerId).emit(
        "errorMessage",
        "Assassin word cannot be the current guess."
      );
      return;
    }

    // VALID: lock in assassin word
    state.powers.assassinWordUsed = true;
    state.powers.assassinWord = w;
  }
});
