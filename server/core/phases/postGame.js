// core/phases/postGame.js

const { emitStateForAllPlayers } = require("../../utils/emitState");
const { emitLobbyEvent } = require("../../utils/emitLobby");
const {startGameTimer} = require("./normal");


function handleGameOverPhase(room, state, action, role, roomId, context) {
    const io = context.io;
     ///NEXT ROUND
    if (action.type === "NEXT_ROUND") {
      if (!state.canNextRound) {return;}
       const res = state.mode?.onNextRound?.(state) || {phase: "simultaneous",resetRound: true};
       state.phase = res.phase || "simultaneous";  
       state.gameOver = false;
       state.canNextRound = false;   
       if (state.timeControl?.enabled){
           state.paused = false;
           state.isTimerRunning = false;
           state.roundStartTime = Date.now();
           startGameTimer(room, state, roomId, context);
       }
       emitLobbyEvent(io, roomId, { type: "hideLobby" });
       emitStateForAllPlayers(roomId, room, io);
      return;
    }  
      ///NEW MATCH
    if (action.type === "NEW_MATCH") {
      state.phase = "lobby";
      state.ready = {};
      emitLobbyEvent(io, roomId, { type: "enterLobby" });  
      emitStateForAllPlayers(roomId, room, io);
      return;
    }
  return;
}


module.exports = {handleGameOverPhase};
