//server side emitState.js 
const { buildSafeStateForPlayer } = require("./safeState");

function emitStateForAllPlayers(roomId, room, io) {

  for (const [playerId, role] of Object.entries(room.players)) {
    const safe = buildSafeStateForPlayer(room.state, role);
    io.to(playerId).emit("stateUpdate", safe);
      console.log("EMITTING SAFE STATE FOR PLAYER", playerId, JSON.stringify(safe, null, 2));
  }
}

module.exports = { emitStateForAllPlayers };
