const engine = require("../powerEngineServer.js");

const FORCE_TIMER_MS = 30_000; // 30 seconds

engine.registerPower("forceTimer", {
  apply(state, action, roomId, io) {
    if (state.powers.forceTimerUsed) return;
    if (state.powerUsedThisTurn) return;

    state.powers.forceTimerUsed = true;
    state.powerUsedThisTurn = true;
    io.to(roomId).emit("toast", "⏱ Force Timer armed — setter will be timed next turn.");
    const deadline = Date.now() + FORCE_TIMER_MS;

    state.powers.forceTimerActive = true;
    state.powers.forceTimerDeadline = deadline;

    io.to(roomId).emit("forceTimerStarted", {
      deadline
    });

    // Schedule expiry
    setTimeout(() => {
      // Guard: match may have progressed
      if (!state.powers.forceTimerActive) return;

      state.powers.forceTimerActive = false;
      state.powers.forceTimerDeadline = null;

      // Enforce rule: old secret is kept
      state.secret = state.secret; // explicit, for clarity
      state.secretLocked = true;   // optional flag if you have one

      io.to(roomId).emit("forceTimerExpired");
    }, FORCE_TIMER_MS);
  }
});
