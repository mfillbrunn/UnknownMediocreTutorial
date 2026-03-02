// server/utils/emitState.js
const { buildSafeStateForPlayer } = require("./safeState");

function emitStateForAllPlayers(roomId, room, io) {
  if (!room || !room.playersByUserId) return;

  for (const player of Object.values(room.playersByUserId)) {
    if (!player.connected) continue;
    if (!player.socketId) continue; // skip AI

    const role = player.role;
    if (role !== "A" && role !== "B") continue;

    const safe = buildSafeStateForPlayer(room.state, role);

    io.to(player.socketId).emit("stateUpdate", safe);
  }
}

module.exports = { emitStateForAllPlayers };
