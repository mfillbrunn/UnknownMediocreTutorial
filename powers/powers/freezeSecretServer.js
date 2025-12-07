// /powers/powers/freezeSecretServer.js
// Server-side logic for Freeze Secret power

const engine = require("../powerEngineServer");

engine.registerPower("freezesecret", {
  apply(state, action, roomId, io) {

    // Cannot use twice
    if (state.powers.freezeSecretUsed) return;

    // Only allowed once setter has set first secret
    if (!state.firstSecretSet) return;

    // Apply effect
    state.powers.freezeSecretUsed = true;
    state.powers.freezeActive = true;

    // Notify clients
    io.to(roomId).emit("powerUsed", { type: "freezeSecret" });
  }
});
