//
// client.js — Non-module version for Railway (No imports)
//

// -----------------------------------------------------
// LOCAL CLIENT STATE
// -----------------------------------------------------
let roomId = null;
let myRole = null;      // "A" = Setter, "B" = Guesser — assigned by server
let state = null;
let iAmReady = false;

// Helpers
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
// AUTO REJOIN
// -----------------------------------------------------
window.addEventListener("load", () => {
  const savedRoom = localStorage.getItem("vswordle_room");
  if (savedRoom) {
    joinRoom(savedRoom, resp => {
      if (resp.ok) {
        roomId = savedRoom;
        $("roomInfo").style.display = "block";
        $("roomCodeLabel").textContent = roomId;
      }
    });
  }
});

// -----------------------------------------------------
// SOCKET EVENT HANDLERS
// -----------------------------------------------------

// SIMPLE TURN POPUP
onAnimateTurn(({ type }) => {
  const tp = $("turnPopup");
  const msg =
    type === "setterSubmitted" ? "Setter Submitted" :
    type === "guesserSubmitted" ? "Guesser Submitted" : "";

  if (msg) {
    tp.textContent = msg;
    tp.classList.add("show");
    setTimeout(() => tp.classList.remove("show"), 800);
  }
});

// POWER NOTIFICATIONS
onPowerUsed(({ type, letters, pos, letter }) => {
  if (type === "reuseLetters") toast(`Setter reusable letters: ${letters.join(", ")}`);
  if (type === "confuseColors") toast("Setter used Blue Mode");
  if (type === "countOnly") toast("Setter used Count-Only");
  if (type === "hideTile") toast("Setter hid a tile");
  if (type === "revealGreen") toast(`Green revealed at ${pos + 1}: ${letter}`);
  if (type === "freezeSecret") toast("Guesser froze secret");
});

// LOBBY EVENTS
onLobbyEvent(evt => {
  if (evt.type === "playerJoined") toast("A player joined.");

  if (evt.type === "rolesSwitched") {
    toast("Roles switched");
    $("switchRolesBtn").classList.add("switch-active");
    setTimeout(() => $("switchRolesBtn").classList.remove("switch-active"), 1200);
  }

  if (evt.type === "playerReady") {
    toast(`Player ${evt.role} is READY`);
  }

  if (evt.type === "hideLobby") {
    hide("lobby");
    show("menu");
  }
});

// -----------------------------------------------------
// STATE UPDATE
// -----------------------------------------------------
onStateUpdate(newState => {
  const old = state;
  state = newState;

  updateUI();
});

// -----------------------------------------------------
// UI UPDATE FLOW
// -----------------------------------------------------
function updateUI() {
  if (!state) return;

  updateMenu();
  updateScreens();
  updateTurnIndicators();
  updateWaitState();
  updateSummaryIfGameOver();
}

function updateMenu() {
  $("menuRoomCode").textContent = roomId || "-";
  $("menuPlayerRole").textContent = myRole === "A" ? "Setter" :
                                    myRole === "B" ? "Guesser" : "-";
  $("phaseLabel").textContent = state.phase || "-";
  $("turnLabel").textContent = state.turn || "-";
}

function updateScreens() {
  hide("setterScreen");
  hide("guesserScreen");

  if (state.phase === "lobby") return;

  if (myRole === "A") show("setterScreen");
  else if (myRole === "B") show("guesserScreen");

  updateSetterScreen();
  updateGuesserScreen();
}

// -----------------------------------------------------
// TURN INDICATION
// -----------------------------------------------------
function updateTurnIndicators() {
  $("turnIndicatorSetter").textContent =
    state.turn === "A" ? "YOUR TURN" : "WAIT";

  $("turnIndicatorGuesser").textContent =
    state.turn === "B" ? "YOUR TURN" : "WAIT";
}

// -----------------------------------------------------
// SETTER SCREEN
// -----------------------------------------------------
function updateSetterScreen() {
  $("secretWordDisplay").textContent = state.secret?.toUpperCase() || "NONE";
  $("pendingGuessDisplay").textContent = state.pendingGuess?.toUpperCase() || "-";

  renderHistory(state, $("historySetter"), true);

  const previewBox = $("setterPreview");
  previewBox.innerHTML = "";
  const guess = state.pendingGuess;
  const w = $("newSecretInput").value.trim().toLowerCase();
  if (guess && w.length === 5) {
    const fb = predictFeedback(w, guess);
    previewBox.textContent = `Preview: ${fb.join("")}`;
  }

  const locked = state.powers.freezeActive;
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
  $("mustContainSetter").textContent =
    getMustContainLetters(state).join(", ") || "none";
}

// -----------------------------------------------------
// GUESSER SCREEN
// -----------------------------------------------------
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
  $("mustContainGuesser").textContent =
    getMustContainLetters(state).join(", ") || "none";
}

// -----------------------------------------------------
// WAIT OVERLAY
// -----------------------------------------------------
function updateWaitState() {
  if (!state) return hideWaitOverlay();

  // ✅ NEW FIX: Never block players in lobby
  if (state.phase === "lobby") {
    hideWaitOverlay();
    return;
  }

  // Simultaneous = both players can act
  if (state.phase === "simultaneous") {
    hideWaitOverlay();
    return;
  }

  // SetterDecision = setter only
  if (state.phase === "setterDecision") {
    if (myRole === "A") hideWaitOverlay();
    else showWaitOverlay("WAIT FOR SETTER");
    return;
  }

  // Normal = alternate turns
  if (state.phase === "normal") {
    if (myRole === state.turn) hideWaitOverlay();
    else showWaitOverlay("WAIT FOR YOUR TURN");
    return;
  }

  hideWaitOverlay();
}


// -----------------------------------------------------
// SUMMARY
// -----------------------------------------------------
function updateSummaryIfGameOver() {
  const box = $("roundSummary");
  if (!state.gameOver) return box.textContent = "";

  let text = `Total guesses: ${state.guessCount}\n\n`;
  state.history.forEach((h, i) => {
    text += `${i + 1}) Secret: ${h.finalSecret?.toUpperCase()} | ` +
            `Guess: ${h.guess.toUpperCase()} | ` +
            `FB: ${h.fb.join("")}\n`;
  });
  box.textContent = text;
}

// -----------------------------------------------------
// BUTTONS
// -----------------------------------------------------

// Create room
$("createRoomBtn").onclick = () => {
  createRoom(resp => {
    if (!resp.ok) return toast(resp.error);
    roomId = resp.roomId;

    $("roomInfo").style.display = "block";
    $("roomCodeLabel").textContent = roomId;
  });
};

// Join room
$("joinRoomBtn").onclick = () => {
  const code = $("joinRoomInput").value.trim().toUpperCase();
  if (!code) return toast("Enter a code");

  joinRoom(code, resp => {
    if (!resp.ok) return toast(resp.error);

    roomId = code;
    $("roomInfo").style.display = "block";
    $("roomCodeLabel").textContent = roomId;
  });
};

// SWITCH ROLES
$("switchRolesBtn").onclick = () => {
  sendGameAction(roomId, { type: "SWITCH_ROLES" });
  $("switchRolesBtn").classList.add("switch-active");
  setTimeout(() => $("switchRolesBtn").classList.remove("switch-active"), 800);
};

// READY BUTTON
$("readyBtn").onclick = () => {
  iAmReady = true;
  $("readyBtn").disabled = true;
  $("readyBtn").textContent = "Waiting...";
  sendGameAction(roomId, { type: "PLAYER_READY" });
};

// GUESS SUBMIT
$("submitGuessBtn").onclick = () => {
  const g = $("guessInput").value.trim().toLowerCase();
  $("guessInput").value = "";
  if (g.length !== 5) return toast("5 letters required");
  sendGameAction(roomId, { type: "SUBMIT_GUESS", guess: g });
};

// SETTER SECRET SUBMIT
$("submitSetterNewBtn").onclick = () => {
  const w = $("newSecretInput").value.trim().toLowerCase();
  $("newSecretInput").value = "";
  if (w.length !== 5) return toast("5 letters!");
  sendGameAction(roomId, { type: "SET_SECRET_NEW", secret: w });
};

$("submitSetterSameBtn").onclick = () => {
  sendGameAction(roomId, { type: "SET_SECRET_SAME" });
};

// POWERS
function setupPowerButtons() {
  renderSetterPowerButtons($("setterPowerContainer"));
  Object.keys(SETTER_POWERS).forEach(key => {
    const btn = $("power_" + key);
    if (btn) btn.onclick = () => activateSetterPower(key, roomId);
  });

  renderGuesserPowerButtons($("guesserPowerContainer"));
  Object.keys(GUESSER_POWERS).forEach(key => {
    const btn = $("power_" + key);
    if (btn) btn.onclick = () => activateGuesserPower(key, roomId);
  });
}
setupPowerButtons();

// NEW MATCH
$("newMatchBtn").onclick = () => {
  sendGameAction(roomId, { type: "NEW_MATCH" });
  hide("setterScreen");
  hide("guesserScreen");
  show("menu");
};

// BACK TO LOBBY
$("backToLobbyBtn").onclick = () => {
  hide("setterScreen");
  hide("guesserScreen");
  show("lobby");
};
