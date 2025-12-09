// /powers/powers/countOnlyServer.js
// Server-side logic for Count-Only power
const engine = require("../powerEngineServer");

engine.registerPower("countonly", {
  apply(state, action, roomId, io) {
    if (state.powers.countOnlyUsed) return;

    state.powers.countOnlyUsed = true;
    state.powers.countOnlyActive = true;

    io.to(roomId).emit("powerUsed", { type: "countOnly" });
  },

postScore(state, entry) {
  if (state.powers.countOnlyActive) {
    entry.countOnlyApplied = true;
    // You may want to blank out fbGuesser entirely:
    entry.fbGuesser = ["⬛","⬛","⬛","⬛","⬛"];
  }
  state.powers.countOnlyActive = false;
}

});
