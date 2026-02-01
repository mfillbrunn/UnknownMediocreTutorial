const { endGame } = require("./gameOver");
const { emitStateForAllPlayers } = require("../../utils/emitState");
const { finalizeFeedback } = require("../../game-engine/finalizeFeedback");
const { addIncrement, resetRoundTimer } = require("../../utils/Timer");

function transitionAfterGuess({
  room,
  state,
  guess,
  roomId,
  context,
  io
}) {
  const assassin = state.powers.assassinWord;

  // Assassin hit → game over
  if (assassin && guess === assassin.toUpperCase()) {
    state.powers.assassinWordassassinated = true;
    pushWinEntry(state, state.secret);
    io.to(roomId).emit("secretFound");
    endGame(state, roomId, io, room, context);
    return "gameOver";
  }

  // Correct guess → game over
  if (guess === state.secret) {
    state.currentSecret = state.secret;
    pushWinEntry(state, guess);
    io.to(roomId).emit("secretFound");
    endGame(state, roomId, io, room, context);
    return "gameOver";
  }

  // Otherwise → setter’s turn
  state.pendingGuess = guess;
  io.to(roomId).emit("guessSubmitted");

  clearRoundState(state);

  state.activeTimer = state.setter;
  advanceTimer(state, state.guesser);
  state.turn = state.setter;
  state.powerUsedThisTurn = false;

  context.powerEngine.turnStart(state, state.turn, roomId, io);
  emitStateForAllPlayers(roomId, room, io);

  return "continue";
}

function transitionAfterSecret({
  room,
  state,
  secret,
  roomId,
  context,
  io
}) {
  state.secret = secret;
  state.currentSecret = secret;
  state.firstSecretSet = true;

  if (state.pendingGuess === secret) {
    pushWinEntry(state, secret);
    io.to(roomId).emit("secretFound");
    endGame(state, roomId, io, room, context);
    return "gameOver";
  }

  io.to(roomId).emit("secretPlanted");

  finalizeFeedback(state, context.powerEngine, roomId, io);
  clearRoundState(state);

  state.activeTimer = state.guesser;
  advanceTimer(state, state.setter);
  state.turn = state.guesser;
  state.powerUsedThisTurn = false;

  context.powerEngine.turnStart(state, state.turn, roomId, io);
  emitStateForAllPlayers(roomId, room, io);

  return "continue";
}

/* ---------- helpers ---------- */

function advanceTimer(state, player) {
  if (state.timeControl.mode === "chess") {
    addIncrement(state, player);
  } else if (state.timeControl.mode === "round") {
    resetRoundTimer(state);
  }
}

function clearRoundState(state) {
  clearActivePowers(state);
  state.powers.forceGuess = null;
}

module.exports = {
  transitionAfterGuess,
  transitionAfterSecret
};
