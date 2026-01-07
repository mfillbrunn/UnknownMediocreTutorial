// core/phases/lobby.js

const { emitLobbyEvent, emitToPlayer,  emitToOtherPlayer } = require("../../utils/emitLobby");
const { emitStateForAllPlayers } = require("../../utils/emitState");
const CompetitiveMode = require("../modes/competitiveMode");
const { stopTimer,startTimer,resetRoundTimer } = require("../../utils/chessTimer");
const { endGame } = require("./gameOver");
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
      ];
function handleLobbyPhase(room, state, action, role, roomId, context) {
  const io = context.io;
if (action.type === "PLAYER_JOINED") {
  if (action.name) {
    state.playerNames[action.playerId] = String(action.name)
      .trim()
      .slice(0, 16);
  }
  emitStateForAllPlayers(roomId, room, io);
    emitLobbyEvent(io, roomId, { type: "playerJoined" });
  return;
}
if (action.type === "SET_TIME_CONTROL") {
  if (state.host !== action.playerId) return state;

 if (action.enabled === false) {
    state.timeControl.enabled = false;
    state.activeTimer = null;
    state.timeRemaining.A = 0;
    state.timeRemaining.B = 0;

    emitStateForAllPlayers(roomId, room, io);
    return;
  }
        state.timeControl.enabled = true;
        state.timeControl.mode = mode;
        
        state.timeControl.preset =
          sec === 60 ? "bullet" :
          sec === 180 ? "blitz" :
          sec === 900 ? "deep" :
          "custom";
  const sec = parseInt(action.seconds, 10);
  const mode = action.mode || "round";

  if (!Number.isFinite(sec) || sec <= 0) return;

  state.timeControl.enabled = true;
  state.timeControl.mode = mode;

  if (mode === "round") {
    state.timeControl.roundSeconds = sec;
    state.timeRemaining.A = sec;
    state.timeRemaining.B = sec;
  } else {
    state.timeControl.initialSeconds = sec;
    state.timeRemaining.A = sec;
    state.timeRemaining.B = sec;
  }; 
  emitStateForAllPlayers(roomId, room, io);
  return;
}


  // -------------------------------
  // SWITCH ROLES
  // -------------------------------
if (action.type === "SWITCH_ROLES") {
  const ids = Object.keys(room.players);
  if (ids.length === 2) {
    const idA = ids.find(id => room.players[id] === "A");
    const idB = ids.find(id => room.players[id] === "B");

    // Swap roles
    room.players[idA] = "B";
    room.players[idB] = "A";

    // Server-side state (A = setter, B = guesser)
    state.setter = "A";
    state.guesser = "B";

    // Notify BOTH players with correct role assignment
    io.to(idA).emit("roleAssigned", {
      role: "B",
      setterId: idB,
      guesserId: idA
    });

    io.to(idB).emit("roleAssigned", {
      role: "A",
      setterId: idB,
      guesserId: idA
    });

    // UI event — optional, but still allowed
    emitLobbyEvent(io, roomId, {
      type: "rolesSwitched",
      setterId: idB,
      guesserId: idA
    });
  }
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
        
          // ✅ Check readiness by PLAYER COUNT
          const readyPlayers = Object.values(state.ready).filter(Boolean).length;
          const playerCount = Object.keys(room.players).length;
        
          if (readyPlayers === playerCount && playerCount === 2) {
        
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
