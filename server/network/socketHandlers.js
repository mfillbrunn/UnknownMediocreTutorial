// network/socketHandlers.js

const {
  rooms,
  createRoom,
  removePlayer,
  findLastOpenRoom,
  joinOrReattach,
  getPlayerByUserId,
  syncStateSocketKeys
} = require("../core/rooms");
const { emitStateForAllPlayers } = require("../utils/emitState");
const { startGameTimer } = require("../core/timeouts/timeoutController");
const { stopAllRoomIntervals } = require("../utils/teardown");
const { maybeRunAI } = require("../core/ai/runAI");

module.exports = function registerSocketHandlers(io, context) {
  const { ALLOWED_GUESSES, ALLOWED_SECRETS } = context;

  io.on("connection", socket => {
    /* ---------- CREATE ROOM ---------- */
    socket.on("createRoom", ({ userId, name }, cb) => {
      const roomId = createRoom(socket, userId);
      socket.data.roomId = roomId;
      const room = rooms[roomId];

      // map display name into socket-keyed container
      if (name) {
        room.state.playerNames = room.state.playerNames || {};
        room.state.playerNames[socket.id] = String(name).trim().slice(0, 16);
      }

      socket.emit("roleAssigned", { role: "A" });
      cb?.({ ok: true, roomId });

      // ensure state mappings in sync (roles keyed by socket)
      syncStateSocketKeys(room);
      emitStateForAllPlayers(roomId, room, io);
    });

    /* ---------- JOIN ROOM / REATTACH ---------- */
    socket.on("joinRoom", ({ roomId, userId, name }, cb) => {
      const result = joinOrReattach(socket, roomId, userId);
      if (!result.ok) return cb?.(result);

      // if socket had another room, leave it
      if (socket.data.roomId && socket.data.roomId !== roomId) {
        socket.leave(socket.data.roomId);
      }
      socket.data.roomId = roomId;
      const room = rooms[roomId];

      // put display name into socket-keyed state (compat)
      if (name) {
        room.state.playerNames = room.state.playerNames || {};
        room.state.playerNames[socket.id] = String(name).trim().slice(0, 16);
      }

      if (result.reattached && result.shouldResumeGame) {
        room.state.paused = false;
        room.state.roundStartTime = Date.now();
        if (room.state.timeControl?.enabled && !room.state.gameOver && room.state.phase !== "lobby") {
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
        state: room.state
      });

      // sync socket-keyed state and broadcast
      syncStateSocketKeys(room);
      emitStateForAllPlayers(roomId, room, io);
    });

    /* ---------- QUICK JOIN ---------- */
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
        if (room.state.timeControl?.enabled && !room.state.gameOver && room.state.phase !== "lobby") {
          startGameTimer(room, room.state, roomId, context);
        }
      }

      if (name) {
        room.state.playerNames = room.state.playerNames || {};
        room.state.playerNames[socket.id] = String(name).trim().slice(0, 16);
      }

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
        state: room.state
      });

      syncStateSocketKeys(room);
      emitStateForAllPlayers(roomId, room, io);
    });
    /*------REMAINING BOX ------*/
socket.on("setterDraftSecret", ({ roomId, draft }) => {
  console.log("SERVER got setterDraftSecret", {
    roomId,
    draft,
    socketId: socket.id
  });

  const room = rooms[roomId];
  if (!room || !room.state) {
    console.log("SERVER no room/state", { roomId });
    return;
  }

  const state = room.state;

  if (socket.id !== state.setter) {
    console.log("SERVER not setter", {
      socketId: socket.id,
      setter: state.setter
    });
    return;
    
  }

  const normalized = typeof draft === "string" ? draft.trim().toUpperCase() : "";

  const boxState = buildSetterRemainingBoxState(
    state,
    socket.id,
    context.ALLOWED_SECRETS,
    normalized
  );

  console.log("SERVER emitting setterRemainingBox", boxState);
  socket.emit("setterRemainingBox", boxState);
});
    /* ---------- GAME ACTION ---------- */
    socket.on("gameAction", ({ action }) => {
      const roomId = socket.data.roomId;
      if (!roomId || !rooms[roomId]) {
        console.warn("[gameAction] socket not in valid room", socket.id);
        socket.emit("roomInvalid", { reason: "desync" });
        return;
      }
      const room = rooms[roomId];

      const userId = room.socketToUserId?.[socket.id];
      if (!userId) {
        console.warn("[gameAction] no userId for socket", socket.id);
        return;
      }
      const player = room.playersByUserId?.[userId];
      if (!player || !player.connected) {
        console.warn("[gameAction] player not active", userId);
        return;
      }

      // pass stable identifiers into game logic
      action.userId = userId;
      action.role = player.role;

      try {
        context.applyAction(room, room.state, action, player.role, roomId, context);
      } catch (err) {
        console.error("[gameAction] applyAction error", err);
      }

      // update state->socket keyed maps and broadcast
      syncStateSocketKeys(room);
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

    /* ---------- DISCONNECT ---------- */
    socket.on("disconnect", () => {
      const roomId = socket.data.roomId;
      if (!roomId) return;

      const room = rooms[roomId];
      if (!room) return;

      const userId = room.socketToUserId?.[socket.id];
      if (!userId) return;

      const player = room.playersByUserId?.[userId];
      if (!player) return;

      // Ensure that we don't treat a replaced socket as the primary disconnect
      // If player's current socketId is different, ignore this stale disconnect
      if (player.socketId && player.socketId !== socket.id) {
        console.log("[DISCONNECT] ignored stale socket", socket.id, "authoritative is", player.socketId);
        return;
      }

      player.connected = false;
      player.disconnectedAt = Date.now();

      // remove reverse map for this socket
      delete room.socketToUserId[socket.id];

      // update timers and paused state
      if (room.state.roundStartTime && room.state.activeTimer) {
        const dt = Math.floor((Date.now() - room.state.roundStartTime) / 1000);
        const roles = room.state.activeTimer === "both" ? ["A", "B"] : [room.state.activeTimer];
        for (const r of roles) {
          room.state.timeUsed[r] = (room.state.timeUsed[r] || 0) + Math.max(0, dt);
        }
        room.state.roundStartTime = Date.now();
      }
      room.state.paused = true;

      if (room.state.timeControl?.enabled) {
        stopAllRoomIntervals(roomId, room);
        room.state.isTimerRunning = false;
      }

      socket.to(roomId).emit("lobbyEvent", {
        type: "playerDisconnected",
        role: player.role
      });

      // update state->socket maps and broadcast
      syncStateSocketKeys(room);
      emitStateForAllPlayers(roomId, room, io);
    });

    /* ---------- LEAVE ROOM ---------- */
    socket.on("leaveRoom", (_payload, cb) => {
      const roomId = socket.data.roomId;
      if (!roomId) return cb?.({ ok: false, error: "Not in a room" });
      const room = rooms[roomId];
      if (!room) return cb?.({ ok: false, error: "Room not found" });

      const userId = room.socketToUserId?.[socket.id];
      if (!userId) return cb?.({ ok: false, error: "Not in a room" });

      removePlayer({
        roomId,
        userId,
        reason: "leave",
        io,
        context
      });
      socket.data.roomId = null;
      cb?.({ ok: true });
    });

    /* ---------- KICK PLAYER ---------- */
    socket.on("kickPlayer", ({ roomId }, cb) => {
      const room = rooms[roomId];
      if (!room) return cb?.({ ok: false, error: "Room not found" });

      const myUserId = room.socketToUserId?.[socket.id];
      const me = room.playersByUserId?.[myUserId];
      if (!me || room.state.hostUserId !== me.userId) {
        return cb?.({ ok: false, error: "Not host" });
      }

      // Find a non-host player to kick
      const target = Object.values(room.playersByUserId || {}).find(p => p.userId !== myUserId && !p.isAI);
      if (!target) return cb?.({ ok: false, error: "No player to kick" });

      removePlayer({
        roomId,
        userId: target.userId,
        reason: "kicked",
        io,
        context
      });

      // Notify kicked player's socket explicitly (if connected)
      if (target.socketId) io.to(target.socketId).emit("forceLeaveRoom");
      socket.emit("lobbyEvent", { type: "playerKicked", role: target.role });

      cb?.({ ok: true });
    });

  }); // connection
};
