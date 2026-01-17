const handleNormalPhase = require("../phases/normal");
const handleSimultaneousPhase = require("../phases/simultaneous");
const { pickGuess, pickSecret } = require("./ai/easyAI");

function maybeRunAI(room, roomId, context) {
  const state = room.state;

  const aiEntry = Object.entries(room.players)
    .find(([_, p]) => p.isAI);

  if (!aiEntry) return;

  const [, ai] = aiEntry;

  // -----------------------------
  // NORMAL PHASE
  // -----------------------------
  if (state.phase === "normal") {
    if (state.turn !== ai.role) return;

    if (ai.role === state.guesser && !state.pendingGuess) {
      const guess = pickGuess(state, context.ALLOWED_GUESSES);

      handleNormalPhase(
        room,
        state,
        { type: "SUBMIT_GUESS", guess, ai: true },
        state.guesser,
        roomId,
        context
      );
      return;
    }

    if (ai.role === state.setter && state.pendingGuess) {
      handleNormalPhase(
        room,
        state,
        { type: "SET_SECRET_SAME", ai: true },
        state.setter,
        roomId,
        context
      );
      return;
    }
  }

  // -----------------------------
  // SIMULTANEOUS PHASE
  // -----------------------------
  if (state.phase === "simultaneous") {
    if (ai.role === state.guesser && !state.simultaneousGuessSubmitted) {
      const guess = pickGuess(state, context.ALLOWED_GUESSES);

      handleSimultaneousPhase(
        room,
        state,
        { type: "SUBMIT_GUESS", guess, ai: true },
        state.guesser,
        roomId,
        context
      );
      return;
    }

    if (ai.role === state.setter && !state.simultaneousSecretSubmitted) {
      const secret = pickSecret(context.ALLOWED_GUESSES);

      handleSimultaneousPhase(
        room,
        state,
        { type: "SET_SECRET_NEW", secret, ai: true },
        state.setter,
        roomId,
        context
      );
      return;
    }
  }
}

module.exports = {maybeRunAI};
