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
console.log("[TIMEOUT] handleTimeout", {
    roomId,
    phase: state.phase,
    timedOutRole,
    turn: state.turn,
    setter: state.setter,
    guesser: state.guesser,
    gameOver: state.gameOver,
    historyLength: state.history?.length ?? 0,
    pendingGuess: state.pendingGuess,
    secret: state.secret ? "(set)" : "(unset)"
  });
  switch (state.phase) {
    case "simultaneous":
      console.log("[TIMEOUT] routing → simultaneous");
      return handleSimultaneousTimeout({
        room,
        state,
        roomId,
        timedOutRole,
        context
      });

    case "normal":
      console.log("[TIMEOUT] routing → simultaneous");
      return handleNormalTimeout({
        room,
        state,
        roomId,
        timedOutRole,
        context
      });

    default:
      // Lobby, gameOver, etc — ignore or no-op
      console.log("[TIMEOUT] routing → normal");
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
  console.log("[TIMEOUT][NORMAL] entered", {
    roomId,
    timedOutRole,
    turn: state.turn,
    setter: state.setter,
    guesser: state.guesser,
    roundTimeouts: state.roundTimeouts,
    forceGuessOptions: state.powers?.forceGuessOptions,
    historyLength: state.history?.length ?? 0
  });
  state.roundTimeouts ??= { A: 0, B: 0 };
  state.roundTimeouts[timedOutRole] =
    (state.roundTimeouts[timedOutRole] || 0) + 1;
  console.log("[TIMEOUT][NORMAL] counter", {
    role: timedOutRole,
    count: state.roundTimeouts[timedOutRole]
  });
  if (state.roundTimeouts[timedOutRole] >= 3) {
    console.warn("[TIMEOUT][NORMAL] max timeouts reached → game over", {
      loser: timedOutRole
    });
    state.timeoutLoser = timedOutRole;
    endGame(state, roomId, io, room, context);
    return { continue: false };
  }

  // Auto-play last move
  const last = state.history.at(-1);
  if (!last) {
    console.warn("[TIMEOUT][NORMAL] no history → abort");
    return { continue: false };
  }
      if (timedOutRole === state.guesser) {
        console.log("[TIMEOUT][NORMAL] guesser timed out → auto-guess", {
          guess: last.guess
        });
        if (state.powers && state.powers.forceGuessOptions !== null) {
          console.log("[TIMEOUT][NORMAL] clearing forceGuessOptions");
          state.powers.forceGuessOptions = null;
        }
    transitionAfterGuess({room,state, guess: last.guess, roomId, context, io});
    } else {
        console.log("[TIMEOUT][NORMAL] setter timed out → auto-secret", {
          secret: state.secret ? "(reuse)" : "(missing)"
          });
      transitionAfterSecret({room,state,secret: state.secret,roomId,context,io});
    }
  setTimeout(() => {try {
    console.log("[TIMEOUT][NORMAL] invoking maybeRunAI");
    maybeRunAI(room, roomId, context);} catch (err) {console.error("maybeRunAI crashed:", err);}}, 1000);
  return { continue: true };
}

function startGameTimer(room, state, roomId, context) {
  if (!room || room.status !== "alive") return;
  const io = context.io;
  if (state.isTimerRunning) return;
  state.isTimerRunning = true;
  startTimer(roomId, state, io, timedOutRole => {
    state.isTimerRunning = false;
    if (state.timeControl.mode === "chess") {
      state.timeoutLoser = timedOutRole;
      endGame(state, roomId, io, room, context);
      return;
    }
    const result = handleTimeout({room,state,roomId,timedOutRole,context});
    if (result?.continue) {
      startGameTimer(room, state, roomId, context);
    }
  });
}

module.exports = {
  startGameTimer, handleTimeout };
