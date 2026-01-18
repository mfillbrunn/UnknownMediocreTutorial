// core/phases/postGame.js

const { emitStateForAllPlayers } = require("../../utils/emitState");
const { emitLobbyEvent } = require("../../utils/emitLobby");
const { createInitialState } = require("../stateFactory");
const resetRoundState = require("../../utils/resetRoundState");
const {startTimer} = require("../../utils/Timer");
const { endGame } = require("./gameOver");

function handleGameOverPhase(room, state, action, role, roomId, context) {
    const io = context.io;
     ///NEXT ROUND
    if (action.type === "NEXT_ROUND") {
      if (!state.canNextRound || state.gameOverView !== "round") {return;}
       const res = state.mode?.onNextRound?.(state) || {phase: "simultaneous",resetRound: true};
        //powers not to reset across rounds
       let saved;
       if (state.activePowers.includes("revealLetter")) {
            saved = state.powers.revealLetter.mode;
        }    
       resetRoundState(room, state, roomId, context);
       if (state.activePowers.includes("revealLetter")) {
            state.powers.revealLetter.mode = saved;
        }    
       state.phase = res.phase || "simultaneous";  
       state.gameOver = false;
       state.gameOverView = "match";
       state.canNextRound = false;   
       if (state.timeControl?.enabled){startGameTimerSim(room, state, roomId, context);}
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
  return;
}


module.exports = {handleGameOverPhase};
