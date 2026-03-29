// core/timeouts/timeoutController.js

const { startTimer } = require("../../utils/Timer");
const { emitRoomState } = require("../rooms");
const { endGame } = require("../phases/gameOver");

/**
 * Central timeout policy engine.
 * Decides what a timeout means based on phase.
 */
function handleTimeout({
  room,
  state,
  roomId,
  timedOutUserId,
  context
}) {
  console.log("[TIMEOUT] handleTimeout", {
    roomId,
    phase: state.phase,
    timedOutUserId,
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
      console.log("[TIMEOUT] routing -> simultaneous");
      return handleSimultaneousTimeout({
        room,
        state,
        roomId,
        timedOutUserId,
        context
      });

    case "normal":
      console.log("[TIMEOUT] routing -> normal");
      return handleNormalTimeout({
        room,
        state,
        roomId,
        timedOutUserId,
        context
      });

    default:
      return { continue: false };
  }
}

function handleSimultaneousTimeout({
  room,
  state,
  roomId,
  timedOutUserId,
  context
}) {
  const io = context.io;

  const isFirstSimultaneous =
    !state.matchRounds || state.matchRounds.length === 0;

  state.timeoutLoser = timedOutUserId;

  if (isFirstSimultaneous) {
    state.canNextRound = false;
    endGame(state, roomId, io, room, context);
    emitRoomState(roomId, room, io);
    return { continue: false };
  }

  endGame(state, roomId, io, room, context);
  return { continue: false };
}

function handleNormalTimeout({
  room,
  state,
  roomId,
  timedOutUserId,
  context
}) {
  const { transitionAfterGuess, transitionAfterSecret, maybeRunAI } = context;
  const io = context.io;

  console.log("[TIMEOUT][NORMAL] entered", {
    roomId,
    timedOutUserId,
    turn: state.turn,
    setter: state.setter,
    guesser: state.guesser,
    roundTimeouts: state.roundTimeouts,
    forceGuessOptions: state.powers?.forceGuessOptions,
    historyLength: state.history?.length ?? 0
  });

  state.roundTimeouts ||= {};
  state.roundTimeouts[timedOutUserId] =
    (state.roundTimeouts[timedOutUserId] || 0) + 1;

  console.log("[TIMEOUT][NORMAL] counter", {
    userId: timedOutUserId,
    count: state.roundTimeouts[timedOutUserId]
  });

  if (state.roundTimeouts[timedOutUserId] >= 3) {
    console.warn("[TIMEOUT][NORMAL] max timeouts reached -> game over", {
      loser: timedOutUserId
    });
    state.timeoutLoser = timedOutUserId;
    endGame(state, roomId, io, room, context);
    return { continue: false };
  }

  const last = state.history.at(-1);
  if (!last) {
    console.warn("[TIMEOUT][NORMAL] no history -> abort");
    return { continue: false };
  }

  if (timedOutUserId === state.guesser) {
    console.log("[TIMEOUT][NORMAL] guesser timed out -> auto-guess", {
      guess: last.guess
    });

    if (state.powers?.forceGuessOptions != null) {
      console.log("[TIMEOUT][NORMAL] clearing forceGuessOptions");
      state.powers.forceGuessOptions = null;
    }

    transitionAfterGuess({
      room,
      state,
      guess: last.guess,
      roomId,
      context,
      io
    });
  } else if (timedOutUserId === state.setter) {
    console.log("[TIMEOUT][NORMAL] setter timed out -> auto-secret", {
      secret: state.secret ? "(reuse)" : "(missing)"
    });

    transitionAfterSecret({
      room,
      state,
      secret: state.secret,
      roomId,
      context,
      io
    });
  } else {
    console.warn("[TIMEOUT][NORMAL] timedOutUserId does not match setter or guesser", {
      timedOutUserId,
      setter: state.setter,
      guesser: state.guesser
    });
    return { continue: false };
  }

  setTimeout(() => {
    try {
      console.log("[TIMEOUT][NORMAL] invoking maybeRunAI");
      maybeRunAI(room, roomId, context);
    } catch (err) {
      console.error("maybeRunAI crashed:", err);
    }
  }, 1000);

  return { continue: true };
}

function startGameTimer(room, state, roomId, context) {
  const { endGame } = context;
  const io = context.io;

  if (!room || room.status !== "alive") return;
  if (state.isTimerRunning) return;

  state.isTimerRunning = true;

  startTimer(roomId, state, io, (timedOutUserId) => {
    state.isTimerRunning = false;

    if (state.timeControl.mode === "chess") {
      state.timeoutLoser = timedOutUserId;
      endGame(state, roomId, io, room, context);
      return;
    }

    const result = handleTimeout({
      room,
      state,
      roomId,
      timedOutUserId,
      context
    });

    if (result?.continue) {
      startGameTimer(room, state, roomId, context);
    }
  });
}

module.exports = {
  startGameTimer
};
