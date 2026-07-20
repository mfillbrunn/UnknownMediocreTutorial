const engine = require("../powerEngineServer.js");

// Delayed Intel (setter power). One-time use: activated during the
// setter's own decision turn, it marks the round about to be recorded
// (state.history.length at the moment of activation -- the entry
// finalizeFeedback is about to push for the current pendingGuess) as
// delayed. utils/delayedFeedback.js's guesserVisibleHistoryCount() is the
// single source of truth for withholding that one round's feedback until
// the guesser has submitted their next guess.
engine.registerPower("delayedIntel", {
  apply(state, action, roomId, io) {
    if (state.powers.delayedIntelUsed) return false;

    state.powers.delayedIntelUsed = true;
    state.powers.delayedIntelRoundIndex = state.history.length;

    io.to(roomId).emit("toast", "Delayed Intel activated for this round");
    io.to(roomId).emit("powerUsed", { type: "delayedIntel" });
  }
});
