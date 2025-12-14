// powers/powers/forceTimerServer.js

const engine = require("../powerEngineServer.js");

engine.registerPower("forceTimer", {
  apply(state, action, roomId, io) {
    if (state.powers.forceTimerUsed) return;

    state.powers.forceTimerUsed = true;
    state.powers.forceTimerActive = true;

    // 30 seconds from now
    const deadline = Date.now() + 30000;
    state.powers.forceTimerDeadline = deadline;

    // Tell clients the timer started
    io.to(roomId).emit("forceTimerStarted", { deadline });

    // ---------------------------------------
    // SERVER TICK LOOP (250ms)
    // ---------------------------------------
    if (state.powers.forceTimerInterval) {
      clearInterval(state.powers.forceTimerInterval);
    }

    state.powers.forceTimerInterval = setInterval(() => {
      const now = Date.now();
      const remaining = deadline - now;

      // Send ticking updates to UI
      io.to(roomId).emit("forceTimerTick", { remaining });

      // Deadline passed → force submit
      if (remaining <= 0) {
        clearInterval(state.powers.forceTimerInterval);
        delete state.powers.forceTimerInterval;

        // Mark expired so normal.js picks up the SET_SECRET_SAME action immediately
        state.powers.forceTimerExpiredFlag = true;

        io.to(roomId).emit("forceTimerExpired");

        // We DO NOT call scoring here — normal.js already handles it cleanly.
      }
    }, 250);

    io.to(roomId).emit("powerUsed", { type: "forceTimer" });
  },

  // Cleanup after decision resolves (normal.js calls finalizeFeedback)
  postScore(state, entry) {
    state.powers.forceTimerActive = false;
    state.powers.forceTimerSetterPhase = false;

    delete state.powers.forceTimerDeadline;
    delete state.powers.forceTimerExpiredFlag;

    if (state.powers.forceTimerInterval) {
      clearInterval(state.powers.forceTimerInterval);
      delete state.powers.forceTimerInterval;
    }
  }
});
