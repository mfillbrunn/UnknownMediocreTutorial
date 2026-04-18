// network/socketHandlers.js

const {
  rooms,
  createRoom,
  removePlayer,
  findLastOpenRoom,
  joinOrReattach,
  getPlayerByUserId,
  getPlayerState,
  setPlayerName,
  emitRoomState
} = require("../core/rooms");
const { startGameTimer } = require("../core/timeouts/timeoutController");
const { stopAllRoomIntervals } = require("../utils/teardown");
const { maybeRunAI } = require("../core/ai/runAI");
const { buildSetterRemainingBoxState } = require("../utils/remainingWords");

module.exports = function registerSocketHandlers(io, context) {
  io.on("connection", (socket) => {
    /* ---------- CREATE ROOM ---------- */
    socket.on("createRoom", ({ userId, name }, cb) => {
      const roomId = createRoom(socket, userId);
      socket.data.roomId = roomId;

      const room = rooms[roomId];

      if (name) {
        setPlayerName(room, userId, name);
      }

      const role = room.state.players?.[userId]?.role ?? null;

      socket.emit("roleAssigned", { role });

      cb?.({
        ok: true,
        roomId,
        role,
        state: room.state
      });

      emitRoomState(roomId, room, io);
    });

    /* ---------- JOIN ROOM / REATTACH ---------- */
    socket.on("joinRoom", ({ roomId, userId, name }, cb) => {
      const result = joinOrReattach(socket, roomId, userId);
      if (!result.ok) return cb?.(result);

      if (socket.data.roomId && socket.data.roomId !== roomId) {
        socket.leave(socket.data.roomId);
      }

      socket.data.roomId = roomId;
      const room = rooms[roomId];

      if (name) {
        setPlayerName(room, userId, name);
      }

      if (result.reattached && result.shouldResumeGame) {
        room.state.paused = false;
        room.state.roundStartTime = Date.now();

        if (
          room.state.timeControl?.enabled &&
          !room.state.gameOver &&
          room.state.phase !== "lobby"
        ) {
          room.state.roundStartTime = Date.now();
          startGameTimer(room, room.state, roomId, context);
        }
      }

      socket.emit("roleAssigned", { role: result.role });

      socket.to(roomId).emit("lobbyEvent", {
        type: result.reattached ? "playerRejoined" : "playerJoined",
        userId
      });

      cb?.({
        ok: true,
        roomId,
        reattached: result.reattached,
        role: result.role,
        state: room.state
      });

      emitRoomState(roomId, room, io);
    });

    /* ---------- QUICK JOIN ---------- */
    socket.on("quickJoin", ({ userId, name }, cb) => {
      const roomId = findLastOpenRoom();
      if (!roomId) {
        return cb?.({ ok: false, error: "No open rooms available" });
      }

      const result = joinOrReattach(socket, roomId, userId);
      if (!result.ok) return cb?.(result);

      if (socket.data.roomId && socket.data.roomId !== roomId) {
        socket.leave(socket.data.roomId);
      }

      socket.data.roomId = roomId;
      const room = rooms[roomId];

      if (name) {
        setPlayerName(room, userId, name);
      }

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

      socket.emit("roleAssigned", { role: result.role });

      socket.to(roomId).emit("lobbyEvent", {
        type: result.reattached ? "playerRejoined" : "playerJoined",
        userId
      });

      cb?.({
        ok: true,
        roomId,
        reattached: result.reattached,
        role: result.role,
        state: room.state
      });

      emitRoomState(roomId, room, io);
    });

    /* ---------- SETTER REMAINING BOX ---------- */
socket.on("setterDraftSecret", ({ roomId, draft }) => {
  const room = rooms[roomId];
  if (!room || !room.state) return;

  const userId = room.socketToUserId?.[socket.id];
  if (!userId) return;

  const actingPlayer = getPlayerState(room, userId);
  if (!actingPlayer) return;
  if (actingPlayer.role !== "setter") return;
  if (userId !== room.state.setter) return;

  const normalized =
    typeof draft === "string" ? draft.trim().toUpperCase() : "";

  // DEBUG
  console.log("[setterDraftSecret]", {
    userId,
    stateSetter: room.state.setter,
    phase: room.state.phase,
    historyLength: room.state.history?.length,
    allowedSecretsLength: context.ALLOWED_SECRETS?.length,
    normalized,
  });

  const boxState = buildSetterRemainingBoxState(
    room.state,
    userId,
    context.ALLOWED_SECRETS,
    normalized
  );

  console.log("[setterDraftSecret] boxState", boxState);

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

      const connPlayer = room.playersByUserId?.[userId];
      const statePlayer = room.state.players?.[userId];

      if (!connPlayer || !connPlayer.connected || !statePlayer) {
        console.warn("[gameAction] player not active", userId);
        return;
      }

      action.userId = userId;

      try {
        context.applyAction(room, room.state, action, roomId, context);
      } catch (err) {
        console.error("[gameAction] applyAction error", err);
      }

      emitRoomState(roomId, room, io);

      if (
        !action.ai &&
        !action.type.startsWith("USE_") &&
        (room.state.phase === "normal" || room.state.phase === "simultaneous")
      ) {
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

      const connPlayer = room.playersByUserId?.[userId];
      const statePlayer = room.state.players?.[userId];
      if (!connPlayer || !statePlayer) return;

      if (connPlayer.socketId && connPlayer.socketId !== socket.id) {
        console.log(
          "[DISCONNECT] ignored stale socket",
          socket.id,
          "authoritative is",
          connPlayer.socketId
        );
        return;
      }

      connPlayer.connected = false;
      connPlayer.disconnectedAt = Date.now();

      delete room.socketToUserId[socket.id];

      if (room.state.roundStartTime && room.state.activeTimer) {
        const dt = Math.floor((Date.now() - room.state.roundStartTime) / 1000);

        const activeUsers =
          room.state.activeTimer === "both"
            ? [room.state.setter, room.state.guesser].filter(Boolean)
            : [room.state.activeTimer];

        for (const activeUserId of activeUsers) {
          room.state.timeUsed[activeUserId] =
            (room.state.timeUsed[activeUserId] || 0) + Math.max(0, dt);
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
        userId
      });

      emitRoomState(roomId, room, io);
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
      const me = room.state.players?.[myUserId];

      if (!me || room.state.hostUserId !== myUserId) {
        return cb?.({ ok: false, error: "Not host" });
      }

      const target = Object.values(room.state.players || {}).find(
        (p) => p.userId !== myUserId && !p.isAI
      );

      if (!target) {
        return cb?.({ ok: false, error: "No player to kick" });
      }

      const targetConn = room.playersByUserId?.[target.userId];

      removePlayer({
        roomId,
        userId: target.userId,
        reason: "kicked",
        io,
        context
      });

      if (targetConn?.socketId) {
        io.to(targetConn.socketId).emit("forceLeaveRoom");
      }

      socket.emit("lobbyEvent", {
        type: "playerKicked",
        userId: target.userId
      });

      cb?.({ ok: true });
    });
  });
};
