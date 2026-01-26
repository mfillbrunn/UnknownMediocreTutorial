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

window.createRoom = function (payload, cb) {
  const userId = window.getUserId();
  if (!userId) return cb?.({ ok: false, error: "Not logged in" });
  socket.emit("createRoom", {
    ...payload,
    userId
  }, res => {
    if (res?.ok) {
      persistRoom(res.roomId);
      window.roomId = res.roomId;
    }
    cb?.(res);
  });
};

window.joinRoom = function (roomCode, payload, cb) {
  const userId = window.getUserId();
  if (!userId) return cb?.({ ok: false, error: "Not logged in" });
  socket.emit("joinRoom", {
    roomId: roomCode,
    userId,
    ...payload
  }, res => {
    if (res?.ok) {
        persistRoom(roomCode);
        window.roomId = roomCode; 
      }
    cb?.(res);
  });
};

window.quickJoin = function (payload, cb) {
  const userId = window.getUserId();
  if (!userId) return cb?.({ ok: false, error: "Not logged in" });
  socket.emit("quickJoin", {
    userId,
    ...payload
  }, res => {
    if (res?.ok && res.roomId) {
        persistRoom(res.roomId);
        window.roomId = res.roomId;
      }
    cb?.(res);
  });
};

window.sendGameAction = function (action) {
  if (!socket.connected) return;
  if (!window.roomId) return;
  socket.emit("gameAction", { action });
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
socket.on("connect", () => {
  console.log("🔌 Connected");
  window.socketReady = true;
  maybeAutoRejoin();
});
socket.on("connect_error", err =>
  console.warn("❌ Connection error:", err.message)
);

socket.on("reconnect", () => {
  console.log("🔁 Reconnected");
  window.socketReady = true;
  window.autoRejoinAttempted = false;
  maybeAutoRejoin();
});
