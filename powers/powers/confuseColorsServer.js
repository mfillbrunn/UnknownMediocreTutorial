const engine = require("../powerEngineServer");

engine.registerPower("confuseColors", {
  apply(state, action, roomId, io) {
    if (state.powers.confuseColorsUsed) return;

    state.powers.confuseColorsUsed = true;
    state.powers.confuseColorsActive = true;

    io.to(roomId).emit("powerUsed", { type: "confuseColors" });
  }
});
