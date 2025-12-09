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

function assignRoles(room) {
  const ids = Object.keys(room.players);

  if (ids.length === 1) {
    room.players[ids[0]] = "A"; // first player always Setter
  }

  if (ids.length === 2) {
    room.players[ids[0]] = "A";
    room.players[ids[1]] = "B";
  }
}

function createRoom(socket) {
  let roomId;
  do {
    roomId = generateRoomId();
  } while (rooms[roomId]);

  rooms[roomId] = { 
    state: createInitialState(),
    players: {}
  };

  socket.join(roomId);
  rooms[roomId].players[socket.id] = "A";
  assignRoles(rooms[roomId]);

  return roomId;
}

function joinRoom(socket, roomId) {
  const room = rooms[roomId];
  if (!room) return { ok: false, error: "Room not found" };

  if (Object.keys(room.players).length >= 2)
    return { ok: false, error: "Room is full" };

  socket.join(roomId);
  room.players[socket.id] = "B";
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

module.exports = {
  rooms,
  createRoom,
  joinRoom,
  assignRoles,
  cleanupEmptyRooms
};
