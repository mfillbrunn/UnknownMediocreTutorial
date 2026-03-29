// core/phases/lobby.js

const { emitLobbyEvent, emitToUser,  emitToOtherUser } = require("../../utils/emitLobby");
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
  const playerState = ensurePlayerState(room, state, action.playerId);
  if (!playerState) return;

  if (action.name) {
    playerState.name = String(action.name).trim().slice(0, 16);
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
  if (state.ranked) return;
  if (state.hostUserId !== action.userId) return;

  const players = Object.values(room.playersByUserId);
  if (players.length !== 2) return;
        
  const playerA = players.find(p => p.role === "A");
  const playerB = players.find(p => p.role === "B");
  if (!playerA || !playerB) return;

  // Swap canonical roles
        const setterPlayer = Object.values(room.playersByUserId).find(p => p.role === "A");
        const guesserPlayer = Object.values(room.playersByUserId).find(p => p.role === "B");
        
        state.setter = setterPlayer?.userId ?? null;
        state.guesser = guesserPlayer?.userId ?? null;
        
        if (!state.players?.[playerA.userId] || !state.players?.[playerB.userId]) {
          console.error("SWITCH_ROLES desync", {
            playerA,
            playerB,
            statePlayers: state.players,
            roomPlayers: room.playersByUserId
          });
          return;
        }

  // Update state.players
  state.players[playerA.userId].role = "B";
  state.players[playerB.userId].role = "A";

  state.setter = "A";
  state.guesser = "B";

  for (const p of Object.values(state.players)) {
          p.ready = false;
        }

  emitLobbyEvent(io, roomId, { type: "rolesSwitched" });
  emitStateForAllPlayers(roomId, room, io);
  return;
}

if (action.type === "ADD_AI") {
  if (state.ranked) return;
  if (state.hostUserId !== action.userId) return;
  if (room.playersByUserId["AI"]) return;
  state.aiDifficulty = action.difficulty ?? 1;

  const humanCount = Object.values(room.playersByUserId)
    .filter(p => !p.isAI).length;

  if (humanCount >= 2) return;

  const AI_USER = "AI";

  room.playersByUserId[AI_USER] = {
    userId: AI_USER,
    role: "B",
    socketId: null,
    connected: true,
    isAI: true
  };

  state.players ||= {};
  state.players[AI_USER] = {
    role: "B",
    ready: false,
    name: `AI Lvl ${action.difficulty ?? 1}`
  };
for (const p of Object.values(state.players)) {
  p.ready = false;
}
  emitLobbyEvent(io, roomId, {
    type: "playerJoined",
    userId: AI_USER,
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

  const userId = action.userId;
  if (!userId) return;

  const player = room.playersByUserId[userId];
  if (!player) return;

  state.players ||= {};
  state.players[userId] ||= {};

  state.players[userId].ready = true;

  const humans = Object.values(room.playersByUserId)
    .filter(p => !p.isAI);

  const readyHumans = humans.filter(p =>
    state.players[p.userId]?.ready
  );

  if (readyHumans.length < humans.length) {
    emitStateForAllPlayers(roomId, room, io);
    return;
  }

  // Everyone ready → start game

  stopAllRoomIntervals(roomId, room);

  const freshState = createInitialState();

  freshState.players = {};

  for (const p of Object.values(room.playersByUserId)) {
    freshState.players[p.userId] = {
      role: p.role,
      ready: false,
      name: state.players[p.userId]?.name
    };
  }

  freshState.hostUserId = state.hostUserId;
  freshState.ranked = state.ranked;
  freshState.timeControl = state.timeControl;
  freshState.powerCount = state.powerCount;

  room.state = freshState;
  state = freshState;

  const N = state.powerCount || 2;

  let sP = SETTER_POWERS
    .slice()
    .sort(() => Math.random() - 0.5)
    .slice(0, N);

  let gP = GUESSER_POWERS
    .slice()
    .sort(() => Math.random() - 0.5)
    .slice(0, N);

  state.mode = state.isTutorial
    ? new TutorialMode()
    : new CompetitiveMode();

  state.mode.initMatch(state);
  state.mode.onLobbyReady(state, sP, gP);

  state.phase = "simultaneous";

  if (state.timeControl?.enabled) {
    resetRoundTimer(state);
    state.activeTimer = "both";
    state.roundStartTime = Date.now();
    startGameTimer(room, state, roomId, context);
  }

  emitLobbyEvent(io, roomId, { type: "hideLobby" });
  emitStateForAllPlayers(roomId, room, io);
  io.to(roomId).emit("gameStart");

  return;
}
}
function ensurePlayerState(room, state, userId) {
  state.players ||= {};

  const roomPlayer = room.playersByUserId?.[userId];
  if (!roomPlayer) return null;

  state.players[userId] ||= {
    role: roomPlayer.role ?? null,
    ready: false,
    name: null,
    isAI: !!roomPlayer.isAI
  };

  state.players[userId].role = roomPlayer.role ?? state.players[userId].role;
  state.players[userId].isAI = !!roomPlayer.isAI;

  return state.players[userId];
}
module.exports = handleLobbyPhase;
