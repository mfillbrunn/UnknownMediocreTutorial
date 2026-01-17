// core/phases/gameOver.js

const { emitStateForAllPlayers } = require("../../utils/emitState");
const { emitLobbyEvent } = require("../../utils/emitLobby");
const { createInitialState } = require("../stateFactory");
const resetRoundState = require("../../utils/resetRoundState");
const {resetRoundTimer,stopTimer, startTimer} = require("../../utils/chessTimer");
const {applyRankedElo} = require("../../utils/elo");
const {  computeMatchResult, writeMatchHistory} =  require("../../utils/writeMatchData");

function endGame(state, roomId, io, room, context) {
   const { supabase } = context; 
   if (state.timeControl?.enabled) {
      stopTimer(roomId);
      state.isTimerRunning = false;
   } 
   state.matchRounds = state.matchRounds || []; 
   if (state.powers.assassinated) {state.guessCount = state.guessCount + state.powers.assassinPoints;} 
   state.matchRounds.push({setter: state.setter, guesser: state.guesser, guessCount: state.guessCount,
       time: { A: state.timeUsed.A, B: state.timeUsed.B,}, timeoutLoser: state.timeoutLoser || null,
    history: state.history.map(x => ({ ...x })),
    powers: state.activePowers.map(x => ({ ...x })),
  });
    const res = state.mode?.onRoundEnd?.(state) || { view: "match", canNextRound: false };
   state.turn = null;
   state.gameOver = true; 
   state.phase = "gameOver";
   state.gameOverView = res.view || "match"; 
   state.canNextRound = !!res.canNextRound;
   const isAIMatch = Object.values(room.players).some(p => p.isAI);
   if (!isAIMatch) {
      if (!state.canNextRound) {
           const {winner,tie} = computeMatchResult(state, null);
          if (state.ranked) {
            applyRankedElo({ state, room, supabase,winner,tie })
              .then(ratingChange => {return writeMatchHistory({state,room,supabase,ratingChange});})
              .catch(err => console.error("Ranked match persistence failed:", err));
          }else {
             writeMatchHistory({ state, room, supabase })
            .catch(err => console.error("Match history write failed:", err));
           }
          emitLobbyEvent(io, roomId, { type: "gameOverShowMenu" });
          io.to(roomId).emit("animateTurn", { type: "guesserSubmitted" });
          emitStateForAllPlayers(roomId, room, io)
      }
   }
}

function handleGameOverPhase(room, state, action, role, roomId, context) {
  const io = context.io;
   ///NEXT ROUND
  if (action.type === "NEXT_ROUND") {
    if (!state.canNextRound || state.gameOverView !== "round") {return;}
     const res = state.mode?.onNextRound?.(state) || {phase: "simultaneous",resetRound: true};
     resetRoundState(room, state, roomId, context);
     state.phase = res.phase || "simultaneous";  
     state.gameOver = false;
     state.gameOverView = "match";
     state.canNextRound = false;   
     emitLobbyEvent(io, roomId, { type: "hideLobby" });
     emitStateForAllPlayers(roomId, room, io);
    return;
  }  
  ///NEW MATCH
if (action.type === "NEW_MATCH") {
  const names = state.playerNames;
  const fresh = createInitialState();
   for (const key of Object.keys(state)) {
     delete state[key];
   }
  Object.assign(state, fresh);
  state.phase = "lobby";
  state.ready = {};
  state.playerNames= names;
  // Re-sync roles with room.players
  for (const [playerId, player] of Object.entries(room.players)) {
    state.roles[playerId] = player.role;
  }
  state.setter = "A";
  state.guesser = "B";
  emitStateForAllPlayers(roomId, room, io);
  return;
}

function hasAIPlayer(room) {
  return Object.values(room.players).some(p => p.isAI);
}

  return;
}

module.exports = {handleGameOverPhase, endGame};
