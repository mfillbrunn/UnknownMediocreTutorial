// socketClient.js — Non-module version for Railway deployment


if (typeof io === "undefined") {
  alert("Socket.IO failed to load!");
}

// Empty BACKEND_URL = connect to same origin (Railway correct)
const BACKEND_URL = "";

// Create Socket.IO client
const socket = io(BACKEND_URL, {
  path: "/socket.io",             
  transports: ["polling", "websocket"],  
  withCredentials: false
});

// ------------------------------
// OUTGOING METHODS (GLOBAL)
// ------------------------------
window.createRoom = function (cb) {
  socket.emit("createRoom", cb);
};

window.joinRoom = function (roomCode, cb) {
  socket.emit("joinRoom", roomCode, cb);
};

window.sendGameAction = function (roomId, action) {
  socket.emit("gameAction", { roomId, action });
};

// ------------------------------
// INCOMING EVENTS (GLOBAL)
// ------------------------------
window.onStateUpdate = function (handler) {
  socket.on("stateUpdate", handler);
};

window.onAnimateTurn = function (handler) {
  socket.on("animateTurn", handler);
};

window.onPowerUsed = function (handler) {
  socket.on("powerUsed", handler);
};

window.onLobbyEvent = function (handler) {
  socket.on("lobbyEvent", handler);
};


// ------------------------------
// CONNECTION LOGS
// ------------------------------
socket.on("connect", () => console.log("🔌 Connected"));
socket.on("connect_error", err =>
  console.warn("❌ Connection error:", err.message)
);
