const { endGame } = require("../phases/gameOver");
const { emitStateForAllPlayers } = require("../../utils/emitState");
const { finalizeFeedback } = require("../../game-engine/finalizeFeedback");
const { addIncrement, resetRoundTimer } = require("../../utils/Timer");
const { clearForceTimer, registerForceTimer } = require("../../utils/forceTimer");

function transitionAfterGuess({  room,  state,  guess,  roomId,  context,  io}) {
  const assassin = state.powers.assassinWord;
  // Assassin hit → game over
  if (assassin && guess === assassin.toUpperCase()) {
    state.powers.assassinWordassassinated = true;
    pushWinEntry(state, state.secret);
    io.to(roomId).emit("secretFound");
    endGame(state, roomId, io, room, context);
    return "gameOver";
  }
  // Correct guess → game over
  if (guess === state.secret) {
    state.currentSecret = state.secret;
    pushWinEntry(state, guess);
    io.to(roomId).emit("secretFound");
    endGame(state, roomId, io, room, context);
    return "gameOver";
  }
  // Otherwise → setter’s turn
  state.pendingGuess = guess;
  io.to(roomId).emit("guessSubmitted");
  clearRoundState(state, "guesser");  
  if (state.powers.forceTimerArmed) {
      startForceTimer(roomId, room, state, io, context);
  } 
  context.powerEngine.turnStart(state, state.turn, roomId, io);
  emitStateForAllPlayers(roomId, room, io);
  return "continue";
}

function transitionAfterSecret({  room,  state,  secret,  roomId,  context,  io}) {
  state.secret = secret;
  state.currentSecret = secret;
  state.firstSecretSet = true;
  if (state.pendingGuess === secret) {
    pushWinEntry(state, secret);
    io.to(roomId).emit("secretFound");
    endGame(state, roomId, io, room, context);
    return "gameOver";
  }
  io.to(roomId).emit("secretPlanted");
  clearForceTimer(roomId, state);
  finalizeFeedback(state, context.powerEngine, roomId, io);
  clearRoundState(state, "setter");
  context.powerEngine.turnStart(state, state.turn, roomId, io);
  emitStateForAllPlayers(roomId, room, io);
  return "continue";
}

/* ---------- helpers ---------- */

function advanceTimer(state, player) {
  if (state.timeControl.mode === "chess") {
    addIncrement(state, player);
  } else if (state.timeControl.mode === "round") {
    resetRoundTimer(state);
  }
}
const ROUND_SCOPED_ACTIVE_POWERS = new Set([
  "freezeActive", "stealthGuessActive", "confuseColorsActive","magicModeActive",  "countOnlyActive", "nonsenseActive", "rouletteSecretActive"
]);
function clearActivePowers(state) {
  if (!state?.powers || !Array.isArray(state.activePowers)) return;
  for (const power of state.activePowers) {
    const key = `${power}Active`;
    if (!(key in state.powers)) continue;
    if (ROUND_SCOPED_ACTIVE_POWERS.has(key)) continue;
    const val = state.powers[key];
    if (!val) continue;
    state.powers[key] = typeof val === "boolean" ? false : null;
  }
}

function clearRoundState(state, role) {
  clearActivePowers(state);
  if (role==="setter"){
    if (state.powers && state.powers.stealthGuessActive) {state.powers.stealthGuessActive = false;}
      if (state.powers && state.powers.magicModeActive) {state.powers.magicModeActive = false;}
      if (state.powers && state.powers.rouletteSecretActive) {state.powers.rouletteSecretActive = false;}  
      state.activeTimer = state.guesser;
      advanceTimer(state, state.setter);
      state.turn = state.guesser;
  }
  if (role==="guesser"){
    if (state.powers && state.powers.confuseColorsActive) {state.powers.confuseColorsActive = false;}
    if (state.powers && state.powers.countOnlyActive) {state.powers.countOnlyActive = false;}
    if (state.powers && state.powers.forceGuessOptions)  {state.powers.forceGuessOptions = null;}
    if (state.powers && state.powers.nonsenseActive)  {state.powers.nonsenseActive = false;}
    state.activeTimer = state.setter;
    advanceTimer(state, state.guesser);
    state.turn = state.setter;
  }
  state.powers.forceGuess = null;
  state.powerUsedThisTurn = false;
}

function startForceTimer(roomId, room, state, io, context, applyAction) {
  const durationMs = 30000;
  const deadline = Date.now() + durationMs;

  state.powers.forceTimerActive = true;
  state.powers.forceTimerDeadline = deadline;
  state.powers.forceTimerArmed = false;

  io.to(roomId).emit("forceTimerStarted", { deadline, durationMs });

  const interval = setInterval(() => {
    const remaining = deadline - Date.now();
    io.to(roomId).emit("forceTimerTick", { remaining });

    if (remaining <= 0) {
      clearInterval(interval);
      state.powerUsedThisTurn = false;

      applyAction(
        room,
        state,
        { type: "SET_SECRET_SAME", playerId: room[state.setter] },
        state.setter,
        roomId,
        context
      );

      io.to(roomId).emit("forceTimerExpired");
    }
  }, 250);

  registerForceTimer(roomId, interval);
}

function pushWinEntry(state, word) {
  state.history.push({
    guess: word,
    fb: ["🟩","🟩","🟩","🟩","🟩"],
    fbGuesser: ["🟩","🟩","🟩","🟩","🟩"],
    extraInfo: null,
    finalSecret: word
  });  
}

module.exports = {
  transitionAfterGuess,
  transitionAfterSecret
};
