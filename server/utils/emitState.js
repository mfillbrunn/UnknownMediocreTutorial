// server/utils/emitState.js
const { buildSafeStateForPlayer } = require("./safeState");

function emitStateForAllPlayers(roomId, room, io, allowedSecrets) {
  if (!room || !room.playersByUserId) return;

  for (const player of Object.values(room.playersByUserId)) {
    if (!player.connected) continue;
    if (!player.socketId) continue; // skip AI

    const userId = player.userId;
    if (!userId) continue;
    if (!room.state?.players?.[userId]) continue;

    const safe = buildSafeStateForPlayer(room.state, userId, allowedSecrets);
    io.to(player.socketId).emit("stateUpdate", safe);
  }
}

module.exports = { emitStateForAllPlayers };
