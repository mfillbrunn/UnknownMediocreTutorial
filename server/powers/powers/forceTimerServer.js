const engine = require("../powerEngineServer.js");

/**
 * Force Timer
 * - Armed by setter
 * - Timer starts when guesser turn begins
 * - On expiry, server automatically resubmits the guesser's last guess
 */
engine.registerPower("forceTimer", {
  apply(state, action, roomId, io) {
    // One-time use
    if (state.powers.forceTimerUsed) return false;

    state.powers.forceTimerUsed = true;
    state.powers.forceTimerArmed = true;
    state.powers.forceTimerActive = true;

    io.to(roomId).emit("toast","⏱ Force Timer armed — guesser will be timed next turn." );
    io.to(roomId).emit("powerUsed", { type: "forceTimer" });
  }
});
