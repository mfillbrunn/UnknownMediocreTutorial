// /powers/powers/countOnlyServer.js
const engine = require("../powerEngineServer.js");

engine.registerPower("countonly", {
  apply(state, action, roomId, io) {
    if (state.powers.countOnlyUsed) return;
    state.powers.countOnlyUsed = true;
    state.powers.countOnlyActive = true;
    io.to(roomId).emit("powerUsed", { type: "countOnly" });
  },

  postScore(state, entry) {
    if (state.powers.countOnlyActive) {

      // Compute count: greens + yellows
      const greens = entry.fb.filter(c => c === "🟩").length;
      const yellows = entry.fb.filter(c => c === "🟨").length;
      const totalMatches = greens + yellows;

      // Store number for guesser ONLY
      entry.countOnlyTotal = totalMatches;  // <— THIS IS NEW

      // Replace fbGuesser with all black tiles
      entry.fbGuesser = ["⬛","⬛","⬛","⬛","⬛"];

      // Mark that this entry used count-only
      entry.countOnlyApplied = true;

      // Reset active state
      state.powers.countOnlyActive = false;
    }
  }
});
