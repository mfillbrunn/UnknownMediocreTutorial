// utils/emitLobby.js

/**
 * Sends a lobby-related event to all players in the room.
 *
 * Usage:
 *   emitLobbyEvent(io, roomId, { type: "playerReady", role: "A" });
 */
function emitLobbyEvent(io, roomId, payload) {
  io.to(roomId).emit("lobbyEvent", payload);
}
function emitToPlayer(io, playerId, payload) {
  io.to(playerId).emit("lobbyEvent", payload);
}

// NEW: emit to the other player automatically
function emitToOtherPlayer(io, roomId, triggeringPlayerId, payload) {
  const playerIds = Object.keys(roomId.players);
  const other = playerIds.find(id => id !== triggeringPlayerId);
  if (other) {
    io.to(other).emit("lobbyEvent", payload);
  }
}

module.exports = {
  emitLobbyEvent,
  emitToPlayer,
  emitToOtherPlayer
};
