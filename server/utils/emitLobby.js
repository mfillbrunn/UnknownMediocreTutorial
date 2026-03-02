// utils/emitLobby.js

/**
 * Sends a lobby-related event to all players in the room.
 */
function emitLobbyEvent(io, roomId, payload) {
  io.to(roomId).emit("lobbyEvent", payload);
}

/**
 * Emit directly to a specific userId (not socketId).
 */
function emitToUser(io, room, userId, payload) {
  const player = room.playersByUserId?.[userId];
  if (!player || !player.socketId) return;

  io.to(player.socketId).emit("lobbyEvent", payload);
}

/**
 * Emit to the other human player (userId-based).
 */
function emitToOtherUser(io, room, triggeringUserId, payload) {
  const others = Object.values(room.playersByUserId || {})
    .filter(p => p.userId !== triggeringUserId && !p.isAI);

  for (const p of others) {
    if (p.socketId) {
      io.to(p.socketId).emit("lobbyEvent", payload);
    }
  }
}

module.exports = {
  emitLobbyEvent,
  emitToUser,
  emitToOtherUser
};
