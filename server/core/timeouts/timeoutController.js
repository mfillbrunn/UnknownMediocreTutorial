// core/timeouts/timeoutController.js

const { endGame } = require("../phases/gameOver");
const { emitStateForAllPlayers } = require("../../utils/emitState");
const { emitLobbyEvent } = require("../../utils/emitLobby");
const {transitionAfterGuess, transitionAfterSecret} = require("../transitions/normalTransitions");
const {maybeRunAI} = require("../ai/runAI");

/**
 * Central timeout policy engine.
 * Decides what a timeout means based on phase.
 */
function handleTimeout({
  room,
  state,
  roomId,
  timedOutRole,
  context
}) {
  const io = context.io;

  switch (state.phase) {
    case "simultaneous":
      return handleSimultaneousTimeout({
        room,
        state,
        roomId,
        timedOutRole,
        context
      });

    case "normal":
      return handleNormalTimeout({
        room,
        state,
        roomId,
        timedOutRole,
        context
      });

    default:
      // Lobby, gameOver, etc — ignore or no-op
      return { continue: false };
  }
}

function handleSimultaneousTimeout({
  room,
  state,
  roomId,
  timedOutRole,
  context
}) {
  const io = context.io;

  const isFirstSimultaneous =
    !state.matchRounds || state.matchRounds.length === 0;

  if (isFirstSimultaneous) {
    state.timeoutLoser = timedOutRole;
    state.canNextRound = false;
    endGame(state, roomId, io, room, context);
    emitStateForAllPlayers(roomId, room, io);
    return { continue: false };
  }
  // Otherwise: immediate loss
  state.timeoutLoser = timedOutRole;
  endGame(state, roomId, io, room, context);
  return { continue: false };
}

function handleNormalTimeout({
  room,
  state,
  roomId,
  timedOutRole,
  context
}) {
  const io = context.io;  
  state.roundTimeouts ??= { A: 0, B: 0 };
  state.roundTimeouts[timedOutRole] =
    (state.roundTimeouts[timedOutRole] || 0) + 1;

  if (state.roundTimeouts[timedOutRole] >= 3) {
    state.timeoutLoser = timedOutRole;
    endGame(state, roomId, io, room, context);
    return { continue: false };
  }

  // Auto-play last move
  const last = state.history.at(-1);
  if (!last) return { continue: false };
      if (timedOutRole === state.guesser) {
        if (state.powers && state.powers.forceGuessOptions)  {state.powers.forceGuessOptions = null;}
    transitionAfterGuess({room,state, guess: last.guess, roomId, context, io});
    } else {
      transitionAfterSecret({room,state,secret: state.secret,roomId,context,io});
    }
  setTimeout(() => {try {maybeRunAI(room, roomId, context);} catch (err) {console.error("maybeRunAI crashed:", err);}}, 1000);
  return { continue: true };
}

module.exports = { handleTimeout };
