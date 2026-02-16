// core/rooms.js
const { createInitialState } = require("./stateFactory");
const {endGame }  = require("./phases/gameOver");
const { emitStateForAllPlayers } = require("../utils/emitState");;
const { stopTimer } = require("../utils/Timer");
const {   destroyRoom, stopAllRoomIntervals } = require("../utils/teardown");
const rooms = {};

function hasAnyHumanPlayers(room) {
  return Object.values(room.players).some(
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
    players: {},
    status: "alive", // or "closing" | "dead",
    currentSocketByUserId: {},
    aiOnlySince: null
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
  room.currentSocketByUserId[userId] = socket.id;
  room.state.roles[socket.id] = "A";
  room.state.hostUserId = userId;

  return roomId;
}

/**
 * Join a room OR reattach if userId exists and is disconnected.
 */
function joinOrReattach(socket, roomId, userId) {
    const room = rooms[roomId];
    if (!room) {
      console.warn("[joinOrReattach] room not found:", roomId);
      return { ok: false, error: "Room not found" };
    }
  room.aiOnlySince = null;
    if (!userId) return { ok: false, error: "Missing userId" };
    room.currentSocketByUserId ??= {};
    const existing = getPlayerByUserId(room, userId);
    if (existing) {
      const { socketId: oldSocketId, player } = existing;
      room.currentSocketByUserId[userId] = socket.id;
      const oldName = room.state.playerNames?.[oldSocketId];
      const oldReady = room.state.ready?.[oldSocketId];
      
      delete room.players[oldSocketId];
      if (room.state.playerNames) delete room.state.playerNames[oldSocketId];
      if (room.state.roles) delete room.state.roles[oldSocketId];
      if (room.state.ready) delete room.state.ready[oldSocketId];
      if (oldName) room.state.playerNames[socket.id] = oldName;
      if (oldReady && room.state.ready) room.state.ready[socket.id] = oldReady;
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
    room.currentSocketByUserId ??= {};
    room.currentSocketByUserId[userId] = socket.id;
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
    if (room &&Object.values(room.players).filter(p => p.connected && !p.isAI).length === 1) {
  return roomId;
}
  }
  return null;
}

function removePlayer({ roomId, socketId, reason, io, context }) {
  const room = rooms[roomId];
  if (!room || room.status !== "alive") return { ok: false };
  const player = room.players[socketId];
  if (!player) return { ok: false };
  const role = player.role;
  const userId = player.userId;
  const wasHost = room.state.hostUserId === userId;
  const remainingPlayers = Object.entries(room.players)
    .filter(([id]) => id !== socketId)
    .map(([_, p]) => p);
  const hasHumanAfterRemoval = remainingPlayers.some(p => !p.isAI);
  if (!hasHumanAfterRemoval) {
    room.aiOnlySince ??= Date.now();
  }
  
  delete room.players[socketId];
  delete room.state.roles[socketId];
  delete room.state.ready?.[socketId];
  delete room.state.playerNames?.[socketId];

  if (room.currentSocketByUserId?.[userId] === socketId) {
    delete room.currentSocketByUserId[userId];
  }
  const sock = io?.sockets?.sockets?.get(socketId);
  if (sock) {
    sock.data.roomId = null;  
    sock.leave(roomId);
  }
    io?.to(roomId).emit("lobbyEvent", {
    type: "playerLeft",
    role,
    reason
  });
   if (wasHost) {
    const newHost = Object.values(room.players).find(p => !p.isAI);
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
  emitStateForAllPlayers(roomId, room, io);
  return { ok: true };
}

function cleanupDisconnectedPlayers(io, graceMs = 30_000, context) {
  const now = Date.now();
  const AI_ONLY_GRACE_MS = 30_000;

  for (const [roomId, room] of Object.entries(rooms)) {
    // 🛑 Skip rooms already being destroyed
    if (!room || room.status !== "alive") continue;

    // 🔥 Handle AI-only rooms first
    if (!hasAnyHumanPlayers(room)) {
      if (!room.aiOnlySince) {
        room.aiOnlySince = now;
        continue;
      }

      if (now - room.aiOnlySince >= AI_ONLY_GRACE_MS) {
        console.log("Cleaning AI-only room after grace:", roomId);
        forceCloseRoom(roomId, room, io);
      }

      // 🚫 Never process disconnected players for AI-only rooms
      continue;
    }

    // Humans exist → reset marker
    room.aiOnlySince = null;

    // Handle disconnected human players
    for (const [socketId, player] of Object.entries(room.players)) {
      if (
        !player.connected &&
        player.disconnectedAt &&
        now - player.disconnectedAt >= graceMs
      ) {
        // removePlayer is now safe; it may destroy the room
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

function addAIPlayer(room) {
  if (!room || room.status !== "alive") return;

  const AI_ID = "AI";

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

function forceCloseRoom(roomId, room, io) {
  if (!room) return;
  if (room.status === "dead") return;
  room.status = "dead";
  console.log("[forceCloseRoom] closing room:", roomId);
  stopAllRoomIntervals(roomId, room);
  // Notify clients
  if (io) {
    io.to(roomId).emit("forceLeaveRoom");
    io.in(roomId).socketsLeave(roomId);
  }
  // Final removal
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
