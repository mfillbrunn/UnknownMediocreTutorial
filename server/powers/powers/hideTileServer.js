// /powers/powers/hideTileServer.js
// Server-side logic for the Hide Evidence power (setter ability), a.k.a.
// "Reset Letter": the setter picks one letter on their own keyboard (see
// public/powerEngine/powers/hideTile.js) and every occurrence of that letter
// across every guess made so far this round has its feedback ERASED
// (entry.fb / entry.fbGuesser set to "" — same erase-not-mask treatment as
// Vowel Refresh), not just redacted for one side. Usable twice per match.
//
// A letter's info isn't only carried by entry.fb/fbGuesser -- powers like
// Field Report, Reveal Letter, Reveal Penalty, Bet Miss, Magic Mode, and
// the guesser quest rewards can also bind a letter via state.extraConstraints
// (a GREEN "must be at this exact position" or YELLOW "must be somewhere in
// the word" rule -- see history.js's isConsistentWithHistory and
// constraintData.js's Must Contain box, both of which read straight from
// this array). Erasing only the history rows and leaving a matching
// extraConstraint in place would still fully reveal/bind that letter, so
// this power clears both.
const engine = require("../powerEngineServer.js");
const { isConsistentWithHistory } = require("../../game-engine/history");
const {
  hasLetterKnowledge,
  eraseLetterKnowledge
} = require("../../utils/resetLetterKnowledge");

engine.registerPower("hideTile", {
  apply(state, action, roomId, io) {
    const uses = state.powers.hideTileUses || 0;
    if (uses >= 2) return false;

    const letter = String(action.letter || "").toUpperCase();
    if (!/^[A-Z]$/.test(letter)) return false;

    if (!hasLetterKnowledge(state, letter)) return false;

    eraseLetterKnowledge(state, [letter]);

    state.powers.hideTileUses = uses + 1;
    state.powers.hideTileUsed = state.powers.hideTileUses >= 2;
    state.powers.hideTileActive = true;
    state.powers.hideTileLetters = [
      ...(state.powers.hideTileLetters || []),
      letter
    ];

    if (state.powers?.rouletteSecretActive) {
      state.powers.rouletteSecretFeasible = global.ALLOWED_SECRETS.filter(
        secret => isConsistentWithHistory(state.history, secret, state)
      );
    }

    io.to(roomId).emit("powerUsed", {
      type: "hideTile",
      letter
    });

    return true;
  }
});