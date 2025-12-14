// /powers/powers/revealHistoryServer.js
const engine = require("../powerEngineServer.js");

engine.registerPower("revealHistory", {
  apply(state, action, roomId, io) {
    if (state.powers.revealHistoryUsed) return;
    if (state.history.length < 2) return; // must have at least 2 completed rounds

    state.powers.revealHistoryUsed = true;

    const entry = state.history[state.history.length - 2];
    const secret = entry.finalSecret;

    // Broadcast popup to both players
    io.to(roomId).emit("revealOldSecret", { secret });

    // Tag next history entry for UI annotation
    state.powers.revealHistoryPending = secret;
  },

  postScore(state, entry) {
    if (state.powers.revealHistoryPending) {
      entry.revealedOldSecret = state.powers.revealHistoryPending;
      state.powers.revealHistoryPending = null;
    }
  }
});
