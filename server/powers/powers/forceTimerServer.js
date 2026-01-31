const engine = require("../powerEngineServer.js");

/**
 * Force Timer
 * - Armed by guesser
 * - Timer starts when setter turn begins
 * - On expiry, server automatically keeps old secret
 */
engine.registerPower("forceTimer", {
  apply(state, action, roomId, io) {
    // One-time use
    if (state.powers.forceTimerUsed) return false;

    state.powers.forceTimerUsed = true;
    state.powers.forceTimerArmed = true;
    state.powers.forceTimerActive = true;

    io.to(roomId).emit("toast","⏱ Force Timer armed — setter will be timed next turn." );
    io.to(roomId).emit("powerUsed", { type: "forceTimer" });
  }
});
