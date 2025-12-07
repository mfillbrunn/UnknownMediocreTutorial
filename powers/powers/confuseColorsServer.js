// /powers/powers/confuseColorsServer.js
// Server-side logic for Blue Mode (Confuse Colors)

const engine = require("../powerEngineServer");

engine.registerPower("confusecolors", {
  apply(state, action, roomId, io) {
    // Already used this match?
    if (state.powers.confuseColorsUsed) return;

    // Mark one-time use
    state.powers.confuseColorsUsed = true;

    // Activate effect for the NEXT feedback computation
    state.powers.confuseColorsActive = true;

    // Notify clients
    io.to(roomId).emit("powerUsed", { type: "confuseColors" });
  }
});
