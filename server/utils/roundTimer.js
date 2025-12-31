const { emitStateForAllPlayers } = require("./emitState");
const { endGame,handleNormalPhase  } = require("../core/phases/normal");
const { resetRoundTimer } = require("./chessTimer");

function handleRoundTimeout(room, state, roomId, role, context) {
  const io = context.io;

  // Simultaneous phase → immediate loss
  if (state.phase === "simultaneous") {
    state.timeoutLoser = role;
    endGame(state, roomId, io, room);
    return { shouldContinue: false };
  }

  state.roundTimeouts[role]++;

  const last = state.history[state.history.length - 1];

  // Reset round timer + advance turn
  resetRoundTimer(state);
  state.activeTimer = role === "A" ? "B" : "A";

  if (last) {
    if (role === state.guesser) {
      handleNormalPhase(
        room,
        state,
        { type: "SUBMIT_GUESS", guess: last.guess, timedOut: true },
        state.guesser,
        roomId,
        context
      );
    } else {
      handleNormalPhase(
        room,
        state,
        { type: "SET_SECRET_SAME", timedOut: true },
        state.setter,
        roomId,
        context
      );
    }
  }

  emitStateForAllPlayers(roomId, room, io);

  if (state.roundTimeouts[role] >= 3) {
    state.timeoutLoser = role;
    endGame(state, roomId, io, room);
    return { shouldContinue: false };
  }

  return { shouldContinue: true };
}


module.exports = { handleRoundTimeout };
