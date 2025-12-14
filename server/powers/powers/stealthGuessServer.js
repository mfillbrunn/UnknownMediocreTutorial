// /powers/powers/stealthGuessServer.js
const engine = require("../powerEngineServer.js");

engine.registerPower("stealthGuess", {
  apply(state, action, roomId, io) {
    if (state.powers.stealthGuessUsed) return;

    state.powers.stealthGuessUsed = true;
    state.powers.stealthGuessActive = true;

    io.to(roomId).emit("powerUsed", { type: "stealthGuess" });
  },

  postScore(state, entry) {
    if (state.powers.stealthGuessActive) {
      entry.stealthApplied = true;
      state.powers.stealthGuessActive = false; // only for one round
    }
  }
});
