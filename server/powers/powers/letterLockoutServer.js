// powers/powers/letterLockoutServer.js
//
// Setter power, active from the start of the match, usable every round
// (not a one-shot): on each of the setter's normal-phase decision turns
// they may ban one letter they haven't banned before this match. The
// guesser's very next guess is rejected server-side if it contains that
// letter (see server/game-engine/validation.js's checkGuess), and the
// ban clears the instant that guess is validated and submitted
// (normalTransitions.js's clearRoundState) — it only ever covers one
// guess, not every future one.
//
// state.powers.letterLockoutUsedLetters is the running, match-scoped
// pool of already-banned letters (postGame.js preserves it across the
// round-2 role swap). state.powers.letterLockoutBanned is whichever
// letter is currently in effect.

const engine = require("../powerEngineServer");

engine.registerPower("letterLockout", {
  apply(state, action, roomId, io) {
    const letter = (action.letter || "").toUpperCase();
    if (!/^[A-Z]$/.test(letter)) return false;

    const used = state.powers.letterLockoutUsedLetters || [];
    if (used.includes(letter)) return false; // already banned earlier this match

    state.powers.letterLockoutUsedLetters = [...used, letter];
    state.powers.letterLockoutBanned = letter;

    io.to(roomId).emit("toast", `The Spy locked out the letter ${letter}.`);
    io.to(roomId).emit("powerUsed", { type: "letterLockout", letter });
  }
});
