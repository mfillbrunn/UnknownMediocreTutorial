// core/phases/normal.js

const { emitStateForAllPlayers } = require("../../utils/emitState");
const { emitLobbyEvent } = require("../../utils/emitLobby");
const { finalizeFeedback } = require("../stateFactory");
const { isValidWord, parseWordlist } = require("../../game-engine/validation");
const { isConsistentWithHistory } = require("../../game-engine/history");
const FORCE_TIMER_INTERVALS = {};

function startForceTimer(roomId, room, state, io, context) {
  const { ALLOWED_GUESSES, powerEngine } = context;
  const deadline = Date.now() + 30000;

  state.powers.forceTimerActive = true;
  state.powers.forceTimerDeadline = deadline;
  state.powers.forceTimerExpiredFlag = false;

  io.to(roomId).emit("forceTimerStarted", { deadline });

  // Clear old interval
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

      // ⭐ AUTO-RESOLVE SAME SECRET IMMEDIATELY
      const handleNormalPhase = require("./normal");  // correct path since already in core/phases/

      const autoAction = {
        type: "SET_SECRET_SAME",
        playerId: room[state.setter]  // setter's socket ID
      };

      handleNormalPhase(
        room,
        state,
        autoAction,
        state.setter,  // role
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



function normalizePowerId(actionType) {
  const raw = actionType.replace("USE_", "").toLowerCase();
  return raw.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

function handleNormalPhase(room, state, action, role, roomId, context) {
  const io = context.io;
  const { ALLOWED_GUESSES, powerEngine } = context;

  // Debug logging (optional)
  // console.log("[NORMAL PHASE]", { action, role, turn: state.turn, pendingGuess: state.pendingGuess });

  // =====================================================================================
  // SPECIAL CASE: NEW_MATCH
  // =====================================================================================
if (action.type === "NEW_MATCH") {
  const createInitialState = require("../stateFactory").createInitialState;
   const newState = createInitialState();
  Object.assign(state, newState);
    // Setter is always "A", guesser is always "B"
  state.setter = "A";
  state.guesser = "B";

  state.ready = { A: false, B: false };
  state.phase = "lobby";

  emitLobbyEvent(io, roomId, { type: "showLobby" });
  emitStateForAllPlayers(roomId, room, io);
  return;
}


  // =====================================================================================
  // CASE 1: GUESSER SUBMITS A GUESS (when no pendingGuess)
  // =====================================================================================
  if (
    !state.pendingGuess &&
    action.type.startsWith("USE_") &&
    role === state.guesser
  ) {
    const powerId = normalizePowerId(action.type);
    console.log("[DEBUG] Guesser power before guessing:", powerId);
    if (!state.powerUsedThisTurn) {
        state.powerUsedThisTurn = true;
        powerEngine.applyPower(powerId, state, action, roomId, io);
    }
    emitStateForAllPlayers(roomId, room, io);
    return;
}
  
  if (
    !state.pendingGuess &&
    action.type === "SUBMIT_GUESS" &&
    role === state.guesser
  ) {
    const g = action.guess.toLowerCase();
    if (!isValidWord(g, ALLOWED_GUESSES)) return;
    // Immediate win
    if (g === state.secret) {
      state.currentSecret = state.secret; 
      pushWinEntry(state, g);
      endGame(state, roomId, room, io);
      return;
    }

    // Otherwise → store guess, setter must decide SAME or NEW
    state.pendingGuess = g;
    state.turn = state.setter;
    if (state.powers.forceTimerArmed) {
        startForceTimer(roomId, room, state, io, context);
    }
    powerEngine.turnStart(state, state.turn);
    state.powerUsedThisTurn = false;
    
    emitStateForAllPlayers(roomId, room, io);
    return;
  }

  // =====================================================================================
  // CASE 2: SETTER DECISION STEP (pendingGuess exists)
  // =====================================================================================
  if (state.pendingGuess && state.turn === state.setter) {
    // -------------------------------------------
    // FORCE TIMER: auto-submit SAME secret
    // -------------------------------------------
    if (state.powers.forceTimerActive && state.powers.forceTimerDeadline) {
      // NEW: Use the explicit expired flag set by the server’s interval
      if (state.powers.forceTimerExpiredFlag) {
        console.log("FORCE TIMER EXPIRED — auto-submitting SAME secret");
        action = { type: "SET_SECRET_SAME", playerId: action.playerId };
      }
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
    // -------------------------------------------
    // SET_SECRET_NEW
    // -------------------------------------------
    if (action.type === "SET_SECRET_NEW") {
      // Power hook may block
      if (powerEngine.beforeSetterSecretChange(state, action)) return;
      const w = action.secret.toLowerCase();

      if (!isValidWord(w, ALLOWED_GUESSES)) return;
      if (!isConsistentWithHistory(state.history, w)) {
        io.to(action.playerId).emit("errorMessage", "Secret inconsistent with history!");
        return;
      }
      state.secret = w;
      state.currentSecret = w;
      state.firstSecretSet = true;
      // Instant win if SAME
      if (state.pendingGuess === w) {
        state.currentSecret = w;
        pushWinEntry(state, w);
        endGame(state, roomId, room, io);
        return;
      }

      // Otherwise score guess normally
      finalizeFeedback(state, powerEngine);
      clearForceTimer(roomId, state);
      state.turn = state.guesser;
      powerEngine.turnStart(state, state.turn);
      state.powerUsedThisTurn = false;
      
      emitStateForAllPlayers(roomId, room, io);
      return;
    }
   // -------------------------------------------
    // SET_SECRET_SAME
    // -------------------------------------------
    if (action.type === "SET_SECRET_SAME") {
      if (powerEngine.beforeSetterSecretChange(state, action)) return;
      if (!isConsistentWithHistory(state.history, state.secret)) return;
      // Instant win
      if (state.pendingGuess === state.secret) {
        state.currentSecret = state.secret;   
        pushWinEntry(state, state.secret);
        endGame(state, roomId, room, io);
        return;
      }

      // Score guess
       state.currentSecret = state.secret; 
      state.firstSecretSet = true;
      finalizeFeedback(state, powerEngine);
      clearForceTimer(roomId, state);
      state.turn = state.guesser;
      powerEngine.turnStart(state, state.turn);
      state.powerUsedThisTurn = false;
      
      emitStateForAllPlayers(roomId, room, io);
      return;

    }
    return; // setter turn but action not for setter
  }

  // =====================================================================================
  // CASE 3: POWERS
  // =====================================================================================
  if (action.type.startsWith("USE_")) {
   const powerId = normalizePowerId(action.type);

    if (state.powerUsedThisTurn) return;

    state.powerUsedThisTurn = true;
    powerEngine.applyPower(powerId, state, action, roomId, io);

    emitStateForAllPlayers(roomId, room, io);
    return;
  }

  // =====================================================================================
  // Otherwise ignore the action
  // =====================================================================================
}

// ============================================================================
// HELPERS
// ============================================================================

function pushWinEntry(state, word) {
  state.history.push({
    guess: word,
    fb: ["🟩", "🟩", "🟩", "🟩", "🟩"],
    fbGuesser: ["🟩", "🟩", "🟩", "🟩", "🟩"],
    extraInfo: null,
    finalSecret: word
  });
}

function endGame(state, roomId, room, io) {
  state.phase = "gameOver";
  state.turn = null;
  state.gameOver = true;

  io.to(roomId).emit("animateTurn", { type: "guesserSubmitted" });
  emitStateForAllPlayers(roomId, room, io);
  require("../../utils/emitLobby").emitLobbyEvent(io, roomId, {
    type: "gameOverShowMenu"
  });
}

module.exports = handleNormalPhase;
