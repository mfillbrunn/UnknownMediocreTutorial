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
    console.log("quickJoin result:", res);
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
  if (window.isRejoining) return;
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

window.onPowerUsed(payload => {
  if (!payload?.type) return;

  if (
    tutorialWaitingFor &&
    tutorialWaitingFor.type === "power" &&
    payload.type === tutorialWaitingFor.powerId
  ) {
    tutorialWaitingFor = null;
    tutorialSubStep++;
    tutorialSteps(window.state, window.myRole);
  }
});


function onRejoinUI() {
  // Always leave startup/menu mode
  document.body.classList.remove("menu-mode");

  hide("startupScreen");
  hide("menu");

  // Show lobby or game based on state (stateUpdate will follow)
  show("lobby");
}
function maybeAutoRejoin() {
  if (window.autoRejoinAttempted) return;
  if (!window.socketReady) return;
  if (!window.authReady) return;

  const roomId = localStorage.getItem("roomId");
  if (!roomId || !window.currentUser) return;

  window.autoRejoinAttempted = true;
  tryAutoRejoin();
}


function tryAutoRejoin() {
  const storedRoomId = localStorage.getItem("roomId");
  const user = window.currentUser;

  if (!storedRoomId || !user) return;
  if (!socket.connected) return;

  const username =
    window.myProfile?.username || user.email || "Player";
  window.isRejoining = true;
  socket.emit(
    "joinRoom",
    { roomId: storedRoomId, userId: user.id, name: username },
    res => {
      if (!res?.ok) {
        window.isRejoining = false;
        if (res.error === "Room not found") {
          window.autoRejoinAttempted = true;
          localStorage.removeItem("roomId");
          clearRoom?.();
          showStartup?.();
          toast("Your previous game has ended.");
        } else {
          // allow one retry on next reconnect
          window.autoRejoinAttempted = false;
        }
        return;
      }
      window.isRejoining = false;
      window.roomId = res.roomId || storedRoomId;
      onRejoinUI();
    }
  );
}

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

socket.on("disconnect", reason => {
  console.warn("🔌 Disconnected:", reason);
});
