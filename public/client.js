//
// client.js — FINAL PATCHED VERSION FOR VS Wordle
// Non-module version (no imports)
//

// -----------------------------------------------------
// LOCAL CLIENT STATE
// -----------------------------------------------------
let roomId = null;
let myRole = null;      // Assigned by server: "A" or "B"
let state = null;
let iAmReady = false;

// DOM helpers
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
// SOCKET EVENTS
// -----------------------------------------------------

// TURN POPUP
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

// POWER notifications
onPowerUsed(({ type, letters, pos, letter }) => {
  if (type === "reuseLetters") toast(`Setter reusable letters: ${letters.join(", ")}`);
  if (type === "confuseColors") toast("Setter used Blue Mode");
  if (type === "countOnly") toast("Setter used Count-Only");
  if (type === "hideTile") toast("Setter hid a tile");
  if (type === "revealGreen") toast(`Green revealed: ${letter} at ${pos+1}`);
  if (type === "freezeSecret") toast("Guesser froze the secret");
});

// LOBBY EVENTS
onLobbyEvent(evt => {

  if (evt.type === "playerJoined") {
    toast("A player joined.");

    // Enable Ready button
    $("readyBtn").disabled = false;
    $("readyBtn").classList.remove("disabled");
    $("readyBtn").textContent = "I'm Ready";
  }

  if (evt.type === "rolesSwitched") {
    const { setterId, guesserId } = evt;

    if (socket.id === setterId) myRole = "A";
    if (socket.id === guesserId) myRole = "B";

    updateRoleLabels();

    $("switchRolesBtn").classList.add("switch-active");
    setTimeout(() => $("switchRolesBtn").classList.remove("switch-active"), 800);

    $("readyBtn").disabled = false;
    $("readyBtn").classList.remove("disabled");
    $("readyBtn").textContent = "I'm Ready";
  }

  if (evt.type === "playerReady") {
    toast(`Player ${evt.role} is READY`);
  }

  if (evt.type === "hideLobby") {
    hide("lobby");
    hide("menu");
    if (myRole === "A") show("setterScreen");
    if (myRole === "B") show("guesserScreen");
  }
});

// Role assignment from the server
socket.on("roleAssigned", ({ role, setterId, guesserId }) => {
  myRole = role;
  updateRoleLabels();

  // ENABLE READY BUTTON HERE
  $("readyBtn").disabled = false;
  $("readyBtn").classList.remove("disabled");
  $("readyBtn").textContent = "I'm Ready";
});


// -----------------------------------------------------
// STATE UPDATE FROM SERVER
// -----------------------------------------------------
onStateUpdate(newState => {
  state = newState;
  updateUI();
});

// -----------------------------------------------------
// UI UPDATE LOGIC
// -----------------------------------------------------
function updateUI() {
  if (!state) return;
  updateMenu();
  updateScreens();
  updateTurnIndicators();
  updateSummaryIfGameOver();
  if (state.phase !== "lobby") hide("lobby");
}

// Update menu info
function updateMenu() {
  $("menuRoomCode").textContent = roomId || "-";
  $("menuPlayerRole").textContent =
    myRole === "A" ? "Setter" :
    myRole === "B" ? "Guesser" : "-";

  $("phaseLabel").textContent = state.phase || "-";
  $("turnLabel").textContent = state.turn || "-";
}

// Update UI screens
function updateScreens() {
  hide("setterScreen");
  hide("guesserScreen");

  if (state.phase === "lobby") return;
  if (state.phase !== "lobby") {
    hide("menu");     // Hides menu during all gameplay phases
  }
  if (myRole === "A") show("setterScreen");
  if (myRole === "B") show("guesserScreen");

  updateSetterScreen();
  updateGuesserScreen();
}

// -----------------------------------------------------
// ROLE LABEL UPDATER
// -----------------------------------------------------
function updateRoleLabels() {
  const label = myRole === "A" ? "Setter" : "Guesser";

  $("lobbyRoleLabel").textContent = label;
  $("lobbyRoleLabel").classList.add("big-role");

  $("menuPlayerRole").textContent = label;
}

// -----------------------------------------------------
// TURN INDICATORS
// -----------------------------------------------------
function updateTurnIndicators() {
  $("turnIndicatorSetter").textContent =
    state.turn === "A" ? "YOUR TURN" : "WAIT";

  if (state.phase === "simultaneous") {
  $("turnIndicatorSetter").textContent = "YOUR TURN";
  $("turnIndicatorGuesser").textContent = "YOUR TURN";

  $("turnIndicatorSetter").className = "turn-indicator your-turn";
  $("turnIndicatorGuesser").className = "turn-indicator your-turn";
  return;
}
if (state.phase === "setterDecision") {
  $("turnIndicatorSetter").textContent = "YOUR TURN";
  $("turnIndicatorGuesser").textContent = "WAIT";

  $("turnIndicatorSetter").className = "turn-indicator your-turn";
  $("turnIndicatorGuesser").className = "turn-indicator wait-turn";
  return;
}

  $("turnIndicatorSetter").className =
    "turn-indicator " + (state.turn === "A" ? "your-turn" : "wait-turn");

  $("turnIndicatorGuesser").className =
    "turn-indicator " + (state.turn === "B" ? "your-turn" : "wait-turn");
}

// -----------------------------------------------------
// SETTER SCREEN
// -----------------------------------------------------
function updateSetterScreen() {

  // --- BASIC INFO ---
  $("secretWordDisplay").textContent = state.secret?.toUpperCase() || "NONE";
  $("pendingGuessDisplay").textContent = state.pendingGuess?.toUpperCase() || "-";

  renderHistory(state, $("historySetter"), true);

  const previewBox = $("setterPreview");
  previewBox.innerHTML = "";

  const guess = state.pendingGuess;
  const typedSecret = $("newSecretInput").value.trim().toLowerCase();


  // ---------------------------------------------------------------------
  // ⭐ NEW LOGIC:
  // Setter is in the "decision step" when:
  //  - phase is normal
  //  - a pending guess exists (waiting for setter choice)
  //  - it's the setter's turn
  // ---------------------------------------------------------------------
  const isSetterDecision =
    state.phase === "normal" &&
    !!state.pendingGuess &&
    myRole === state.setter;


  // ---------------------------------------------------------------------
  // ⭐ PREVIEW LOGIC
  // ---------------------------------------------------------------------
  if (isSetterDecision && guess) {

    // Case 1: Setter typed a NEW secret
    if (typedSecret.length === 5) {
      const fbNew = predictFeedback(typedSecret, guess);
      previewBox.textContent = `Preview (new): ${fbNew.join("")}`;
    }

    // Case 2: Fallback — preview SAME existing secret
    else if (state.secret.length === 5) {
      const fbSame = predictFeedback(state.secret, guess);
      previewBox.textContent = `Preview: ${fbSame.join("")}`;
    }
  }


  // ---------------------------------------------------------------------
  // ⭐ INPUT LOCKING
  // Setter can type ONLY when:
  //   - It is setterDecision (i.e., isSetterDecision == true)
  //   - freezeSecret is NOT active
  // ---------------------------------------------------------------------
  const shouldLock =
    state.phase !== "normal" ||
    !isSetterDecision ||
    state.powers.freezeActive;

  $("newSecretInput").disabled = shouldLock;
  $("submitSetterNewBtn").disabled = shouldLock;
  $("submitSetterSameBtn").disabled = shouldLock;


  // ---------------------------------------------------------------------
  // ⭐ KEYBOARD RENDERING
  // (Keyboard disabled or active based on shouldLock)
  // ---------------------------------------------------------------------
  renderKeyboard(state, $("keyboardSetter"), "setter", (letter, special) => {
    if (shouldLock) return;

    const box = $("newSecretInput");

    if (special === "BACKSPACE") box.value = box.value.slice(0, -1);
    else if (special === "ENTER") $("submitSetterNewBtn").click();
    else if (letter) box.value += letter;

    updateSetterScreen();
  });


  // ---------------------------------------------------------------------
  // ⭐ CONSTRAINTS DISPLAY (pattern + must-contain letters)
  // ---------------------------------------------------------------------
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

  $("knownPatternGuesser").textContent = formatPattern(getPattern(state, false));
  $("mustContainGuesser").textContent =
    getMustContainLetters(state).join(", ") || "none";
}

// -----------------------------------------------------
// SUMMARY
// -----------------------------------------------------
function updateSummaryIfGameOver() {
  const box = $("roundSummary");
  if (!state.gameOver) return box.textContent = "";

  let text = `Total guesses: ${state.guessCount}\n\n`;
  state.history.forEach((h, i) => {
    text += `${i + 1}) Secret: ${h.finalSecret?.toUpperCase()} | `;
    text += `Guess: ${h.guess.toUpperCase()} | `;
    text += `FB: ${h.fb.join("")}\n`;
  });

  box.textContent = text;
}

// -----------------------------------------------------
// BUTTONS
// -----------------------------------------------------

$("createRoomBtn").onclick = () => {
  createRoom(resp => {
    if (!resp.ok) return toast(resp.error);
    roomId = resp.roomId;
    $("roomInfo").style.display = "block";
    $("roomCodeLabel").textContent = roomId;
    $("readyBtn").disabled = false;
    $("readyBtn").classList.remove("disabled");
    $("readyBtn").textContent = "I'm Ready";
  });
};

$("joinRoomBtn").onclick = () => {
  const code = $("joinRoomInput").value.trim().toUpperCase();
  if (!code) return toast("Enter a code");
  joinRoom(code, resp => {
    if (!resp.ok) return toast(resp.error);
    roomId = code;
    $("roomInfo").style.display = "block";
    $("roomCodeLabel").textContent = roomId;
    $("readyBtn").disabled = false;
    $("readyBtn").classList.remove("disabled");
    $("readyBtn").textContent = "I'm Ready";
  });
};

$("switchRolesBtn").onclick = () => {
  sendGameAction(roomId, { type: "SWITCH_ROLES" });
};

$("readyBtn").onclick = () => {
  iAmReady = true;
  $("readyBtn").disabled = true;
  $("readyBtn").textContent = "Waiting...";
  sendGameAction(roomId, { type: "PLAYER_READY" });
};

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

$("submitSetterSameBtn").onclick = () => {
  sendGameAction(roomId, { type: "SET_SECRET_SAME" });
};

// Powers
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

$("newMatchBtn").onclick = () => {
  sendGameAction(roomId, { type: "NEW_MATCH" });
  hide("setterScreen");
  hide("guesserScreen");
  show("menu");
};

$("backToLobbyBtn").onclick = () => {
  hide("setterScreen");
  hide("guesserScreen");
  show("lobby");
};
