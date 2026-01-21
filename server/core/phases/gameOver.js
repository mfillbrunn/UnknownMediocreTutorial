// core/phases/gameOver.js

const { emitStateForAllPlayers } = require("../../utils/emitState");
const { emitLobbyEvent } = require("../../utils/emitLobby");
const {stopTimer} = require("../../utils/Timer");
const {applyRankedElo} = require("../../utils/elo");
const {  computeMatchResult, writeMatchHistory} =  require("../../utils/writeMatchData");
const resetRoundState = require("../../utils/resetRoundState");
const { createInitialState } = require("../stateFactory");

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
      }
   }
//Clean up the room
   const res = state.mode?.onRoundEnd?.(state) || { view: "match", canNextRound: false };
   state.turn = null;
   state.gameOver = true; 
   state.phase = "gameOver";
   state.gameOverView = res.view || "match"; 
   state.canNextRound = !!res.canNextRound;
   // Next Round
   if (state.canNextRound){
      let saved;
       if (state.activePowers.includes("revealLetter")) {
            saved = state.powers.revealLetter.mode;
        }    
       resetRoundState(room, state, roomId, context);
       if (state.activePowers.includes("revealLetter")) {
            state.powers.revealLetter.mode = saved;
        }
   }
   //Match is over
    if (!state.canNextRound){
      const names = state.playerNames;
      const fresh = createInitialState();
      for (const key of Object.keys(state)) {
          delete state[key];
      }
      Object.assign(state, fresh);
      state.playerNames= names;
      for (const [playerId, player] of Object.entries(room.players)) {
        state.roles[playerId] = player.role;
      }
      state.setter = "A";
      state.guesser = "B";
    }
   emitStateForAllPlayers(roomId, room, io);
}

module.exports = {endGame};
