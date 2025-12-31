const applyAction = require("../core/stateMachine");
const { emitStateForAllPlayers } = require("./emitState");
const { endGame } = require("../core/phases/normal");
const { resetRoundTimer } = require("./chessTimer");

function handleRoundTimeout(state, roomId, io, room, role) {
  // 🔴 Rule: timeout during simultaneous phase = immediate game over
  if (state.phase === "simultaneous") {
    state.timeoutLoser = role;
    endGame(state, roomId, io, room);
    return;
  }

  // Normal (non-simultaneous) round timeout logic
  state.roundTimeouts[role]++;

  const last = state.history[state.history.length - 1];

  // No prior completed round to repeat
  if (!last) {
    resetRoundTimer(state);
    state.activeTimer = role === "A" ? "B" : "A";
    emitStateForAllPlayers(roomId, room, io);

    if (state.roundTimeouts[role] >= 3) {
      state.timeoutLoser = role;
      endGame(state, roomId, io, room);
    }
    return;
  }

  // Auto-resubmit based on role
  if (role === state.guesser) {
    applyAction(
      room,
      state,
      { type: "SUBMIT_GUESS", guess: last.guess, timedOut: true },
      role,
      roomId,
      { io }
    );
  } else if (role === state.setter) {
    applyAction(
      room,
      state,
      { type: "SET_SECRET_SAME", timedOut: true },
      role,
      roomId,
      { io }
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
