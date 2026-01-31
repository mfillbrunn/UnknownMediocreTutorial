const engine = require("../powerEngineServer");

engine.registerPower("betMiss", {
  apply(state, action, roomId, io) {
    if (state.powers.betMissUsed) return;
    state.powers.betMissActive = true;
    state.powers.betMissUsed = true;
    io.to(roomId).emit("powerUsed", { type: "betMiss" });
  }
});
