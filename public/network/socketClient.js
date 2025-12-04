// /public/network/socketClient.js

const socket = io({
  path: "/socket.io/",
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

export function onLobbyEvent(handler) {
  socket.on("lobbyEvent", handler);
}

socket.on("connect_error", err => {
  console.warn("Socket connection error:", err.message);
});
