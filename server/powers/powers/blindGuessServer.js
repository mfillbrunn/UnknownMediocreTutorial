const engine = require("../powerEngineServer");

engine.registerPower("blindGuess", {
  apply(state, action, roomId, io) {
    if (state.powers.blindGuessUsed) return;

    state.powers.blindGuessUsed = true;
    state.powers.blindGuessArmed = true;

    io.to(roomId).emit(
      "toast",
      "🟣 Blind Guess armed — the next guess will be blind."
    );
  },

  turnStart(state, role) {
    if (role === state.guesser && state.powers.blindGuessArmed) {
      state.powers.blindGuessArmed = false;
      state.powers.blindGuessActive = true;
    }
  }
});
