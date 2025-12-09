//server side emitState.js 
const { buildSafeStateForPlayer } = require("./safeState");

function emitStateForAllPlayers(roomId, room, io) {
  console.log("EMITTING SAFE STATE FOR PLAYER", playerId, JSON.stringify(safe, null, 2));
  for (const [playerId, role] of Object.entries(room.players)) {
    const safe = buildSafeStateForPlayer(room.state, role);
    io.to(playerId).emit("stateUpdate", safe);
  }
}

module.exports = { emitStateForAllPlayers };
