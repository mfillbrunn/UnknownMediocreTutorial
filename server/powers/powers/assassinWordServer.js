const engine = require("../powerEngineServer.js");

engine.registerPower("assassinWord", {
  apply(state, action, roomId, io) {
    if (state.powers.assassinWordUsed) return;
    if (!action.word) return;

    const w = action.word.toUpperCase();

    // 1) Cannot be current secret
    if (state.secret && w === state.secret.toUpperCase()) {
      io.to(action.playerId).emit(
        "errorMessage",
        "Assassin word cannot be the current secret."
      );
      return;
    }

    // 2) Cannot be current pending guess
    if (state.pendingGuess && w === state.pendingGuess.toUpperCase()) {
      io.to(action.playerId).emit(
        "errorMessage",
        "Assassin word cannot be the current guess."
      );
      return;
    }

    // All good: lock in assassin word
    state.powers.assassinWordUsed = true;
    state.powers.assassinWord = w;

    // Optional: confirm to setter that assassin word is set
    io.to(action.playerId).emit("assassinSet", { word: w });
  }
});
