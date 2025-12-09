// network/socketHandlers.js

const { rooms, createRoom, joinRoom } = require("../core/rooms");
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

      socket.emit("roleAssigned", {
        role: "A",
        setterId: socket.id,
        guesserId: null
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


    // GAME ACTION -----------------------------
    socket.on("gameAction", ({ roomId, action }) => {
      console.log("SERVER RECEIVED GAME ACTION:", action);
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

  });
};
