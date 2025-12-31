const { emitStateForAllPlayers } = require("../../utils/emitState");
const { scoreGuess } = require("../../game-engine/scoring");
const { endGame } = require("./normal");
const { addIncrement,resetRoundTimer } = require("../../utils/chessTimer");

function handleSimultaneousPhase(room, state, action, role, roomId, context) {
  const io = context.io;
  const { ALLOWED_GUESSES, powerEngine } = context;
  const { isValidWord } = require("../../game-engine/validation");

  // ---------------------------------------------
  // SETTER submits initial secret
  // ---------------------------------------------
  if (action.type === "SET_SECRET_NEW" && role === state.setter) {
    if (state.simultaneousSecretSubmitted) return;

    const w = action.secret.toLowerCase();
    if (!isValidWord(w, ALLOWED_GUESSES)) return;

    state.secret = w;
    state.currentSecret = w;              // ⭐ Required for correct scoring
    state.firstSecretSet = true;
    state.simultaneousSecretSubmitted = true;
    if (state.timeControl.mode === "chess") {
      addIncrement(state, role);
    } 
    if (state.activeTimer === "both") {
      state.activeTimer = state.guesser;
      state.timeUsed[state.setter] +=  Math.floor((Date.now() - state.roundStartTime) / 1000);
    }
  }

  // ---------------------------------------------
  // GUESSER submits initial guess
  // ---------------------------------------------
  if (action.type === "SUBMIT_GUESS" && role === state.guesser) {
    if (state.simultaneousGuessSubmitted) return;

    const g = action.guess.toLowerCase();
    if (!isValidWord(g, ALLOWED_GUESSES)) return;

    state.pendingGuess = g;
    state.simultaneousGuessSubmitted = true;
    if (state.timeControl.mode === "chess") {
      addIncrement(state, role);
    } 
    if (state.activeTimer === "both") {
        state.activeTimer = state.setter;   
        state.timeUsed[state.guesser] +=  Math.floor((Date.now() - state.roundStartTime) / 1000);
    }
  }

  // ---------------------------------------------
  // PROGRESS UPDATE
  // ---------------------------------------------
  io.to(roomId).emit("simulProgress", {
    secretSubmitted: state.simultaneousSecretSubmitted,
    guessSubmitted: state.simultaneousGuessSubmitted
  });

  // ---------------------------------------------
  // CHECK: Both submitted?
  // ---------------------------------------------
  const bothSubmitted =
    state.secret &&
    state.pendingGuess &&
    state.simultaneousSecretSubmitted &&
    state.simultaneousGuessSubmitted;

  if (!bothSubmitted) return;

  // BOTH ARE SUBMITTED → SCORE THE SIMULTANEOUS ROUND
  const guess = state.pendingGuess;
  const secret = state.secret;

  // Pre-score hooks
  powerEngine.preScore(state, guess);

  // Base scoring
  const fb = scoreGuess(secret, guess);

  // Perfect match? → End game immediately
  const isWin = fb.every(tile => tile === "🟩");
  if (isWin) {
    state.history.push({
      guess,
      fb,
      fbGuesser: [...fb],
      extraInfo: null,
      finalSecret: secret,
      roundIndex: state.history.length
    });

    state.pendingGuess = "";
    endGame(state, roomId, io, room);
    return;
  }

  // Build entry BEFORE postScore so powers can alter like in normal scoring
  const entry = {
    guess,
    fb,
    fbGuesser: [...fb],
    extraInfo: null,
    finalSecret: secret,
    roundIndex: state.history.length
  };

  // Post-score power effects
  powerEngine.postScore(state, entry, roomId, io);

  // Save history entry
  state.history.push(entry);

  // CLEAN UP
  state.pendingGuess = "";
  state.guessCount++;

  // ---------------------------------------------
  // TRANSITION TO NORMAL PHASE WITH GUESSER TURN
  // ---------------------------------------------
  state.phase = "normal";
  state.turn = state.guesser;       // ⭐ Important: skip setter decision step
  state.powerUsedThisTurn = false;
  if (state.timeControl.mode === "round") {
      resetRoundTimer(state);
    }
  state.activeTimer = state.guesser; 
  state.roundStartTime = Date.now();
  powerEngine.turnStart(state, state.guesser, roomId, io);

  emitStateForAllPlayers(roomId, room, io);
}

module.exports = handleSimultaneousPhase;
