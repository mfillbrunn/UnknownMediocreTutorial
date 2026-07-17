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
  emitRoomState,
  forceCloseRoom
} = require("../core/rooms");
const { startGameTimer } = require("../core/timeouts/timeoutController");
const { stopAllRoomIntervals } = require("../utils/teardown");
const { maybeRunAI } = require("../core/ai/runAI");
const { buildSetterRemainingBoxState, computeRemainingAfterGuess } = require("../utils/remainingWords");
const { getDailyStatus } = require("../core/dailyTracking");

module.exports = function registerSocketHandlers(io, context) {
  io.on("connection", (socket) => {
    /* ---------- DAILY CHALLENGE STATUS ---------- */
    socket.on("getDailyStatus", ({ userId, date }, cb) => {
      cb?.(getDailyStatus(userId, date));
    });

    /* ---------- MY GAMES (unlimited-time games in progress) ---------- */
    socket.on("getMyActiveGames", ({ userId }, cb) => {
      if (!userId) return cb?.([]);

      const results = [];

      for (const [roomId, room] of Object.entries(rooms)) {
        if (!room || room.status !== "alive") continue;
        const state = room.state;
        if (!state || state.gameOver) continue;
        if (state.timeControl?.enabled !== false) continue;

        const me = state.players?.[userId];
        if (!me) continue;

        // A room an "Invite a Friend" host has already readied up and
        // left is still phase "lobby" until the friend joins — surface it
        // too (as pending) so it doesn't just vanish from view.
        const isPending = state.phase === "lobby";

        const opponentId = Object.keys(state.players || {}).find(
          (id) => id !== userId
        );
        const opponent = opponentId ? state.players[opponentId] : null;

        let isMyTurn = false;
        if (state.phase === "normal") {
          isMyTurn = state.turn === userId;
        } else if (state.phase === "simultaneous") {
          isMyTurn =
            me.role === "setter"
              ? !state.simultaneousSecretSubmitted
              : !state.simultaneousGuessSubmitted;
        }

        results.push({
          roomId,
          opponentName: opponent?.name || (opponent?.isAI ? "AI" : isPending ? null : "Opponent"),
          myRole: me.role,
          isMyTurn,
          isPending,
          phase: state.phase,
          ranked: !!state.ranked,
          startedAt: state.matchStartedAt || null
        });
      }

      // Games where it's your turn first, pending invites last.
      results.sort((a, b) => {
        if (a.isPending !== b.isPending) return a.isPending ? 1 : -1;
        return (b.isMyTurn ? 1 : 0) - (a.isMyTurn ? 1 : 0);
      });

      cb?.(results);
    });

    /* ---------- ABANDON GAME (unlimited-time, non-ranked only) ---------- */
    socket.on("abandonGame", ({ roomId, userId }, cb) => {
      const room = rooms[roomId];
      if (!room || room.status !== "alive") {
        return cb?.({ ok: false, error: "Game not found" });
      }
      if (!room.playersByUserId?.[userId]) {
        return cb?.({ ok: false, error: "Not your game" });
      }
      if (room.state?.ranked) {
        return cb?.({ ok: false, error: "Ranked games can't be abandoned" });
      }

      forceCloseRoom(roomId, room, io);
      cb?.({ ok: true });
    });

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

  // Persisted so the next general state broadcast (triggered by anything
  // else in the room — a power use, a reconnect, etc.) can still compute
  // the "New" count instead of falling back to "?" just because that
  // broadcast wasn't the setterDraftSecret event itself.
  room.state.setterDraft = normalized;

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

    // Wiretap live tap: while the guesser's wiretap is active this turn,
    // they emit their in-progress guess draft and get back how many secrets
    // would remain if they submitted it (scored against the real secret).
    socket.on("guesserWiretapDraft", ({ roomId, draft }) => {
      const room = rooms[roomId];
      if (!room || !room.state) return;
      const state = room.state;

      const userId = room.socketToUserId?.[socket.id];
      if (!userId || userId !== state.guesser) return;
      if (!state.powers?.wiretapActive) return;
      if (state.phase !== "normal") return;

      const g = typeof draft === "string" ? draft.trim().toUpperCase() : "";
      if (g.length !== 5 || !/^[A-Z]{5}$/.test(g)) {
        socket.emit("wiretapLive", { draft: g, count: null });
        return;
      }

      // A drafted word that isn't actually in the dictionary could never be
      // submitted as a guess, so treat it like an inconsistent word rather
      // than computing a hypothetical (misleading) count for it.
      const guesses = context.ALLOWED_GUESSES;
      const isValidGuessWord = Array.isArray(guesses)
        ? guesses.includes(g)
        : guesses instanceof Set
          ? guesses.has(g)
          : true;

      if (!isValidGuessWord) {
        socket.emit("wiretapLive", { draft: g, count: null, invalid: true });
        return;
      }

      const count = computeRemainingAfterGuess(
        state.secret,
        g,
        state,
        context.ALLOWED_SECRETS
      );
      socket.emit("wiretapLive", { draft: g, count });
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
        // Most powers keep the same player's turn, so there's nothing for the
        // AI to do afterwards. Double Tap is the exception: it consumes the
        // guesser's turn and hands the pending (visible) guess to the setter,
        // so the AI setter must be given a chance to respond just like a
        // normal guess.
        (!action.type.startsWith("USE_") || action.type === "USE_DOUBLE_GUESS") &&
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
