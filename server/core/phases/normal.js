const { emitStateForAllPlayers } = require("../../utils/emitState");
const { emitLobbyEvent } = require("../../utils/emitLobby");
const { finalizeFeedback } = require("../stateFactory");
const { isValidWord } = require("../../game-engine/validation");
const { isConsistentWithHistory } = require("../../game-engine/history");
const FORCE_TIMER_INTERVALS = {};

function startForceTimer(roomId, room, state, io, context) {
  const deadline = Date.now() + 30000;

  state.powers.forceTimerActive = true;
  state.powers.forceTimerDeadline = deadline;
  state.powers.forceTimerExpiredFlag = false;

  io.to(roomId).emit("forceTimerStarted", { deadline });

  if (FORCE_TIMER_INTERVALS[roomId]) {
    clearInterval(FORCE_TIMER_INTERVALS[roomId]);
  }

  FORCE_TIMER_INTERVALS[roomId] = setInterval(() => {
    const remaining = deadline - Date.now();
    io.to(roomId).emit("forceTimerTick", { remaining });

    if (remaining <= 0) {
      clearInterval(FORCE_TIMER_INTERVALS[roomId]);
      delete FORCE_TIMER_INTERVALS[roomId];

      state.powers.forceTimerExpiredFlag = true;
      io.to(roomId).emit("forceTimerExpired");

      const handleNormalPhase = require("./normal");
      const autoAction = {
        type: "SET_SECRET_SAME",
        playerId: room[state.setter]
      };

      handleNormalPhase(
        room,
        state,
        autoAction,
        state.setter,
        roomId,
        context
      );
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
  delete state.powers.forceTimerExpiredFlag;
  delete state.powers.forceTimerArmed;
}

function normalizePowerId(type) {
  const raw = type.replace("USE_", "").toLowerCase();
  return raw.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

function handleNormalPhase(room, state, action, role, roomId, context) {
  const io = context.io;
  const { ALLOWED_GUESSES, powerEngine } = context;

  if (action.type === "NEW_MATCH") {
    const createInitialState = require("../stateFactory").createInitialState;
    const newState = createInitialState();
    Object.assign(state, newState);
    state.setter = "A";
    state.guesser = "B";
    state.ready = { A: false, B: false };
    state.phase = "lobby";

    emitLobbyEvent(io, roomId, { type: "showLobby" });
    emitStateForAllPlayers(roomId, room, io);
    return;
  }

  if (!state.pendingGuess &&
      action.type.startsWith("USE_") &&
      role === state.guesser) {

    const powerId = normalizePowerId(action.type);
    if (!state.powerUsedThisTurn) {
      state.powerUsedThisTurn = true;
      powerEngine.applyPower(powerId, state, action, roomId, io);
    }
    emitStateForAllPlayers(roomId, room, io);
    return;
  }

  if (!state.pendingGuess &&
      action.type === "SUBMIT_GUESS" &&
      role === state.guesser) {
    
    const g = action.guess.toLowerCase();
    if (!isValidWord(g, ALLOWED_GUESSES)) return;
    // If assassin word was set, check immediately on guess submission
    const assassin = state.powers.assassinWord;
    if (assassin && g.toUpperCase() === assassin.toUpperCase()) {
      
      // mark win entry (death)
      pushWinEntry(state, state.secret);
    
      // end immediately, skipping setter choice
      endGame(state, roomId, io, room);
      return;
    }

    if (g === state.secret) {
      state.currentSecret = state.secret;
      pushWinEntry(state, g);
      endGame(state, roomId, io, room);
      return;
    }
    state.pendingGuess = g;
    state.turn = state.setter;
    if (state.powers.forceTimerArmed) {
      startForceTimer(roomId, room, state, io, context);
    }
    state.powerUsedThisTurn = false;
    powerEngine.turnStart(state, state.turn, roomId, io);
    emitStateForAllPlayers(roomId, room, io);
    return;
  }
  if (state.pendingGuess && state.turn === state.setter) {
    if (state.powers.forceTimerActive &&
        state.powers.forceTimerDeadline &&
        state.powers.forceTimerExpiredFlag) {
      action = { type: "SET_SECRET_SAME", playerId: action.playerId };
    }
    if (action.type.startsWith("USE_") && role === state.setter) {
      const powerId = normalizePowerId(action.type);
      if (!state.powerUsedThisTurn) {
        state.powerUsedThisTurn = true;
        powerEngine.applyPower(powerId, state, action, roomId, io);
        emitStateForAllPlayers(roomId, room, io);
      }
      return;
    }

    if (action.type === "SET_SECRET_NEW") {
      if (powerEngine.beforeSetterSecretChange(state, action)) return;
      const w = action.secret.toLowerCase();
      if (!isValidWord(w, ALLOWED_GUESSES)) return;
      if (!isConsistentWithHistory(state.history, w, state)) {
        io.to(action.playerId).emit("errorMessage", "Secret inconsistent with history!");
        return;
      }
// Force setter to obey revealed green
if (state.powers.forcedGreens) {
  for (const pos in state.powers.forcedGreens) {
    const required = state.powers.forcedGreens[pos];
    if (w[pos].toUpperCase() !== required) {
      io.to(action.playerId).emit(
        "errorMessage",
        `Secret must contain ${required} in position ${parseInt(pos)+1}!`
      );
      return;
    }
  }
}


      state.secret = w;
      state.currentSecret = w;
      state.firstSecretSet = true;
      if (state.pendingGuess === w) {
        state.currentSecret = w;
        pushWinEntry(state, w);
        endGame(state, roomId, io, room);
        return;
      }
      finalizeFeedback(state, powerEngine, roomId, io);
      clearForceTimer(roomId, state);
      state.turn = state.guesser;
      state.powerUsedThisTurn = false;
      powerEngine.turnStart(state, state.guesser, roomId, io);
      emitStateForAllPlayers(roomId, room, io);
      return;
    }
    if (action.type === "SET_SECRET_SAME") {
      if (powerEngine.beforeSetterSecretChange(state, action)) return;
      const w = state.secret;
       if (!isConsistentWithHistory(state.history, w, state)) {
        io.to(action.playerId).emit("errorMessage", "Secret inconsistent with history!");
        return;
      }      
  // Force setter to obey revealed green
if (state.powers.forcedGreens) {
  for (const pos in state.powers.forcedGreens) {
    const required = state.powers.forcedGreens[pos];
    if (w[pos].toUpperCase() !== required) {
      io.to(action.playerId).emit(
        "errorMessage",
        `Secret must contain ${required} in position ${parseInt(pos)+1}!`
      );
      return;
    }
  }
}

      if (state.pendingGuess === state.secret) {
        state.currentSecret = state.secret;
        pushWinEntry(state, state.secret);
        endGame(state, roomId, io, room);
        return;
      }
      state.currentSecret = state.secret;
      state.firstSecretSet = true;
      finalizeFeedback(state, powerEngine, roomId, io);
      clearForceTimer(roomId, state);
      state.turn = state.guesser;
      powerEngine.turnStart(state, state.guesser, roomId, io);
      state.powerUsedThisTurn = false;
      emitStateForAllPlayers(roomId, room, io);
      return;
    }

    return;
  }

  if (action.type.startsWith("USE_")) {
    const powerId = normalizePowerId(action.type);
    if (state.powerUsedThisTurn) return;
    state.powerUsedThisTurn = true;
    powerEngine.applyPower(powerId, state, action, roomId, io);
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

function endGame(state, roomId, io, room) {
  state.phase = "gameOver";
  state.turn = null;
  state.gameOver = true;
  io.to(roomId).emit("animateTurn", { type: "guesserSubmitted" });
  emitStateForAllPlayers(roomId, room, io);
  emitLobbyEvent(io, roomId, { type: "gameOverShowMenu" });
}

module.exports = {
  handleNormalPhase,
  endGame,
  pushWinEntry
};
