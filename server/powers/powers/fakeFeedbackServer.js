// /powers/powers/fakeFeedback.js
const engine = require("../powerEngineServer.js");
const { isConsistentWithHistory } = require("../../game-engine/history");
const { scoreGuess } = require("../../game-engine/scoring");
const { buildKeyboardState } = require("../../game-engine/keyboardState");

// Mixes up this guess's feedback, but protects any LETTER that already had
// a known status going into this guess (i.e. it's already colored on the
// keyboard from an earlier guess this round, or forced by a power like
// Field Report) -- those positions keep their true color untouched, since
// faking something the player already knows would just look broken. Every
// other position -- including a green revealed for the first time by this
// very guess -- is fair game and gets its true color reassigned to a
// different eligible position. Used as a fallback when no real alternate
// secret is available (see apply() below) -- typically right after Signal
// Scramble lets a guess skip the dictionary check, which can make almost
// every other real word inconsistent with this guess's true feedback.
// Since the fake doesn't need to correspond to any real word in that case,
// synthesizing it directly sidesteps that dead end entirely.
function buildScrambledFakeFeedback(trueFb, guess, state) {
  const fake = [...trueFb];
  const { keyboard } = buildKeyboardState(state);

  const idx = [];
  const vals = [];
  for (let i = 0; i < 5; i++) {
    if (keyboard[guess[i]] != null) continue; // already known -- protected
    idx.push(i);
    vals.push(trueFb[i]);
  }
  // Nothing worth scrambling: fewer than 2 eligible tiles, or they're
  // already all the same symbol (every permutation would look identical).
  if (idx.length < 2 || new Set(vals).size < 2) return fake;

  let shuffled = vals;
  for (let attempt = 0; attempt < 20; attempt++) {
    const candidate = [...vals];
    for (let i = candidate.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [candidate[i], candidate[j]] = [candidate[j], candidate[i]];
    }
    if (candidate.some((v, i) => v !== vals[i])) { shuffled = candidate; break; }
  }

  idx.forEach((position, k) => { fake[position] = shuffled[k]; });
  return fake;
}

engine.registerPower("fakeFeedback", {
  apply(state, action, roomId, io) {
    if (state.powers.fakeFeedbackUsed) return false;
    state.powers.fakeFeedbackUsed = true;
    state.powers.fakeFeedbackActive = true;

    // nonsenseLastTurn (set by nonsense's own turnStart, see
    // nonsenseServer.js) means the guess this power is about to react to
    // was submitted under Signal Scramble and doesn't have to be a real
    // word. Searching ALLOWED_SECRETS for a real alternate secret still
    // "works" then, but a rare/unlikely-letter guess tends to score the
    // exact same (often all-gray) reading against almost any real word as
    // it does against the true secret -- the composite tiles only look
    // ambiguous when the two readings actually differ, so the picked
    // alternate is frequently indistinguishable from the truth and the
    // power quietly does nothing. Skip the dictionary search in that case
    // and synthesize the fake reading directly from this guess's own true
    // feedback in postScore instead -- it doesn't need to correspond to
    // any real word.
    state.powers.fakeFeedbackScramble = !!state.powers.nonsenseLastTurn;

    if (state.powers.fakeFeedbackScramble) {
      state.powers.fakeFeedbackSecret = null;
    } else {
      const fakesecret = global.ALLOWED_SECRETS.filter(secret =>isConsistentWithHistory(state.history, secret, state));
      if (fakesecret.length <= 1) {
        // No real alternate secret left consistent with history at all --
        // fall back to the same synthesis rather than silently no-op'ing
        // (the old behavior: fakeFeedbackSecret = state.secret, i.e.
        // entry2 always equal to entry1, no fakery at all).
        state.powers.fakeFeedbackSecret = null;
        state.powers.fakeFeedbackScramble = true;
      } else {
        do {
          state.powers.fakeFeedbackSecret = fakesecret[Math.floor(Math.random() * fakesecret.length)];
        } while (state.powers.fakeFeedbackSecret === state.secret);
      }
    }
   io.to(roomId).emit("powerUsed", { type: "fakeFeedback" });
  },
 postScore(state, entry) {
   if (!state.powers.fakeFeedbackActive) {return;}
   let entry1 = scoreGuess(state.secret, state.pendingGuess);
   let entry2 = state.powers.fakeFeedbackScramble
     ? buildScrambledFakeFeedback(entry1, state.pendingGuess.toUpperCase(), state)
     : scoreGuess(state.powers.fakeFeedbackSecret, state.pendingGuess);
   entry.fakeFeedback = {
    entry1,   // ["🟩","⬛",...]
    entry2    // ["🟨","⬛",...]
  };
   entry.fbGuesser = ["?","?","?","?","?"];
 }
});
