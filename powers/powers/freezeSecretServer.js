// /powers/powers/freezeSecretServer.js
const engine = require("../powerEngineServer");

engine.registerPower("freezesecret", {
  apply(state, action, roomId, io) {
    if (state.powers.freezeSecretUsed) return;
    if (!state.firstSecretSet) return;

    state.powers.freezeSecretUsed = true;
    state.powers.freezeActive = true;

    io.to(roomId).emit("powerUsed", { type: "freezeSecret" });
  },

  // Setter cannot change secret while freeze is active
  postScore(state, entry) {
    if (state.powers.freezeActive) {
      entry.freezeApplied = true;
    }
  },

  // Freeze ends when the setter finishes their decision turn
  turnStart(state, role) {
    if (state.phase === "normal" && role === state.guesser) {
      state.powers.freezeActive = false;
    }
  }
});
