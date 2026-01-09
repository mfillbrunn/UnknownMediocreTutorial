// core/phases/gameOver.js

const { emitStateForAllPlayers } = require("../../utils/emitState");
const { emitLobbyEvent } = require("../../utils/emitLobby");
const { createInitialState } = require("../stateFactory");
const resetRoundState = require("../../utils/resetRoundState");
const {resetRoundTimer,stopTimer, startTimer} = require("../../utils/chessTimer");
const {applyRankedElo} = require("../../utils/elo");

function endGame(state, roomId, io, room) {
   state.turn = null;
   state.gameOver = true;
   if (state.timeControl.enabled) {
      stopTimer(roomId);
      state.isTimerRunning = false;
   } 
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
    if (!state.canNextRound && state.ranked === true){
      await applyRankedElo({ state, room, supabase });
   }   
    emitLobbyEvent(io, roomId, { type: "gameOverShowMenu" });
    io.to(roomId).emit("animateTurn", { type: "guesserSubmitted" });
    emitStateForAllPlayers(roomId, room, io)
}

function handleGameOverPhase(room, state, action, role, roomId, context) {
  const io = context.io;
   ///NEXT ROUND
  if (action.type === "NEXT_ROUND") {
    if (!state.canNextRound || state.gameOverView !== "round") {return;}
    const res = state.mode?.onNextRound?.(state) || {phase: "simultaneous",resetRound: true};
    if (res.resetRound) {
      resetRoundState(state);
    }
   if (state.timeControl.enabled && !state.isTimerRunning) {
        resetRoundTimer(state);
        state.activeTimer = "both";
        state.roundStartTime = Date.now();
        stopTimer(roomId);
        startGameTimerSim(room, state, roomId, context)
        state.isTimerRunning=true;
      }
    state.gameOver = false;
    state.gameOverView = "match";
    state.canNextRound = false;
    state.phase = res.phase || "simultaneous";
    state.turn = null;
    emitLobbyEvent(io, roomId, { type: "hideLobby" });
    emitStateForAllPlayers(roomId, room, io);
    return;
  }  
        ///NEW MATCH
      if (action.type === "NEW_MATCH") {
        names = state.playerNames;
        const fresh = createInitialState();
        Object.assign(state, fresh);
        state.setter = "A";
        state.guesser = "B";
        state.phase = "lobby";
        state.ready = {};
         state.playerNames= names;
        // Re-sync roles with room.players
        for (const [playerId, role] of Object.entries(room.players)) {
          state.roles[playerId] = role;
        }
        emitStateForAllPlayers(roomId, room, io);
        return;
      }

  return;
}

function startGameTimerSim(room, state, roomId, context) {
  const io = context.io;
  startTimer(roomId, state, io, timedOutRole => {
      state.timeoutLoser = timedOutRole;
      endGame(state, roomId, io, room);
      return;
  });
}




module.exports = {handleGameOverPhase, endGame};


