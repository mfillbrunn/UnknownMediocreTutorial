// /powers/powers/countOnlyServer.js
const engine = require("../powerEngineServer.js");

engine.registerPower("countOnly", {
  apply(state, action, roomId, io) {
    if (state.powers.countOnlyUsed) return;
    state.powers.countOnlyUsed = true;
    state.powers.countOnlyActive = true;
    state.powers.countOnlyWord = state.pendingGuess;
    io.to(roomId).emit("powerUsed", { type: "countOnly" });
  },

  postScore(state, entry) {
  if (state.powers.countOnlyActive) {

    const greens = entry.fb.filter(c => c === "🟩").length;
    const yellows = entry.fb.filter(c => c === "🟨").length;
    const totalMatches = greens + yellows;

    // Provide structured information for the guesser UI
    entry.extraInfo = {
      greens,
      yellows,
      total: totalMatches
    };

    // Replace guesser feedback with black tiles
    entry.fbGuesser = ["⬛","⬛","⬛","⬛","⬛"];

    entry.countOnlyApplied = true;
    entry.powerUsed = "countOnly";
  }
}
});
