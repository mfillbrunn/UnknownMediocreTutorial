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
    console.log("[SERVER] ForceTimer apply called");
    console.log("[SERVER] powerUsedThisTurn:", state.powers.forceTimerUsed);
    if (state.powers.forceTimerUsed) return;
    console.log("[SERVER] powerUsedThisTurn:", state.powerUsedThisTurn);

    state.powers.forceTimerUsed = true;
    state.powers.forceTimerArmed = true;
    state.powerUsedThisTurn = true;
    console.log("[SERVER] ForceTimer armed", state.powers);

    io.to(roomId).emit(
      "toast",
      "⏱ Force Timer armed — setter will be timed next turn."
    );
  }
});
