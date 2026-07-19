const engine = require("../powerEngineServer");

engine.registerPower("blindGuess", {
  apply(state, action, roomId, io) {
    if (state.powers.blindGuessUsed) return false;

    state.powers.blindGuessUsed = true;
    state.powers.blindGuessArmed = true;

    io.to(roomId).emit(
      "toast",
      "🟣 Blind Guess armed — the next guess will be blind."
    );
    io.to(roomId).emit("powerUsed", { type: "blindGuess" });
  },

  turnStart(state, role) {
    if (role === state.guesser && state.powers.blindGuessArmed) {
      state.powers.blindGuessArmed = false;
      state.powers.blindGuessActive = true;
    }
  },

  postScore(state, entry) {
    // Nothing ever turned blindGuessActive back off — once armed and
    // triggered it stayed set for the rest of the match, hiding the
    // client's ENTIRE history/keyboard forever instead of just for the
    // one guess the power's own description promises ("for the next
    // guess"). Tag the entry it covered and reset it here, the same
    // one-shot pattern stealthGuess/hideTile already use.
    if (state.powers.blindGuessActive) {
      entry.blindGuessApplied = true;
      state.powers.blindGuessActive = false;
    }
  }
});
