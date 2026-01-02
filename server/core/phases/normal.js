const { emitStateForAllPlayers } = require("../../utils/emitState");
const { emitLobbyEvent } = require("../../utils/emitLobby");
const { finalizeFeedback } = require("../../game-engine/finalizeFeedback");
const { isValidWord } = require("../../game-engine/validation");
const { isConsistentWithHistory } = require("../../game-engine/history");
const { addIncrement, resetRoundTimer, startTimer} = require("../../utils/chessTimer");
const { endGame } = require("./gameOver");
const FORCE_TIMER_INTERVALS = {};

function handleNormalPhase(room, state, action, role, roomId, context) {
  const io = context.io;
  const { ALLOWED_GUESSES, powerEngine } = context;

 if (action.type === "CONFIRM_FORCE_GUESS" && role === state.setter) {
  const opts = state.powers.forcedGuessOptions;
  if (!opts) return;
  const chosen = opts.find(o => o.type === action.mode);
  if (!chosen) return;
  state.powers.forcedGuess = chosen;
  state.powers.forcedGuessOptions = null;
  emitStateForAllPlayers(roomId, room, io);
  return;
}
  /// POWERs
  if (action.type.startsWith("USE_")) {
    const powerId = normalizePowerId(action.type);
    if (!state.powerUsedThisTurn) {
      state.powerUsedThisTurn = true;
      powerEngine.applyPower(powerId, state, action, roomId, io);
    }
    emitStateForAllPlayers(roomId, room, io);
    return;
  }
  ///
  /// GUESSER SUBMIT
  ///
  if (!state.pendingGuess && action.type === "SUBMIT_GUESS" && role === state.guesser) {
          const g = action.guess.toLowerCase();    
          state.countGuess+=1;
          // If assassin word was set, check immediately on guess submission
      const assassin = state.powers.assassinWord;
      if (assassin && g.toUpperCase() === assassin.toUpperCase()) {
        // mark win entry (death)
        pushWinEntry(state, state.secret);
        // end immediately, skipping setter choice
        endGame(state, roomId, io, room);
        if (state.powers.blindGuessActive) { state.powers.blindGuessActive = false;}
          state.powers.forcedGuess = null;
        return;
      }
    
    state.timeUsed[state.guesser] +=  Math.floor((Date.now() - state.roundStartTime) / 1000);
    state.roundStartTime = Date.now();
    
    if (g === state.secret) {
      state.currentSecret = state.secret;
      pushWinEntry(state, g);
      endGame(state, roomId, io, room);
      if (state.powers.blindGuessActive) { state.powers.blindGuessActive = false;}
      state.powers.forcedGuess = null;
      return;
    }
    state.pendingGuess = g;
    if (state.powers.blindGuessActive) { state.powers.blindGuessActive = false;}
    state.activeTimer = state.setter;
    if (state.timeControl.mode === "chess") {
      addIncrement(state, state.guesser);
      } else if (state.timeControl.mode === "round") {
      resetRoundTimer(state);
    }
    state.turn = state.setter;
    state.powers.forcedGuess = null;
    if (state.powers.forceTimerArmed) {
      startForceTimer(roomId, room, state, io, context);
    }
    state.powerUsedThisTurn = false;
    powerEngine.turnStart(state, state.turn, roomId, io);
    emitStateForAllPlayers(roomId, room, io);
    return;
  }

  /// SETTER
if (state.pendingGuess && state.turn === state.setter && (action.type === "SET_SECRET_NEW" || action.type === "SET_SECRET_SAME") ) {
    let w = null;
    if (action.type === "SET_SECRET_NEW") {
       w = action.secret.toLowerCase();
    } else if (action.type === "SET_SECRET_SAME"){
       w = state.secret;
    }
    if (powerEngine.beforeSetterSecretChange(state, action)) return;
    if (state.powers.assassinWord && w.toUpperCase() === state.powers.assassinWord.toUpperCase()) {
      io.to(action.playerId).emit("errorMessage", "Secret cannot match assassin word!");
      return;
    }
      state.secret = w;
      state.currentSecret = w;
      state.firstSecretSet = true;
      state.timeUsed[state.setter] +=  Math.floor((Date.now() - state.roundStartTime) / 1000);
      state.roundStartTime = Date.now();
      if (state.pendingGuess === w) {
        pushWinEntry(state, w);
        endGame(state, roomId, io, room);
        return;
      }
      clearForceTimer(roomId, state);
      finalizeFeedback(state, powerEngine, roomId, io);
      if (state.timeControl.mode === "chess") {
        addIncrement(state, state.setter);
      } else if (state.timeControl.mode === "round") {
        resetRoundTimer(state);
      }
      state.turn = state.guesser;
      state.powerUsedThisTurn = false;  
      powerEngine.turnStart(state, state.guesser, roomId, io);
      state.activeTimer = state.guesser;
      emitStateForAllPlayers(roomId, room, io);
      return;
    }
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

function handleRoundTimeout(room, state, roomId, role, context) {
  const io = context.io;

  // Simultaneous → immediate loss
  if (state.phase === "simultaneous") {
    state.timeoutLoser = role;
    endGame(state, roomId, io, room);
    return false;
  }

  state.roundTimeouts[role]++;

  const last = state.history.at(-1);

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
    return false;
  }

  return true;
}

function startGameTimer(room, state, roomId, context) {
  const io = context.io;

  startTimer(roomId, state, io, timedOutRole => {
    if (state.timeControl.mode === "chess") {
      state.timeoutLoser = timedOutRole;
      endGame(state, roomId, io, room);
      return;
    }

    const shouldContinue =
      handleRoundTimeout(room, state, roomId, timedOutRole, context);

    if (shouldContinue) {
      startGameTimer(room, state, roomId, context);
    }
  });
}

function normalizePowerId(type) {
  const raw = type.replace("USE_", "").toLowerCase();
  return raw.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

function startForceTimer(roomId, room, state, io, context) {
  const durationMs = 30000;
  const deadline = Date.now() + durationMs;
  
  state.powers.forceTimerActive = true;
  state.powers.forceTimerDeadline = deadline;
  state.powers.forceTimerArmed = false;
  
  io.to(roomId).emit("forceTimerStarted", {
  deadline,
  durationMs
});

  if (FORCE_TIMER_INTERVALS[roomId]) {
    clearInterval(FORCE_TIMER_INTERVALS[roomId]);
  }

  FORCE_TIMER_INTERVALS[roomId] = setInterval(() => {
    const remaining = deadline - Date.now();
    io.to(roomId).emit("forceTimerTick", { remaining });

    if (remaining <= 0) {
      clearInterval(FORCE_TIMER_INTERVALS[roomId]);
      delete FORCE_TIMER_INTERVALS[roomId];
    state.powerUsedThisTurn = false;
      handleNormalPhase(
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
}


function clearForceTimer(roomId, state) {
  if (FORCE_TIMER_INTERVALS[roomId]) {
    clearInterval(FORCE_TIMER_INTERVALS[roomId]);
    delete FORCE_TIMER_INTERVALS[roomId];
  }

  delete state.powers.forceTimerActive;
  delete state.powers.forceTimerDeadline;
  delete state.powers.forceTimerArmed;
}

module.exports = {
  handleNormalPhase,
  pushWinEntry,
  handleRoundTimeout,
  startGameTimer
};
