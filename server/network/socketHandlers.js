// network/socketHandlers.js

const { rooms, createRoom,removePlayer, findLastOpenRoom, joinOrReattach  } = require("../core/rooms");
const { emitStateForAllPlayers } = require("../utils/emitState");
const { startGameTimer } = require("../core/timeouts/timeoutController");
const {  stopAllRoomIntervals } = require("../utils/teardown");
const {maybeRunAI} = require("../core/ai/runAI");

module.exports = function registerSocketHandlers(io, context) {
  const { ALLOWED_GUESSES, ALLOWED_SECRETS } = context;
  
  io.on("connection", socket => {

    // CREATE ROOM ----------------------------
socket.on("createRoom", ({ userId, name, mode }, cb) => {
  const roomId = createRoom(socket, userId);
  socket.data.roomId = roomId;
  const room = rooms[roomId];
  if (mode === "tutorial") {
    const TutorialMode = require("../core/modes/tutorialMode");
    room.state.isTutorial = true;
    console.log("Tutorial mode");
    room.state.mode = new TutorialMode();
  }
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
  if (socket.data.roomId && socket.data.roomId !== roomId) {
    socket.leave(socket.data.roomId);
  }
  socket.data.roomId = roomId;
  const room = rooms[roomId];
  if (name) {
    room.state.playerNames[socket.id] = String(name).trim().slice(0, 16);
  }

  if (result.reattached && result.shouldResumeGame) {
    room.state.paused = false;
    room.state.roundStartTime = Date.now();
  if (
    room.state.timeControl?.enabled &&
    !room.state.gameOver &&
    room.state.phase !== "lobby"
  ) {
    // Resume timing from current phase/turn
    room.state.roundStartTime = Date.now();
    startGameTimer(room, room.state, roomId, context);
  }
  }
    socket.emit("roleAssigned", { role: result.role });
    socket.to(roomId).emit("lobbyEvent", { type: "playerJoined" });
    cb?.({
  ok: true,
  roomId,
  reattached: result.reattached,
  role: result.role,
  state: room.state,
  // optional: minimal player info (don’t send sockets if you don’t want)
});
    emitStateForAllPlayers(roomId, room, io);
});

    // QUICK JOIN ------------------------------
socket.on("quickJoin", ({ userId, name }, cb) => {
  const roomId = findLastOpenRoom();
  if (!roomId) return cb?.({ ok: false, error: "No open rooms available" });
  const result = joinOrReattach(socket, roomId, userId);
  if (!result.ok) return cb?.(result);
  if (socket.data.roomId && socket.data.roomId !== roomId) {
    socket.leave(socket.data.roomId);
  }
  socket.data.roomId = roomId;
  const room = rooms[roomId];
  if (result.reattached && result.shouldResumeGame) {
    room.state.paused = false;
    room.state.roundStartTime = Date.now();
    if (
      room.state.timeControl?.enabled &&
      !room.state.gameOver &&
      room.state.phase !== "lobby"
    ) {
      startGameTimer(room, room.state, roomId, context);
    }
  }
  if (name) {room.state.playerNames[socket.id] = String(name).trim().slice(0, 16);}
  socket.emit("roleAssigned", { role: result.role });
  socket.to(roomId).emit("lobbyEvent", {
    type: result.reattached ? "playerRejoined" : "playerJoined",
    role: result.role
  });
  cb?.({
  ok: true,
  roomId,
  reattached: result.reattached,
  role: result.role,
  state: room.state,
  // optional: minimal player info (don’t send sockets if you don’t want)
});

  emitStateForAllPlayers(roomId, room, io);
});

    // GAME ACTION -----------------------------
socket.on("gameAction", ({ action }) => {
  const roomId = socket.data.roomId;
  if (!roomId || !rooms[roomId]) {
    console.warn("[gameAction] socket not in valid room", socket.id);
    socket.emit("roomInvalid", { reason: "desync" });
    return;
  }
  const room = rooms[roomId];
  const player = room.players[socket.id];
  if (!player || !player.connected) {
    console.warn("[gameAction] player not active", socket.id);
    return;
  }
  action.playerId = socket.id;
  action.role = player.role;

  context.applyAction(room, room.state, action, player.role, roomId, context);
  emitStateForAllPlayers(roomId, room, io);
    if (!action.ai && !action.type.startsWith("USE_") && (room.state.phase === "normal" || room.state.phase === "simultaneous")) {
    setTimeout(() => {
      try {
        maybeRunAI(room, roomId, context);
      } catch (err) {
        console.error("maybeRunAI crashed:", err);
      }
    }, 1000);
  }
});


    // DISCONNECT ------------------------------
socket.on("disconnect", () => {
  for (const [roomId, room] of Object.entries(rooms)) {
    const player = room.players[socket.id];
    if (!player) continue;
    room.currentSocketByUserId ??= {};
    const authoritativeSocketId =room.currentSocketByUserId?.[player.userId];
    // Ignore stale sockets, but tolerate missing authority after resets
  if (authoritativeSocketId && authoritativeSocketId !== socket.id) {console.log("[DISCONNECT] ignored stale socket", socket.id, "authoritative is", authoritativeSocketId);
    continue;
  }
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
      stopAllRoomIntervals(roomId, room);
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
    removePlayer({
      roomId,
      socketId: socket.id,
      reason: "leave",
      io,
      context
    });
    socket.data.roomId = null;
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
  if (!me || room.state.hostUserId !== me.userId) {
    return cb?.({ ok: false, error: "Not host" });
  }

  // Find the other player
  const targetEntry = Object.entries(room.players)
    .find(([id]) => id !== socket.id);

  if (!targetEntry) {
    return cb?.({ ok: false, error: "No player to kick" });
  }

  const [targetSocketId, targetPlayer] = targetEntry;

  // ✅ REMOVE THE TARGET (not the host)
  removePlayer({
    roomId,
    socketId: targetSocketId,
    reason: "kicked",
    io,
    context
  });

  // Notify kicked player explicitly
  io.to(targetSocketId).emit("forceLeaveRoom");  
  // Notify host only (optional UX)
  socket.emit("lobbyEvent", {
    type: "playerKicked",
    role: targetPlayer?.role
  });

  cb?.({ ok: true });
});

});
};
