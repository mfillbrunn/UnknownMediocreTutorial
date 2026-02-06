// core/rooms.js
const { createInitialState } = require("./stateFactory");
const {endGame }  = require("./phases/gameOver");
const { emitStateForAllPlayers } = require("../utils/emitState");;
const { stopTimer } = require("../utils/Timer");
const {   destroyRoom, stopAllRoomIntervals } = require("../utils/teardown");
const rooms = {};

function hasAnyHumanPlayers(room) {
  return Object.values(room.playersByUserId).some(
    p => !p.isAI && p.connected
  );
}


// Generate a human-friendly room ID
function generateRoomId() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let id = "";
  for (let i = 0; i < 4; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

function createRoom(socket, userId) {
  let roomId;
  do {
    roomId = generateRoomId();
  } while (rooms[roomId]);

  const state = createInitialState();

  rooms[roomId] = {
    state,
    status: "alive",
    aiOnlySince: null,
    playersByUserId: {}   // ✅ authoritative
  };

  const room = rooms[roomId];

  socket.join(roomId);
  socket.data.roomId = roomId;
  socket.data.userId = userId;

  // Create host player
  room.playersByUserId[userId] = {
    userId,
    role: "A",
    socketId: socket.id,
    connected: true,
    isAI: false
  };

  // Domain state (userId-keyed)
  state.rolesByUserId[userId] = "A";
  state.playerNamesByUserId[userId] = null; // filled later
  state.readyByUserId[userId] = false;
  state.hostUserId = userId;

  return roomId;
}


/**
 * Join a room OR reattach if userId exists and is disconnected.
 */
function joinOrReattach(socket, roomId, userId) {
  if (!userId) {
    return { ok: false, error: "Missing userId" };
  }

  const room = rooms[roomId];
  if (!room) {
    return { ok: false, error: "Room not found" };
  }

  socket.join(roomId);
  socket.data.roomId = roomId;
  socket.data.userId = userId;

  // ---------- REATTACH ----------
  const existing = room.playersByUserId[userId];
  if (existing) {
    existing.socketId = socket.id;
    existing.connected = true;
    existing.disconnectedAt = null;

    const shouldResumeGame =
      !room.state.gameOver &&
      room.state.phase !== "lobby";

    return {
      ok: true,
      reattached: true,
      role: existing.role,
      shouldResumeGame
    };
  }

  // ---------- NEW JOIN ----------
  if (Object.keys(room.playersByUserId).length >= 2) {
    return { ok: false, error: "Room is full" };
  }

  const occupiedRoles = new Set(
    Object.values(room.playersByUserId).map(p => p.role)
  );
  const role = occupiedRoles.has("A") ? "B" : "A";

  room.playersByUserId[userId] = {
    userId,
    role,
    socketId: socket.id,
    connected: true,
    disconnectedAt: null,
    isAI: false
  };

  // Domain state (userId-keyed)
  room.state.rolesByUserId[userId] = role;

  return {
    ok: true,
    reattached: false,
    role,
    shouldResumeGame: false
  };
}


function cleanupEmptyRooms() {
  for (const [roomId, room] of Object.entries(rooms)) {
    if (
      !room.playersByUserId ||
      Object.keys(room.playersByUserId).length === 0
    ) {
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
    if (!room || room.status !== "alive") continue;

    const connectedHumans = Object.values(room.playersByUserId)
      .filter(p => p.connected && !p.isAI);

    if (connectedHumans.length === 1) {
      return roomId;
    }
  }

  return null;
}

function removePlayer({ roomId, userId, reason, io, context }) {
  const room = rooms[roomId];
  if (!room || room.status !== "alive") return { ok: false };

  const player = room.playersByUserId[userId];
  if (!player) return { ok: false };

  const wasHost = room.state.hostUserId === userId;

  // Remove player
  delete room.playersByUserId[userId];
  delete room.state.rolesByUserId[userId];
  delete room.state.playerNamesByUserId[userId];
  delete room.state.readyByUserId[userId];

  // Disconnect socket (if still connected)
  const sock = io?.sockets?.sockets?.get(player.socketId);
  if (sock) {
    sock.data.roomId = null;
    sock.leave(roomId);
  }

  // Host reassignment
  if (wasHost) {
    const newHost = Object.values(room.playersByUserId)
      .find(p => !p.isAI);

    room.state.hostUserId = newHost?.userId ?? null;

    if (newHost) {
      io.to(roomId).emit("lobbyEvent", {
        type: "hostChanged",
        userId: newHost.userId
      });
    }
  }

  // Pause game if active
  if (!room.state.gameOver && room.state.phase !== "lobby") {
    stopTimer(roomId);
    room.state.paused = true;
  }

  io.to(roomId).emit("lobbyEvent", {
    type: "playerLeft",
    userId,
    role: player.role,
    reason
  });

  emitStateForAllPlayers(roomId, room, io);
  return { ok: true };
}

function cleanupDisconnectedPlayers(io, graceMs = 30_000, context) {
  const now = Date.now();
  const AI_ONLY_GRACE_MS = 30_000;

  for (const [roomId, room] of Object.entries(rooms)) {
    if (!room || room.status !== "alive") continue;

    // 🔥 Handle AI-only rooms
    if (!hasAnyHumanPlayers(room)) {
      if (!room.aiOnlySince) {
        room.aiOnlySince = now;
        continue;
      }

      if (now - room.aiOnlySince >= AI_ONLY_GRACE_MS) {
        console.log("Cleaning AI-only room after grace:", roomId);
        forceCloseRoom(roomId, room, io);
      }
      continue;
    }

    // Humans exist → reset AI-only marker
    room.aiOnlySince = null;

    // Handle disconnected HUMAN players by userId
    for (const [userId, player] of Object.entries(room.playersByUserId)) {
      if (
        !player.isAI &&
        !player.connected &&
        player.disconnectedAt &&
        now - player.disconnectedAt >= graceMs
      ) {
        removePlayer({
          roomId,
          userId,
          reason: "disconnect",
          io,
          context
        });
      }
    }
  }
}


function addAIPlayer(room) {
  if (!room || room.status !== "alive") return;

  const AI_USER_ID = "AI";

  if (room.playersByUserId[AI_USER_ID]) return;

  room.playersByUserId[AI_USER_ID] = {
    userId: AI_USER_ID,
    role: "B",
    socketId: null,
    connected: true,
    disconnectedAt: null,
    isAI: true
  };

  room.state.rolesByUserId[AI_USER_ID] = "B";
  room.state.playerNamesByUserId[AI_USER_ID] = "AI";
}


function forceCloseRoom(roomId, room, io) {
  if (!room || room.status === "dead") return;

  room.status = "dead";
  console.log("[forceCloseRoom] closing room:", roomId);

  stopAllRoomIntervals(roomId, room);

  if (io) {
    for (const player of Object.values(room.playersByUserId)) {
      if (player.socketId) {
        const sock = io.sockets.sockets.get(player.socketId);
        sock?.leave(roomId);
        sock && (sock.data.roomId = null);
      }
    }
    io.to(roomId).emit("forceLeaveRoom");
  }

  delete rooms[roomId];
}


module.exports = {
  rooms,
  createRoom,
  joinOrReattach,
  removePlayer,
  cleanupEmptyRooms,
  findLastOpenRoom,
  cleanupDisconnectedPlayers,
   addAIPlayer
};
