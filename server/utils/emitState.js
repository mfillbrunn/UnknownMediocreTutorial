//server side emitState.js 
const { buildSafeStateForPlayer } = require("./safeState");
function emitStateForAllPlayers(roomId, room, io) {
  for (const [playerId, player] of Object.entries(room.players)) {
    const role = player?.role;
    if (role !== "A" && role !== "B") continue;

    const safe = buildSafeStateForPlayer(room.state, role);
    io.to(playerId).emit("stateUpdate", safe);
  }
}


module.exports = { emitStateForAllPlayers };
