// /powers/powers/forceTimerServer.js
const engine = require("../powerEngineServer.js");

engine.registerPower("forceTimer", {
  apply(state, action, roomId, io) {
    if (state.powers.forceTimerUsed) return;
    state.powers.forceTimerUsed = true;

    // Power active — wait for setter turn
    state.powers.forceTimerActive = true;

    io.to(roomId).emit("powerUsed", { type: "forceTimer" });
  },

  turnStart(state, role) {
    // When setter's turn starts in a normal turn
    if (state.powers.forceTimerActive &&
        state.phase === "normal" &&
        role === state.setter &&
        state.pendingGuess) {

      // Activate countdown
      state.powers.forceTimerSetterPhase = true;
      state.powers.forceTimerDeadline = Date.now() + 30000;
    }
  },

  postScore(state, entry) {
    // Timer ends after decision resolves
    if (state.powers.forceTimerActive) {
      state.powers.forceTimerActive = false;
      state.powers.forceTimerSetterPhase = false;
      delete state.powers.forceTimerDeadline;
    }
  }
});
