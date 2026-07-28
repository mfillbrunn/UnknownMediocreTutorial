// /powers/powers/confuseColorsServer.js
// Server-side logic for Blue Mode (Confuse Colors)
const engine = require("../powerEngineServer.js");


engine.registerPower("confuseColors", {
  apply(state, action, roomId, io) {
    if (state.powers.confuseColorsUsed) return false; 

    state.powers.confuseColorsUsed = true;
    state.powers.confuseColorsActive = true;

    io.to(roomId).emit("powerUsed", { type: "confuseColors" });
  },

 postScore(state, entry) {
  if (state.powers.confuseColorsActive) {
    entry.confuseApplied = true;
    // Only the positions that were actually green/yellow (and get recolored
    // blue below) become unreliable for future secret-switch validation --
    // a position that came back gray was never touched by this power and
    // still means exactly what it always means (this letter truly isn't in
    // the word), so it must keep binding the setter's later choices same as
    // any other gray tile. A blanket per-guess exemption here used to let
    // the setter switch to a secret that contradicted an untouched gray
    // tile from this same guess.
    entry.confuseIgnoreIndices = entry.fb.reduce((acc, f, i) => {
      if (f === "🟩" || f === "🟨") acc.push(i);
      return acc;
    }, []);
    entry.fbGuesser = entry.fbGuesser.map(t => {
      // Do NOT recolor blind-spot purple
    if (t === "🟪") return t;
        // Recolor only true green/yellow
      if (t === "🟩" || t === "🟨") return "🟦";
      return t;

    });
    entry.powerUsed = "ConfuseColors";
  }
}


});
