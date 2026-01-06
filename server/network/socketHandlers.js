// network/socketHandlers.js

const { rooms, createRoom, joinRoom, findLastOpenRoom  } = require("../core/rooms");
const applyAction = require("../core/stateMachine");
const { emitStateForAllPlayers } = require("../utils/emitState");
const { emitLobbyEvent } = require("../utils/emitLobby");

module.exports = function registerSocketHandlers(io, context) {
  const { ALLOWED_GUESSES } = context;
  
  io.on("connection", socket => {

    // CREATE ROOM ----------------------------
    socket.on("createRoom", cb => {
      const roomId = createRoom(socket);
      const room = rooms[roomId];
      room.state.host = "A";
      socket.emit("roleAssigned", {
        role: "A",
        setterId: socket.id,
        guesserId: null,
        host: "A"
      });
      cb({ ok: true, roomId });
      emitStateForAllPlayers(roomId, room, io);
    });


    // JOIN ROOM ------------------------------
    socket.on("joinRoom", (roomId, cb) => {
      const result = joinRoom(socket, roomId);
      if (!result.ok) return cb(result);

      const room = rooms[roomId];

      // Notify other player (not the joiner)
      socket.to(roomId).emit("lobbyEvent", { type: "playerJoined" });

      const setterId = Object.keys(room.players)
        .find(id => room.players[id] === "A");
      const guesserId = Object.keys(room.players)
        .find(id => room.players[id] === "B");
      socket.emit("roleAssigned", {
        role: room.players[socket.id],
        setterId,
        guesserId
      });

      cb({ ok: true, roomId });
      emitStateForAllPlayers(roomId, room, io);
    });

    // QUICK JOIN ------------------------------
    socket.on("quickJoin", cb => {
      const roomId = findLastOpenRoom();
    
      if (!roomId) {
        return cb({ ok: false, error: "No open rooms available" });
      }
    
      //const result = joinRoom(socket, roomId);
      //if (!result.ok) return cb(result);
    
      const room = rooms[roomId];
       if (!room || !room.players) {
        return cb({ ok: false, error: "Room not found" });
      }
      const occupiedRoles = new Set(Object.values(room.players));
      let assignedRole;
      if (!occupiedRoles.has("A")) {
        assignedRole = "A"; // Setter
      } else if (!occupiedRoles.has("B")) {
        assignedRole = "B"; // Guesser
      } else {
        return cb({ ok: false, error: "Room is full" });
      }
      if (!room.state.host) {
        room.state.host = assignedRole;
      }
      socket.join(roomId);
      room.players[socket.id] = assignedRole;
      
      // Notify host
      socket.to(roomId).emit("lobbyEvent", { type: "playerJoined" });
    
      const setterId = Object.keys(room.players)
        .find(id => room.players[id] === "A");
      const guesserId = Object.keys(room.players)
        .find(id => room.players[id] === "B");
    
      socket.emit("roleAssigned", {
        role: assignedRole,
        setterId,
        guesserId
      });
    
      cb({ ok: true, roomId });
      emitStateForAllPlayers(roomId, room, io);
    });


    // GAME ACTION -----------------------------
    socket.on("gameAction", ({ roomId, action }) => {
      const room = rooms[roomId];
      if (!room) return;

      const role = room.players[socket.id];
      if (!role) return;

      action.playerId = socket.id;
      action.role = role;
      applyAction(room, room.state, action, role, roomId, context);

      emitStateForAllPlayers(roomId, room, io);
    });


    // DISCONNECT ------------------------------
    socket.on("disconnect", () => {
      for (const [roomId, room] of Object.entries(rooms)) {
        delete room.players[socket.id];
      }
    });
    // LEAVE ROOM ------------------------------
socket.on("leaveRoom", cb => {
  for (const [roomId, room] of Object.entries(rooms)) {
    const role = room.players[socket.id];
    if (!role) continue;

    // Remove player
    delete room.players[socket.id];
    socket.leave(roomId);

    // If host left, transfer host
    if (room.state.host === role) {
      const remainingRole = Object.values(room.players)[0];
      room.state.host = remainingRole || null;
    }

    // Notify remaining player
    socket.to(roomId).emit("lobbyEvent", {
      type: "playerLeft",
      role
    });

    emitStateForAllPlayers(roomId, room, io);

    cb?.({ ok: true });
    return;
  }

  cb?.({ ok: false, error: "Not in a room" });
});

// KICK PLAYER ------------------------------
socket.on("kickPlayer", ({ roomId }, cb) => {
  const room = rooms[roomId];
  if (!room) return cb?.({ ok: false });

  const role = room.players[socket.id];
  if (!role) return cb?.({ ok: false });

  // Host check
  if (room.state.host !== role) {
    return cb?.({ ok: false, error: "Not host" });
  }

  // Find the other player
  const targetEntry = Object.entries(room.players)
    .find(([id, r]) => r !== role);

  if (!targetEntry) {
    return cb?.({ ok: false, error: "No player to kick" });
  }

  const [targetSocketId, targetRole] = targetEntry;

  // Remove target
  delete room.players[targetSocketId];
  io.sockets.sockets.get(targetSocketId)?.leave(roomId);

  // Notify kicked player
  io.to(targetSocketId).emit("lobbyEvent", {
    type: "kicked"
  });

  // Notify host
  socket.emit("lobbyEvent", {
    type: "playerKicked",
    role: targetRole
  });

  emitStateForAllPlayers(roomId, room, io);

  cb?.({ ok: true });
});
  });
};


