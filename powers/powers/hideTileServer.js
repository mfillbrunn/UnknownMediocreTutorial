const engine = require("../powerEngineServer");

engine.registerPower("hideTile", {
  apply(state, action, roomId, io) {
    // Max 2 tiles hidden; limit controlled by hideTilePendingCount
    if (state.powers.hideTileUsed && state.powers.hideTilePendingCount === 0) return;

    state.powers.hideTileUsed = true;
    state.powers.hideTilePendingCount = Math.min(
      2,
      state.powers.hideTilePendingCount + 1
    );

    io.to(roomId).emit("powerUsed", { type: "hideTile" });
  }
});
