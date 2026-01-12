// core/rooms.js
const { createInitialState } = require("./stateFactory");

const rooms = {};

// Generate a human-friendly room ID
function generateRoomId() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let id = "";
  for (let i = 0; i < 4; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

function getPlayerByUserId(room, userId) {
  if (!room || !userId) return null;
  for (const [socketId, player] of Object.entries(room.players)) {
    if (player?.userId === userId) return { socketId, player };
  }
  return null;
}

function createRoom(socket, userId) {
  let roomId;
  do {
    roomId = generateRoomId();
  } while (rooms[roomId]);

  rooms[roomId] = {
    state: createInitialState(),
    players: {}
  };

  socket.join(roomId);
  const room = rooms[roomId];

  room.players[socket.id] = {
    role: "A",
    userId,
    connected: true,
    disconnectedAt: null
  };

  room.state.roles[socket.id] = "A";
  room.state.hostUserId = userId;

  return roomId;
}

/**
 * Join a room OR reattach if userId exists and is disconnected.
 */
function joinOrReattach(socket, roomId, userId) {
  const room = rooms[roomId];
  if (!room) return { ok: false, error: "Room not found" };
  if (!userId) return { ok: false, error: "Missing userId" };

  // 1) Reattach if user already exists in room
  const existing = getPlayerByUserId(room, userId);
  if (existing) {
    const { socketId: oldSocketId, player } = existing;

    // If already connected, you can either reject or "steal" the session.
    // For competitive play, "steal" is usually correct (last connection wins).
    if (player.connected && oldSocketId !== socket.id) {
      // Mark old as disconnected; optionally force it out:
      player.connected = false;
      player.disconnectedAt = Date.now();
    }

    // Migrate authoritative mappings
    delete room.players[oldSocketId];
    delete room.state.roles[oldSocketId];
    delete room.state.playerNames[oldSocketId];
    if (room.state.ready) delete room.state.ready[oldSocketId];

    room.players[socket.id] = {
      ...player,
      connected: true,
      disconnectedAt: null
    };

    room.state.roles[socket.id] = player.role;
    socket.join(roomId);
    return { ok: true, reattached: true, role: player.role };
  }

  // 2) Normal join if space
  if (Object.keys(room.players).length >= 2) {
    return { ok: false, error: "Room is full" };
  }

  socket.join(roomId);

  // Determine role: first is A, second is B (based on occupancy)
  const occupiedRoles = new Set(Object.values(room.players).map(p => p.role));
  const role = occupiedRoles.has("A") ? "B" : "A";

  room.players[socket.id] = {
    role,
    userId,
    connected: true,
    disconnectedAt: null
  };

  room.state.roles[socket.id] = role;
  return { ok: true, reattached: false, role };
}

function cleanupEmptyRooms() {
  for (const [roomId, room] of Object.entries(rooms)) {
    if (Object.keys(room.players).length === 0) {
      console.log("Cleaning empty room:", roomId);
      delete rooms[roomId];
    }
  }
}

function findLastOpenRoom() {
  const roomIds = Object.keys(rooms);
  for (let i = roomIds.length - 1; i >= 0; i--) {
    const roomId = roomIds[i];
    const room = rooms[roomId];
    if (
  room &&
  Object.values(room.players).filter(p => p.connected).length === 1
) {
  return roomId;
}
  }
  return null;
}

function cleanupDisconnectedPlayers(io, graceMs = 30_000) {
  const now = Date.now();

  for (const [roomId, room] of Object.entries(rooms)) {
    const players = Object.entries(room.players);

    for (const [socketId, player] of players) {
      if (
        !player.connected &&
        player.disconnectedAt &&
        now - player.disconnectedAt >= graceMs
      ) {
        const role = player.role;

        // Remove the disconnected player
        delete room.players[socketId];
        delete room.state.roles[socketId];

        // If one player remains → they win
        const remaining = Object.values(room.players);
        if (remaining.length === 1) {
          const remainingRole = remaining[0].role;

          room.state.timeoutLoser = role;
          endGame(room.state, roomId, io, room, { io });
        } else {
          // No players left → reset room
          room.state.phase = "lobby";
        }

        io.to(roomId).emit("lobbyEvent", {
          type: "playerKicked",
          reason: "disconnect"
        });
      }
    }
  }
}


module.exports = {
  rooms,
  createRoom,
  joinOrReattach,
  cleanupEmptyRooms,
  findLastOpenRoom,
  cleanupDisconnectedPlayers
};
