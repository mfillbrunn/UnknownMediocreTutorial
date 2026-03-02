// core/rooms.js
const { createInitialState } = require("./stateFactory");
const { endGame } = require("./phases/gameOver");
const { emitStateForAllPlayers } = require("../utils/emitState");
const { stopTimer } = require("../utils/Timer");
const { destroyRoom, stopAllRoomIntervals } = require("../utils/teardown");
const rooms = {};

/* ---------- Helpers ---------- */

function hasAnyHumanPlayers(room) {
  return Object.values(room.playersByUserId || {}).some(p => !p.isAI && p.connected);
}

function generateRoomId() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let id = "";
  for (let i = 0; i < 4; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

function getPlayerByUserId(room, userId) {
  if (!room || !userId) return null;
  return room.playersByUserId?.[userId] ?? null;
}

/* Build socket-keyed mappings used by clients.
   Keeps compatibility with existing client expectations
   that state.roles / state.playerNames / state.ready are keyed by socket.id. */
function syncStateSocketKeys(room) {
  // Clean all socket-keyed maps
  room.state.roles = {};
  room.state.playerNames = room.state.playerNames || {};
  room.state.ready = room.state.ready || {};

  for (const [userId, p] of Object.entries(room.playersByUserId || {})) {
    if (!p.socketId) continue;
    // roles map
    room.state.roles[p.socketId] = p.role;
    // keep playerNames and ready if they were stored keyed by old socket keys.
    // If you prefer storing names/ready by userId in future, convert here.
    // If there's an existing playerNamesByUserId, map it. For now, prefer existing socket-keyed storage.
    // Ensure keys exist
    room.state.playerNames[p.socketId] = room.state.playerNames[p.socketId] ?? room.state.playerNamesByUserId?.[userId] ?? room.state.playerNames[p.socketId] ?? null;
    room.state.ready[p.socketId] = room.state.ready[p.socketId] ?? room.state.readyByUserId?.[userId] ?? false;
  }
}

/* ---------- Room lifecycle ---------- */

function createRoom(socket, userId) {
  let roomId;
  do {
    roomId = generateRoomId();
  } while (rooms[roomId]);

  rooms[roomId] = {
    state: createInitialState(),
    playersByUserId: {}, // userId -> player object
    socketToUserId: {},  // socketId -> userId
    status: "alive",     // "alive" | "closing" | "dead"
    aiOnlySince: null
  };

  const room = rooms[roomId];
  socket.join(roomId);

  // create initial player
  room.playersByUserId[userId] = {
    role: "A",
    userId,
    socketId: socket.id,
    connected: true,
    disconnectedAt: null,
    isAI: false
  };

  room.socketToUserId[socket.id] = userId;

  // Keep state mapping compatible for clients
  room.state.roles = room.state.roles || {};
  room.state.roles[socket.id] = "A";

  room.state.hostUserId = userId;

  return roomId;
}

/**
 * Join a room OR reattach if userId exists and is disconnected.
 * Returns: { ok, error?, reattached?, role?, shouldResumeGame? }
 */
function joinOrReattach(socket, roomId, userId) {
  const room = rooms[roomId];
  if (!room) {
    console.warn("[joinOrReattach] room not found:", roomId);
    return { ok: false, error: "Room not found" };
  }
  room.aiOnlySince = null;
  if (!userId) return { ok: false, error: "Missing userId" };

  room.playersByUserId ??= {};
  room.socketToUserId ??= {};

  const existing = room.playersByUserId[userId];

  // If this socket was previously mapped to another userId, clear that mapping
  const prevMappedUser = room.socketToUserId[socket.id];
  if (prevMappedUser && prevMappedUser !== userId) {
    delete room.socketToUserId[socket.id];
  }

  if (existing) {
    // Reattach: update the player's socketId and keep userId as primary identity
    const oldSocketId = existing.socketId;
    if (oldSocketId && room.socketToUserId[oldSocketId] === userId) {
      delete room.socketToUserId[oldSocketId]; // remove old reverse map
    }

    existing.socketId = socket.id;
    existing.connected = true;
    existing.disconnectedAt = null;

    room.socketToUserId[socket.id] = userId;

    // Update any socket-keyed state so clients receive expected mapping
    room.state.roles = room.state.roles || {};
    room.state.roles[socket.id] = existing.role;
    if (oldSocketId) {
      delete room.state.roles[oldSocketId];
      if (room.state.playerNames) {
        // migrate display name if present
        const oldName = room.state.playerNames[oldSocketId];
        if (oldName) {
          delete room.state.playerNames[oldSocketId];
          room.state.playerNames[socket.id] = oldName;
        }
      }
      if (room.state.ready) {
        const oldReady = room.state.ready[oldSocketId];
        if (typeof oldReady !== "undefined") {
          delete room.state.ready[oldSocketId];
          room.state.ready[socket.id] = oldReady;
        }
      }
    }

    socket.join(roomId);

    const shouldResumeGame = !room.state.gameOver && room.state.phase !== "lobby";

    return { ok: true, reattached: true, role: existing.role, shouldResumeGame };
  }

  // Normal join if space (count humans)
  const humanCount = Object.values(room.playersByUserId).filter(p => !p.isAI).length;
  if (humanCount >= 2) {
    return { ok: false, error: "Room is full" };
  }

  socket.join(roomId);

  const occupiedRoles = new Set(Object.values(room.playersByUserId).map(p => p.role));
  const role = occupiedRoles.has("A") ? "B" : "A";

  room.playersByUserId[userId] = {
    role,
    userId,
    socketId: socket.id,
    connected: true,
    disconnectedAt: null,
    isAI: false
  };

  room.socketToUserId[socket.id] = userId;

  // keep state.roles consistent
  room.state.roles = room.state.roles || {};
  room.state.roles[socket.id] = role;

  return {
    ok: true,
    reattached: false,
    role,
    shouldResumeGame: false
  };
}

function cleanupEmptyRooms() {
  for (const [roomId, room] of Object.entries(rooms)) {
    if (!room) continue;
    const hasAny = Object.keys(room.playersByUserId || {}).length > 0;
    if (!hasAny) {
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
    console.log("Room snapshot:", roomId, room.playersByUserId);
    if (room && Object.values(room.playersByUserId || {}).filter(p => p.connected && !p.isAI).length === 1) {
      return roomId;
    }
  }
  return null;
}

/* Remove player by userId (not socketId) */
function removePlayer({ roomId, userId, reason, io, context }) {
  const room = rooms[roomId];
  if (!room || room.status !== "alive") return { ok: false };
  const player = room.playersByUserId?.[userId];
  if (!player) return { ok: false };

  const role = player.role;
  const wasHost = room.state.hostUserId === userId;

  // compute remaining after removal
  const remainingPlayers = Object.entries(room.playersByUserId || {})
    .filter(([uid]) => uid !== userId)
    .map(([_, p]) => p);
  const hasHumanAfterRemoval = remainingPlayers.some(p => !p.isAI);
  if (!hasHumanAfterRemoval) {
    room.aiOnlySince ??= Date.now();
  }

  // remove reverse socket mapping and do socket leave
  const socketId = player.socketId;
  if (socketId && room.socketToUserId?.[socketId] === userId) {
    delete room.socketToUserId[socketId];
    const sock = io?.sockets?.sockets?.get(socketId);
    if (sock) {
      sock.data.roomId = null;
      sock.leave(roomId);
    }
  }

  // delete player record
  delete room.playersByUserId[userId];

  // clean up state socket-keyed maps
  if (socketId) {
    if (room.state.roles) delete room.state.roles[socketId];
    if (room.state.ready) delete room.state.ready[socketId];
    if (room.state.playerNames) delete room.state.playerNames[socketId];
  }

  // notify
  io?.to(roomId).emit("lobbyEvent", { type: "playerLeft", role, reason });

  // host reassignment
  if (wasHost) {
    const newHost = Object.values(room.playersByUserId).find(p => !p.isAI);
    room.state.hostUserId = newHost?.userId ?? null;
    if (newHost && io) {
      io.to(roomId).emit("lobbyEvent", { type: "hostChanged", userId: newHost.userId });
    }
  }

  if (!room.state.gameOver && room.state.phase !== "lobby") {
    stopTimer(roomId);
    room.state.paused = true;
  }

  emitStateForAllPlayers(roomId, room, io);
  return { ok: true };
}

function cleanupDisconnectedPlayers(io, graceMs = 30_000, context) {
  const now = Date.now();
  const AI_ONLY_GRACE_MS = 30_000;

  for (const [roomId, room] of Object.entries(rooms)) {
    if (!room || room.status !== "alive") continue;

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

    room.aiOnlySince = null;

    for (const [userId, player] of Object.entries(room.playersByUserId || {})) {
      if (!player.isAI && !player.connected && player.disconnectedAt && now - player.disconnectedAt >= graceMs) {
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

  const AI_USER = "AI";
  if (room.playersByUserId?.[AI_USER]) return;

  room.playersByUserId[AI_USER] = {
    role: "B",
    userId: AI_USER,
    socketId: null,
    connected: true,
    disconnectedAt: null,
    isAI: true
  };

  // keep state mapping for compatibility (no socket for AI)
  room.state.roles = room.state.roles || {};
  room.state.roles["AI"] = "B";
}

/* Force close - unchanged */
function forceCloseRoom(roomId, room, io) {
  if (!room) return;
  if (room.status === "dead") return;
  room.status = "dead";
  console.log("[forceCloseRoom] closing room:", roomId);
  stopAllRoomIntervals(roomId, room);
  if (io) {
    io.to(roomId).emit("forceLeaveRoom");
    io.in(roomId).socketsLeave(roomId);
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
  addAIPlayer,
  getPlayerByUserId,
  syncStateSocketKeys
};
