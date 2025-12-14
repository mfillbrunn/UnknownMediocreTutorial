// powers/powers/forceTimerServer.js
const engine = require("../powerEngineServer.js");

// Global map: roomId → interval handle
const FORCE_TIMER_HANDLES = {};

engine.registerPower("forceTimer", {
  apply(state, action, roomId, io) {
    if (state.powers.forceTimerUsed) return;

    state.powers.forceTimerUsed = true;
    state.powers.forceTimerActive = true;

    const deadline = Date.now() + 30000;
    state.powers.forceTimerDeadline = deadline;

    // Notify clients timer began
    io.to(roomId).emit("forceTimerStarted", { deadline });

    // If an old handle exists, clear it
    if (FORCE_TIMER_HANDLES[roomId]) {
      clearInterval(FORCE_TIMER_HANDLES[roomId]);
    }

    // ----------------------------
    // Run countdown externally (NOT inside state)
    // ----------------------------
    FORCE_TIMER_HANDLES[roomId] = setInterval(() => {
      const now = Date.now();
      const remaining = deadline - now;

      io.to(roomId).emit("forceTimerTick", { remaining });

      if (remaining <= 0) {
        clearInterval(FORCE_TIMER_HANDLES[roomId]);
        delete FORCE_TIMER_HANDLES[roomId];

        // mark expired so normal.js executes SET_SECRET_SAME
        state.powers.forceTimerExpiredFlag = true;

        io.to(roomId).emit("forceTimerExpired");
      }
    }, 250);

    io.to(roomId).emit("powerUsed", { type: "forceTimer" });
  },

  postScore(state, entry, roomId) {
    state.powers.forceTimerActive = false;
    state.powers.forceTimerSetterPhase = false;

    delete state.powers.forceTimerDeadline;
    delete state.powers.forceTimerExpiredFlag;

    // Stop the countdown loop if still running
    if (FORCE_TIMER_HANDLES[roomId]) {
      clearInterval(FORCE_TIMER_HANDLES[roomId]);
      delete FORCE_TIMER_HANDLES[roomId];
    }
  }
});
