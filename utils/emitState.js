const { buildSafeStateForPlayer } = require("./safeState");

function emitStateForAllPlayers(roomId, room, io) {
  for (const [playerId, role] of Object.entries(room.players)) {
    const safe = buildSafeStateForPlayer(room.state, role);
    io.to(playerId).emit("stateUpdate", safe);
  }
}

module.exports = { emitStateForAllPlayers };
