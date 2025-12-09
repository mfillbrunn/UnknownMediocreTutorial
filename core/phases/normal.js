// core/phases/normal.js

const { emitStateForAllPlayers } = require("../../utils/safeState");
const { emitLobbyEvent } = require("../../utils/emitLobby");
const { finalizeFeedback } = require("../stateFactory");
const { isValidWord, parseWordlist } = require("../../game-engine/validation");
const { isConsistentWithHistory } = require("../../game-engine/history");

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

    // Preserve roles
    const oldSetter = state.setter;
    const oldGuesser = state.guesser;

    const newState = createInitialState();
    Object.assign(state, newState);

    state.setter = oldSetter;
    state.guesser = oldGuesser;
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
    action.type === "SUBMIT_GUESS" &&
    role === state.guesser
  ) {
    const g = action.guess.toLowerCase();
    if (!isValidWord(g, ALLOWED_GUESSES)) return;

    // Immediate win
    if (g === state.secret) {
      pushWinEntry(state, g);
      endGame(state, roomId, room, io);
      return;
    }

    // Otherwise → store guess, setter must decide SAME or NEW
    state.pendingGuess = g;
    state.turn = state.setter;
    state.powerUsedThisTurn = false;

    emitStateForAllPlayers(roomId, room, io);
    return;
  }

  // =====================================================================================
  // CASE 2: SETTER DECISION STEP (pendingGuess exists)
  // =====================================================================================
  if (state.pendingGuess && state.turn === state.setter) {
    // -------------------------------------------
    // SET_SECRET_NEW
    // -------------------------------------------
    if (action.type === "SET_SECRET_NEW") {
      // Power hook may block
      if (powerEngine.beforeSetterSecretChange(state, action)) return;

      const w = action.secret.toLowerCase();

      if (!isValidWord(w, ALLOWED_GUESSES)) return;
      if (!isConsistentWithHistory(state.history, w)) return;

      state.secret = w;

      // Instant win if SAME
      if (state.pendingGuess === w) {
        pushWinEntry(state, w);
        endGame(state, roomId, room, io);
        return;
      }

      // Otherwise score guess normally
      finalizeFeedback(state, powerEngine);

      state.turn = state.guesser;
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
        pushWinEntry(state, state.secret);
        endGame(state, roomId, room, io);
        return;
      }

      // Score guess
      finalizeFeedback(state, powerEngine);

      // Next turn
      state.turn = state.guesser;
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
    const powerId = action.type.replace("USE_", "").toLowerCase();
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
