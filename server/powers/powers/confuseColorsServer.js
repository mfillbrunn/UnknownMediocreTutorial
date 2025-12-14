// /powers/powers/confuseColorsServer.js
// Server-side logic for Blue Mode (Confuse Colors)
const engine = require("../powerEngineServer.js");


engine.registerPower("confuseColors", {
  apply(state, action, roomId, io) {
    if (state.powers.confuseColorsUsed) return;

    state.powers.confuseColorsUsed = true;
    state.powers.confuseColorsActive = true;

    io.to(roomId).emit("powerUsed", { type: "confuseColors" });
  },

 postScore(state, entry) {
  if (state.powers.confuseColorsActive) {
    entry.confuseApplied = true;
    entry.ignoreConstraints = true;
    entry.fbGuesser = entry.fbGuesser.map(t => {
      // Do NOT recolor blind-spot purple
    if (t === "🟪") return t;
        // Recolor only true green/yellow
      if (t === "🟩" || t === "🟨") return "🟦";
      return t;

    });
    entry.powerUsed = "ConfuseColors";
  }
  state.powers.confuseColorsActive = false;
}


});
