// core/rooms.js

const { createInitialState } = require("./stateFactory");

const rooms = {};

// Generate a human-friendly room ID
function generateRoomId() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let id = "";
  for (let i = 0; i < 4; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

function createRoom(socket, userID) {
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
    userID,
    connected: true,
    disconnectedAt: null
  };
  room.state.roles[socket.id] = "A";
  room.state.host = socket.id;

  return roomId;
}

function joinRoom(socket, roomId) {
  const room = rooms[roomId];
  if (!room) return { ok: false, error: "Room not found" };

  if (Object.keys(room.players).length >= 2)
    return { ok: false, error: "Room is full" };

  socket.join(roomId);
  room.players[socket.id] = {
    role: "B",
    userId,
    connected: true,
    disconnectedAt: null
  };
  room.state.roles[socket.id] = "B";
  assignRoles(room);

  return { ok: true };
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
    if (room && Object.keys(room.players).length === 1) {
      return roomId;
    }
  }
  return null;
}


module.exports = {
  rooms,
  createRoom,
  joinRoom,
  cleanupEmptyRooms,
  findLastOpenRoom
};
