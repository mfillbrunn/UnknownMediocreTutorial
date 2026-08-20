// powers/powers/letterLockoutServer.js
//
// Setter power, active from the start of the match, usable every round
// (not a one-shot): on each of the setter's normal-phase decision turns
// it bans one letter that hasn't been banned before this match. The
// guesser's very next guess is rejected server-side if it contains that
// letter (see server/game-engine/validation.js's checkGuess), and the
// ban clears the instant that guess is validated and submitted
// (normalTransitions.js's clearRoundState) — it only ever covers one
// guess, not every future one.
//
// The letter itself is picked automatically, not chosen by the setter
// (action.letter is ignored) -- see pickLockoutLetter below.
//
// state.powers.letterLockoutUsedLetters is the running, match-scoped
// pool of already-banned letters (postGame.js preserves it across the
// round-2 role swap). state.powers.letterLockoutBanned is whichever
// letter is currently in effect.

const engine = require("../powerEngineServer");
const { getMustContainLetters } = require("../../utils/constraintData");
const { getLetterStatusFromHistory } = require("../../game-engine/keyboardState");

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

// Never repeats a letter already banned this match, and never bans one
// already confirmed green or yellow (the guesser is entitled to use it --
// blocking it would effectively erase real information the feedback
// already gave away). Among what's left, prefers a letter that hasn't
// appeared in any guess at all yet: banning one already confirmed absent
// (gray) is a wasted pick, since the Inspector already knows not to type
// it.
function pickLockoutLetter(state) {
  const used = state.powers.letterLockoutUsedLetters || [];
  const mustContain = getMustContainLetters(state);
  const eligible = ALPHABET.filter(
    letter => !used.includes(letter) && !mustContain.includes(letter)
  );
  if (!eligible.length) return null;

  const untouched = eligible.filter(
    letter => getLetterStatusFromHistory(letter, state).status === null
  );
  const pool = untouched.length ? untouched : eligible;
  return pool[Math.floor(Math.random() * pool.length)];
}

engine.registerPower("letterLockout", {
  apply(state, action, roomId, io) {
    const letter = pickLockoutLetter(state);
    if (!letter) return false;

    const used = state.powers.letterLockoutUsedLetters || [];
    state.powers.letterLockoutUsedLetters = [...used, letter];
    state.powers.letterLockoutBanned = letter;

    io.to(roomId).emit("toast", `The Spy locked out the letter ${letter}.`);
    io.to(roomId).emit("powerUsed", { type: "letterLockout", letter });
  }
});
