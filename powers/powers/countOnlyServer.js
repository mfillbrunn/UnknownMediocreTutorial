// /powers/powers/countOnlyServer.js
// Server-side logic for Count-Only power

const engine = require("../powerEngineServer");

engine.registerPower("countonly", {
  apply(state, action, roomId, io) {
    // Already used in this match?
    if (state.powers.countOnlyUsed) return;

    // Mark one-time use
    state.powers.countOnlyUsed = true;

    // Activate effect so modifyFeedback applies it on next guess
    state.powers.countOnlyActive = true;

    // Notify clients (toast)
    io.to(roomId).emit("powerUsed", { type: "countOnly" });
  }
});
