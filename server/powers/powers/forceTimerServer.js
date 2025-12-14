// /powers/powers/forceTimerServer.js
const engine = require("../powerEngineServer.js");

engine.registerPower("forceTimer", {
  apply(state, action, roomId, io) {
    if (state.powers.forceTimerUsed) return;
    state.powers.forceTimerUsed = true;

    // Activate force timer machinery
    state.powers.forceTimerActive = true;
    state.powers.forceTimerDeadline = Date.now() + 30000; // 30 sec

    io.to(roomId).emit("powerUsed", { type: "forceTimer" });
  },

  turnStart(state, role) {
    // Only matters when setter's turn begins during normal phase
    if (!state.powers.forceTimerActive) return;
    if (state.phase !== "normal") return;
    if (role !== state.setter) return;

    // When setter's decision step begins, broadcast countdown
    state.powers.forceTimerSetterPhase = true;
  },

  postScore(state, entry) {
    // When decision concludes (guess scored), timer expires
    if (state.powers.forceTimerActive) {
      state.powers.forceTimerActive = false;
      state.powers.forceTimerSetterPhase = false;
      delete state.powers.forceTimerDeadline;
    }
  }
});
