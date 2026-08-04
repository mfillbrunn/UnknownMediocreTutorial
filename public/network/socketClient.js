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
      markFreshGameState();
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
      markFreshGameState();
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
      markFreshGameState();
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
// Returns true when an action was queued for sending.
// The optional callback receives the server acknowledgement.
window.sendGameAction = function (
  action,
  cb
) {
  const showMessage = message => {
    if (
      typeof toast === "function"
    ) {
      toast(message);
    }
  };

  const rejectBeforeSend = (
    message,
    code
  ) => {
    showMessage(message);

    cb?.({
      ok: false,
      code,
      error: message
    });

    window.requestRoomSync?.(
      "action-blocked"
    );

    return false;
  };

  if (!socket.connected) {
    return rejectBeforeSend(
      "Reconnecting — your move was not sent.",
      "SOCKET_DISCONNECTED"
    );
  }

  if (!window.roomId) {
    return rejectBeforeSend(
      "No active game.",
      "NO_ROOM"
    );
  }

  if (
    window.isRejoining ||
    window.gameSessionReady === false
  ) {
    return rejectBeforeSend(
      "Syncing game — try again in a moment.",
      "SYNCING"
    );
  }

  socket.timeout(6000).emit(
    "gameAction",
    {
      action
    },
    (err, result) => {
      if (
        err ||
        !result?.ok
      ) {
        const code =
          result?.code ||
          "ACTION_TIMEOUT";

        const desyncCodes =
          new Set([
            "ROOM_DESYNC",
            "SESSION_DESYNC",
            "PLAYER_INACTIVE"
          ]);

        const message =
          desyncCodes.has(code)
            ? "Game was out of sync. Reconnecting…"
            : "Move was not confirmed. Reconnecting…";

        showMessage(message);

        window.requestRoomSync?.(
          "action-failed"
        );

        cb?.({
          ok: false,
          code,
          error:
            result?.error ||
            err?.message ||
            message
        });

        return;
      }

      /*
       * Advance a power tutorial only after the server confirms
       * that the action actually reached it.
       */
      const tutorialPowerId =
        actionTypeToPowerId(
          action.type
        );

      if (tutorialPowerId) {
        window
          .notifyTutorialPowerUsed
          ?.(tutorialPowerId);
      }

      cb?.(result);
    }
  );

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

  // The player who used the power already confirmed it themselves via
  // the power-info popup's own "Use" button, so a second "You used: X"
  // splash right after is redundant -- only the opponent, who wasn't
  // shown anything yet, still needs the notification.
  if (formatted.actorRole === window.myRole) return;

  const who = formatted.actorRole == null ? "A power was used" : "Opponent used";
  // formatPowerEvent falls back detail to the same static desc when a power
  // has no dynamic result to report, so only append it when it says something
  // desc doesn't -- otherwise the popup repeats the description twice.
  const detailSuffix = formatted.detail && formatted.detail !== formatted.desc ? ` — ${formatted.detail}` : "";

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
// ------------------------------
// CONNECTION + STATE SYNC
// ------------------------------

window._everDisconnected = false;
window._disconnectedAt = 0;
window._skipNextGameOverReveal =
  false;

/*
 * When a stored room exists, the session is not considered usable
 * until a new authoritative stateUpdate arrives.
 */
window.gameSessionReady =
  !localStorage.getItem("roomId");

let roomSyncInFlight = false;
let roomSyncTimeout = null;
let roomSyncGeneration = 0;
let lastRoomSyncStartedAt = 0;
let pageHiddenAt = 0;

function hasStoredRoom() {
  return !!(
    window.roomId ||
    localStorage.getItem("roomId")
  );
}

function setConnectionStatus(
  status,
  message = ""
) {
  const banner =
    document.getElementById(
      "connectionBanner"
    );

  if (!banner) return;

  banner.dataset.state = status;

  if (
    status === "ready" ||
    !hasStoredRoom()
  ) {
    banner.hidden = true;
    return;
  }

  banner.textContent =
    message ||
    (
      status === "syncing"
        ? "Syncing game…"
        : "Reconnecting…"
    );

  banner.hidden = false;
}

function cancelRoomSync() {
  roomSyncGeneration++;

  clearTimeout(roomSyncTimeout);
  roomSyncTimeout = null;

  roomSyncInFlight = false;
}

window.cancelRoomSync =
  cancelRoomSync;

function markFreshGameState() {
  clearTimeout(roomSyncTimeout);
  roomSyncTimeout = null;

  roomSyncInFlight = false;

  window.isRejoining = false;
  window.gameSessionReady = true;
  window.autoRejoinAttempted =
    true;

  document
    .getElementById(
      "rejoinModal"
    )
    ?.classList.remove("active");

  setConnectionStatus("ready");
}

function failRoomSync(message) {
  clearTimeout(roomSyncTimeout);
  roomSyncTimeout = null;

  roomSyncInFlight = false;

  window.isRejoining = false;
  window.gameSessionReady = false;
  window.autoRejoinAttempted =
    false;

  setConnectionStatus(
    "offline",
    message
  );
}

function expireLocalRoom(message) {
  cancelRoomSync();

  window.isRejoining = false;
  window.gameSessionReady = true;
  window.autoRejoinAttempted =
    true;

  localStorage.removeItem(
    "roomId"
  );

  window.roomId = null;

  if (
    typeof clearRoom ===
    "function"
  ) {
    clearRoom();
  }

  setConnectionStatus("ready");

  if (
    message &&
    typeof toast === "function"
  ) {
    toast(message);
  }
}

function requestRoomSync(
  reason = "manual"
) {
  const currentRoomId =
    window.roomId ||
    localStorage.getItem(
      "roomId"
    );

  const userId =
    window.getUserId?.() ||
    window.currentUser?.id;

  if (
    !currentRoomId ||
    !userId ||
    !window.authReady
  ) {
    return false;
  }

  if (roomSyncInFlight) {
    return true;
  }

  const now = Date.now();

  /*
   * visibilitychange, focus, pageshow, and Supabase SIGNED_IN can
   * all fire almost together when a phone returns to the app.
   */
  if (
    now - lastRoomSyncStartedAt <
    500
  ) {
    return true;
  }

  if (
    navigator.onLine === false ||
    !socket.connected
  ) {
    window.isRejoining = true;
    window.gameSessionReady = false;

    setConnectionStatus(
      "offline",
      navigator.onLine === false
        ? "Offline — waiting for internet…"
        : "Reconnecting…"
    );

    if (!socket.connected) {
      socket.connect();
    }

    return false;
  }

  roomSyncInFlight = true;
  lastRoomSyncStartedAt = now;

  const generation =
    ++roomSyncGeneration;

  window.isRejoining = true;
  window.gameSessionReady = false;

  setConnectionStatus(
    "syncing",
    "Syncing game…"
  );

  clearTimeout(roomSyncTimeout);

  roomSyncTimeout =
    setTimeout(() => {
      if (
        generation !==
        roomSyncGeneration
      ) {
        return;
      }

      failRoomSync(
        "Could not refresh the game. Tap to retry."
      );
    }, 9000);

  socket.timeout(7000).emit(
    "syncRoom",
    {
      roomId: currentRoomId,
      userId
    },
    (err, response) => {
      if (
        generation !==
        roomSyncGeneration
      ) {
        return;
      }

      if (
        err ||
        !response?.ok
      ) {
        const code =
          response?.code ||
          "SYNC_TIMEOUT";

        if (
          code ===
            "ROOM_NOT_FOUND" ||
          code ===
            "PLAYER_NOT_FOUND"
        ) {
          expireLocalRoom(
            response?.error ||
            "This game is no longer available."
          );

          return;
        }

        failRoomSync(
          "Could not sync the game. Tap to retry."
        );

        return;
      }

      const resolvedRoomId =
        response.roomId ||
        currentRoomId;

      window.roomId =
        resolvedRoomId;

      localStorage.setItem(
        "roomId",
        resolvedRoomId
      );

      /*
       * Do not hide the banner here.
       *
       * The server sends stateUpdate before acknowledging syncRoom.
       * markFreshGameState() hides the banner only when that fresh
       * authoritative state actually reaches this browser.
       */
    }
  );

  return true;
}

window.requestRoomSync =
  requestRoomSync;

function maybeAutoRejoin() {
  if (!window.socketReady) return;
  if (!window.authReady) return;

  requestRoomSync(
    "auto-rejoin"
  );
}

function tryAutoRejoin() {
  requestRoomSync(
    "manual-rejoin"
  );
}

window.maybeAutoRejoin =
  maybeAutoRejoin;

window.tryAutoRejoin =
  tryAutoRejoin;

/*
 * This listener is separate from client.js's normal state listener.
 * Every fresh state, including one requested after returning to the
 * app, marks the room session as usable.
 */
socket.on(
  "stateUpdate",
  markFreshGameState
);

socket.on(
  "roomInvalid",
  () => {
    window.gameSessionReady =
      false;

    setConnectionStatus(
      "syncing",
      "Game out of sync — reconnecting…"
    );

    requestRoomSync(
      "room-invalid"
    );
  }
);

socket.on("connect", () => {
  console.log("🔌 Connected");

  window.socketReady = true;

  clearTimeout(
    window._disconnectToastTimer
  );

  if (hasStoredRoom()) {
    window.gameSessionReady =
      false;

    window.isRejoining = true;

    setConnectionStatus(
      "syncing",
      "Syncing game…"
    );
  } else {
    setConnectionStatus("ready");
  }

  maybeAutoRejoin();
});

socket.on(
  "connect_error",
  err => {
    console.warn(
      "❌ Connection error:",
      err.message
    );

    if (hasStoredRoom()) {
      window.gameSessionReady =
        false;

      setConnectionStatus(
        "offline",
        "Reconnecting…"
      );
    }
  }
);

/*
 * Reconnection lifecycle events belong to the Socket.IO Manager.
 */
socket.io.on(
  "reconnect_attempt",
  () => {
    if (!hasStoredRoom()) {
      return;
    }

    window.gameSessionReady =
      false;

    setConnectionStatus(
      "offline",
      "Reconnecting…"
    );
  }
);

socket.on(
  "disconnect",
  reason => {
    console.warn(
      "🔌 Disconnected:",
      reason
    );

    window.socketReady = false;
    window.autoRejoinAttempted =
      false;

    window._everDisconnected =
      true;

    window._disconnectedAt =
      Date.now();

    window
      ._skipNextGameOverReveal =
      true;

    window.isRejoining = true;
    window.gameSessionReady =
      false;

    if (!hasStoredRoom()) {
      return;
    }

    clearTimeout(
      window._disconnectToastTimer
    );

    window._disconnectToastTimer =
      setTimeout(() => {
        if (!socket.connected) {
          if (
            typeof toast ===
            "function"
          ) {
            toast(
              "Connection lost — reconnecting…"
            );
          }

          setConnectionStatus(
            "offline",
            "Reconnecting…"
          );
        }
      }, 700);
  }
);

document.addEventListener(
  "visibilitychange",
  () => {
    if (
      document.visibilityState ===
      "hidden"
    ) {
      pageHiddenAt = Date.now();
      return;
    }

    if (!hasStoredRoom()) {
      return;
    }

    const awayMs =
      pageHiddenAt
        ? Date.now() -
          pageHiddenAt
        : 0;

    pageHiddenAt = 0;

    window.gameSessionReady =
      false;

    setConnectionStatus(
      "syncing",
      "Syncing game…"
    );

    requestRoomSync(
      `visible-${awayMs}`
    );
  }
);

window.addEventListener(
  "focus",
  () => {
    if (
      document.visibilityState !==
      "visible"
    ) {
      return;
    }

    requestRoomSync("focus");
  }
);

window.addEventListener(
  "online",
  () => {
    requestRoomSync("online");
  }
);

window.addEventListener(
  "offline",
  () => {
    if (!hasStoredRoom()) {
      return;
    }

    window.isRejoining = true;
    window.gameSessionReady =
      false;

    setConnectionStatus(
      "offline",
      "Offline — waiting for internet…"
    );
  }
);

window.addEventListener(
  "pageshow",
  event => {
    if (
      event.persisted ||
      hasStoredRoom()
    ) {
      requestRoomSync(
        "pageshow"
      );
    }
  }
);

document
  .getElementById(
    "connectionBanner"
  )
  ?.addEventListener(
    "click",
    () => {
      requestRoomSync(
        "banner-click"
      );
    }
  );
