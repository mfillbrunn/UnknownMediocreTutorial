// client.js — FULL MODERN REWRITE
// Uses ES modules and imports dynamic power systems

import { SETTER_POWERS, GUESSER_POWERS } from "./powers/powers.js";
import {
  renderSetterPowerButtons,
  activateSetterPower,
  resetSetterPowers
} from "./powers/setterPowers.js";
import {
  renderGuesserPowerButtons,
  activateGuesserPower,
  resetGuesserPowers
} from "./powers/guesserPowers.js";

// -----------------------------------------------------
// SOCKET SETUP
// -----------------------------------------------------
const socket = io();
let roomId = null;
let myRole = null;          // "A", "B", or "spectator"
let state = null;           // entire game state snapshot from server

// -----------------------------------------------------
// SIMPLE DOM HELPERS
// -----------------------------------------------------
function $(id) {
  return document.getElementById(id);
}
function show(id) {
  $(id).classList.add("active");
}
function hide(id) {
  $(id).classList.remove("active");
}
function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 1500);
}

// -----------------------------------------------------
// TURN POPUP
// -----------------------------------------------------
socket.on("animateTurn", ({ type }) => {
  const tp = $("turnPopup");
  let msg = "";

  if (type === "setterSubmitted") msg = "Setter Submitted";
  if (type === "guesserSubmitted") msg = "Guesser Submitted";

  if (msg) {
    tp.textContent = msg;
    tp.classList.add("show");
    setTimeout(() => tp.classList.remove("show"), 800);
  }
});

// -----------------------------------------------------
// POWER NOTIFICATIONS
// -----------------------------------------------------
socket.on("powerUsed", ({ player, type, letters, pos, letter }) => {
  if (type === "reuseLetters") {
    toast(`Setter gained reusable letters: ${letters.join(", ")}`);
  }
  if (type === "confuseColors") {
    toast("Setter used Blue Mode");
  }
  if (type === "countOnly") {
    toast("Setter used Count-Only");
  }
  if (type === "hideTile") {
    toast("Setter hid a tile");
  }
  if (type === "revealGreen") {
    toast(`Guesser sees a Green at position ${pos + 1}: ${letter}`);
  }
  if (type === "freezeSecret") {
    toast("Guesser froze secret");
  }
});

// -----------------------------------------------------
// KEYBOARD LAYOUT
// -----------------------------------------------------
const KEYBOARD_ROWS = [
  "QWERTYUIOP",
  "ASDFGHJKL",
  "ZXCVBNM"
];

// -----------------------------------------------------
// KEYBOARD RENDERING
// -----------------------------------------------------
function renderKeyboard(containerId, target) {
  const cont = $(containerId);
  cont.innerHTML = "";

  const usedLetters = new Set();
  if (state && state.history) {
    for (const h of state.history) {
      for (const ch of h.guess.toUpperCase()) {
        usedLetters.add(ch);
      }
    }
  }

  const reusePool = state?.powers?.reuseLettersPool || [];

  KEYBOARD_ROWS.forEach(row => {
    const rowDiv = document.createElement("div");
    rowDiv.className = "key-row";

    for (const ch of row) {
      const key = document.createElement("div");
      key.className = "key";
      key.textContent = ch;

      // Red outline for letters guesser previously used (setter sees this)
      if (target === "setter" && usedLetters.has(ch)) {
        key.classList.add("key-red-outline");
      }

      // Reuse pool letters (setter special effect)
      if (target === "setter" && reusePool.includes(ch)) {
        key.style.background = "#bbb"; // grey-out
      }

      // Keyboard coloring for guesser
      if (target === "guesser") {
        if (state?.history?.length > 0) {
          // last feedback
          const last = state.history[state.history.length - 1];
          if (last && last.fbGuesser) {
            const guess = last.guess.toUpperCase();
            const f = last.fbGuesser;

            for (let i = 0; i < 5; i++) {
              if (guess[i] === ch) {
                if (f[i] === "🟩") key.classList.add("key-green");
                if (f[i] === "🟨") key.classList.add("key-yellow");
                if (f[i] === "⬛") key.classList.add("key-gray");
                if (f[i] === "🟦") key.style.background = "#75a7ff";
              }
            }
          }
        }
      }

      key.addEventListener("click", () => {
        if (target === "setter") {
          $("newSecretInput").value += ch;
        } else {
          $("guessInput").value += ch;
        }
      });

      rowDiv.appendChild(key);
    }

    cont.appendChild(rowDiv);
  });
}

// -----------------------------------------------------
// HISTORY RENDERING
// -----------------------------------------------------
function renderHistory(containerId, isSetter) {
  const box = $(containerId);
  box.innerHTML = "";

  if (!state || !state.history.length) {
    box.textContent = "No guesses yet.";
    return;
  }

  for (const h of state.history) {
    const div = document.createElement("div");
    div.style.marginBottom = "6px";

    const guess = h.guess.toUpperCase();

    let tiles = "";
    if (isSetter) {
      // setter sees full real feedback
      for (const f of h.fb) {
        tiles += f;
      }
    } else {
      // guesser sees transformed feedback
      for (let i = 0; i < 5; i++) {
        if (h.hiddenIndices.includes(i)) {
          tiles += "❓";
        } else {
          tiles += h.fbGuesser[i];
        }
      }
      if (h.extraInfo) {
        tiles += `   Feedback: ${h.extraInfo.greens} green, ${h.extraInfo.yellows} yellow`;
      }
    }

    div.textContent = `${guess}   ${tiles}`;
    box.appendChild(div);
  }
}

// -----------------------------------------------------
// SCREEN RENDERING
// -----------------------------------------------------
function render() {
  if (!state) return;

  // Update menu info
  $("menuRoomCode").textContent = roomId;
  $("menuPlayerRole").textContent = myRole;
  $("roundLabel").textContent = state.roundNumber;
  $("roleLabel").textContent =
    state.setter === myRole ? "Setter" :
    state.guesser === myRole ? "Guesser" :
    "Spectator";
  $("turnLabel").textContent = state.turn;

  $("guessCountMenu").textContent = state.guessCount;

  // Update setter-specific fields
  $("secretWordDisplay").textContent = state.secret.toUpperCase() || "----";
  $("pendingGuessDisplay").textContent = state.pendingGuess.toUpperCase() || "-";

  // History for both screens
  renderHistory("historySetter", true);
  renderHistory("historyGuesser", false);

  // Re-render keyboards
  renderKeyboard("keyboardSetter", "setter");
  renderKeyboard("keyboardGuesser", "guesser");

  // Update constraints text
  const patternSetter = patternFromHistory(true);
  $("knownPatternSetter").textContent = patternSetter.split("").join(" ");
  $("mustContainSetter").textContent = mustContainLetters().join(", ") || "none";

  const patternGuesser = patternFromHistory(false);
  $("knownPatternGuesser").textContent = patternGuesser.split("").join(" ");
  $("mustContainGuesser").textContent = mustContainLetters().join(", ") || "none";
}

// -----------------------------------------------------
// CONSTRAINTS (known pattern + must-contain)
// -----------------------------------------------------
function patternFromHistory(isSetterView) {
  let res = ["-", "-", "-", "-", "-"];

  if (!state || !state.history.length) return res.join("");

  for (const h of state.history) {
    for (let i = 0; i < 5; i++) {
      const f = isSetterView ? h.fb[i] : h.fbGuesser[i];

      if (f === "🟩") {
        res[i] = h.guess[i].toUpperCase();
      }
    }
  }
  return res.join("");
}

function mustContainLetters() {
  const s = new Set();
  if (!state || !state.history.length) return [];

  for (const h of state.history) {
    for (let i = 0; i < 5; i++) {
      if (h.fb[i] === "🟩" || h.fb[i] === "🟨") {
        s.add(h.guess[i].toUpperCase());
      }
    }
  }
  return Array.from(s);
}

// -----------------------------------------------------
// STATE UPDATE FROM SERVER
// -----------------------------------------------------
socket.on("stateUpdate", newState => {
  state = newState;
  render();
});

// -----------------------------------------------------
// LOBBY
// -----------------------------------------------------
$("createRoomBtn").onclick = () => {
  socket.emit("createRoom", (resp) => {
    if (!resp.ok) return;
    roomId = resp.roomId;
    $("roomInfo").style.display = "block";
    $("roomCodeLabel").textContent = roomId;
    hide("lobby");
    show("menu");
  });
};

$("joinRoomBtn").onclick = () => {
  const code = $("joinRoomInput").value.trim().toUpperCase();
  if (!code) return;

  socket.emit("joinRoom", code, (resp) => {
    if (!resp.ok) return toast(resp.error);
    roomId = code;
    $("roomInfo").style.display = "block";
    $("roomCodeLabel").textContent = roomId;
    hide("lobby");
    show("menu");
  });
};

// -----------------------------------------------------
// ENTER GAME BUTTONS
// -----------------------------------------------------
$("btnSetter").onclick = () => {
  hide("menu");
  show("setterScreen");
};
$("btnGuesser").onclick = () => {
  hide("menu");
  show("guesserScreen");
};

// -----------------------------------------------------
// SUBMIT GUESS
// -----------------------------------------------------
$("submitGuessBtn").onclick = () => {
  const g = $("guessInput").value.trim().toLowerCase();
  $("guessInput").value = "";
  if (g.length !== 5) return toast("5 letters required");

  socket.emit("gameAction", {
    roomId,
    action: {
      type: "SUBMIT_GUESS",
      guess: g
    }
  });
};

// -----------------------------------------------------
// SET SECRET (NEW)
// -----------------------------------------------------
$("submitSetterNewBtn").onclick = () => {
  const w = $("newSecretInput").value.trim().toLowerCase();
  $("newSecretInput").value = "";
  if (w.length !== 5) return toast("5 letters required");

  socket.emit("gameAction", {
    roomId,
    action: {
      type: "SET_SECRET_NEW",
      secret: w
    }
  });
};

// KEEP SAME SECRET
$("submitSetterSameBtn").onclick = () => {
  socket.emit("gameAction", {
    roomId,
    action: { type: "SET_SECRET_SAME" }
  });
};

// -----------------------------------------------------
// POWER BUTTON DYNAMIC RENDERING
// -----------------------------------------------------
function setupPowerButtons() {
  // Setter
  renderSetterPowerButtons($("setterPowerContainer"));
  for (const key of Object.keys(SETTER_POWERS)) {
    $("power_" + key).onclick = () =>
      activateSetterPower(key, roomId, socket);
  }

  // Guesser
  renderGuesserPowerButtons($("guesserPowerContainer"));
  for (const key of Object.keys(GUESSER_POWERS)) {
    $("power_" + key).onclick = () =>
      activateGuesserPower(key, roomId, socket);
  }
}

// Render them once the DOM is ready
setupPowerButtons();

// -----------------------------------------------------
// NEW MATCH
// -----------------------------------------------------
$("newMatchBtn").onclick = () => {
  socket.emit("gameAction", {
    roomId,
    action: { type: "NEW_MATCH" }
  });

  resetSetterPowers();
  resetGuesserPowers();

  hide("setterScreen");
  hide("guesserScreen");
  show("menu");
};

// Back buttons
$("guesserBackToMenuBtn").onclick = () => {
  hide("guesserScreen");
  show("menu");
};
$("setterBackToMenuBtn").onclick = () => {
  hide("setterScreen");
  show("menu");
};

$("backToLobbyBtn").onclick = () => {
  hide("menu");
  show("lobby");
};
