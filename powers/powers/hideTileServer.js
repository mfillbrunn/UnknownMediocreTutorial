// /powers/powers/hideTileServer.js
// Server-side logic for Hide Tile power (setter ability)

const engine = require("../powerEngineServer");

engine.registerPower("hidetile", {
  apply(state, action, roomId, io) {
    // Allow at most 2 hidden tiles total
    if (state.powers.hideTileUsed && state.powers.hideTilePendingCount === 0) return;

    // Mark used at least once
    state.powers.hideTileUsed = true;

    // Each use hides +1 tile, max 2
    state.powers.hideTilePendingCount = Math.min(
      2,
      state.powers.hideTilePendingCount + 1
    );

    // Notify clients
    io.to(roomId).emit("powerUsed", { type: "hideTile" });
  }
});
