// /powers/powers/confuseColorsServer.js
// Server-side logic for Blue Mode (Confuse Colors)
const engine = require("../powerEngineServer");

engine.registerPower("confusecolors", {
  apply(state, action, roomId, io) {
    if (state.powers.confuseColorsUsed) return;

    state.powers.confuseColorsUsed = true;
    state.powers.confuseColorsActive = true;

    io.to(roomId).emit("powerUsed", { type: "confuseColors" });
  },

 postScore(state, entry) {
  if (state.powers.confuseColorsActive) {
    entry.confuseApplied = true;
  }
  // effect ends after one feedback
  state.powers.confuseColorsActive = false;
}

});
