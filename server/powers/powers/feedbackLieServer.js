// /powers/powers/feedbackLieServer.js — Feedback Lie (setter power)
//
// One-shot: the guesser's next guess comes back with every tile showing a
// color that is actually wrong -- a full, clean lie, unlike Falsify Intel
// (fakeFeedback) which only recolors 1..N tiles the guesser couldn't
// already deduce. The guesser's keyboard and any AI reasoning about
// remaining secrets get plain "no info" (fbGuesser = "❓", same marker
// Count Only uses) rather than being fed the lie as if it were real
// evidence -- the deception is purely visual, on the row tiles the guesser
// is shown. The real-looking-but-false colors live in the separate
// entry.feedbackLie side channel that public/ui/history.js renders from.
const engine = require("../powerEngineServer.js");
const { scoreGuess } = require("../../game-engine/scoring");

const COLORS = ["🟩", "🟨", "⬛"];

function buildLieFeedback(trueFb) {
  return trueFb.map(trueResult => {
    const options = COLORS.filter(color => color !== trueResult);
    return options[Math.floor(Math.random() * options.length)];
  });
}

engine.registerPower("feedbackLie", {
  apply(state, action, roomId, io) {
    if (state.powers.feedbackLieUsed) return false;
    state.powers.feedbackLieUsed = true;
    state.powers.feedbackLieActive = true;
    io.to(roomId).emit("powerUsed", { type: "feedbackLie" });
  },

  postScore(state, entry) {
    if (!state.powers.feedbackLieActive) return;
    // One-shot per activation: the guesser's NEXT guess after the setter
    // fired the power, not every guess for the rest of the round.
    state.powers.feedbackLieActive = false;
    const guess = (state.pendingGuess || "").toUpperCase();
    const trueFb = Array.isArray(entry.fb) ? entry.fb : scoreGuess(state.secret, guess);
    entry.feedbackLie = buildLieFeedback(trueFb);
    entry.feedbackLieApplied = true;
    entry.fbGuesser = ["❓", "❓", "❓", "❓", "❓"];
    entry.powerUsed = "feedbackLie";
  }
});
