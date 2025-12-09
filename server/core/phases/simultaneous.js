// core/phases/simultaneous.js

const { emitStateForAllPlayers } = require("../../utils/emitState");

function handleSimultaneousPhase(room, state, action, role, roomId, context) {
  const io = context.io;
  const { ALLOWED_GUESSES } = context;
  const { isValidWord } = require("../../game-engine/validation");

  // ---------------------------------------------
  // SETTER submits initial secret
  // ---------------------------------------------
  if (action.type === "SET_SECRET_NEW" && role === state.setter) {
    if (state.simultaneousSecretSubmitted) return;

    const w = action.secret.toLowerCase();
    if (!isValidWord(w, ALLOWED_GUESSES)) return;

    state.secret = w;
    state.simultaneousSecretSubmitted = true;
  }

  // ---------------------------------------------
  // GUESSER submits initial guess
  // ---------------------------------------------
  if (action.type === "SUBMIT_GUESS" && role === state.guesser) {
    if (state.simultaneousGuessSubmitted) return;

    const g = action.guess.toLowerCase();
    if (!isValidWord(g, ALLOWED_GUESSES)) return;

    state.pendingGuess = g;
    state.simultaneousGuessSubmitted = true;
  }

  // ---------------------------------------------
  // PARTIAL UPDATE (just one submitted)
  // Always update UI to show “WAIT” indicators.
  // ---------------------------------------------
  emitStateForAllPlayers(roomId, room, io);

  // ---------------------------------------------
  // If BOTH submitted → transition to NORMAL phase
  // ---------------------------------------------
  const bothSubmitted =
    state.secret &&
    state.pendingGuess &&
    state.simultaneousSecretSubmitted &&
    state.simultaneousGuessSubmitted;

  if (!bothSubmitted) return;

  // Transition to normal gameplay
  state.phase = "normal";
  state.turn = state.setter; // setter must decide SAME or NEW first

  // Emit full state update in new phase
  emitStateForAllPlayers(roomId, room, io);
}

module.exports = handleSimultaneousPhase;
