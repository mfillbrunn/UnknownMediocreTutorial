// core/phases/lobby.js

const { emitLobbyEvent, emitToPlayer,  emitToOtherPlayer } = require("../../utils/emitLobby");
const { emitStateForAllPlayers } = require("../../utils/emitState");
const CompetitiveMode = require("../modes/competitiveMode");
const { stopTimer,startTimer,resetRoundTimer } = require("../../utils/chessTimer");
const {handleRoundTimeout} = require("../../utils/roundTimer");
const { endGame } = require("./gameOver");
const {startGameTimer} = require("../../utils/startGameTimer");

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

if (action.type === "SET_TIME_CONTROL") {
  const sec = parseInt(action.seconds, 10);
  const mode = action.mode || "round";
  if (!Number.isFinite(sec) || sec < 0) return;
  state.timeControl.mode = mode;
  state.timeControl.enabled = sec > 0;
  if (mode === "round") {
    state.timeControl.roundSeconds = sec;
    state.timeRemaining.A = sec;
    state.timeRemaining.B = sec;
  } else {
    state.timeControl.initialSeconds = sec;
    state.timeRemaining.A = sec;
    state.timeRemaining.B = sec;
  }
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
    state.ready[role] = true;

          if (role.name) {
            state.playerNames[role] = String(action.name)
              .trim()
              .slice(0, 16);
          }
   emitToOtherPlayer(io, room, action.playerId, { type: "playerReady",role,playerId: action.playerId});
   emitToPlayer(io, action.playerId, {type: "playerReady",role,playerId: action.playerId});

    // If both ready → enter simultaneous phase
    if (state.ready.A && state.ready.B) {
          
            const N = state.powerCount || 2;
         const sP = SETTER_POWERS.slice().sort(() => Math.random() - 0.5).slice(0, N);
         const gP = GUESSER_POWERS.slice().sort(() => Math.random() - 0.5).slice(0, N);
        
         state.mode = new CompetitiveMode();
         state.mode.initMatch(state);
         state.mode.onLobbyReady(state, sP, gP);
                    // Initialize unified revealLetter power mode
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
        }
      emitLobbyEvent(io, roomId, { type: "hideLobby" });            
      emitStateForAllPlayers(roomId, room, io);

    }
    return;
  }
}

module.exports = handleLobbyPhase;
