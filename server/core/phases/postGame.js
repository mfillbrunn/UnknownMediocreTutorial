// core/phases/postGame.js

const { emitStateForAllPlayers } = require("../../utils/emitState");
const { emitLobbyEvent } = require("../../utils/emitLobby");
const { createInitialState } = require("../stateFactory");
const resetRoundState = require("../../utils/resetRoundState");
const { startGameTimer } = require("../timeouts/timeoutController");;

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
          const prevState = state;        
          const freshState = createInitialState();
          freshState.phase = "lobby";
          freshState.ready = {};
          freshState.hostUserId = prevState.hostUserId;        
          // Rebuild playerNames using *current* sockets only
          freshState.playerNames = {};
          freshState.roles = {};        
          for (const [socketId, player] of Object.entries(room.players)) {
            // Preserve role from room.players (authoritative)
            freshState.roles[socketId] = player.role;        
            // Preserve name by userId if possible
            const oldSocketId =
              room.currentSocketByUserId?.[player.userId];        
            if (oldSocketId && prevState.playerNames?.[oldSocketId]) {
              freshState.playerNames[socketId] =
                prevState.playerNames[oldSocketId];
            }
          }        
          freshState.setter = "A";
          freshState.guesser = "B";        
          room.state = freshState;        
          // Rebuild authoritative socket map
          room.currentSocketByUserId = {};
          for (const [sid, p] of Object.entries(room.players)) {
            if (p?.userId) {
              room.currentSocketByUserId[p.userId] = sid;
            }
          }        
          emitLobbyEvent(io, roomId, { type: "enterLobby" });
          emitStateForAllPlayers(roomId, room, io);
          return;
        }

  return;
}


module.exports = {handleGameOverPhase};
