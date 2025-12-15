// core/phases/lobby.js

const { emitLobbyEvent, emitToPlayer,  emitToOtherPlayer } = require("../../utils/emitLobby");
const { emitStateForAllPlayers } = require("../../utils/emitState");
const SETTER_POWERS = [
        "hideTile",
        "suggestSecret",
        "confuseColors",
        "countOnly",
        "blindSpot"
      ];
      
      const GUESSER_POWERS = [
        "suggestGuess",
        "forceTimer",
        "revealHistory",
        "stealthGuess",
        "revealGreen",
        "freezeSecret"
      ];
function handleLobbyPhase(room, state, action, role, roomId, context) {
  const io = context.io;

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

   emitToOtherPlayer(io, room, action.playerId, {
      type: "playerReady",
      role,
     playerId: action.playerId
    });
    emitToPlayer(io, action.playerId, {
      type: "playerReady",
      role,
      playerId: action.playerId
    });

    // If both ready → enter simultaneous phase
    if (state.ready.A && state.ready.B) {
           // ⭐ Choose exactly 2 random setter powers
   const setterShuffled = SETTER_POWERS.slice().sort(() => Math.random() - 0.5);
   const pickerSetter = setterShuffled.slice(0, 2);

   // ⭐ Choose exactly 2 random guesser powers
   const guesserShuffled = GUESSER_POWERS.slice().sort(() => Math.random() - 0.5);
   const pickerGuesser = guesserShuffled.slice(0, 2);

   // ⭐ Combine them into activePowers
   state.activePowers = [...pickerSetter, ...pickerGuesser];
      state.phase = "simultaneous";
      state.turn = null;
      state.simultaneousGuessSubmitted = false;
      state.simultaneousSecretSubmitted = false;

      emitLobbyEvent(io, roomId, { type: "hideLobby" });
      emitStateForAllPlayers(roomId, room, io);
    }
    return;
  }

  // NEW_MATCH during lobby does nothing here
}

module.exports = handleLobbyPhase;
