// network/socketHandlers.js

const { rooms, createRoom, findLastOpenRoom, joinOrReattach  } = require("../core/rooms");
const applyAction = require("../core/stateMachine");
const { emitStateForAllPlayers } = require("../utils/emitState");
const { emitLobbyEvent } = require("../utils/emitLobby");
const { stopTimer } = require("../utils/chessTimer");
const { startGameTimer } = require("../core/phases/normal");

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
    room.state.roundStartTime = Date.now();
    if ( room.state.timeControl?.enabled && room.state.phase !== "lobby" && room.state.phase !== "gameOver" &&
      room.state.phase !== "roundSummary" &&  room.state.activeTimer) 
        {
      startGameTimer(room, room.state, roomId, context);
      room.state.isTimerRunning = true;
      }
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
  if (result.reattached) {
    room.state.paused = false;
    room.state.roundStartTime = Date.now();
    if ( room.state.timeControl?.enabled && room.state.phase !== "lobby" && room.state.phase !== "gameOver" &&
      room.state.phase !== "roundSummary" &&  room.state.activeTimer // must know whose clock is running) {
      startGameTimer(room, room.state, roomId, context);
      room.state.isTimerRunning = true;
  }
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
    if (room.state.roundStartTime && room.state.activeTimer) {
      const dt = Math.floor((Date.now() - room.state.roundStartTime) / 1000);    
      const roles =
        room.state.activeTimer === "both"
          ? ["A", "B"]
          : [room.state.activeTimer];    
      for (const r of roles) {
        room.state.timeUsed[r] = (room.state.timeUsed[r] || 0) + Math.max(0, dt);
      }    
      // reset baseline so resume doesn't double count
      room.state.roundStartTime = Date.now();
    }

    room.state.paused = true;
    if (room.state.timeControl?.enabled) {
      stopTimer(roomId);
      room.state.isTimerRunning = false;
    };

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
  if (!room) return cb?.({ ok: false, error: "Room not found" });

  const me = room.players[socket.id];
  if (!me) return cb?.({ ok: false, error: "Not in room" });

  // Host check
  if (room.state.host !== socket.id) {
    return cb?.({ ok: false, error: "Not host" });
  }

  // Find the other player (by socket id)
  const targetEntry = Object.entries(room.players)
    .find(([id]) => id !== socket.id);

  if (!targetEntry) {
    return cb?.({ ok: false, error: "No player to kick" });
  }

  const [targetSocketId, targetPlayer] = targetEntry;

  // Remove target
  removePlayerFromRoom({
    room,
    socketId: targetSocketId
  });

  // Ensure socket leaves the room server-side
  io.sockets.sockets.get(targetSocketId)?.leave(roomId);

  // Notify the kicked player
  io.to(targetSocketId).emit("lobbyEvent", {
    type: "playerLeft",
    reason: "kicked",
    role: targetPlayer?.role
  });
  io.to(targetSocketId).emit("forceLeaveRoom");

  // Notify the host (kicker)
  socket.emit("lobbyEvent", {
    type: "playerKicked",
    role: targetPlayer?.role
  });
  socket.to(roomId).emit("lobbyEvent", {
    type: "playerLeft",
    reason: "kicked",
    role: targetPlayer?.role
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
}
