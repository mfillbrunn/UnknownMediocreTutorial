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
function shakeInput(element) {
  element.classList.add("shake");
  setTimeout(() => element.classList.remove("shake"), 300);
}
// WORD LIST — loaded for local validation
window.ALLOWED_GUESSES = new Set();

fetch("wordlists/allowed_guesses.txt")
  .then(r => r.text())
  .then(t => {
    t.split(/\s+/).forEach(w => window.ALLOWED_GUESSES.add(w.trim().toLowerCase()));
  });

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

onPowerUsed((data) => {
  const mod = PowerEngine.powers[data.type];
  if (mod?.effects?.onPowerUsed) {
    mod.effects.onPowerUsed(data);
  }
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
  if (evt.type === "gameOverShowMenu") {
  hide("setterScreen");
  hide("guesserScreen");
  show("menu");

  // enable READY button for next round
  $("readyBtn").disabled = false;
  $("readyBtn").classList.remove("disabled");
  $("readyBtn").textContent = "I'm Ready";
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
  updateGuesserScreen();   // 🔥 ADD THIS
  updateSetterScreen();    // optional, but consistent
});

// -----------------------------------------------------
// UI UPDATE LOGIC
// -----------------------------------------------------
function updateUI() {
  // Render power buttons once AFTER DOM + state exists
  if (!state) return;
  if (!PowerEngine._initialized && roomId) {
    PowerEngine.renderButtons(roomId);
    PowerEngine._initialized = true;
  }
  updateMenu();
  updateScreens();
  updateTurnIndicators();
  updateSummaryIfGameOver();
  if (state.phase !== "lobby") hide("lobby");
  PowerEngine.applyUI(state, myRole, roomId);
}

// Update menu info
function updateMenu() {
  $("menuRoomCode").textContent = roomId || "-";
  $("menuPlayerRole").textContent =
    myRole === "A" ? "Setter" :
    myRole === "B" ? "Guesser" : "-";
}

// Update UI screens
function updateScreens() {
  // LOBBY
  if (state.phase === "lobby") {
    show("lobby");
    hide("menu");
    hide("setterScreen");
    hide("guesserScreen");
    return;
  }

  // GAME OVER → show menu + summary, hide gameplay screens
  if (state.phase === "gameOver") {
    hide("setterScreen");
    hide("guesserScreen");
    hide("lobby");
    show("menu");
    return;
  }

  // ALL OTHER PHASES (simultaneous + normal)
  hide("lobby");
  hide("menu");

 if (myRole === state.setter) {
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
  const isSetterTurn = (state.turn === state.setter);
  const isGuesserTurn = (state.turn === state.guesser);

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
    return;

    // Setter → WAIT
    setterBar.textContent = "WAIT";
    setterBar.className =  "turn-indicator wait-turn";
  }
}

function updateSetterScreen() {
  $("secretWordDisplay").textContent = state.secret?.toUpperCase() || "NONE";
  $("pendingGuessDisplay").textContent =
    state.phase === "simultaneous"
      ? "-"
      : (state.pendingGuess?.toUpperCase() || "-");

  renderHistory(state, $("historySetter"), true);

  const previewBox = $("setterPreview");
  previewBox.innerHTML = "";

  const guess = state.pendingGuess;
  const typedSecret = $("newSecretInput").value.trim().toLowerCase();

  // -------------------------------------------
  // FIXED: ROLE vs TURN
  // -------------------------------------------
  const isSetter = (myRole === state.setter);
  const isSetterTurnNow = (state.turn === state.setter);
  const isGuesserTurnNow = (state.turn === state.guesser);
  

  // Setter decision step (after guesser submits)
  const isDecisionStep =
    state.phase === "normal" &&
    !!state.pendingGuess &&
    isSetterTurnNow;

  // Setter's own normal turn (after decision, before next guess)
  const isSetterNormalTurn =
    state.phase === "normal" &&
    !state.pendingGuess &&
    isSetterTurnNow;

  // ---------------------------------------------------------------------
  // PREVIEW LOGIC
  // ---------------------------------------------------------------------
  if (isDecisionStep && guess) {
    if (typedSecret.length === 5) {
      const fb = predictFeedback(typedSecret, guess);
      previewBox.textContent = `Preview (new): ${fb.join("")}`;
    } else if (state.secret.length === 5) {
      const fbSame = predictFeedback(state.secret, guess);
      previewBox.textContent = `Preview: ${fbSame.join("")}`;
    }
  }

  // ---------------------------------------------------------------------
  // INPUT LOCKING LOGIC (FIXED)
  // ---------------------------------------------------------------------
  const setterSubmittedSimultaneous = state.simultaneousSecretSubmitted;
  const isSimultaneous = (state.phase === "simultaneous");
  const shouldLock =
    state.phase === "gameOver" ||
    isGuesserTurnNow ||                     // 🔥 FIX: do not allow setter typing on guesser turn
    (isSimultaneous && setterSubmittedSimultaneous) ||
    (!isSimultaneous && state.turn !== state.setter);

  $("newSecretInput").disabled = shouldLock;
  $("submitSetterNewBtn").disabled = shouldLock;

  // SAME only allowed during decision step
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
const hasSubmittedSimultaneousGuess = state.simultaneousGuessSubmitted;

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
  if (!state.gameOver) {
    box.innerHTML = "";
    return;
  }

  let html = `<h3>Round Summary</h3>`;
  html += `<p><b>Total guesses:</b> ${state.guessCount +1}</p>`;

  html += `<table class="summary-table">`;
  html += `<tr><th>#</th><th>Secret</th><th>Guess</th><th>Feedback</th></tr>`;

  state.history.forEach((h, i) => {
    html += `
      <tr>
        <td>${i + 1}</td>
        <td>${h.finalSecret.toUpperCase()}</td>
        <td>${h.guess.toUpperCase()}</td>
        <td>${h.fb.join("")}</td>
      </tr>
    `;
  });

  html += `</table>`;
  box.innerHTML = html;
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

  if (g.length !== 5) {
    toast("5 letters required");
    shakeInput($("guessInput"));
    return;
  }

  if (!window.ALLOWED_GUESSES || !window.ALLOWED_GUESSES.has(g)) {
    toast("Word not in dictionary");
    shakeInput($("guessInput"));
    return;
  }

  $("guessInput").value = "";
  sendGameAction(roomId, { type: "SUBMIT_GUESS", guess: g });
};



$("submitSetterNewBtn").onclick = () => {
  const w = $("newSecretInput").value.trim().toLowerCase();

  if (w.length !== 5) {
    toast("5 letters!");
    shakeInput($("newSecretInput"));
    return;
  }

  if (!window.ALLOWED_GUESSES || !window.ALLOWED_GUESSES.has(w)) {
    toast("Word not in dictionary");
    shakeInput($("newSecretInput"));
    return;
  }

  $("newSecretInput").value = "";
  sendGameAction(roomId, { type: "SET_SECRET_NEW", secret: w });
};



$("submitSetterSameBtn").onclick = () => {
  sendGameAction(roomId, { type: "SET_SECRET_SAME" });
};



$("newMatchBtn").onclick = () => {
  sendGameAction(roomId, { type: "NEW_MATCH" });
  hide("setterScreen");
  hide("guesserScreen");
  show("menu");
};


