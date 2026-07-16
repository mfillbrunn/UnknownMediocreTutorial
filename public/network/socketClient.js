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
// RANKED MATCHMAKING
// ------------------------------
window.rankedQueueJoin = function (preset, cb) {
  const userId = window.getUserId();
  if (!userId) return cb?.({ ok: false, error: "Not logged in" });
  const name = window.myProfile?.username || window.currentUser?.email || "Player";
  socket.emit("rankedQueueJoin", { userId, name, preset }, res => cb?.(res));
};

window.rankedQueueCancel = function () {
  const userId = window.getUserId();
  if (!userId) return;
  socket.emit("rankedQueueCancel", { userId });
};

window.onRankedMatchFound = function (handler) {
  socket.on("rankedMatchFound", handler);
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

// Centered, opaque popup for any power use, visible to both the user and
// their opponent (worded from each viewer's own perspective), lingering
// long enough to actually read the power's description.
let _powerPopupTimer = null;
window.showPowerPopup = function (html) {
  const el = document.getElementById("powerPopup");
  if (!el) return;
  el.querySelector(".power-popup-emoji").textContent = html.emoji || "";
  el.querySelector(".power-popup-title").textContent = html.title || "";
  el.querySelector(".power-popup-desc").textContent = html.desc || "";

  clearTimeout(_powerPopupTimer);
  el.classList.remove("show");
  void el.offsetWidth; // restart if already showing
  el.classList.add("show");
  _powerPopupTimer = setTimeout(() => el.classList.remove("show"), 5500);
};

// Click anywhere on the popup to dismiss it early instead of waiting out
// the full timer.
document.getElementById("powerPopup")?.addEventListener("click", () => {
  clearTimeout(_powerPopupTimer);
  document.getElementById("powerPopup")?.classList.remove("show");
});

// Powers used mid-turn, buffered here so the action log can show them the
// moment they happen instead of waiting for the enclosing guess/decision to
// resolve. Cleared in client.js whenever state.history actually changes.
window._livePowerEvents = [];

// Powers with their own dedicated result popup (richer than the generic
// one — e.g. Field Report's condition list) skip this one so the two
// centered popups don't stack/overwrite each other.
const POWERS_WITH_OWN_POPUP = new Set(["fieldReport"]);

socket.on("powerActivity", payload => {
  if (!payload?.id) return;

  window._livePowerEvents.push(payload);
  window.renderActionLog?.(window.state, window.myRole);

  const formatted = window.formatPowerEvent?.(payload);
  if (!formatted) return;
  if (POWERS_WITH_OWN_POPUP.has(payload.id)) return;

  const who =
    formatted.actorRole == null ? "A power was used" :
    formatted.actorRole === window.myRole ? "You used" : "Opponent used";
  const detailSuffix = formatted.detail ? ` — ${formatted.detail}` : "";

  window.showPowerPopup({
    emoji: formatted.emoji,
    title: `${who}: ${formatted.label}`,
    desc: `${formatted.desc || ""}${detailSuffix}`
  });
});


function onRejoinUI() {
  // Always leave startup/menu mode
  document.body.classList.remove("menu-mode");

  // Whatever menu screen the player was actually on (My Games, Daily
  // Challenge, Friends, ...) needs to go too, not just startup/menu.
  hideAllScreens();

  // Show lobby or game based on state (stateUpdate will follow)
  show("lobby");
}

// Tracks whether the socket has ever *dropped* during this page load. The
// very first connection just resumes any in-progress game silently (that's
// "continuing where you left off" after opening/reloading the app). Once a
// real disconnect has happened — tab backgrounded, network hiccup, laptop
// asleep — every connection after that is a reconnection, and those get a
// prompt instead of silently dropping the player back into the game.
window._everDisconnected = false;

function maybeAutoRejoin() {
  if (window.autoRejoinAttempted) return;
  if (!window.socketReady) return;
  if (!window.authReady) return;

  const roomId = localStorage.getItem("roomId");
  if (!roomId || !window.currentUser) return;

  window.autoRejoinAttempted = true;

  if (!window._everDisconnected) {
    tryAutoRejoin();
    return;
  }

  showRejoinPrompt();
}

function showRejoinPrompt() {
  const modal = $("rejoinModal");
  if (!modal) {
    // Markup missing for some reason — fall back to the old silent path
    // rather than stranding the player with no way back in.
    tryAutoRejoin();
    return;
  }
  if (modal.classList.contains("active")) return; // already showing
  modal.classList.add("active");
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
      // Not just window.roomId — client.js's own `roomId` (declared with
      // `let`, a separate global binding, not a window property) gates
      // PowerEngine's one-time button-render call. Leaving it unset here
      // is why rejoining left the power buttons (and anything else keyed
      // off it) missing until a full reload re-derived it from
      // localStorage.
      roomId = res.roomId || storedRoomId;
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
  // The Socket "connect" event above already fires (and reacts to) every
  // reconnection too, so this is just a log line, not a second attempt.
  console.log("🔁 Reconnected");
  window.socketReady = true;
});

socket.on("disconnect", reason => {
  console.warn("🔌 Disconnected:", reason);
  // Allow the next successful "connect" to react again (show the rejoin
  // prompt, or resolve a stale room) instead of staying stuck from a
  // previous cycle's flag.
  window.autoRejoinAttempted = false;
  window._everDisconnected = true;
  if (window.roomId) {
    toast("Connection lost — reconnecting…");
  }
});
