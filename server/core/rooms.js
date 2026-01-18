// core/rooms.js
const { createInitialState } = require("./stateFactory");
const {endGame }  = require("./phases/gameOver");

const rooms = {};

function hasAnyHumanPlayers(room) {
  return Object.values(room.players).some(p => !p.isAI);
}

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
    disconnectedAt: null,
    isAI: false
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
    room.currentSocketByUserId ??= {};
    const existing = getPlayerByUserId(room, userId);
    if (existing) {
      const { socketId: oldSocketId, player } = existing;
      room.currentSocketByUserId[userId] = socket.id;
      if (oldSocketId !== socket.id) {
        player.connected = false;
        player.disconnectedAt = Date.now();
      }
      delete room.players[oldSocketId];
      delete room.state.roles[oldSocketId];
      delete room.state.playerNames[oldSocketId];
      if (room.state.ready) delete room.state.ready[oldSocketId];
      room.players[socket.id] = {
        ...player,
        connected: true,
        disconnectedAt: null
      };
      room.currentSocketByUserId[userId] = socket.id;
      room.state.roles[socket.id] = player.role;
      socket.join(roomId);
      const shouldResumeGame =
        !room.state.gameOver &&
        room.state.phase !== "lobby";
      return { ok: true, reattached: true, role: player.role,shouldResumeGame  };
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
    return {
    ok: true,
    reattached: false,
    role: role,
    shouldResumeGame:false
  };
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

function removePlayer({
  roomId,
  socketId,
  reason,
  io,
  context
}) {
  const room = rooms[roomId];
  if (!room) return { ok: false };

  const player = room.players[socketId];
  if (!player) return { ok: false };

  const role = player.role;

  delete room.players[socketId];

  io?.to(roomId).emit("lobbyEvent", {
    type: "playerLeft",
    role,
    reason
  });

  if (!hasAnyHumanPlayers(room)) {
    console.log("Deleting room with only AI:", roomId);
    delete rooms[roomId];
    return { ok: true, deleted: true };
  }
  resetRoomState(room);

  // If one player remains and this was mid-game, you can still award a win
  if (
    Object.keys(room.players).length === 1 &&
    room.state.phase !== "lobby"
  ) {
    room.state.timeoutLoser = role;
    endGame(room.state, roomId, io, room, context);
  }

  return { ok: true };
}
function cleanupDisconnectedPlayers(io, graceMs = 30_000, context) {
  const now = Date.now();

  for (const [roomId, room] of Object.entries(rooms)) {
    // 🔥 Delete AI-only rooms
    if (!hasAnyHumanPlayers(room)) {
      console.log("Cleaning AI-only room:", roomId);
      delete rooms[roomId];
      continue;
    }

    // Handle disconnected human players
    for (const [socketId, player] of Object.entries(room.players)) {
      if (
        !player.connected &&
        player.disconnectedAt &&
        now - player.disconnectedAt >= graceMs
      ) {
        removePlayer({
          roomId,
          socketId,
          reason: "disconnect",
          io,
          context
        });
      }
    }
  }
}


function resetRoomState(room) {
  const prevRankMode = room.state.rankMode;
  const prevRanked = room.state.ranked;

  room.state = createInitialState();

  // Optional carry-over
  room.state.rankMode = prevRankMode;
  room.state.ranked = prevRanked;

  // Reapply existing players' roles (if any remain)
  for (const [socketId, player] of Object.entries(room.players)) {
    room.state.roles[socketId] = player.role;
  }

  // Reset host if someone remains
  const remainingPlayers = Object.values(room.players);
  room.state.hostUserId = remainingPlayers[0]?.userId ?? null;
}

function addAIPlayer(room) {
  const AI_ID = "AI"; // constant fake socket id

  if (room.players[AI_ID]) return;

  room.players[AI_ID] = {
    role: "B",
    userId: "AI",
    connected: true,
    disconnectedAt: null,
    isAI: true
  };

  room.state.roles[AI_ID] = "B";
}


module.exports = {
  rooms,
  createRoom,
  joinOrReattach,
  removePlayer,
  cleanupEmptyRooms,
  findLastOpenRoom,
  cleanupDisconnectedPlayers,
  resetRoomState,
  addAIPlayer
};
