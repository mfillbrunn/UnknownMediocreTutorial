//
// client.js — Corrected Version
//

// -----------------------------------------------------
// IMPORTS
// -----------------------------------------------------

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
  getPattern,
  getMustContainLetters,
  formatPattern
} from "./game-engine/constraints.js";

import {
  createRoom,
  joinRoom,
  sendGameAction,
  onStateUpdate,
  onAnimateTurn,
  onPowerUsed,
  onLobbyEvent
} from "./network/socketClient.js";

import { predictFeedback } from "./game-engine/preview.js";

// -----------------------------------------------------
// LOCAL CLIENT STATE
// -----------------------------------------------------

let roomId = null;
let myRole = null;   // "A" or "B"
let state = null;
let iAmReady = false;

// -----------------------------------------------------
// AUTO-REJOIN ON REFRESH
// -----------------------------------------------------

window.addEventListener("load", () => {
  const savedRoom = localStorage.getItem("vswordle_room");
  const savedRole = localStorage.getItem("vswordle_role");

  if (savedRoom) {
    joinRoom(savedRoom, resp => {
      if (resp.ok) {
        roomId = savedRoom;
        myRole = savedRole;
        $("roomInfo").style.display = "block";
        $("roomCodeLabel").textContent = roomId;

        if (myRole) {
          sendGameAction(roomId, { type: "SET_ROLE", role: myRole });
        }
      }
    });
  }
});

// -----------------------------------------------------
// DOM HELPERS
// -----------------------------------------------------

function $(id) { return document.getElementById(id); }
function show(id) { $(id).classList.add("active"); }
function hide(id) { $(id).classList.remove("active"); }

function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 1500);
}

// -----------------------------------------------------
// WAIT OVERLAY
// -----------------------------------------------------

function showWaitOverlay() { $("waitOverlay").classList.remove("hidden"); }
function hideWaitOverlay() { $("waitOverlay").classList.add("hidden"); }

// -----------------------------------------------------
// SOCKET EVENTS
// -----------------------------------------------------

// Turn animations
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

// Power-use events → toast messages
onPowerUsed(({ type, letters, pos, letter }) => {
  if (type === "reuseLetters") toast(`Setter reusable letters: ${letters.join(", ")}`);
  if (type === "confuseColors") toast("Setter used Blue Mode");
  if (type === "countOnly") toast("Setter used Count-Only");
  if (type === "hideTile") toast("Setter hid a tile");
  if (type === "revealGreen") toast(`Guesser sees Green ${pos+1}: ${letter}`);
  if (type === "freezeSecret") toast("Guesser froze secret");
});

// Lobby events
onLobbyEvent(evt => {
  if (evt.type === "playerJoined") toast("A player joined your room.");
  if (evt.type === "rolePicked") toast(`Player picked role ${evt.role}.`);
  if (evt.type === "playerReady") toast(`Player ${evt.role} is READY.`);
});

// -----------------------------------------------------
// STATE UPDATE HANDLER
// -----------------------------------------------------

onStateUpdate(newState => {
  const oldState = state;
  state = newState;

  detectLobbyChanges(oldState, state);
  updateUI();
});

// -----------------------------------------------------
// LOBBY CHANGE DETECTION
// -----------------------------------------------------

function detectLobbyChanges(oldS, newS) {
  if (!oldS) return;

  if (oldS.ready && newS.ready) {
    if (oldS.ready.A !== newS.ready.A && newS.ready.A) toast("Player A is READY");
    if (oldS.ready.B !== newS.ready.B && newS.ready.B) toast("Player B is READY");
  }

  if (oldS.setter !== newS.setter) toast(`Setter is now → ${newS.setter}`);
  if (oldS.guesser !== newS.guesser) toast(`Guesser is now → ${newS.guesser}`);
}

// -----------------------------------------------------
// RENDERING
// -----------------------------------------------------

function updateUI() {
  if (!state) return;

  updateMenu();
  updateScreens();
  updateWaitState();
  updateSummaryIfGameOver();
}

function updateMenu() {
  $("menuRoomCode").textContent = roomId || "-";

  if (!myRole) $("menuPlayerRole").textContent = "-";
  else $("menuPlayerRole").textContent =
    myRole === state.setter ? "Setter" : "Guesser";

  $("phaseLabel").textContent = state.phase || "-";
  $("turnLabel").textContent = state.turn || "-";
}

function updateScreens() {
  hide("setterScreen");
  hide("guesserScreen");

  if (!state.phase || state.phase === "lobby") return;

  if (myRole === state.setter) show("setterScreen");
  if (myRole === state.guesser) show("guesserScreen");

  updateSetterScreen();
  updateGuesserScreen();
}

// SETTER SCREEN
function updateSetterScreen() {
  $("secretWordDisplay").textContent = state.secret
    ? state.secret.toUpperCase()
    : "NONE";

  $("pendingGuessDisplay").textContent = state.pendingGuess
    ? state.pendingGuess.toUpperCase()
    : "-";

  renderHistory(state, $("historySetter"), true);

  const previewBox = $("setterPreview");
  previewBox.innerHTML = "";

  const secretInput = $("newSecretInput").value.trim().toLowerCase();

  if (secretInput.length === 5 && state.pendingGuess?.length === 5) {
    const fb = predictFeedback(secretInput, state.pendingGuess);
    if (fb) previewBox.textContent = `Preview: ${fb.join("")}`;
  }

  const locked = state.powers?.freezeActive;
  $("newSecretInput").disabled = locked;
  $("submitSetterNewBtn").disabled = locked;
  $("submitSetterSameBtn").disabled = locked;

  renderKeyboard(state, $("keyboardSetter"), "setter", (letter, special) => {
    const box = $("newSecretInput");
    if (special === "BACKSPACE") box.value = box.value.slice(0, -1);
    else if (special === "ENTER") $("submitSetterNewBtn").click();
    else if (letter) box.value += letter;

    updateSetterScreen();
  });

  $("knownPatternSetter").textContent =
    formatPattern(getPattern(state, true));

  const must = getMustContainLetters(state);
  $("mustContainSetter").textContent = must.length ? must.join(", ") : "none";
}

// GUESSER SCREEN
function updateGuesserScreen() {
  renderHistory(state, $("historyGuesser"), false);

  renderKeyboard(state, $("keyboardGuesser"), "guesser", (letter, special) => {
    const box = $("guessInput");

    if (special === "BACKSPACE") box.value = box.value.slice(0, -1);
    else if (special === "ENTER") $("submitGuessBtn").click();
    else if (letter) box.value += letter;
  });

  $("knownPatternGuesser").textContent =
    formatPattern(getPattern(state, false));

  const must = getMustContainLetters(state);
  $("mustContainGuesser").textContent = must.length ? must.join(", ") : "none";
}

// -----------------------------------------------------
// WAIT OVERLAY LOGIC
// -----------------------------------------------------

function updateWaitState() {
  if (!state) return hideWaitOverlay();

  if (state.phase === "simultaneous") return hideWaitOverlay();

  if (state.phase === "setterDecision")
    return myRole === state.setter ? hideWaitOverlay() : showWaitOverlay();

  if (state.phase === "normal")
    return myRole === state.turn ? hideWaitOverlay() : showWaitOverlay();

  hideWaitOverlay();
}

// -----------------------------------------------------
// GAME SUMMARY
// -----------------------------------------------------

function updateSummaryIfGameOver() {
  const box = $("roundSummary");

  if (!state?.gameOver) {
    box.textContent = "";
    return;
  }

  let text = `Total guesses: ${state.guessCount}\n\n`;
  state.history.forEach((h, i) => {
    const idx = i + 1;
    const secret = h.finalSecret || "(unknown)";
    const guess = h.guess.toUpperCase();
    const fb = h.fb.join("");

    text += `${idx}) Secret: ${secret.toUpperCase()} | Guess: ${guess} | FB: ${fb}\n`;
  });

  box.textContent = text;
}

// -----------------------------------------------------
// LOBBY BUTTONS
// -----------------------------------------------------

$("createRoomBtn").onclick = () => {
  createRoom(resp => {
    if (!resp.ok) return;
    roomId = resp.roomId;
    localStorage.setItem("vswordle_room", roomId);

    $("roomInfo").style.display = "block";
    $("roomCodeLabel").textContent = roomId;
  });
};

$("joinRoomBtn").onclick = () => {
  const code = $("joinRoomInput").value.trim().toUpperCase();
  if (!code) return toast("Enter a code");

  joinRoom(code, resp => {
    if (!resp.ok) return toast(resp.error);

    roomId = code;
    localStorage.setItem("vswordle_room", roomId);
    $("roomInfo").style.display = "block";
    $("roomCodeLabel").textContent = roomId;
  });
};

$("pickRoleA").onclick = () => chooseRole("A");
$("pickRoleB").onclick = () => chooseRole("B");

function chooseRole(role) {
  myRole = role;

  $("pickRoleA").classList.toggle("selected", role === "A");
  $("pickRoleB").classList.toggle("selected", role === "B");

  sendGameAction(roomId, { type: "SET_ROLE", role });
  localStorage.setItem("vswordle_role", role);
}

// START GAME — DOUBLE READY
$("startGameBtn").onclick = () => {
  if (!myRole) return toast("Choose a role first!");

  iAmReady = true;
  toast("You are READY. Waiting for other player…");

  sendGameAction(roomId, { type: "PLAYER_READY", role: myRole });
};

// GAMEPLAY BUTTONS
$("submitGuessBtn").onclick = () => {
  const g = $("guessInput").value.trim().toLowerCase();
  $("guessInput").value = "";
  if (g.length !== 5) return toast("5 letters required");

  sendGameAction(roomId, { type: "SUBMIT_GUESS", guess: g });
};

$("submitSetterNewBtn").onclick = () => {
  const w = $("newSecretInput").value.trim().toLowerCase();
  $("newSecretInput").value = "";
  if (w.length !== 5) return toast("5 letters!");

  sendGameAction(roomId, { type: "SET_SECRET_NEW", secret: w });
};

$("submitSetterSameBtn").onclick =
  () => sendGameAction(roomId, { type: "SET_SECRET_SAME" });

// POWERS
function setupPowerButtons() {
  renderSetterPowerButtons($("setterPowerContainer"));
  for (const key of Object.keys(SETTER_POWERS)) {
    const btn = $("power_" + key);
    if (btn) btn.onclick = () => activateSetterPower(key, roomId);
  }

  renderGuesserPowerButtons($("guesserPowerContainer"));
  for (const key of Object.keys(GUESSER_POWERS)) {
    const btn = $("power_" + key);
    if (btn) btn.onclick = () => activateGuesserPower(key, roomId);
  }
}

setupPowerButtons();

// NEW MATCH
$("newMatchBtn").onclick = () => {
  sendGameAction(roomId, { type: "NEW_MATCH" });

  iAmReady = false;
  resetSetterPowers();
  resetGuesserPowers();

  hide("setterScreen");
  hide("guesserScreen");
  show("menu");
};

$("backToLobbyBtn").onclick = () => {
  hide("setterScreen");
  hide("guesserScreen");
  show("lobby");
};
