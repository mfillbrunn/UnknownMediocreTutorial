// core/phases/lobby.js

const { emitLobbyEvent } = require("../../utils/emitLobby");
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

      room.players[idA] = "B";
      room.players[idB] = "A";

      const tmp = state.setter;
      state.setter = state.guesser;
      state.guesser = tmp;

      emitLobbyEvent(io, roomId, {
        type: "rolesSwitched",
        setterId: idA,
        guesserId: idB
      });
    }
    return;
  }

  // -------------------------------
  // PLAYER READY
  // -------------------------------
  if (action.type === "PLAYER_READY") {
    state.ready[role] = true;

    emitToOtherPlayer(io, roomId, {
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
