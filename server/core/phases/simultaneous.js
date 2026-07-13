// core/phases/simultaneous.js

const { scoreGuess } = require("../../game-engine/scoring");
const { endGame } = require("./gameOver");
const { addIncrement, resetRoundTimer } = require("../../utils/Timer");
const { checkSecret, checkGuess } = require("../../game-engine/validation");
const { emitRoomState } = require("../rooms");

function handleSimultaneousPhase(room, state, action, roomId, context) {
  const io = context.io;
  const { powerEngine } = context;
  const userId = action.userId;

  if (!userId) return;

  const socketId = room.playersByUserId?.[userId]?.socketId ?? null;

  // Concede
  if (action.type === "CONCEDE") {
    if (userId === state.guesser) {
      const CONCEDE_PENALTY = 10;
      state.guessCount += CONCEDE_PENALTY;
    }
    endGame(state, roomId, io, room, context);
    return;
  }

  // Setter submits initial secret
  if (action.type === "SET_SECRET_NEW" && userId === state.setter) {
    const res = checkSecret({
      secret: action.secret,
      state,
      allowedSecrets: context.ALLOWED_SECRETS
    });

    if (!res.ok) {
      if (socketId) io.to(socketId).emit("errorMessage", res.error);
      return;
    }

    if (state.simultaneousSecretSubmitted) return;

    const secret = action.secret.toUpperCase();
    state.secret = secret;
    state.simultaneousSecretSubmitted = true;

    if (state.timeControl.mode === "chess") {
      addIncrement(state, state.setter);
    }

    if (state.activeTimer === "both") {
      state.activeTimer = state.guesser;
    }

    if (state.roundStartTime && state.timeUsed?.[state.setter] != null) {
      state.timeUsed[state.setter] += Math.floor((Date.now() - state.roundStartTime) / 1000);
    }

    emitRoomState(roomId, room, io);
  }

  // Guesser submits initial guess
  if (action.type === "SUBMIT_GUESS" && userId === state.guesser) {
    const res = checkGuess({
      guess: action.guess,
      state,
      allowedGuesses: context.ALLOWED_GUESSES
    });

    if (!res.ok) {
      if (socketId) io.to(socketId).emit("errorMessage", res.error);
      return;
    }

    if (state.simultaneousGuessSubmitted) return;

    const guess = action.guess.toUpperCase();
    state.pendingGuess = guess;
    state.guessCount += 1;
    state.simultaneousGuessSubmitted = true;

    if (state.timeControl.mode === "chess") {
      addIncrement(state, state.guesser);
    }

    if (state.activeTimer === "both") {
      state.activeTimer = state.setter;
    }

    if (state.roundStartTime && state.timeUsed?.[state.guesser] != null) {
      state.timeUsed[state.guesser] += Math.floor((Date.now() - state.roundStartTime) / 1000);
    }

    emitRoomState(roomId, room, io);
  }

  io.to(roomId).emit("simulProgress", {
    secretSubmitted: state.simultaneousSecretSubmitted,
    guessSubmitted: state.simultaneousGuessSubmitted
  });

  const bothSubmitted =
    state.secret &&
    state.pendingGuess &&
    state.simultaneousSecretSubmitted &&
    state.simultaneousGuessSubmitted;

  if (!bothSubmitted) return;

  powerEngine.preScore(state, state.pendingGuess);

  const fb = scoreGuess(state.secret, state.pendingGuess);
  const entry = {
    guess: state.pendingGuess,
    fb,
    fbGuesser: [...fb],
    extraInfo: null,
    finalSecret: state.secret,
    roundIndex: state.history.length,
    powerEvents: []
  };

  state.pendingGuess = "";

  const isWin = fb.every((tile) => tile === "🟩");
  if (isWin) {
    state.history.push(entry);
    io.to(roomId).emit("secretFound");
    endGame(state, roomId, io, room, context);
    return;
  }

  state.simultaneousAllWrong = fb.every((tile) => tile === "⬛");
  entry.secretLocked = state.simultaneousAllWrong;
  state.history.push(entry);
  // Transition to normal phase with guesser turn
  state.phase = "normal";
  state.turn = state.guesser;
  state.powerUsedThisTurn = false;

  if (state.timeControl.mode === "round") {
    resetRoundTimer(state);
  }

  state.activeTimer = state.guesser;
  state.roundStartTime = Date.now();

  emitRoomState(roomId, room, io);
}

module.exports = handleSimultaneousPhase;
