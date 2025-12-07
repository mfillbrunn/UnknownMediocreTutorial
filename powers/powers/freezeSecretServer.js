//FREEZE 

const engine = require("../powerEngineServer");

engine.registerPower("freezesecret", {
  apply(state, action, roomId, io) {
    if (state.powers.freezeSecretUsed) return;
    if (!state.firstSecretSet) return;

    state.powers.freezeSecretUsed = true;
    state.powers.freezeActive = true;

    io.to(roomId).emit("powerUsed", { type: "freezeSecret" });
  },

  turnStart(state, role) {
    // When setter's decision turn ends, freeze ends.
    if (state.phase === "normal" && role === state.guesser) {
      state.powers.freezeActive = false;
    }
  }
});
