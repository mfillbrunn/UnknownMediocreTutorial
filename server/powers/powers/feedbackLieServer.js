// /powers/powers/feedbackLieServer.js — Feedback Lie (setter power)
//
// One-shot: the guesser's next guess comes back with LIE_COUNT randomly
// chosen tiles showing a color that is actually wrong; the rest show the
// truth. Which tiles lie is never revealed -- the row looks like an
// ordinary result, so the guesser knows some of it is false but not which
// part. That's also why the guesser's keyboard and any AI reasoning about
// remaining secrets still get plain "no info" (fbGuesser = "❓", same marker
// Count Only uses) for the WHOLE row, not just the lied tiles: marking only
// the lied letters "?" would point straight at them. The deception is
// purely visual, on the row tiles the guesser is shown; the mixed
// true/false colors live in the separate entry.feedbackLie side channel
// that public/ui/history.js renders from.
const engine = require("../powerEngineServer.js");
const { scoreGuess } = require("../../game-engine/scoring");

const COLORS = ["🟩", "🟨", "⬛"];
const LIE_COUNT = 2;

function pickLieIndices(length, count) {
  const pool = Array.from({ length }, (_, index) => index);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return new Set(pool.slice(0, Math.min(count, length)));
}

function buildLieFeedback(trueFb) {
  const lies = pickLieIndices(trueFb.length, LIE_COUNT);
  return trueFb.map((trueResult, index) => {
    if (!lies.has(index)) return trueResult;
    // Only ever a color that is NOT the truth, so a chosen tile always lies.
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
