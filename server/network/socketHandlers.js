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
const { computeLetterProfileStats } = require("../utils/letterProfile");
const { guesserVisibleHistoryCount } = require("../utils/delayedFeedback");
const {
  getDailyStatus,
  markDailyAbandoned
} = require("../core/dailyTracking");

const {
  runPowerSimulation,
  runAllPowerSimulations,
  savePowerSimulation
} = require("../core/simulation/runPowerSimulation");

const {
  buildSafeStateForPlayer
} = require("../utils/safeState");

module.exports = function registerSocketHandlers(io, context) {
  io.on("connection", (socket) => {
    /* ---------- DAILY CHALLENGE STATUS ---------- */
    socket.on("getDailyStatus", ({ userId, date }, cb) => {
      cb?.(getDailyStatus(userId, date));
    });

    /* ---------- MY GAMES (unlimited-time games in progress) ---------- */
    socket.on("getMyActiveGames", ({ userId }, cb) => {
      if (!userId) return cb?.([]);

      const resultsByMatch =   new Map();

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

const participants =
  Object.keys(state.players || {})
    .filter(id => id !== "AI")
    .sort()
    .join("|");

const matchKey =
  state.matchId ||
  `${participants}:${
    state.matchStartedAt ||
    roomId
  }`;

const candidate = {
  roomId,
  matchId: state.matchId || null,

  opponentName:
    opponent?.name ||
    (
      opponent?.isAI
        ? "AI"
        : isPending
          ? null
          : "Opponent"
    ),

  myRole: me.role,
  isMyTurn,
  isPending,
  phase: state.phase,
  ranked: !!state.ranked,

  startedAt:
    state.matchStartedAt ||
    null,

  /*
   * Used only to decide which copy is newer when a
   * duplicate room exists.
   */
  _progress:
    (
      state.matchRounds?.length ||
      0
    ) * 1000 +
    (
      state.history?.length ||
      0
    )
};

const existing =
  resultsByMatch.get(matchKey);

if (
  !existing ||
  candidate._progress >
    existing._progress
) {
  resultsByMatch.set(
    matchKey,
    candidate
  );
}
      }
const results = [
  ...resultsByMatch.values()
].map(game => {
  const {
    _progress,
    ...publicGame
  } = game;

  return publicGame;
});
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

      if (room.state?.isDaily && room.state?.dailyDate) {
        markDailyAbandoned(userId, room.state.dailyDate);
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

    /* ---------- SYNC ROOM / FOREGROUND RESUME ---------- */
    socket.on("syncRoom", ({ roomId, userId } = {}, cb) => {
      const room = rooms[roomId];

      if (!room || room.status !== "alive") {
        cb?.({
          ok: false,
          code: "ROOM_NOT_FOUND",
          error: "Room not found"
        });

        return;
      }

      const connPlayer =
        room.playersByUserId?.[userId];

      const statePlayer =
        room.state?.players?.[userId];

      if (!connPlayer || !statePlayer) {
        cb?.({
          ok: false,
          code: "PLAYER_NOT_FOUND",
          error: "You are no longer in this game"
        });

        return;
      }

      const oldSocketId =
        connPlayer.socketId;

      const wasDisconnected =
        !connPlayer.connected;

      /*
       * Remove the old socket mapping. The old socket may still
       * technically exist after a phone wakes from suspension.
       */
      if (
        oldSocketId &&
        oldSocketId !== socket.id
      ) {
        if (
          room.socketToUserId?.[
            oldSocketId
          ] === userId
        ) {
          delete room.socketToUserId[
            oldSocketId
          ];
        }

        const oldSocket =
          io.sockets.sockets.get(
            oldSocketId
          );

        if (oldSocket) {
          oldSocket.leave(roomId);

          if (
            oldSocket.data.roomId ===
            roomId
          ) {
            oldSocket.data.roomId =
              null;
          }

          oldSocket.data.userId =
            null;
        }
      }

      /*
       * A socket should only belong to its current game room.
       */
      if (
        socket.data.roomId &&
        socket.data.roomId !== roomId
      ) {
        socket.leave(
          socket.data.roomId
        );
      }

      room.socketToUserId ||= {};

      room.socketToUserId[
        socket.id
      ] = userId;

      room.aiOnlySince = null;

      connPlayer.socketId =
        socket.id;

      connPlayer.connected = true;
      connPlayer.disconnectedAt = null;

      socket.data.roomId = roomId;
      socket.data.userId = userId;

      socket.join(roomId);

      /*
       * Resume only when this was a genuine reconnect and all
       * human players are connected again.
       *
       * This avoids resetting the timer every time someone merely
       * returns to the tab while their connection was still healthy.
       */
      const allHumansConnected =
        Object.values(
          room.playersByUserId || {}
        )
          .filter(
            player => !player.isAI
          )
          .every(
            player => player.connected
          );

      if (
        wasDisconnected &&
        allHumansConnected &&
        room.state.paused &&
        !room.state.gameOver &&
        room.state.phase !== "lobby"
      ) {
        room.state.paused = false;
        room.state.roundStartTime =
          Date.now();

        if (
          room.state.timeControl?.enabled
        ) {
          startGameTimer(
            room,
            room.state,
            roomId,
            context
          );
        }
      }

      socket.emit("roleAssigned", {
        role: statePlayer.role
      });

      if (wasDisconnected) {
        socket.to(roomId).emit(
          "lobbyEvent",
          {
            type: "playerRejoined",
            userId
          }
        );
      }

      /*
       * Send only this player their own safe copy of the state.
       */
      const safeState =
        buildSafeStateForPlayer(
          room.state,
          userId,
          context.ALLOWED_SECRETS
        );

      socket.emit(
        "stateUpdate",
        safeState
      );

      cb?.({
        ok: true,
        roomId,
        role: statePlayer.role,
        wasDisconnected
      });
    });

    /* ---------- QUICK JOIN ---------- */
    // "Play Human" from the Quick Play menu: join whatever open room is
    // waiting, or -- if none is -- create a fresh one instead of just
    // failing, so the button always puts the player somewhere instead of
    // needing a second "create a room" fallback action from the client.
    socket.on("quickJoin", ({ userId, name }, cb) => {
      let roomId = findLastOpenRoom();
      let createdNewRoom = false;

      if (!roomId) {
        roomId = createRoom(socket, userId);
        createdNewRoom = true;
      }

      const result = createdNewRoom
        ? { ok: true, reattached: false, role: rooms[roomId]?.state?.players?.[userId]?.role ?? null }
        : joinOrReattach(socket, roomId, userId);
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

  const boxState = buildSetterRemainingBoxState(
    room.state,
    userId,
    context.ALLOWED_SECRETS,
    normalized
  );

  socket.emit("setterRemainingBox", boxState);

  if (room.state.activePowers?.includes("letterProfile")) {
    // Same "keep showing the last real word" fallback as safeState.js's
    // setterLetterProfile: a partial (<5 letter) in-progress draft
    // shouldn't blank the box, it should keep reflecting the still-current
    // committed secret until a full new draft word replaces it.
    const word = normalized.length === 5 ? normalized : room.state.secret;
    socket.emit(
      "setterLetterProfile",
      computeLetterProfileStats(word, room.state.powers?.letterProfileMode)
    );
  }
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

      // If Delayed Intel is also active, the guesser hasn't unlocked the
      // most recent round's feedback yet — computing this hypothetical
      // count from the FULL true history would hand back exactly what
      // that power is withholding. Truncate to only what they've
      // actually unlocked (see delayedFeedback.js).
      const visibleCount = guesserVisibleHistoryCount(state);
      const historyForCount =
        visibleCount === state.history.length
          ? state
          : { ...state, history: state.history.slice(0, visibleCount) };

      const count = computeRemainingAfterGuess(
        state.secret,
        g,
        historyForCount,
        context.ALLOWED_SECRETS
      );
      socket.emit("wiretapLive", { draft: g, count });
    });

    /* ---------- GAME ACTION ---------- */
    socket.on(
      "gameAction",
      ({ action } = {}, cb) => {
        const roomId =
          socket.data.roomId;

        if (
          !roomId ||
          !rooms[roomId]
        ) {
          console.warn(
            "[gameAction] socket not in valid room",
            socket.id
          );

          cb?.({
            ok: false,
            code: "ROOM_DESYNC",
            error:
              "Socket is not attached to the room"
          });

          socket.emit("roomInvalid", {
            reason: "desync"
          });

          return;
        }

        const room =
          rooms[roomId];

        const userId =
          room.socketToUserId?.[
            socket.id
          ];

        if (!userId) {
          console.warn(
            "[gameAction] no userId for socket",
            socket.id
          );

          cb?.({
            ok: false,
            code: "SESSION_DESYNC",
            error:
              "Socket is not attached to a player"
          });

          return;
        }

        const connPlayer =
          room.playersByUserId?.[
            userId
          ];

        const statePlayer =
          room.state.players?.[
            userId
          ];

        if (
          !connPlayer ||
          !connPlayer.connected ||
          !statePlayer
        ) {
          console.warn(
            "[gameAction] player not active",
            userId
          );

          cb?.({
            ok: false,
            code: "PLAYER_INACTIVE",
            error:
              "Player session is inactive"
          });

          return;
        }

        if (
          !action ||
          typeof action.type !==
            "string"
        ) {
          cb?.({
            ok: false,
            code: "BAD_ACTION",
            error: "Invalid action"
          });

          return;
        }

        action.userId = userId;

        try {
          context.applyAction(
            room,
            room.state,
            action,
            roomId,
            context
          );
        } catch (err) {
          console.error(
            "[gameAction] applyAction error",
            err
          );

          cb?.({
            ok: false,
            code: "ACTION_ERROR",
            error: "Action failed"
          });

          return;
        }

        emitRoomState(
          roomId,
          room,
          io
        );

        /*
         * Confirm to the sending browser that its socket was
         * correctly attached and the action reached the server.
         */
        cb?.({
          ok: true
        });

        if (
          !action.ai &&
          (
            !action.type.startsWith(
              "USE_"
            ) ||
            action.type ===
              "USE_DOUBLE_GUESS"
          ) &&
          (
            room.state.phase ===
              "normal" ||
            room.state.phase ===
              "simultaneous"
          )
        ) {
          setTimeout(() => {
            try {
              maybeRunAI(
                room,
                roomId,
                context
              );
            } catch (err) {
              console.error(
                "maybeRunAI crashed:",
                err
              );
            }
          }, 1000);
        }
      }
    );

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
        (p) => p.userId !== myUserId
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

    /* ---------- DEV: POWER STRENGTH SIMULATION ---------- */
    socket.on("runPowerSimulation", async ({ userId, powerId, powerRole, runs, aiDifficulty }, cb) => {
      if (!userId) return cb?.({ ok: false, error: "Not logged in" });
      if (!powerId || (powerRole !== "setter" && powerRole !== "guesser")) {
        return cb?.({ ok: false, error: "Pick a power first" });
      }

      const safeRuns = Math.max(1, Math.min(1000, Math.floor(Number(runs)) || 100));
      const safeDifficulty = Math.max(1, Math.min(3, Math.floor(Number(aiDifficulty)) || 2));

      try {
        const stats = await runPowerSimulation(
          { powerId, powerRole, runs: safeRuns, aiDifficulty: safeDifficulty },
          context,
          (progress) => socket.emit("powerSimulationProgress", progress)
        );

        let saved = null;
        try {
          saved = await savePowerSimulation(stats, context, userId);
        } catch (saveErr) {
          console.error("Power simulation save failed:", saveErr);
        }

        cb?.({ ok: true, stats, saved });
      } catch (err) {
        console.error("Power simulation failed:", err);
        cb?.({ ok: false, error: "Simulation failed" });
      }
    });

    socket.on("runAllPowerSimulations", async ({ userId, runs, aiDifficulty, roleFilter }, cb) => {
      if (!userId) return cb?.({ ok: false, error: "Not logged in" });

      const safeRuns = Math.max(1, Math.min(1000, Math.floor(Number(runs)) || 100));
      const safeDifficulty = Math.max(1, Math.min(3, Math.floor(Number(aiDifficulty)) || 2));
      const safeRoleFilter = ["all", "setter", "guesser"].includes(roleFilter) ? roleFilter : "all";

      try {
        const results = await runAllPowerSimulations(
          { runs: safeRuns, aiDifficulty: safeDifficulty, roleFilter: safeRoleFilter },
          context,
          userId,
          (progress) => socket.emit("powerSimulationBatchProgress", progress)
        );

        cb?.({ ok: true, results });
      } catch (err) {
        console.error("Power simulation batch failed:", err);
        cb?.({ ok: false, error: "Simulation batch failed" });
      }
    });
  });
};
