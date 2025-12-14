// powers/powers/forceTimerServer.js
const engine = require("../powerEngineServer.js");

engine.registerPower("forceTimer", {
  apply(state, action, roomId, io) {
    if (state.powers.forceTimerUsed) return;

    state.powers.forceTimerUsed = true;
    state.powers.forceTimerArmed = true;

    io.to(roomId).emit("powerUsed", { type: "forceTimer" });
  }
});
