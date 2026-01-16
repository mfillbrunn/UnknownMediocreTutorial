const applyAction = require("../stateMachine");
  const { pickGuess, pickSecret } = require("./ai/easyAI");

function maybeRunAI(room, roomId, context) {
  const state = room.state;
  const aiPlayer = Object.entries(room.players)
    .find(([_, p]) => p.isAI);
  if (!aiPlayer) return;
  const [aiSocketId, ai] = aiPlayer;
  if (state.turn !== ai.role) return;
  if (ai.role === state.guesser && !state.pendingGuess) {
    const guess = pickGuess(state, context.ALLOWED_GUESSES);
    applyAction(
      room,
      state,
      { type: "SUBMIT_GUESS", guess },
      ai.role,
      roomId,
      context
    );
  }

  if (ai.role === state.setter && state.pendingGuess) {
    const secret = pickSecret(context.ALLOWED_GUESSES);
    applyAction(
      room,
      state,
      { type: "SET_SECRET_SAME" },
      ai.role,
      roomId,
      context
    );
  }
}

module.exports = {maybeRunAI};
