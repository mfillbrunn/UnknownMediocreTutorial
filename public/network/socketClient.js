// socketClient.js — Non-module version for Railway deployment

if (typeof io === "undefined") {
  alert("Socket.IO failed to load!");
}

// Empty BACKEND_URL = connect to same origin (Railway correct)
const BACKEND_URL = "";

// Create Socket.IO client
const socket = io(BACKEND_URL, {
  path: "/socket.io",             // ⭐ MUST match server exactly (with trailing slash)
  transports: ["polling", "websocket"],  // ⭐ polling first fixes Railway upgrade issues
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
//--------------------------------------------------
// RARE LETTER BONUS (client receives letter reveal)
//--------------------------------------------------
socket.on("rareLetterReveal", ({ index, letter }) => {
  console.log("[CLIENT] RareLetterBonus reveal:", index, letter);

  // Ensure powers structure exists
  if (state && state.powers) {
    if (!state.powers.guesserLockedGreens) {
      state.powers.guesserLockedGreens = [];
    }
    state.powers.guesserLockedGreens.push(letter.toUpperCase());
  }

  // Update keyboard immediately
  try {
    if (typeof renderKeyboard === "function") {
      // rebuild both keyboards (setter/guesser)
      updateGuesserScreen?.();
      updateSetterScreen?.();
    }
  } catch (e) {
    console.warn("Keyboard refresh failed:", e);
  }

  // Optional: highlight current row
  highlightRareBonusTile(index, letter);
});

function highlightRareBonusTile(i, letter) {
  const row = document.querySelector(".board-row.current");
  if (!row) return;

  const tile = row.children[i];
  if (!tile) return;

  tile.textContent = letter.toUpperCase();
  tile.classList.add("tile-green", "power-reveal");
}

// ------------------------------
// CONNECTION LOGS
// ------------------------------
socket.on("connect", () => console.log("🔌 Connected"));
socket.on("connect_error", err =>
  console.warn("❌ Connection error:", err.message)
);
