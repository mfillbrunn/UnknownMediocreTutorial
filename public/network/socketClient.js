// /public/network/socketClient.js

// Use your real Railway backend URL:
const BACKEND_URL = "https://unknownmediocretutorial-production.up.railway.app";

const socket = io(BACKEND_URL, {
  path: "/socket.io/",
  transports: ["websocket", "polling"],
  withCredentials: false
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

socket.on("connect", () => {
  console.log("🔌 Connected to:", BACKEND_URL);
});

socket.on("connect_error", err => {
  console.warn("❌ Connection error:", err.message);
});
