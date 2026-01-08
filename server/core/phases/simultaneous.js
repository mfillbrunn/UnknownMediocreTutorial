const { emitStateForAllPlayers } = require("../../utils/emitState");
const { scoreGuess } = require("../../game-engine/scoring");
const { endGame } = require("./gameOver");
const { addIncrement,resetRoundTimer, stopTimer } = require("../../utils/chessTimer");
const { startGameTimer } = require("./normal");

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
    state.currentSecret = w;
    state.firstSecretSet = true;
    state.simultaneousSecretSubmitted = true;
    if (state.timeControl.mode === "chess") {addIncrement(state, state.setter);} 
    if (state.activeTimer === "both") {state.activeTimer = state.guesser;}
    state.timeUsed[state.setter] +=  Math.floor((Date.now() - state.roundStartTime) / 1000);
  }
  // ---------------------------------------------
  // GUESSER submits initial guess
  // ---------------------------------------------
  if (action.type === "SUBMIT_GUESS" && role === state.guesser) {
    if (state.simultaneousGuessSubmitted) return;
    const g = action.guess.toLowerCase();
    if (!isValidWord(g, ALLOWED_GUESSES)) return;
    state.pendingGuess = g;
    state.guessCount=state.guessCount + 1;
    state.simultaneousGuessSubmitted = true;
    if (state.timeControl.mode === "chess") {addIncrement(state, state.guesser);} 
    if (state.activeTimer === "both") {state.activeTimer = state.setter;}
    state.timeUsed[state.guesser] +=  Math.floor((Date.now() - state.roundStartTime) / 1000);
  }
  io.to(roomId).emit("simulProgress", {secretSubmitted: state.simultaneousSecretSubmitted, guessSubmitted: state.simultaneousGuessSubmitted});
  // ---------------------------------------------
  // CHECK: Both submitted?
  // ---------------------------------------------
  const bothSubmitted = state.secret && state.pendingGuess && state.simultaneousSecretSubmitted && state.simultaneousGuessSubmitted;
  if (!bothSubmitted) return;
  // Pre-score hooks
  powerEngine.preScore(state, state.pendingGuess);
  // Base scoring
  const fb = scoreGuess(state.secret, state.pendingGuess);  
  const entry = {
    guess: state.pendingGuess,
    fb,
    fbGuesser: [...fb],
    extraInfo: null,
    finalSecret: state.secret,
    roundIndex: state.history.length
  };
  state.pendingGuess = "";
  const isWin = fb.every(tile => tile === "🟩");
    if (isWin) {
    state.history.push(entry);
    endGame(state, roomId, io, room);
    return;
  }
  powerEngine.postScore(state, entry, roomId, io);
  state.history.push(entry);
  // ---------------------------------------------
  // TRANSITION TO NORMAL PHASE WITH GUESSER TURN
  // ---------------------------------------------
  state.phase = "normal";
  state.turn = state.guesser;
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
