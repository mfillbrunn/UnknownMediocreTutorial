const engine = require("../powerEngineServer");

engine.registerPower("freezeSecret", {
  apply(state, action, roomId, io) {
    if (state.powers.freezeSecretUsed) return;
    if (!state.firstSecretSet) return;

    state.powers.freezeSecretUsed = true;
    state.powers.freezeActive = true;

    io.to(roomId).emit("powerUsed", { type: "freezeSecret" });
  }
});
