// /powers/powers/countOnlyServer.js
// UMT_CHALLENGES_V2: Count Only is one feedback row per activation in a
// challenge, while its original full-round behavior is unchanged elsewhere.
const engine = require("../powerEngineServer.js");

engine.registerPower("countOnly", {
  apply(state, action, roomId, io) {
    if (state.powers.countOnlyUsed) return false;
    state.powers.countOnlyUsed = true;
    state.powers.countOnlyActive = true;
    state.powers.countOnlyWord = state.pendingGuess;
    state.powers.countOnlyRound = state.history.length;
    io.to(roomId).emit("powerUsed", { type: "countOnly" });
  },

  postScore(state, entry) {
    if (!state.powers.countOnlyActive) return;

    const feedback = Array.isArray(entry.fb) ? entry.fb : [];
    const greens = feedback.filter(color => color === "🟩").length;
    const yellows = feedback.filter(color => color === "🟨").length;
    const totalMatches = greens + yellows;

    entry.extraInfo = {
      greens,
      yellows,
      total: totalMatches
    };
    // Unknown markers prevent the keyboard from learning false gray letters.
    entry.fbGuesser = ["❓", "❓", "❓", "❓", "❓"];
    entry.countOnlyApplied = true;
    entry.powerUsed = "countOnly";

    // Ordinary Count Only remains active for the rest of its round. Challenge
    // mode consumes one activation per row so difficulty can mean 2/3/4 turns.
    const challenge = state.singlePlayer?.challenge;
    if (challenge?.enabled && challenge.powerId === "countOnly") {
      state.powers.countOnlyActive = false;
    }
  }
});
