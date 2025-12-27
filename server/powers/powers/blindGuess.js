const engine = require("../powerEngineServer");

engine.registerPower("blindGuess", {
  apply(state, action, roomId, io) {
    // No stacking
    if (state.powers.blindGuessArmed || state.powers.blindGuessActive) return;

    state.powers.blindGuessArmed = true;

    io.to(roomId).emit(
      "toast",
      "🟣 Blind Guess armed — the next guess will be blind."
    );
  },

  turnStart(state, role) {
    // Activate only when guesser turn begins
    if (role === state.guesser && state.powers.blindGuessArmed) {
      state.powers.blindGuessArmed = false;
      state.powers.blindGuessActive = true;
    }
  }
});
