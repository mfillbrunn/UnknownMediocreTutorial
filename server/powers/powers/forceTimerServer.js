// powers/powers/forceTimerServer.js
const engine = require("../powerEngineServer.js");

// Interval handles stored by roomId
const FORCE_TIMER_HANDLES = {};

engine.registerPower("forceTimer", {
  apply(state, action, roomId, io) {
    if (state.powers.forceTimerUsed) return;

    state.powers.forceTimerUsed = true;
    state.powers.forceTimerActivated = true; // <-- Activation only, no timer yet

    io.to(roomId).emit("powerUsed", { type: "forceTimer" });
  },

  // Timer should start ONLY when setter's turn begins
  turnStart(state, role, roomId, io) {
    const isSetterTurn = role === state.setter;
    const hasPendingGuess = !!state.pendingGuess;

    if (
      state.powers.forceTimerActivated &&
      isSetterTurn &&
      hasPendingGuess &&
      !state.powers.forceTimerActive // prevent double-start
    ) {
      // Activate now
      state.powers.forceTimerActive = true;

      const deadline = Date.now() + 30000;
      state.powers.forceTimerDeadline = deadline;

      io.to(roomId).emit("forceTimerStarted", { deadline });

      // Clear old interval
      if (FORCE_TIMER_HANDLES[roomId]) {
        clearInterval(FORCE_TIMER_HANDLES[roomId]);
      }

      // Begin ticking
      FORCE_TIMER_HANDLES[roomId] = setInterval(() => {
        const now = Date.now();
        const remaining = deadline - now;

        io.to(roomId).emit("forceTimerTick", { remaining });

        if (remaining <= 0) {
          clearInterval(FORCE_TIMER_HANDLES[roomId]);
          delete FORCE_TIMER_HANDLES[roomId];

          state.powers.forceTimerExpiredFlag = true;

          io.to(roomId).emit("forceTimerExpired");
        }
      }, 250);
    }
  },

  postScore(state, entry, roomId) {
    // Cleanup all power state after resolution
    delete state.powers.forceTimerActivated;
    delete state.powers.forceTimerActive;
    delete state.powers.forceTimerDeadline;
    delete state.powers.forceTimerExpiredFlag;

    if (FORCE_TIMER_HANDLES[roomId]) {
      clearInterval(FORCE_TIMER_HANDLES[roomId]);
      delete FORCE_TIMER_HANDLES[roomId];
    }
  }
});
