// core/phases/gameOver.js

const { emitStateForAllPlayers } = require("../../utils/emitState");
const { emitLobbyEvent } = require("../../utils/emitLobby");
const {stopTimer} = require("../../utils/Timer");
const {applyRankedElo} = require("../../utils/elo");
const {  computeMatchResult, writeMatchHistory} =  require("../../utils/writeMatchData");
const { computeRemainingAfterIndexFromState } = require("../../utils/remainingWords");

function buildArchivedRoundHistory(state, allowedSecrets) {
  const history = Array.isArray(state.history) ? state.history : [];
  return history.map((entry, idx) => {
    const cloned = { ...entry };
    const isFinal = idx === history.length - 1;
    let remainingAfter = 0;
    if (state.timeoutLoser) {remainingAfter = "—";
    } else if (isFinal) {remainingAfter = 0;
    } else {
      const tempState = {...state, history: history.slice(0, idx + 1)};
      remainingAfter = computeRemainingAfterIndexFromState(idx,tempState,allowedSecrets);
    }
    return {...cloned, remainingAfter};
  });
}

function endGame(state, roomId, io, room, context) {
   const { supabase } = context; 
   if (state.timeControl?.enabled) {
      stopTimer(roomId);
      state.isTimerRunning = false;
   } 
   state.matchRounds = state.matchRounds || []; 
   if (state.powers.assassinWordassassinated) {state.guessCount = state.guessCount + state.powers.assassinPoints;} 
   if (state.powers.revealPenaltyUsed) {
      const n = state.secret.split("").filter(c => c === state.powers.revealPenaltyLetter).length;
      let penalty = 0;
      if (n === 1) penalty = 2;
      else if (n === 2) penalty = 4;
      else if (n >= 3) penalty = 6;
      state.guessCount += penalty;
   }
   state.matchRounds.push({setter: state.setter, guesser: state.guesser, guessCount: state.guessCount,
       time: { A: state.timeUsed.A, B: state.timeUsed.B,}, timeoutLoser: state.timeoutLoser || null,
    history: buildArchivedRoundHistory(state, context.ALLOWED_SECRETS),
    powers: state.activePowers.map(x => ({ ...x })),
  });
    const res = state.mode?.onRoundEnd?.(state) || { view: "match", canNextRound: false };
   state.turn = null;
   state.gameOver = true; 
   state.phase = "gameOver";
   state.gameOverView = res.view || "match"; 
   state.canNextRound = !!res.canNextRound;
   const isAIMatch = Object.values(room.playersByUserId).some(p => p.isAI);
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
   emitStateForAllPlayers(roomId, room, io);
}

module.exports = {endGame};
