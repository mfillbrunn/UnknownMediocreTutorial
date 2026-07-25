// /powers/powers/hideTileServer.js
// Server-side logic for Hide Tile power (setter ability)
//
// The setter chooses exactly which tile of the pending guess loses its
// feedback (by tapping it client-side — see
// public/powerEngine/powers/hideTile.js), instead of the server picking
// one at random. Mirrors Vowel Refresh's mechanism exactly: the feedback
// for that position is genuinely ERASED (entry.fb / entry.fbGuesser set to
// "") rather than masked behind a "?" placeholder for one side only —
// neither the setter nor the guesser gets to see or rely on it, and
// isConsistentWithHistory already treats "" as "no constraint here" (see
// its normalizeFB comment), so it's really gone, not just hidden.
const engine = require("../powerEngineServer.js");

engine.registerPower("hideTile", {
  apply(state, action, roomId, io) {
    // One-time use per match.
    if (state.powers.hideTileUsed) return false;
    if (!state.pendingGuess) return false;

    const index = Number(action.index);
    if (!Number.isInteger(index) || index < 0 || index > 4) return false;

    state.powers.hideTileUsed = true;
    state.powers.hideTileActive = true;
    state.powers.hideTilePendingIndex = index;

    io.to(roomId).emit("powerUsed", { type: "hideTile" });
  },

  postScore(state, entry) {
    if (typeof state.powers.hideTilePendingIndex !== "number") return;

    const idx = state.powers.hideTilePendingIndex;
    state.powers.hideTilePendingIndex = null;

    if (Array.isArray(entry.fb)) entry.fb[idx] = "";
    if (Array.isArray(entry.fbGuesser)) entry.fbGuesser[idx] = "";
  }
});
