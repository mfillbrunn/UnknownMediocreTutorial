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

// Maps a power's USE_<SNAKE_CASE> action type back to its camelCase id --
// mirrors server/core/phases/normal.js's normalizePowerId exactly, so it
// works for any power (not just the ones some earlier tutorial stage
// happened to wait on) without needing a new entry added by hand each
// time another power gets its own tutorial. Used to nudge the tutorial
// forward the instant the player actually fires the action, since
// (unlike a guess/secret submission) using a power doesn't advance
// state.history.length and so wouldn't otherwise re-trigger
// tutorialSteps(); harmless no-op via notifyTutorialPowerUsed's own guard
// when the tutorial isn't actually waiting on this specific power.
function actionTypeToPowerId(type) {
  if (typeof type !== "string" || !type.startsWith("USE_")) return null;
  return type
    .replace("USE_", "")
    .toLowerCase()
    .replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

// Returns whether the action was actually emitted -- callers that
// optimistically clear local UI state right after sending (a submitted
// guess/secret draft, most notably) need to know this failed silently
// rather than assuming it reached the server. Before this returned
// nothing, a guess typed and submitted during a brief disconnect would
// get its local draft wiped anyway even though sendGameAction bailed out
// on the `!socket.connected` check below, so the guess was just lost:
// the screen looked normal (empty, ready-to-type draft, same as after a
// real successful submit) but the server never received anything, and
// the next real submission attempt would fail with a generic "5 letters"
// error since the "draft" backing it had already been cleared out from
// under it.
window.sendGameAction = function (action) {
  if (!socket.connected) return false;
  if (!window.roomId) return false;
  if (window.isRejoining) return false;
  const tutorialPowerId = actionTypeToPowerId(action.type);
  if (tutorialPowerId) window.notifyTutorialPowerUsed?.(tutorialPowerId);
  socket.emit("gameAction", { action });
  return true;
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
// centered popups don't stack/overwrite each other. Quest is registered
// as a fake "power" purely to piggyback on the server's turnStart
// dispatch (see questServer.js) and already has its own big-announce
// popup (greenLetterRevealed in power-functions.js / questEarlyClaim in
// quest.js) — without this, completing a quest fired that AND a second,
// redundant generic popup every time, which given how often the AI
// completes its own quest (genericAI.js actively biases guesses toward
// it) made the AI look like it was spamming a "power" it never actually
// has. magicMode is the same shape: the generic "you used Inside Job"
// popup fires on activation, then its real result (magicModeRevealed in
// magicMode.js) fires later once the next guess scores -- showing both
// reads as the power popping up twice for one use.
const POWERS_WITH_OWN_POPUP = new Set(["fieldReport", "quest", "magicMode"]);

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

// Tracks whether the socket has ever *dropped* during this page load, and
// when the most recent drop happened. The very first connection just
// resumes any in-progress game silently (that's "continuing where you left
// off" after opening/reloading the app).
window._everDisconnected = false;
window._disconnectedAt = 0;

// How long a gap counts as "brief". socket.io reconnects on its own after a
// transient hiccup (a momentary network blip, a server event-loop stall
// during AI computation, a proxy timeout), and the server keeps the
// player's seat for a 30s reattach grace. A reconnect that lands inside
// that window can just resume silently — throwing the disruptive "rejoin"
// modal for a blip the user never even caused is exactly the annoyance
// being reported. Only a genuinely long absence (tab backgrounded for
// minutes, laptop asleep), where the seat may already be gone, still asks.
const BRIEF_RECONNECT_MS = 20000;

function maybeAutoRejoin() {
  if (window.autoRejoinAttempted) return;
  if (!window.socketReady) return;
  if (!window.authReady) return;

  const roomId = localStorage.getItem("roomId");
  if (!roomId || !window.currentUser) return;

  window.autoRejoinAttempted = true;

  // First connection of this page load — silent resume.
  if (!window._everDisconnected) {
    tryAutoRejoin();
    return;
  }

  // Reconnection after a drop: resume silently if it was brief (still
  // within the server's reattach grace), otherwise ask.
  const gap = window._disconnectedAt
    ? Date.now() - window._disconnectedAt
    : Infinity;

  if (gap < BRIEF_RECONNECT_MS) {
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

  // sendGameAction drops every action while isRejoining is true (so a
  // guess/secret submitted mid-rejoin can't race the room state). If this
  // ack never arrives — connection drops again right after the emit, or a
  // slow server tick (e.g. mid AI turn) loses it — isRejoining stayed
  // stuck true forever, silently swallowing all future input until the
  // player reloaded the page. Force it back open after a timeout so a lost
  // ack degrades to "one rejoin attempt didn't land" instead of "the game
  // is now permanently unresponsive."
  const rejoinTimeout = setTimeout(() => {
    window.isRejoining = false;
    window.autoRejoinAttempted = false;
  }, 8000);

  socket.emit(
    "joinRoom",
    { roomId: storedRoomId, userId: user.id, name: username },
    res => {
      clearTimeout(rejoinTimeout);
      if (!res?.ok) {
        window.isRejoining = false;
        if (res.error === "Room not found") {
          window.autoRejoinAttempted = true;
          localStorage.removeItem("roomId");
          clearRoom?.();
          showStartup?.();
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
// A small, persistent banner (distinct from the transient "Connection
// lost" toast, and from the disruptive rejoinModal reserved for long
// absences) -- stays up for as long as the socket is actually down, so a
// player mid-blip has a standing signal that something's off rather than
// a message that already scrolled away. Shown on the same deferred timer
// as the toast (a sub-second blip shows neither), hidden the instant the
// socket reconnects.
function setConnectionBannerVisible(visible) {
  const el = document.getElementById("connectionBanner");
  if (!el) return;
  el.hidden = !visible;
}

socket.on("connect", () => {
  console.log("🔌 Connected");
  window.socketReady = true;
  // A blip that recovered before the deferred "connection lost" toast
  // fired — cancel it so a sub-second hiccup shows the player nothing.
  clearTimeout(window._disconnectToastTimer);
  setConnectionBannerVisible(false);
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
  // Stamp the drop so the next reconnect can tell a brief blip (resume
  // silently) from a long absence (ask before rejoining) — see
  // maybeAutoRejoin / BRIEF_RECONNECT_MS.
  window._disconnectedAt = Date.now();
  // Don't flash a "connection lost" toast the instant the socket drops —
  // socket.io reconnects on its own, and a sub-second transport blip
  // (the common "transport close" hiccup during normal play) recovers
  // before the player would even register the message. Defer it, and let
  // the connect handler cancel it if we're back in time; only a drop that
  // actually persists past this delay is worth telling the player about.
  if (window.roomId) {
    clearTimeout(window._disconnectToastTimer);
    window._disconnectToastTimer = setTimeout(() => {
      if (!socket.connected) {
        toast("Connection lost — reconnecting…");
        setConnectionBannerVisible(true);
      }
    }, 2500);
  }
});
