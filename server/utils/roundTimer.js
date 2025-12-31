const applyAction = require("../core/stateMachine");
const { emitStateForAllPlayers } = require("./emitState");
const { endGame,handleNormalPhase  } = require("../core/phases/normal");
const { resetRoundTimer } = require("./chessTimer");

function handleRoundTimeout(room, state, roomId, role, context) {
  // Rule: timeout during simultaneous phase = immediate game over
  if (state.phase === "simultaneous") {
    state.timeoutLoser = role;
    endGame(state, roomId, io, room);
    return;
  }

  // Normal (non-simultaneous) round timeout logic
  state.roundTimeouts[role]++;

  const last = state.history[state.history.length - 1];
  // Auto-resubmit based on role
  if (role === state.guesser) {
    handleNormalPhase(
      room,
      state,
      {
        type: "SUBMIT_GUESS",
        guess: last.guess,
        timedOut: true
      },
      state.guesser,
      roomId,
      context
    );
  } else if (role === state.setter) {
    handleNormalPhase(
      room,
      state,
      {
        type: "SET_SECRET_SAME",
        timedOut: true
      },
      state.setter,
      roomId,
      context
    );
  }

  resetRoundTimer(state);
  state.activeTimer = role === "A" ? "B" : "A";

  emitStateForAllPlayers(roomId, room, io);

  if (state.roundTimeouts[role] >= 3) {
    state.timeoutLoser = role;
    endGame(state, roomId, io, room);
  }
}

module.exports = { handleRoundTimeout };
