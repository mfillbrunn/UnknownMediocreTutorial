// /powers/powers/hideTileServer.js
// Server-side logic for the Hide Evidence power (setter ability), a.k.a.
// "Reset Letter": the setter picks one letter on their own keyboard (see
// public/powerEngine/powers/hideTile.js) and every occurrence of that letter
// across every guess made so far this round has its feedback ERASED
// (entry.fb / entry.fbGuesser set to "" — same erase-not-mask treatment as
// Vowel Refresh), not just redacted for one side. Usable twice per match.
const engine = require("../powerEngineServer.js");

engine.registerPower("hideTile", {
  apply(state, action, roomId, io) {
    const uses = state.powers.hideTileUses || 0;
    if (uses >= 2) return false;

    const letter = String(action.letter || "").toUpperCase();
    if (!/^[A-Z]$/.test(letter)) return false;

    // Nothing to reset (letter hasn't appeared in a scored guess this
    // round yet) -- reject instead of silently burning a use.
    let hasFeedback = false;
    for (const entry of state.history) {
      const guess = (entry.guess || "").toUpperCase();
      for (let i = 0; i < guess.length; i++) {
        if (guess[i] !== letter) continue;
        if ((Array.isArray(entry.fb) && entry.fb[i]) || (Array.isArray(entry.fbGuesser) && entry.fbGuesser[i])) {
          hasFeedback = true;
        }
      }
    }
    if (!hasFeedback) return false;

    for (const entry of state.history) {
      const guess = (entry.guess || "").toUpperCase();
      for (let i = 0; i < guess.length; i++) {
        if (guess[i] !== letter) continue;
        if (Array.isArray(entry.fb)) entry.fb[i] = "";
        if (Array.isArray(entry.fbGuesser)) entry.fbGuesser[i] = "";
      }
    }

    state.powers.hideTileUses = uses + 1;
    state.powers.hideTileUsed = state.powers.hideTileUses >= 2;
    state.powers.hideTileActive = true;
    state.powers.hideTileLetters = [...(state.powers.hideTileLetters || []), letter];

    io.to(roomId).emit("powerUsed", { type: "hideTile", letter });
  }
});
