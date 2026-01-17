// core/phases/lobby.js

const { emitLobbyEvent, emitToPlayer,  emitToOtherPlayer } = require("../../utils/emitLobby");
const { emitStateForAllPlayers } = require("../../utils/emitState");
const CompetitiveMode = require("../modes/competitiveMode");
const { stopTimer,startTimer,resetRoundTimer } = require("../../utils/chessTimer");
const {handleRoundTimeout, startGameTimer} = require("./normal");

const SETTER_POWERS = [
        "hideTile",
        "suggestSecret",
        "confuseColors",
        "countOnly",
        "blindSpot",
        "vowelRefresh",
        "assassinWord",
        "forceGuess",
        "blindGuess",
      ];
      
      const GUESSER_POWERS = [
        "suggestGuess",
        "forceTimer",
        "revealHistory",
        "stealthGuess",
        "revealGreen",
        "freezeSecret",
        "magicMode",
        "revealLetter",
              "nonsense",
      ];
function handleLobbyPhase(room, state, action, role, roomId, context) {
  const io = context.io;
if (action.type === "PLAYER_JOINED") {
  if (action.name) {
    state.playerNames[action.playerId] = String(action.name).trim().slice(0, 16);
  }
  emitStateForAllPlayers(roomId, room, io);
 emitLobbyEvent(io, roomId, { type: "playerJoined" });
  return;
}
if (action.type === "SET_RANKED") {
  if (state.hostUserId !== action.userId) return;
  state.ranked = !!action.ranked;
}

if (action.type === "SET_TIME_CONTROL") {
  if (state.hostUserId !== action.userId) return;

 if (action.enabled === false) {
    state.timeControl.enabled = false;
    state.timeControl.preset = "none";
    state.activeTimer = null;
    state.timeRemaining.A = 0;
    state.timeRemaining.B = 0;
    state.rankMode = "notime";
    emitStateForAllPlayers(roomId, room, io);
    return;
  }        
  const sec = parseInt(action.seconds, 10);
  const mode = action.mode || "round";
  if (!Number.isFinite(sec) || sec <= 0) return;
  state.timeControl.enabled = true;
  state.timeControl.mode = mode;       
        state.timeControl.preset =
          sec === 60 ? "bullet" :
          sec === 180 ? "blitz" :
          sec === 900 ? "deep" :
          "custom";
  if (mode === "round") {
    state.timeControl.roundSeconds = sec;
    state.timeRemaining.A = sec;
    state.timeRemaining.B = sec;
  } else {
    state.timeControl.initialSeconds = sec;
    state.timeRemaining.A = sec;
    state.timeRemaining.B = sec;
  }; 
    if (action.seconds === 60 && action.mode === "round") state.rankMode = "bullet";
    else if (action.seconds === 180 && action.mode === "round") state.rankMode = "blitz";
    else if (action.seconds === 300 && action.mode === "chess") state.rankMode = "blitz"; 
    else state.rankMode = "custom";
  emitStateForAllPlayers(roomId, room, io);
  return;
}
  // -------------------------------
  // SWITCH ROLES
  // -------------------------------
if (action.type === "SWITCH_ROLES") {
  if (state.ranked) return; // silently ignore
  if (Object.values(room.players).some(p => p.isAI)) return;
  const ids = Object.keys(room.players);
  if (ids.length !== 2) return;
  const idA = ids.find(id => room.players[id]?.role === "A");
  const idB = ids.find(id => room.players[id]?.role === "B");
  if (!idA || !idB) return;
  room.players[idA].role = "B";
  room.players[idB].role = "A";
  state.roles[idA] = "B";
  state.roles[idB] = "A";
  state.setter = "A";
  state.guesser = "B";
  // Notify players (UX only)
  for (const playerId of ids) {
    io.to(playerId).emit("lobbyEvent", { type: "rolesSwitched" });
  }
  return;
}

if (action.type === "ADD_AI") {
         console.log("the call works");
  if (state.ranked) return;
   // Only host can add AI
        console.log(state.hostUserId);
        console.log(action.userId);
  if (state.hostUserId !== action.userId) return;
  // Already have 2 players
        console.log(Object.keys(room.players).length);
  if (Object.keys(room.players).length >= 2) return;
  // Add AI player
  const AI_ID = "AI";
  room.players[AI_ID] = {
    role: "B",
    userId: "AI",
    connected: true,
    disconnectedAt: null,
    isAI: true
  };
  state.roles[AI_ID] = "B";
  state.playerNames[AI_ID] = "Computer";
  // Mark AI as ready immediately
  state.ready[AI_ID] = true;
  emitLobbyEvent(io, roomId, {
    type: "playerJoined",
    playerId: AI_ID,
    isAI: true
  });

  emitLobbyEvent(io, roomId, {
    type: "playerReady",
    playerId: AI_ID
  });

  emitStateForAllPlayers(roomId, room, io);
        console.log("the call goes through");
  return;
}


if (action.type === "SET_POWER_COUNT") {
    let n = parseInt(action.count, 10);
        console.log("SET_POWER_COUNT received:", n);
    if (isNaN(n)) return;
    n = Math.max(1, Math.min(10, n));
    state.powerCount = n;
    emitStateForAllPlayers(roomId, room, io);
    return;
}

  // -------------------------------
  // PLAYER READY
  // -------------------------------
        if (action.type === "PLAYER_READY") {
        
          // Ready is per PLAYER (socket.id), not role
          state.ready[action.playerId] = true;
               
          emitToOtherPlayer(io, room, action.playerId, {
            type: "playerReady",
            playerId: action.playerId
          });
          emitToPlayer(io, action.playerId, {
            type: "playerReady",
            playerId: action.playerId
          });
          const readyPlayers = Object.values(state.ready).filter(Boolean).length;
          const playerCount = Object.keys(room.players).length;
          if (readyPlayers === 1){
                emitStateForAllPlayers(roomId, room, io);
          }
          if (readyPlayers === playerCount && playerCount === 2) {
                if (state.ranked) {
                  const ids = Object.keys(room.players);
                  const shuffled = ids.sort(() => Math.random() - 0.5);
                
                  room.players[shuffled[0]].role = "A";
                  room.players[shuffled[1]].role = "B";
                
                  state.roles[shuffled[0]] = "A";
                  state.roles[shuffled[1]] = "B";
                }
            const N = state.powerCount || 2;        
            const sP = SETTER_POWERS
              .slice()
              .sort(() => Math.random() - 0.5)
              .slice(0, N);        
            const gP = GUESSER_POWERS
              .slice()
              .sort(() => Math.random() - 0.5)
              .slice(0, N);        
            state.mode = new CompetitiveMode();
            state.mode.initMatch(state);
            state.mode.onLobbyReady(state, sP, gP);        
            if (state.activePowers.includes("revealLetter")) {
              state.powers.revealLetter.mode =
                Math.random() < 0.5 ? "RARE" : "ROW";
            }        
            state.phase = "simultaneous";
            state.turn = null;
            state.simultaneousGuessSubmitted = false;
            state.simultaneousSecretSubmitted = false;        
            if (state.timeControl.enabled) {
              resetRoundTimer(state);
              state.activeTimer = "both";
              state.roundStartTime = Date.now();
              stopTimer(roomId);
              startGameTimer(room, state, roomId, context);
              state.isTimerRunning = true;
            }        
            emitLobbyEvent(io, roomId, { type: "hideLobby" });
            emitStateForAllPlayers(roomId, room, io);
          }
        
          return;
        }

}

module.exports = handleLobbyPhase;
