// core/phases/lobby.js

const { emitLobbyEvent, emitToPlayer,  emitToOtherPlayer } = require("../../utils/emitLobby");
const { emitStateForAllPlayers } = require("../../utils/emitState");
const CompetitiveMode = require("../modes/competitiveMode");
const TutorialMode = require("../modes/tutorialMode");
const { stopTimer,resetRoundTimer } = require("../../utils/Timer");
const { stopAllRoomIntervals } = require("../../utils/teardown");
const { createInitialState,  createInitialPowers} = require("../stateFactory");
const { startGameTimer } = require("../timeouts/timeoutController");

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
        "fakeFeedback",
        "revealPenalty"
      ];
      
      const GUESSER_POWERS = [
        "suggestGuess",
        "rouletteSecret",
        "forceTimer",
        "revealHistory",
        "stealthGuess",
        "revealGreen",
        "freezeSecret",
        "magicMode",
        "revealLetter",
              "nonsense",
              "betMiss",
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
  emitStateForAllPlayers(roomId, room, io);
}
if (action.type === "SET_SHUFFLE") {
  if (state.hostUserId !== action.userId) return;
  state.shuffle = !!action.shuffle;
  emitStateForAllPlayers(roomId, room, io);
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
          sec === 90 ? "bullet" :
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
    if (action.seconds === 90 && action.mode === "round") state.rankMode = "bullet";
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
  emitLobbyEvent(io, roomId, {
    type: "rolesSwitched"
  });
  state.ready = {};      
  emitStateForAllPlayers(roomId, room, io);
  return;
}

if (action.type === "ADD_AI") {
  if (state.ranked) return;
  if (state.hostUserId !== action.userId) return;
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
  room.state.aiDifficulty = action.difficulty ?? 1;  
  state.playerNames[AI_ID] = `AI Lvl ${room.state.aiDifficulty}`;
  emitLobbyEvent(io, roomId, {
    type: "playerJoined",
    playerId: AI_ID,
    isAI: true
  });
  emitStateForAllPlayers(roomId, room, io);
  return;
}

if (action.type === "SET_DEV_MODE") {
   state.devMode = !state.devMode;
   state.powerCount = state.devMode ? 20 : 2;           
    emitStateForAllPlayers(roomId, room, io);
    return;
}

  // -------------------------------
  // PLAYER READY
  // -------------------------------
        if (action.type === "PLAYER_READY") {        
          // Ready is per PLAYER (socket.id), not role
          const players = Object.entries(room.players);
          const humanPlayers = players.filter(([_, p]) => !p.isAI);
          const aiPlayers = players.filter(([_, p]) => p.isAI);
                console.log(action.mode);
         if (action.mode === "tutorial") {state.isTutorial = true;}               
         if (humanPlayers.length + aiPlayers.length < 2){return;}  
          state.ready[action.playerId] = true;               
          emitToOtherPlayer(io, room, action.playerId, {
            type: "playerReady",
            playerId: action.playerId
          });
          emitToPlayer(io, action.playerId, {
            type: "playerReady",
            playerId: action.playerId
          });
          console.log(roomId);  
          const readyHumans = humanPlayers.filter(([id]) => state.ready[id]);
          if (readyHumans.length === 1){
                emitStateForAllPlayers(roomId, room, io);
          }             
          if (readyHumans.length === 2 || (readyHumans.length === humanPlayers.length && aiPlayers.length === 1)) {
             //refresh state
             console.log(roomId);   
             stopAllRoomIntervals(roomId, room);
             const oldState = state;                  
             const freshState = createInitialState();
             freshState.playerNames = oldState.playerNames;
             freshState.hostUserId = oldState.hostUserId;
             freshState.ranked = oldState.ranked;
             freshState.timeControl = oldState.timeControl;
             freshState.powerCount = oldState.powerCount;
             for (const [playerId, player] of Object.entries(room.players)) {
                  freshState.roles[playerId] = player.role;
             }
             freshState._timerGeneration = (oldState._timerGeneration || 0) + 1;
             room.state = freshState;
             state = freshState; 
              if (state.ranked || state.shuffle) {
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
            if (!state.isTutorial) {
                  state.mode = new CompetitiveMode();
                }
            if (state.isTutorial){
                  state.mode = new TutorialMode();
                  }                  
            state.mode.initMatch(state);
            state.mode.onLobbyReady(state, sP, gP);   
            state.phase = "simultaneous";
            if (state.timeControl.enabled) {
              resetRoundTimer(state);
              state.activeTimer = "both";
              state.roundStartTime = Date.now();
              startGameTimer(room, state, roomId, context);
            }        
             if (state.activePowers.includes("revealLetter")) {
                state.powers.revealLetter.mode =Math.random() < 0.5 ? "RARE" : "ROW";
            }        
            emitLobbyEvent(io, roomId, { type: "hideLobby" });
            emitStateForAllPlayers(roomId, room, io);
            io.to(roomId).emit("gameStart");
          }        
          return;
        }
}

module.exports = handleLobbyPhase;
