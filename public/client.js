// client.js — modular client using UI + game-engine + socketClient

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

import { renderKeyboard } from "./ui/keyboard.js";
import { renderHistory } from "./ui/history.js";
import {
  getKnownPattern,
  getMustContain,
  spacedPattern
} from "./game-engine/constraints.js";

import {
  createRoom,
  joinRoom,
  sendGameAction,
  onStateUpdate,
  onAnimateTurn,
  onPowerUsed
} from "./network/socketClient.js";

// -----------------------------------------------------
// STATE
// -----------------------------------------------------
let roomId = null;
let myRole = "-";  // Display only for now
let state = null;

// -----------------------------------------------------
// DOM HELPERS
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
// SOCKET EVENT HOOKS (via socketClient)
// -----------------------------------------------------
onAnimateTurn(({ type }) => {
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

onPowerUsed(({ player, type, letters, pos, letter }) => {
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

onStateUpdate(newState => {
  state = newState;
  render();
});

// -----------------------------------------------------
// RENDERING
// -----------------------------------------------------
function render() {
  if (!state) return;

  // Menu info
  $("menuRoomCode").textContent = roomId || "-";
  $("menuPlayerRole").textContent = myRole || "-";

  $("roundLabel").textContent = state.roundNumber;
  $("roleLabel").textContent =
    state.setter === myRole ? "Setter" :
    state.guesser === myRole ? "Guesser" :
    "Spectator";

  $("turnLabel").textContent = state.turn;
  $("guessCountMenu").textContent = state.guessCount;

  // Setter info
  $("secretWordDisplay").textContent = state.secret
    ? state.secret.toUpperCase()
    : "NONE";
  $("pendingGuessDisplay").textContent = state.pendingGuess
    ? state.pendingGuess.toUpperCase()
    : "-";

  // History
  renderHistory(state, $("historySetter"), true);
  renderHistory(state, $("historyGuesser"), false);

  // Keyboards
  renderKeyboard(state, $("keyboardSetter"), "setter", (ch) => {
    $("newSecretInput").value += ch;
  });
  renderKeyboard(state, $("keyboardGuesser"), "guesser", (ch) => {
    $("guessInput").value += ch;
  });

  // Constraints (using safe client-side game-engine logic)
  const patSetter = getKnownPattern(state.history, "fb");
  $("knownPatternSetter").textContent = spacedPattern(patSetter);

  const patGuesser = getKnownPattern(state.history, "fbGuesser");
  $("knownPatternGuesser").textContent = spacedPattern(patGuesser);

  const mustContain = getMustContain(state.history);
  $("mustContainSetter").textContent = mustContain.length ? mustContain.join(", ") : "none";
  $("mustContainGuesser").textContent = mustContain.length ? mustContain.join(", ") : "none";
}

// -----------------------------------------------------
// LOBBY / MENU
// -----------------------------------------------------
$("createRoomBtn").onclick = () => {
  createRoom((resp) => {
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

  joinRoom(code, (resp) => {
    if (!resp.ok) return toast(resp.error || "Error joining room");
    roomId = code;
    $("roomInfo").style.display = "block";
    $("roomCodeLabel").textContent = roomId;
    hide("lobby");
    show("menu");
  });
};

$("btnSetter").onclick = () => {
  hide("menu");
  show("setterScreen");
};
$("btnGuesser").onclick = () => {
  hide("menu");
  show("guesserScreen");
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

// -----------------------------------------------------
// GUESSER ACTIONS
// -----------------------------------------------------
$("submitGuessBtn").onclick = () => {
  const g = $("guessInput").value.trim().toLowerCase();
  $("guessInput").value = "";
  if (g.length !== 5) return toast("5 letters required");

  sendGameAction(roomId, {
    type: "SUBMIT_GUESS",
    guess: g
  });
};

// -----------------------------------------------------
// SETTER ACTIONS
// -----------------------------------------------------
$("submitSetterNewBtn").onclick = () => {
  const w = $("newSecretInput").value.trim().toLowerCase();
  $("newSecretInput").value = "";
  if (w.length !== 5) return toast("5 letters required");

  sendGameAction(roomId, {
    type: "SET_SECRET_NEW",
    secret: w
  });
};

$("submitSetterSameBtn").onclick = () => {
  sendGameAction(roomId, {
    type: "SET_SECRET_SAME"
  });
};

// -----------------------------------------------------
// POWERS — dynamic buttons
// -----------------------------------------------------
function setupPowerButtons() {
  // Setter powers
  renderSetterPowerButtons($("setterPowerContainer"));
  for (const key of Object.keys(SETTER_POWERS)) {
    const btn = $("power_" + key);
    if (!btn) continue;
    btn.onclick = () => activateSetterPower(key, roomId);
  }

  // Guesser powers
  renderGuesserPowerButtons($("guesserPowerContainer"));
  for (const key of Object.keys(GUESSER_POWERS)) {
    const btn = $("power_" + key);
    if (!btn) continue;
    btn.onclick = () => activateGuesserPower(key, roomId);
  }
}

setupPowerButtons();

// -----------------------------------------------------
// NEW MATCH
// -----------------------------------------------------
$("newMatchBtn").onclick = () => {
  sendGameAction(roomId, { type: "NEW_MATCH" });

  resetSetterPowers();
  resetGuesserPowers();

  hide("setterScreen");
  hide("guesserScreen");
  show("menu");
};
