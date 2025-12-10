// /powers/powers/freezeSecretServer.js
const engine = require("../../powerEngineServer.js");

engine.registerPower("freezesecret", {
  apply(state, action, roomId, io) {
    if (state.powers.freezeSecretUsed) return;
    if (!state.firstSecretSet) return;

    state.powers.freezeSecretUsed = true;
    state.powers.freezeActive = true;

    io.to(roomId).emit("powerUsed", { type: "freezeSecret" });
  },

  // NEW: block actions here
  beforeSetterSecretChange(state, action) {
    if (state.powers.freezeActive) return true;
    return false;
  },

  postScore(state, entry) {
    if (state.powers.freezeActive) {
      entry.freezeApplied = true;
    }
  },

  turnStart(state, role) {
    if (state.phase === "normal" && role === state.guesser) {
      state.powers.freezeActive = false;
    }
  }
});
