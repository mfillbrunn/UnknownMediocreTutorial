// network/socketHandlers.js

const { rooms, createRoom, joinRoom, findLastOpenRoom, joinOrReattach  } = require("../core/rooms");
const applyAction = require("../core/stateMachine");
const { emitStateForAllPlayers } = require("../utils/emitState");
const { emitLobbyEvent } = require("../utils/emitLobby");

module.exports = function registerSocketHandlers(io, context) {
  const { ALLOWED_GUESSES } = context;
  
  io.on("connection", socket => {

    // CREATE ROOM ----------------------------
socket.on("createRoom", ({ userId, name }, cb) => {
  const roomId = createRoom(socket, userId);
  const room = rooms[roomId];

  if (name) {
    room.state.playerNames[socket.id] = String(name).trim().slice(0, 16);
  }

  socket.emit("roleAssigned", { role: "A" });
  cb?.({ ok: true, roomId });

  emitStateForAllPlayers(roomId, room, io);
});




    // JOIN ROOM ------------------------------
socket.on("joinRoom", ({ roomId, userId, name }, cb) => {
  const result = joinOrReattach(socket, roomId, userId);
  if (!result.ok) return cb?.(result);

  const room = rooms[roomId];

  if (name) {
    room.state.playerNames[socket.id] = String(name).trim().slice(0, 16);
  }

  if (result.reattached) {
    room.state.paused = false;
    socket.emit("roleAssigned", { role: result.role });

    socket.to(roomId).emit("lobbyEvent", {
      type: "playerRejoined",
      role: result.role
    });
  } else {
    socket.emit("roleAssigned", { role: result.role });

    socket.to(roomId).emit("lobbyEvent", { type: "playerJoined" });
  }

  cb?.({ ok: true, roomId, reattached: result.reattached });

  emitStateForAllPlayers(roomId, room, io);
});



    // QUICK JOIN ------------------------------
socket.on("quickJoin", ({ userId, name }, cb) => {
  const roomId = findLastOpenRoom();
  if (!roomId) return cb?.({ ok: false, error: "No open rooms available" });

  const result = joinOrReattach(socket, roomId, userId);
  if (!result.ok) return cb?.(result);

  const room = rooms[roomId];

  if (name) {
    room.state.playerNames[socket.id] = String(name).trim().slice(0, 16);
  }

  socket.emit("roleAssigned", { role: result.role });

  socket.to(roomId).emit("lobbyEvent", {
    type: result.reattached ? "playerRejoined" : "playerJoined",
    role: result.role
  });

  cb?.({ ok: true, roomId, reattached: result.reattached });
  emitStateForAllPlayers(roomId, room, io);
});



    // GAME ACTION -----------------------------
socket.on("gameAction", ({ roomId, action }) => {
  const room = rooms[roomId];
  if (!room) return;

  const player = room.players[socket.id];
  if (!player || !player.connected) return;

  const role = player.role;
  if (!role) return;

  action.playerId = socket.id;
  action.role = role;

  applyAction(room, room.state, action, role, roomId, context);
  emitStateForAllPlayers(roomId, room, io);
});



    // DISCONNECT ------------------------------
    socket.on("disconnect", () => {
      for (const [roomId, room] of Object.entries(rooms)) {
        const player = room.players[socket.id];
        if (!player) continue;
    
        player.connected = false;
        player.disconnectedAt = Date.now();
    
        // Pause game
        room.state.paused = true;
    
        socket.to(roomId).emit("lobbyEvent", {
          type: "playerDisconnected",
          role: player.role
        });
    
        emitStateForAllPlayers(roomId, room, io);
      }
    });
    // LEAVE ROOM ------------------------------
socket.on("leaveRoom", (_payload, cb) => {
  for (const [roomId, room] of Object.entries(rooms)) {
    if (!room.players[socket.id]) continue;

    const role = room.state.roles[socket.id];

    removePlayerFromRoom({
      room,
      socketId: socket.id
    });

    socket.leave(roomId);

    // Notify remaining player
    socket.to(roomId).emit("lobbyEvent", {
      type: "playerLeft",
      role,
        reason: "leave"
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
  if (room.state.host !== socket.id) {
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
    removePlayerFromRoom({
      room,
      socketId: targetSocketId
    });
    
    io.sockets.sockets.get(targetSocketId)?.leave(roomId);
    
    io.to(targetSocketId).emit("lobbyEvent", {
      type: "playerLeft",
      reason: "kicked"
    });
    io.to(targetSocketId).emit("forceLeaveRoom");
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


////helper
function removePlayerFromRoom({ room, socketId }) {
  if (!room.players[socketId]) return false;

  // Remove from runtime player map
  delete room.players[socketId];

  // Remove from authoritative state
  delete room.state.roles[socketId];
  delete room.state.playerNames[socketId];
  delete room.state.ready?.[socketId];

  // Transfer host if needed
  if (room.state.host === socketId) {
    room.state.host = Object.keys(room.players)[0] || null;
  }

  // If fewer than 2 players remain, force lobby reset
  const remainingPlayers = Object.keys(room.players).length;
  if (remainingPlayers < 2) {
    room.state.phase = "lobby";
    room.state.turn = null;
    room.state.pendingGuess = null;
    room.state.secret = null;
    room.state.simultaneousSecretSubmitted = false;
  }
    const DISCONNECT_GRACE_MS = 60_000;

function cleanupDisconnectedPlayers() {
  const now = Date.now();

  for (const [roomId, room] of Object.entries(rooms)) {
    for (const [socketId, player] of Object.entries(room.players)) {
      if (
        !player.connected &&
        now - player.disconnectedAt > DISCONNECT_GRACE_MS
      ) {
        delete room.players[socketId];

        io.to(roomId).emit("lobbyEvent", {
          type: "playerLeft",
          reason: "timeout",
          role: player.role
        });

        room.state.paused = false;
        emitStateForAllPlayers(roomId, room, io);
      }
    }
  }
}

  return true;
}


