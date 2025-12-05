//
// socketClient.js — Clean Railway Version
//
if (typeof io === "undefined") {
  alert("Socket.IO failed to load!");
}
// Because frontend + backend are on the SAME Railway domain,
// leave BACKEND_URL empty → socket.io connects to the same origin.
const BACKEND_URL = "";

// Create Socket.IO client
const socket = io(BACKEND_URL, {
  path: "/socket.io/",
  transports: ["websocket", "polling"],
  withCredentials: false
});


// -----------------------------------------------------
// OUTGOING EVENTS
// -----------------------------------------------------

export function createRoom(cb) {
  socket.emit("createRoom", cb);
}

export function joinRoom(roomCode, cb) {
  socket.emit("joinRoom", roomCode, cb);
}

export function sendGameAction(roomId, action) {
  socket.emit("gameAction", { roomId, action });
}


// -----------------------------------------------------
// INCOMING EVENTS
// -----------------------------------------------------

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


// -----------------------------------------------------
// CONNECTION EVENTS
// -----------------------------------------------------

socket.on("connect", () => {
  console.log("🔌 Connected to backend");
});

socket.on("connect_error", err => {
  console.warn("❌ Connection error:", err.message);
});
