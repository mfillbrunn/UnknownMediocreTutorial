//
// client.js — Final modular implementation with:
// - Role selection
// - Double-ready start system
// - Simultaneous first turn
// - Setter decision phase
// - WAIT overlay
// - Summary on game end
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
// LOCAL CLIENT STATE
// -----------------------------------------------------

let roomId = null;
let myRole = null;   // "A" or "B"
let state = null;    // Full game state from server
let iAmReady = false;


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
// WAIT OVERLAY CONTROL
// -----------------------------------------------------

function showWaitOverlay() {
  $("waitOverlay").classList.remove("hidden");
}
function hideWaitOverlay() {
  $("waitOverlay").classList.add("hidden");
}


// -----------------------------------------------------
// SOCKET-INBOUND EVENTS
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

onPowerUsed(({ type, letters, pos, letter }) => {
  if (type === "reuseLetters") toast(`Setter reusable letters: ${letters.join(", ")}`);
  if (type === "confuseColors") toast("Setter used Blue Mode");
  if (type === "countOnly") toast("Setter used Count-Only");
  if (type === "hideTile") toast("Setter hid a tile");
  if (type === "revealGreen") toast(`Guesser sees Green ${pos+1}: ${letter}`);
  if (type === "freezeSecret") toast("Guesser froze secret");
});

onStateUpdate(newState => {
  state = newState;
  updateUI();
});


// -----------------------------------------------------
// RENDERING LOGIC
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
  $("menuPlayerRole").textContent = myRole || "-";
  $("phaseLabel").textContent = state.phase || "-";
  $("turnLabel").textContent = state.turn || "-";
}

// Controls which screen is visible based on role + phase
function updateScreens() {
  // Reset visibility
  hide("setterScreen");
  hide("guesserScreen");

  // If game hasn't started, only menu/lobby visible
  if (!state.phase || state.phase === "lobby") return;

  if (myRole === "A") {
    show("setterScreen");
  } else if (myRole === "B") {
    show("guesserScreen");
  }

  updateSetterScreen();
  updateGuesserScreen();
}

function updateSetterScreen() {
  $("secretWordDisplay").textContent = state.secret
    ? state.secret.toUpperCase()
    : "NONE";

  $("pendingGuessDisplay").textContent = state.pendingGuess
    ? state.pendingGuess.toUpperCase()
    : "-";

  // History
  renderHistory(state, $("historySetter"), true);

  // Keyboard
  renderKeyboard(state, $("keyboardSetter"), "setter", ch => {
    $("newSecretInput").value += ch;
  });

  // Constraints
  const pat = getKnownPattern(state.history, "fb");
  $("knownPatternSetter").textContent = spacedPattern(pat);

  const must = getMustContain(state.history);
  $("mustContainSetter").textContent = must.length ? must.join(", ") : "none";
}

function updateGuesserScreen() {
  renderHistory(state, $("historyGuesser"), false);

  renderKeyboard(state, $("keyboardGuesser"), "guesser", ch => {
    $("guessInput").value += ch;
  });

  const pat = getKnownPattern(state.history, "fbGuesser");
  $("knownPatternGuesser").textContent = spacedPattern(pat);

  const must = getMustContain(state.history);
  $("mustContainGuesser").textContent = must.length ? must.join(", ") : "none";
}



// -----------------------------------------------------
// WAIT-STATE / TURN BLOCKER
// -----------------------------------------------------

function updateWaitState() {
  if (!state || !state.phase) {
    hideWaitOverlay();
    return;
  }

  if (state.phase === "simultaneous") {
    hideWaitOverlay(); // both act at same time
    return;
  }

  if (state.phase === "setterDecision") {
    if (myRole === state.setter) hideWaitOverlay();
    else showWaitOverlay();
    return;
  }

  if (state.phase === "normal") {
    if (state.turn === myRole) hideWaitOverlay();
    else showWaitOverlay();
    return;
  }

  hideWaitOverlay();
}


// -----------------------------------------------------
// SUMMARY WHEN GAME ENDS
// -----------------------------------------------------

function updateSummaryIfGameOver() {
  const box = $("roundSummary");
  if (!state || !state.gameOver) {
    box.textContent = "";
    return;
  }

  let text = `Total guesses: ${state.guessCount}\n\n`;

  state.history.forEach((h, i) => {
    const idx = i + 1;
    const secret = h.finalSecret || h.secret || "(unknown)";
    const guess = h.guess.toUpperCase();
    const fb = h.fb.join("");
    text += `${idx}) Secret: ${secret.toUpperCase()} | Guess: ${guess} | Feedback: ${fb}\n`;
  });

  box.textContent = text;
}


// -----------------------------------------------------
// LOBBY ACTIONS
// -----------------------------------------------------

$("createRoomBtn").onclick = () => {
  createRoom(resp => {
    if (!resp.ok) return;
    roomId = resp.roomId;
    $("roomInfo").style.display = "block";
    $("roomCodeLabel").textContent = roomId;
    state = { phase: "lobby" };
    hide("lobby");
    show("lobby");
  });
};

$("joinRoomBtn").onclick = () => {
  const code = $("joinRoomInput").value.trim().toUpperCase();
  if (!code) return;

  joinRoom(code, resp => {
    if (!resp.ok) return toast(resp.error);
    roomId = code;
    $("roomInfo").style.display = "block";
    $("roomCodeLabel").textContent = roomId;
    state = { phase: "lobby" };
  });
};


// -----------------------------------------------------
// ROLE PICKING
// -----------------------------------------------------

$("pickRoleA").onclick = () => chooseRole("A");
$("pickRoleB").onclick = () => chooseRole("B");

function chooseRole(role) {
  myRole = role;
  toast(`You selected role ${role}`);

  // Highlight selection
  $("pickRoleA").classList.toggle("selected", role === "A");
  $("pickRoleB").classList.toggle("selected", role === "B");

  sendGameAction(roomId, { type: "SET_ROLE", role });

  // Try enabling start game if possible
  updateStartButton();
}


// -----------------------------------------------------
// START GAME READINESS
// -----------------------------------------------------

$("startGameBtn").onclick = () => {
  if (!myRole) return toast("Choose a role first!");

  iAmReady = true;
  toast("You are READY. Waiting for other player…");

  sendGameAction(roomId, { type: "PLAYER_READY", role: myRole });

  updateStartButton();
};

function updateStartButton() {
  if (!state || !state.ready) {
    disableStartButton();
    return;
  }

  const bothReady = state.ready.A && state.ready.B;

  if (!myRole) {
    disableStartButton();
    return;
  }

  if (iAmReady) {
    $("startGameBtn").textContent = "Waiting…";
  }

  $("startGameBtn").disabled = bothReady;
  $("startGameBtn").classList.toggle("disabled", bothReady);
}

function disableStartButton() {
  $("startGameBtn").disabled = true;
  $("startGameBtn").classList.add("disabled");
}



// -----------------------------------------------------
// GAMEPLAY INPUTS
// -----------------------------------------------------

// Submit guess
$("submitGuessBtn").onclick = () => {
  const g = $("guessInput").value.trim().toLowerCase();
  $("guessInput").value = "";
  if (g.length !== 5) return toast("5 letters required");

  sendGameAction(roomId, {
    type: "SUBMIT_GUESS",
    guess: g
  });
};

// Submit new secret
$("submitSetterNewBtn").onclick = () => {
  const w = $("newSecretInput").value.trim().toLowerCase();
  $("newSecretInput").value = "";
  if (w.length !== 5) return toast("5 letters!");

  sendGameAction(roomId, {
    type: "SET_SECRET_NEW",
    secret: w
  });
};

// Keep same secret
$("submitSetterSameBtn").onclick = () => {
  sendGameAction(roomId, { type: "SET_SECRET_SAME" });
};


// -----------------------------------------------------
// POWER BUTTONS
// -----------------------------------------------------

function setupPowerButtons() {
  renderSetterPowerButtons($("setterPowerContainer"));
  for (const key of Object.keys(SETTER_POWERS)) {
    const btn = $("power_" + key);
    if (!btn) continue;
    btn.onclick = () => activateSetterPower(key, roomId);
  }

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

  iAmReady = false;
  resetSetterPowers();
  resetGuesserPowers();

  hide("setterScreen");
  hide("guesserScreen");
  show("menu");
};

// Back buttons
$("backToLobbyBtn").onclick = () => {
  hide("menu");
  show("lobby");
};

$("guesserBackToMenuBtn").onclick =
$("setterBackToMenuBtn").onclick = () => {
  hide("setterScreen");
  hide("guesserScreen");
  show("menu");
};
