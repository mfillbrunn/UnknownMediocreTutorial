// /powers/powers/hideTileServer.js
// Server-side logic for Hide Tile power (setter ability)
const engine = require("../powerEngineServer.js");

engine.registerPower("hidetile", {
  apply(state, action, roomId, io) {
    const maxTiles = 2;

    if (state.powers.hideTileUsed && state.powers.hideTilePendingCount === 0) return;

    state.powers.hideTileUsed = true;
    state.powers.hideTilePendingCount = Math.min(
      maxTiles,
      state.powers.hideTilePendingCount + 1
    );

    io.to(roomId).emit("powerUsed", { type: "hideTile" });
  },

  preScore(state) {
    if (state.powers.hideTilePendingCount > 0) {
      const count = state.powers.hideTilePendingCount;
      state.powers.hideTilePendingCount = 0;

      const hidden = new Set();
      while (hidden.size < count) {
        hidden.add(Math.floor(Math.random() * 5));
      }
      state.powers.currentHiddenIndices = Array.from(hidden);
    }
  },

  postScore(state, entry) {
  entry.hiddenIndices = state.powers.currentHiddenIndices || null;
  if (entry.hiddenIndices) entry.hideTileApplied = true;
  state.powers.currentHiddenIndices = null;
}

});
