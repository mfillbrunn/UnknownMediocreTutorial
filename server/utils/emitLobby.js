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

module.exports = { emitLobbyEvent };
