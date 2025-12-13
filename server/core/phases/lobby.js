// core/phases/lobby.js

const { emitLobbyEvent, emitToPlayer,  emitToOtherPlayer } = require("../../utils/emitLobby");
const { emitStateForAllPlayers } = require("../../utils/emitState");
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


  // -------------------------------
  // PLAYER READY
  // -------------------------------
  if (action.type === "PLAYER_READY") {
    state.ready[role] = true;

   emitToOtherPlayer(io, room, action.playerId, {
      type: "playerReady",
      role
    });

    // If both ready → enter simultaneous phase
    if (state.ready.A && state.ready.B) {
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
