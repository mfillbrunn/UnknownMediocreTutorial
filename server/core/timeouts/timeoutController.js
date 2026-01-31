// core/timeouts/timeoutController.js

const { endGame } = require("../phases/gameOver");
const { emitStateForAllPlayers } = require("../../utils/emitState");
const { emitLobbyEvent } = require("../../utils/emitLobby");
const {maybeRunAI} = require("../ai/runAI");
const applyAction = require("../stateMachine");

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
    // Match abandoned
    state.phase = "lobby";
    state.turn = null;
    state.secret = null;
    state.pendingGuess = null;
    state.simultaneousSecretSubmitted = false;
    state.simultaneousGuessSubmitted = false;
    state.activeTimer = null;
    state.isTimerRunning = false;
    state.roundTimeouts = { A: 0, B: 0 };

    emitLobbyEvent(io, roomId, {
      type: "matchAbandoned",
      reason: "timeout"
    });

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
      applyAction(     room,    state,    {  type: "SUBMIT_GUESS",     guess: last.guess,      timedOut: true       },
        timedOutRole,
        roomId,
        context
      );
    } else {
      applyAction(    room,    state,    {     type: "SET_SECRET_SAME",     timedOut: true    },
        timedOutRole,
        roomId,
        context
      );
    }
  //setTimeout(() => {try {maybeRunAI(room, roomId, context);} catch (err) {console.error("maybeRunAI crashed:", err);}}, 1000);
  return { continue: true };
}

module.exports = { handleTimeout };
