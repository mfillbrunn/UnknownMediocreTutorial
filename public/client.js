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

  // LOBBY → only lobby visible
  if (state.phase === "lobby") {
    show("lobby");
    hide("menu");
    hide("setterScreen");
    hide("guesserScreen");
    return;
  }

  // Any non-lobby phase → hide menu, hide lobby
  hide("lobby");
  hide("menu");

  // ALWAYS show the correct screen for this player,
  // even in simultaneous BEFORE setter/guesser acts
  if (myRole === "A") {
    show("setterScreen");
    hide("guesserScreen");
  } else {
    show("guesserScreen");
    hide("setterScreen");
  }

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
  const setterBar = $("turnIndicatorSetter");
  const guesserBar = $("turnIndicatorGuesser");

  // Hide in lobby
  if (state.phase === "lobby") {
    setterBar.textContent = "";
    guesserBar.textContent = "";
    setterBar.className = "turn-indicator";
    guesserBar.className = "turn-indicator";
    return;
  }

  // SIMULTANEOUS → both act, but once a player submits, they WAIT
if (state.phase === "simultaneous") {

  const setterSubmitted = !!state.secret;
  const guesserSubmitted = !!state.pendingGuess;

  // Setter's bar:
  if (!setterSubmitted) {
    $("turnIndicatorSetter").textContent = "YOUR TURN";
    $("turnIndicatorSetter").className = "turn-indicator your-turn";
  } else {
    $("turnIndicatorSetter").textContent = "WAIT";
    $("turnIndicatorSetter").className = "turn-indicator wait-turn";
  }

  // Guesser's bar:
  if (!guesserSubmitted) {
    $("turnIndicatorGuesser").textContent = "YOUR TURN";
    $("turnIndicatorGuesser").className = "turn-indicator your-turn";
  } else {
    $("turnIndicatorGuesser").textContent = "WAIT";
    $("turnIndicatorGuesser").className = "turn-indicator wait-turn";
  }

  return;
}


  // GAME OVER → both wait
  if (state.phase === "gameOver") {
    setterBar.textContent = "WAIT";
    guesserBar.textContent = "WAIT";

    setterBar.className = "turn-indicator wait-turn";
    guesserBar.className = "turn-indicator wait-turn";
    return;
  }

  // NORMAL PHASE
  const isSetterTurn =
    state.phase === "normal" &&
    !!state.pendingGuess;    // setter must respond

  const isGuesserTurn =
    state.phase === "normal" &&
    !state.pendingGuess;     // guesser must guess

  if (isSetterTurn) {
    // Setter → YOUR TURN
    setterBar.textContent = "YOUR TURN";
    setterBar.className = "turn-indicator your-turn";

    // Guesser → WAIT
    guesserBar.textContent = "WAIT";
    guesserBar.className = "turn-indicator wait-turn";
    return;
  }

  if (isGuesserTurn) {
    // Guesser → YOUR TURN
    guesserBar.textContent = "YOUR TURN";
    guesserBar.className = "turn-indicator your-turn";

    // Setter → WAIT
    setterBar.textContent = "WAIT";
    setterBar.className = "turn-indicator wait-turn";
    return;
  }
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
  const typedSecret = $("newSecretInput").value.trim().toLowerCase();

  // BASIC ROLE CHECK
  const isSetterTurn = myRole === state.setter;

  // PHASE CHECKS
  const isSimultaneous = state.phase === "simultaneous";

  // Setter is deciding on a guess (previous setterDecision)
  const isDecisionStep =
      state.phase === "normal" &&
      !!state.pendingGuess &&
      isSetterTurn;

  // Setter's own normal turn (after they respond to guess)
  const isSetterNormalTurn =
      state.phase === "normal" &&
      !state.pendingGuess &&
      isSetterTurn;

  // ---------------------------------------------------------------------
  // PREVIEW LOGIC
  // ---------------------------------------------------------------------
  if (isDecisionStep && guess) {

    // If setter typed a NEW secret, preview that
    if (typedSecret.length === 5) {
      const fb = predictFeedback(typedSecret, guess);
      previewBox.textContent = `Preview (new): ${fb.join("")}`;
    }

    // Otherwise preview SAME secret
    else if (state.secret.length === 5) {
      const fbSame = predictFeedback(state.secret, guess);
      previewBox.textContent = `Preview: ${fbSame.join("")}`;
    }
  }

  // ---------------------------------------------------------------------
  // INPUT LOCKING LOGIC
  // ---------------------------------------------------------------------
  const setterSubmittedSimultaneous =
  state.phase === "simultaneous" && !!state.secret;

const shouldLock =
  state.phase === "gameOver" ||
  state.powers.freezeActive ||

  // 🚫 Lock setter in simultaneous phase *only after* first submission
  (state.phase === "simultaneous" && setterSubmittedSimultaneous) ||

  // 🚫 In normal phase: lock except when setter must act (decision or new secret)
  (!isSimultaneous && !isDecisionStep && !isSetterNormalTurn);

$("newSecretInput").disabled = shouldLock;
$("submitSetterNewBtn").disabled = shouldLock;

// SAME is only allowed when deciding
$("submitSetterSameBtn").disabled = !isDecisionStep;

  // ---------------------------------------------------------------------
  // KEYBOARD
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
  // CONSTRAINT RENDER
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

  // Render history (guesser sees modified feedback)
  renderHistory(state, $("historyGuesser"), false);

  const guessBox = $("guessInput");
  const kbContainer = $("keyboardGuesser");

  const isGuesser = myRole === state.guesser;
  const isSimultaneous = state.phase === "simultaneous";
  const isGameOver = state.phase === "gameOver";

  // Guesser can make a guess if:
  //
  // 1. simultaneous phase, or
  // 2. normal phase AND (no pending guess yet) AND it's guesser's turn
  //
const hasSubmittedSimultaneousGuess =
  state.phase === "simultaneous" && !!state.pendingGuess;

const canGuess =
  (state.phase === "simultaneous" &&
   isGuesser &&
   !hasSubmittedSimultaneousGuess) ||

  (state.phase === "normal" &&
   isGuesser &&
   !state.pendingGuess &&
   state.turn === state.guesser);



  // ---------------------------
  // ENABLE / DISABLE INPUT
  // ---------------------------
  guessBox.disabled = !canGuess;
  $("submitGuessBtn").disabled = !canGuess;

  // ---------------------------
  // RENDER KEYBOARD
  // ---------------------------
  renderKeyboard(state, kbContainer, "guesser", (letter, special) => {
    if (!canGuess) return;

    if (special === "BACKSPACE") {
      guessBox.value = guessBox.value.slice(0, -1);
    }
    else if (special === "ENTER") {
      $("submitGuessBtn").click();
    }
    else if (letter) {
      if (guessBox.value.length < 5) {
        guessBox.value += letter;
      }
    }
  });

  // ---------------------------
  // DISPLAY KNOWN PATTERN + LETTER CONSTRAINTS
  // ---------------------------
  $("knownPatternGuesser").textContent =
    formatPattern(getPattern(state, false));

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
