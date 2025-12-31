// core/phases/gameOver.js

const { emitStateForAllPlayers } = require("../../utils/emitState");
const { emitLobbyEvent } = require("../../utils/emitLobby");
const { createInitialState } = require("../stateFactory");
const resetRoundState = require("../../utils/resetRoundState");
const {resetRoundTimer,stopTimer} = require("../../utils/chessTimer");
const {startGameTimer} = require("../../utils/startGameTimer");

function endGame(state, roomId, io, room) {
   state.turn = null;
   state.gameOver = true;
   resetRoundTimer(state);
   state.matchRounds = state.matchRounds || []; 
   state.matchRounds.push({
    setter: state.setter,
    guesser: state.guesser,
    guessCount: state.guessCount,
       time: {
    A: state.timeUsed.A,
    B: state.timeUsed.B,
       },
         timeoutLoser: state.timeoutLoser || null,
    history: JSON.parse(JSON.stringify(state.history)),
    powers: JSON.parse(JSON.stringify(state.activePowers || [])),
  });
    const res = state.mode?.onRoundEnd?.(state) || { view: "match", canNextRound: false };
    state.phase = "gameOver";
    state.gameOverView = res.view || "match"; 
    state.canNextRound = !!res.canNextRound;
    emitLobbyEvent(io, roomId, { type: "gameOverShowMenu" });
    io.to(roomId).emit("animateTurn", { type: "guesserSubmitted" });
    emitStateForAllPlayers(roomId, room, io)
}

function handleGameOverPhase(room, state, action, role, roomId, context) {
  const io = context.io;
  if (state.timeControl.enabled) {stopTimer(roomId);} 
  // --------------------------------------------------------------------
  // The only valid action in gameOver is NEW_MATCH
  // --------------------------------------------------------------------
  
  if (action.type === "NEXT_ROUND") {
    if (!state.canNextRound || state.gameOverView !== "round") {
      return; // ignore if not allowed
    }

    // Let the mode decide role swapping, power persistence, next phase, etc.
    // Expected return shape:
    // { phase: "simultaneous"|"normal", resetRound: true|false }
    const res = state.mode?.onNextRound?.(state) || {
      phase: "simultaneous",
      resetRound: true
    };

    if (res.resetRound) {
      resetRoundState(state);
    }

    state.gameOver = false;
    state.gameOverView = "match";
    state.canNextRound = false;
    state.phase = res.phase || "simultaneous";
    state.turn = null;
    if (state.timeControl.enabled) {
      state.activeTimer = "both";
      resetRoundTimer(state);
      startGameTimer(room, state, roomId, context);
    }
    emitLobbyEvent(io, roomId, { type: "hideLobby" });
    emitStateForAllPlayers(roomId, room, io);
    return;
  }  
  if (action.type === "NEW_MATCH") {
     const fresh = createInitialState();
  Object.assign(state, fresh);
  
  // Assign setter/guesser based on current room.players roles (A/B)
  state.setter = "A";
  state.guesser = "B";


    // Re-enter lobby
    state.phase = "lobby";
    state.ready = { A: false, B: false };   
    
    if (state.timeControl.enabled) {
      state.activeTimer = "both";
      resetRoundTimer(state);
      startGameTimer(room, state, roomId, context);
      state.roundStartTime = Date.now();
    }
    emitLobbyEvent(io, roomId, { type: "showLobby" });
    emitStateForAllPlayers(roomId, room, io);
    return;
  }

  // --------------------------------------------------------------------
  // All other actions are ignored during gameOver
  // --------------------------------------------------------------------
  return;
}

module.exports = handleGameOverPhase;
