// server/core/matchmaking.js — ranked matchmaking queue.
//
// Pairs two queued players for the same time-control preset into a fresh
// room, then drives that room through the exact same lobby setup and
// "everyone ready" start sequence a manual lobby would (SET_TIME_CONTROL /
// SET_RANKED / PLAYER_READY dispatched through applyAction), so matchmaking
// doesn't duplicate any of that logic.

const {
  rooms,
  createRoom,
  joinOrReattach,
  setPlayerName,
  setPlayerRole,
  emitRoomState
} = require("./rooms");

const PRESETS = {
  bullet: { seconds: 90, mode: "round" },
  blitz: { seconds: 180, mode: "round" },
  deep: { seconds: 900, mode: "chess" },
  none: null
};

const queues = {
  bullet: [],
  blitz: [],
  deep: [],
  none: []
};

function removeFromAllQueues(userId) {
  for (const key of Object.keys(queues)) {
    queues[key] = queues[key].filter((e) => e.userId !== userId);
  }
}

function removeSocketFromAllQueues(socketId) {
  for (const key of Object.keys(queues)) {
    queues[key] = queues[key].filter((e) => e.socketId !== socketId);
  }
}

function matchPlayers(io, context, preset, a, b) {
  const socketA = io.sockets.sockets.get(a.socketId);
  const socketB = io.sockets.sockets.get(b.socketId);

  if (!socketA || !socketB) {
    // One side vanished while queued — requeue whoever is still connected.
    if (socketA) queues[preset].unshift(a);
    if (socketB) queues[preset].unshift(b);
    return;
  }

  const roomId = createRoom(socketA, a.userId);
  const room = rooms[roomId];
  if (!room) return;

  setPlayerName(room, a.userId, a.name);

  const joinResult = joinOrReattach(socketB, roomId, b.userId);
  if (!joinResult.ok) {
    // Shouldn't happen for a freshly created room; requeue A and drop B's
    // stale entry rather than leaving A stuck in a broken room.
    queues[preset].unshift(a);
    return;
  }
  setPlayerName(room, b.userId, b.name);
  socketB.data.roomId = roomId;

  if (Math.random() < 0.5) {
    setPlayerRole(room, a.userId, "guesser");
    setPlayerRole(room, b.userId, "setter");
  }

  const presetConfig = PRESETS[preset];
  if (presetConfig) {
    context.applyAction(
      room,
      room.state,
      {
        type: "SET_TIME_CONTROL",
        userId: a.userId,
        seconds: presetConfig.seconds,
        mode: presetConfig.mode
      },
      roomId,
      context
    );
  } else {
    context.applyAction(
      room,
      room.state,
      { type: "SET_TIME_CONTROL", userId: a.userId, enabled: false },
      roomId,
      context
    );
  }

  context.applyAction(
    room,
    room.state,
    { type: "SET_RANKED", userId: a.userId, ranked: true },
    roomId,
    context
  );

  socketA.emit("roleAssigned", { role: room.state.players[a.userId]?.role ?? null });
  socketB.emit("roleAssigned", { role: room.state.players[b.userId]?.role ?? null });

  socketA.emit("rankedMatchFound", { roomId });
  socketB.emit("rankedMatchFound", { roomId });

  context.applyAction(room, room.state, { type: "PLAYER_READY", userId: a.userId }, roomId, context);
  context.applyAction(room, room.state, { type: "PLAYER_READY", userId: b.userId }, roomId, context);

  emitRoomState(roomId, room, io);
}

function tryMatch(io, context, preset) {
  const q = queues[preset];
  while (q.length >= 2) {
    const a = q.shift();
    const b = q.shift();
    matchPlayers(io, context, preset, a, b);
  }
}

function registerMatchmaking(io, context) {
  io.on("connection", (socket) => {
    socket.on("rankedQueueJoin", ({ userId, name, preset }, cb) => {
      if (!userId || !Object.prototype.hasOwnProperty.call(PRESETS, preset)) {
        return cb?.({ ok: false, error: "Invalid matchmaking request" });
      }

      removeFromAllQueues(userId);
      queues[preset].push({
        userId,
        name: name || "Player",
        socketId: socket.id,
        joinedAt: Date.now()
      });

      cb?.({ ok: true });
      tryMatch(io, context, preset);
    });

    socket.on("rankedQueueCancel", ({ userId } = {}) => {
      if (userId) removeFromAllQueues(userId);
    });

    socket.on("disconnect", () => {
      removeSocketFromAllQueues(socket.id);
    });
  });
}

module.exports = { registerMatchmaking };
