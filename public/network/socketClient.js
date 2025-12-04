// /public/network/socketClient.js
// Thin wrapper around Socket.IO so the rest of the app
// doesn’t talk to socket.io directly.

const socket = io(); // from <script src="/socket.io/socket.io.js">

// ---- Outgoing ----

export function createRoom(cb) {
  socket.emit("createRoom", cb);
}

export function joinRoom(roomCode, cb) {
  socket.emit("joinRoom", roomCode, cb);
}

export function sendGameAction(roomId, action) {
  socket.emit("gameAction", { roomId, action });
}

// ---- Incoming ----

export function onStateUpdate(handler) {
  socket.on("stateUpdate", handler);
}

export function onAnimateTurn(handler) {
  socket.on("animateTurn", handler);
}

export function onPowerUsed(handler) {
  socket.on("powerUsed", handler);
}
