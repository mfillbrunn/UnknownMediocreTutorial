const engine = require("../powerEngineServer");

engine.registerPower("countOnly", {
  apply(state, action, roomId, io) {
    if (state.powers.countOnlyUsed) return;

    state.powers.countOnlyUsed = true;
    state.powers.countOnlyActive = true;

    io.to(roomId).emit("powerUsed", { type: "countOnly" });
  }
});
