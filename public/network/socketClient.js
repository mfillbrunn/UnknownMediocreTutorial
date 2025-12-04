// /public/network/socketClient.js
// FINAL Railway + Metal Edge compatible client socket config

const socket = io({
  path: "/socket.io/",             // REQUIRED for Railway Metal Edge
  transports: ["websocket", "polling"],
  upgrade: true,
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 500
});

// ---- OUTGOING ----

export function createRoom(cb) {
  socket.emit("createRoom", cb);
}

export function joinRoom(roomCode, cb) {
  socket.emit("joinRoom", roomCode, cb);
}

export function sendGameAction(roomId, action) {
  socket.emit("gameAction", { roomId, action });
}

// ---- INCOMING ----

export function onStateUpdate(handler) {
  socket.on("stateUpdate", handler);
}

export function onAnimateTurn(handler) {
  socket.on("animateTurn", handler);
}

export function onPowerUsed(handler) {
  socket.on("powerUsed", handler);
}

socket.on("connect_error", (err) => {
  console.warn("Socket connection error:", err.message);
});
