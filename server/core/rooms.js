// core/rooms.js
const { createInitialState } = require("./stateFactory");
const { emitStateForAllPlayers } = require("../utils/emitState");
const { stopTimer } = require("../utils/Timer");
const { stopAllRoomIntervals } = require("../utils/teardown");

const rooms = {};

/* ---------- Helpers ---------- */

function hasAnyHumanPlayers(room) {
  return Object.values(room.playersByUserId || {}).some(
    (p) => !p.isAI && p.connected
  );
}

function generateRoomId() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let id = "";
  for (let i = 0; i < 4; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

function getPlayerByUserId(room, userId) {
  if (!room || !userId) return null;
  return room.playersByUserId?.[userId] ?? null;
}

function ensureConnectionPlayer(room, userId, overrides = {}) {
  if (!room || !userId) return null;

  room.playersByUserId ||= {};
  room.playersByUserId[userId] ||= {
    userId,
    socketId: null,
    connected: false,
    disconnectedAt: null,
    isAI: false
  };

  Object.assign(room.playersByUserId[userId], overrides);
  return room.playersByUserId[userId];
}

function ensureStatePlayer(room, userId, overrides = {}) {
  if (!room || !userId) return null;

  const connPlayer = room.playersByUserId?.[userId];
  room.state.players ||= {};

  room.state.players[userId] ||= {
    userId,
    role: null,      // "setter" | "guesser"
    ready: false,
    name: null,
    isAI: !!connPlayer?.isAI
  };

  if (connPlayer) {
    room.state.players[userId].isAI = !!connPlayer.isAI;
  }

  Object.assign(room.state.players[userId], overrides);
  return room.state.players[userId];
}

function getPlayerState(room, userId) {
  if (!room || !userId) return null;
  return room.state.players?.[userId] ?? null;
}

function getMissingRole(room) {
  const roles = new Set(
    Object.values(room.state.players || {})
      .map((p) => p.role)
      .filter(Boolean)
  );

  return roles.has("setter") ? "guesser" : "setter";
}

function setPlayerRole(room, userId, role) {
  const player = ensureStatePlayer(room, userId);
  if (!player) return null;

  player.role = role;
  syncTurnOwners(room);
  return player;
}

function setPlayerReady(room, userId, ready) {
  const player = ensureStatePlayer(room, userId);
  if (!player) return null;

  player.ready = !!ready;
  return player;
}

function setPlayerName(room, userId, name) {
  const player = ensureStatePlayer(room, userId);
  if (!player) return null;

  const trimmed = String(name ?? "").trim().slice(0, 16);
  player.name = trimmed || null;
  return player;
}

function clearAllReady(room) {
  for (const player of Object.values(room.state.players || {})) {
    player.ready = false;
  }
}

function syncTurnOwners(room) {
  const players = Object.values(room.state.players || {});
  room.state.setter = players.find((p) => p.role === "setter")?.userId ?? null;
  room.state.guesser = players.find((p) => p.role === "guesser")?.userId ?? null;
}

function removePlayerState(room, userId) {
  delete room.playersByUserId?.[userId];
  delete room.state.players?.[userId];

  if (room.state.hostUserId === userId) {
    room.state.hostUserId = null;
  }
  if (room.state.setter === userId) {
    room.state.setter = null;
  }
  if (room.state.guesser === userId) {
    room.state.guesser = null;
  }

  syncTurnOwners(room);
}

function emitRoomState(roomId, room, io) {
  syncTurnOwners(room);
  emitStateForAllPlayers(roomId, room, io);
}

/* ---------- Room lifecycle ---------- */

function createRoom(socket, userId) {
  let roomId;
  do {
    roomId = generateRoomId();
  } while (rooms[roomId]);

  rooms[roomId] = {
    state: createInitialState(),
    playersByUserId: {}, // transport/session layer only
    socketToUserId: {},  // socketId -> userId
    status: "alive",
    aiOnlySince: null
  };

  const room = rooms[roomId];
  socket.join(roomId);

  ensureConnectionPlayer(room, userId, {
    socketId: socket.id,
    connected: true,
    disconnectedAt: null,
    isAI: false
  });

  ensureStatePlayer(room, userId, {
    userId,
    role: "setter",
    ready: false,
    name: null,
    isAI: false
  });

  room.socketToUserId[socket.id] = userId;
  room.state.hostUserId = userId;
  syncTurnOwners(room);

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

  if (!userId) {
    return { ok: false, error: "Missing userId" };
  }

  room.playersByUserId ||= {};
  room.socketToUserId ||= {};
  room.state.players ||= {};

  const existingConn = room.playersByUserId[userId];

  const prevMappedUserId = room.socketToUserId[socket.id];
  if (prevMappedUserId && prevMappedUserId !== userId) {
    delete room.socketToUserId[socket.id];
  }

  if (existingConn) {
    const oldSocketId = existingConn.socketId;
    if (oldSocketId && room.socketToUserId[oldSocketId] === userId) {
      delete room.socketToUserId[oldSocketId];
    }

    existingConn.socketId = socket.id;
    existingConn.connected = true;
    existingConn.disconnectedAt = null;

    room.socketToUserId[socket.id] = userId;

    ensureStatePlayer(room, userId, {
      isAI: !!existingConn.isAI
    });

    socket.join(roomId);

    const shouldResumeGame =
      !room.state.gameOver && room.state.phase !== "lobby";

    return {
      ok: true,
      reattached: true,
      role: room.state.players[userId]?.role ?? null,
      shouldResumeGame
    };
  }

  const humanCount = Object.values(room.playersByUserId).filter(
    (p) => !p.isAI
  ).length;

  if (humanCount >= 2) {
    return { ok: false, error: "Room is full" };
  }

  socket.join(roomId);

  const role = getMissingRole(room);

  ensureConnectionPlayer(room, userId, {
    socketId: socket.id,
    connected: true,
    disconnectedAt: null,
    isAI: false
  });

  ensureStatePlayer(room, userId, {
    userId,
    role,
    ready: false,
    name: null,
    isAI: false
  });

  room.socketToUserId[socket.id] = userId;
  syncTurnOwners(room);

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

    const hasAnyPlayers = Object.keys(room.playersByUserId || {}).length > 0;
    if (!hasAnyPlayers) {
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
      Object.values(room.playersByUserId || {}).filter(
        (p) => p.connected && !p.isAI
      ).length === 1
    ) {
      return roomId;
    }
  }

  return null;
}

function removePlayer({ roomId, userId, reason, io, context }) {
  const room = rooms[roomId];
  if (!room || room.status !== "alive") return { ok: false };

  const connPlayer = room.playersByUserId?.[userId];
  const statePlayer = room.state.players?.[userId];
  if (!connPlayer || !statePlayer) return { ok: false };

  const role = statePlayer.role;
  const wasHost = room.state.hostUserId === userId;

  const remainingPlayers = Object.entries(room.playersByUserId || {})
    .filter(([uid]) => uid !== userId)
    .map(([, p]) => p);

  const hasHumanAfterRemoval = remainingPlayers.some((p) => !p.isAI);
  if (!hasHumanAfterRemoval) {
    room.aiOnlySince ??= Date.now();
  }

  const socketId = connPlayer.socketId;
  if (socketId && room.socketToUserId?.[socketId] === userId) {
    delete room.socketToUserId[socketId];
    const sock = io?.sockets?.sockets?.get(socketId);
    if (sock) {
      sock.data.roomId = null;
      sock.leave(roomId);
    }
  }

  removePlayerState(room, userId);

  io?.to(roomId).emit("lobbyEvent", { type: "playerLeft", userId, role, reason });

  if (wasHost) {
    const newHost = Object.values(room.state.players || {}).find((p) => !p.isAI);
    room.state.hostUserId = newHost?.userId ?? null;

    if (newHost && io) {
      io.to(roomId).emit("lobbyEvent", {
        type: "hostChanged",
        userId: newHost.userId
      });
    }
  }

  if (!room.state.gameOver && room.state.phase !== "lobby") {
    stopTimer(roomId);
    room.state.paused = true;
  }

  emitRoomState(roomId, room, io);
  return { ok: true };
}

function cleanupDisconnectedPlayers(io, graceMs = 30000, context) {
  const now = Date.now();
  const AI_ONLY_GRACE_MS = 30000;

  for (const [roomId, room] of Object.entries(rooms)) {
    if (!room || room.status !== "alive") continue;

    // Unlimited-time games are meant to be played over however long it
    // takes — a player closing the tab mid-turn isn't "leaving", so they
    // never get auto-removed (or the room force-closed) just for being
    // disconnected, even if every human is disconnected at once. They
    // come back via the "My Games" list whenever it's next their turn.
    if (room.state?.timeControl?.enabled === false) continue;

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

function addAIPlayer(room, difficulty = 1) {
  if (!room || room.status !== "alive") return;

  const AI_USER = "AI";
  if (room.playersByUserId?.[AI_USER]) return;

  const role = getMissingRole(room);

  ensureConnectionPlayer(room, AI_USER, {
    socketId: null,
    connected: true,
    disconnectedAt: null,
    isAI: true
  });

  ensureStatePlayer(room, AI_USER, {
    userId: AI_USER,
    role,
    ready: false,
    name: `AI Lvl ${difficulty}`,
    isAI: true
  });

  syncTurnOwners(room);
}

function getSocketIdForUser(room, userId) {
  return room.playersByUserId?.[userId]?.socketId ?? null;
}
function emitErrorToUser(room, io, userId, message) {
  const socketId = getSocketIdForUser(room, userId);
  if (!socketId) return;
  io.to(socketId).emit("errorMessage", message);
}
/* Force close */

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
  forceCloseRoom,

  // helpers exported for use elsewhere
  ensureConnectionPlayer,
  ensureStatePlayer,
  emitErrorToUser,
  getSocketIdForUser,
  getPlayerState,
  getMissingRole,
  setPlayerRole,
  setPlayerReady,
  setPlayerName,
  clearAllReady,
  syncTurnOwners,
  removePlayerState,
  emitRoomState
};
