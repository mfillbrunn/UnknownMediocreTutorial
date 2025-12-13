// -----------------------------------------------------
// LOCAL CLIENT STATE
// -----------------------------------------------------
let roomId = null;
let myRole = null;      
let state = null;
let pendingState = null;
let roleAssigned = false;
window.state = null;

// -----------------------------------------------------
// DOM HELPERS
// -----------------------------------------------------
const $ = id => document.getElementById(id);
const show = id => $(id).classList.add("active");
const hide = id => $(id).classList.remove("active");

function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 1500);
}

function shake(element) {
  element.classList.add("shake");
  setTimeout(() => element.classList.remove("shake"), 300);
}
// -----------------------------------------------------
// Pattern Renderer for Pretty Styling (Reveal Green, etc.)
// -----------------------------------------------------
window.renderPatternInto = function (el, pattern, revealInfo = null) {
  let html = "";

  for (let i = 0; i < pattern.length; i++) {
    const isReveal = revealInfo && revealInfo.pos === i;

    // Use the revealed letter only on the reveal position
    let letter;
    if (isReveal) {
      letter = revealInfo.letter.toUpperCase();  
    } else {
      // Default: show dash for unknowns
      letter = pattern[i] === "-" ? "-" : pattern[i];
    }

    if (isReveal) {
      html += `<span class="pattern-letter reveal-green-letter">${letter}</span> `;
    } else {
      html += `<span class="pattern-letter">${letter}</span> `;
    }
  }

  el.innerHTML = html.trim();
};


socket.on("errorMessage", msg => {
  shake($("newSecretInput"));
  toast(msg);
});
// -----------------------------------------------------
// LOAD WORD LIST FOR CLIENT-SIDE VALIDATION
// -----------------------------------------------------
window.ALLOWED_GUESSES = new Set();
fetch("/api/allowed-guesses")
  .then(r => r.json())
  .then(words => words.forEach(w => window.ALLOWED_GUESSES.add(w)));

// -----------------------------------------------------
// AUTO-REJOIN
// -----------------------------------------------------
window.addEventListener("load", () => {
  const savedRoom = localStorage.getItem("vswordle_room");
  if (!savedRoom) return;

  joinRoom(savedRoom, resp => {
    if (resp.ok) {
      roomId = savedRoom;
      $("roomInfo").style.display = "block";
      $("roomCodeLabel").textContent = roomId;
    }
  });
});

// -----------------------------------------------------
// SOCKET EVENT HANDLERS
// -----------------------------------------------------

// Turn animation
onAnimateTurn(({ type }) => {
  const tp = $("turnPopup");
  const msg = type === "setterSubmitted"
    ? "Setter Submitted"
    : type === "guesserSubmitted"
    ? "Guesser Submitted"
    : "";

  if (!msg) return;

  tp.textContent = msg;
  tp.classList.add("show");
  setTimeout(() => tp.classList.remove("show"), 800);
});

// Power UI hook (client-side effects)
onPowerUsed(data => {
  const mod = PowerEngine.powers[data.type];
  mod?.effects?.onPowerUsed?.(data);
});

// Lobby events
onLobbyEvent(evt => {
  switch (evt.type) {

    case "playerJoined":
      toast("A player joined.");
      enableReadyButton(true);
      break;

   case "rolesSwitched":
  const myId = socket.id;

  if (evt.setterId === myId) {
    myRole = "A";
    toast("You are now the Setter!");
  } else if (evt.guesserId === myId) {
    myRole = "B";
    toast("You are now the Guesser!");
  }

  updateRoleLabels();
  break;


    case "playerReady":
    toast(`Player ${evt.role} is READY`);
  
    // If this is ME → freeze my button
    if (evt.playerId === socket.id) {
      enableReadyButton(false);  
    }
    break;

    case "hideLobby":
      hide("lobby");
      hide("menu");
      show(myRole === "A" ? "setterScreen" : "guesserScreen");
      enableReadyButton(false);
      break;

    case "gameOverShowMenu":
      hide("setterScreen");
      hide("guesserScreen");
      show("menu");
      enableReadyButton(false);
      break;
  }
});

// Role assignment from server
socket.on("roleAssigned", ({ role }) => {
  console.log("CLIENT RECEIVED ROLE FROM SERVER:", role);
  myRole = role;
  roleAssigned = true;

  if (pendingState) {
    state = pendingState;
    window.state = state;
    pendingState = null;
    updateUI();
  }
  updateRoleLabels();
});

// State updates
onStateUpdate(newState => {
  if (!roleAssigned) {
    console.log("State received before role — buffering...");
    pendingState = JSON.parse(JSON.stringify(newState));
    return;
  }
  state = JSON.parse(JSON.stringify(newState));
  window.state = state; // ⭐ Makes global for powers
  updateUI();

  // Reset guess input if locked on transition
  if (state.phase === "normal" && $("guessInput").disabled) {
    $("guessInput").value = "";
  }
});

// -----------------------------------------------------
// UI UPDATE PIPELINE
// -----------------------------------------------------
function updateUI() {
  console.log("UPDATE UI — CURRENT ROLE:", myRole);
  if (!state) return;

  // Render power buttons once
  if (!PowerEngine._initialized && roomId) {
    PowerEngine.renderButtons(roomId);
    PowerEngine._initialized = true;
  }

  updateMenu();
  updateScreens();
  updateTurnIndicators();
  updateSummary();
  if (state.phase !== "lobby") hide("lobby");
}

// -----------------------------------------------------
// Update Menu
// -----------------------------------------------------
function updateMenu() {
  $("menuRoomCode").textContent = roomId || "-";
  $("menuPlayerRole").textContent = myRole === "A" ? "Setter" : "Guesser";
}

// -----------------------------------------------------
// Screen Visibility
// -----------------------------------------------------
function updateScreens() {
  if (state.phase === "lobby") {
    show("lobby");
    hide("menu");
    hide("setterScreen");
    hide("guesserScreen");
    enableReadyButton(!state.ready[myRole]);
    PowerEngine.applyUI(state, myRole, roomId);
    return;
  }

  enableReadyButton(false);
  hide("lobby");
  hide("menu");
  
  if (state.phase === "gameOver") {
    hide("setterScreen");
    hide("guesserScreen");
    show("menu");
    PowerEngine.applyUI(state, myRole, roomId);
    return;
  }

  if (myRole === state.setter) {
    show("setterScreen");
    hide("guesserScreen");
    updateSetterScreen();
  } else {
    show("guesserScreen");
    hide("setterScreen");
    updateGuesserScreen();
  }
PowerEngine.applyUI(state, myRole, roomId);
}

// -----------------------------------------------------
// Turn Indicator Bar
// -----------------------------------------------------
function updateTurnIndicators() {
  const setterBar = $("turnIndicatorSetter");
  const guesserBar = $("turnIndicatorGuesser");

  if (state.phase === "lobby") {
    setterBar.textContent = "";
    guesserBar.textContent = "";
    setterBar.className = "turn-indicator";
    guesserBar.className = "turn-indicator";
    return;
  }

  if (state.phase === "simultaneous") {
    updateSimultaneousIndicators();
    return;
  }

  if (state.phase === "gameOver") {
    setToWait(setterBar);
    setToWait(guesserBar);
    return;
  }

  updateNormalTurnIndicators();
}

function updateSimultaneousIndicators() {
  const setterBar = $("turnIndicatorSetter");
  const guesserBar = $("turnIndicatorGuesser");

  const setterSubmitted = !!state.secret;
  const guesserSubmitted = !!state.pendingGuess;

  updateIndicator(setterBar, !setterSubmitted);
  updateIndicator(guesserBar, !guesserSubmitted);
}

function updateNormalTurnIndicators() {
  const setterBar = $("turnIndicatorSetter");
  const guesserBar = $("turnIndicatorGuesser");

  const setterTurn = state.turn === state.setter;

  updateIndicator(setterBar, setterTurn);
  updateIndicator(guesserBar, !setterTurn);
}

function updateIndicator(element, isActiveTurn) {
  if (isActiveTurn) {
    element.textContent = "YOUR TURN";
    element.className = "turn-indicator your-turn";
  } else {
    element.textContent = "WAIT";
    element.className = "turn-indicator wait-turn";
  }
}

function setToWait(element) {
  element.textContent = "WAIT";
  element.className = "turn-indicator wait-turn";
}

// -----------------------------------------------------
// ROLE LABEL
// -----------------------------------------------------
function updateRoleLabels() {
  const label = myRole === "A" ? "Setter" : "Guesser";
  $("lobbyRoleLabel").textContent = label;
  $("menuPlayerRole").textContent = label;
}

// -----------------------------------------------------
// SETTER UI
// -----------------------------------------------------
function updateSetterScreen() {
  

  $("secretWordDisplay").textContent = state.secret?.toUpperCase() || "NONE";
  $("pendingGuessDisplay").textContent =
    state.phase === "simultaneous" ? "-" : (state.pendingGuess?.toUpperCase() || "-");

  renderHistory(state, $("historySetter"), true);

  const isSetterTurn = (state.turn === state.setter);
  const isDecisionStep =
    isSetterTurn &&
    !!state.pendingGuess &&
    state.phase === "normal";

  $("submitSetterSameBtn").disabled = !isDecisionStep;

  // -------------------------------------------------------
  // CORRECT INPUT LOCKING LOGIC
  // -------------------------------------------------------
  let setterInputEnabled = false;

  // SIMULTANEOUS PHASE — setter can enter secret until THEY submit
  if (state.phase === "simultaneous") {
    setterInputEnabled = !state.simultaneousSecretSubmitted;
  }

  // NORMAL PHASE — setter can only enter secret when it's their turn
  else if (state.phase === "normal") {
    setterInputEnabled = isSetterTurn;
  }

  // GAMEOVER / LOBBY — input locked
  else {
    setterInputEnabled = false;
  }

  $("newSecretInput").disabled = !setterInputEnabled;
  if (state.phase === "simultaneous") {
    $("submitSetterSameBtn").disabled = true;
    $("submitSetterSameBtn").classList.add("disabled-btn");   // visual styling
  } else {
    $("submitSetterNewBtn").disabled = !setterInputEnabled;
  }
  // -------------------------------------------------------
  // INITIALIZE KEYBOARD (you had removed this part by accident)
  // -------------------------------------------------------
  renderKeyboard(state, $("keyboardSetter"), "setter", handleSetterKeyboard);

  // Pattern / constraints
    const pat = getPattern(state, true);
    $("knownPatternSetter").textContent = formatPattern(pat);
    const must = getMustContainLetters(state);
    $("mustContainSetter").textContent = must.length ? must.join(", ") : "none";

  updateSetterPreview();
}



function updateSetterPreview() {
  const preview = $("setterPreview");
  preview.innerHTML = "";

  const guess = state.pendingGuess;
  if (!guess) return;

  const typed = $("newSecretInput").value.trim().toLowerCase();
  const isSetterTurn = state.turn === state.setter;

  if (!isSetterTurn) return;

  if (typed.length === 5) {
    const fb = predictFeedback(typed, guess);
    preview.textContent = `Preview (new): ${fb.join("")}`;
  } else if (state.secret.length === 5) {
    const fbSame = predictFeedback(state.secret, guess);
    preview.textContent = `Preview: ${fbSame.join("")}`;
  }
}

function handleSetterKeyboard(letter, special) {
  const input = $("newSecretInput");

  if (state.turn !== state.setter || state.phase !== "normal") return;

  if (special === "BACKSPACE") {
    input.value = input.value.slice(0, -1);
    return;
  }
  if (special === "ENTER") {
    if (state.pendingGuess) $("submitSetterNewBtn").click();
    return;
  }
  if (letter && input.value.length < 5) {
    input.value += letter;
  }
}

// -----------------------------------------------------
// GUESSER UI
// -----------------------------------------------------
function updateGuesserScreen() {
  renderHistory(state, $("historyGuesser"), false);

  const guessBox = $("guessInput");

  const canGuess =
    (state.phase === "simultaneous" && !state.simultaneousGuessSubmitted) ||
    (state.phase === "normal" &&
      myRole === state.guesser &&
      !state.pendingGuess &&
      state.turn === state.guesser);
  
  guessBox.disabled = !canGuess;
  $("submitGuessBtn").disabled = !canGuess;
  if (state.phase === "simultaneous" && state.simultaneousGuessSubmitted) {
    guessBox.disabled = true;
    $("submitGuessBtn").disabled = true;
  }
  // Keyboard
  renderKeyboard(state, $("keyboardGuesser"), "guesser", (letter, special) => {
    if (!canGuess) return;

    if (special === "BACKSPACE") {
      guessBox.value = guessBox.value.slice(0, -1);
    } else if (special === "ENTER") {
      $("submitGuessBtn").click();
    } else if (letter && guessBox.value.length < 5) {
      guessBox.value += letter;
    }
  });

  const pattern = getPattern(state, false);
renderPatternInto(
  $("knownPatternGuesser"),
  pattern,
  state.revealGreenInfo || null
);

  $("mustContainGuesser").textContent =
    getMustContainLetters(state).join(", ") || "none";
}

// -----------------------------------------------------
// SUMMARY
// -----------------------------------------------------
function updateSummary() {
  const container = $("roundSummary");
  if (!state.gameOver) {
    container.innerHTML = "";
    return;
  }

  let html = `<h3>Round Summary</h3>`;
  html += `<p><b>Total guesses:</b> ${state.guessCount + 1}</p>`;
  html += `<table class="summary-table">`;
  html += `<tr><th>#</th><th>Secret</th><th>Guess</th><th>Feedback</th></tr>`;

  for (let i = 0; i < state.history.length; i++) {
    const h = state.history[i];

    const secretCell =
      h.finalSecret ? h.finalSecret.toUpperCase() : "???";

    const guessCell =
      h.guess ? h.guess.toUpperCase() : "";

    const fbCell =
      Array.isArray(h.fb) ? h.fb.join("") : "";

    html += `
      <tr>
        <td>${i + 1}</td>
        <td>${secretCell}</td>
        <td>${guessCell}</td>
        <td>${fbCell}</td>
      </tr>`;
  }

  html += `</table>`;
  container.innerHTML = html;
}


// -----------------------------------------------------
// BUTTONS
// -----------------------------------------------------
function enableReadyButton(enabled) {
  const btn = $("readyBtn");
  btn.disabled = !enabled;
  if (!enabled) {
    btn.classList.add("waiting");
    btn.textContent = "Waiting...";
  } else {
    btn.classList.remove("waiting");
    btn.textContent = "I'm Ready";
  }
}


$("createRoomBtn").onclick = () => {
  createRoom(resp => {
    if (!resp.ok) return toast(resp.error);
    roomId = resp.roomId;
    $("roomInfo").style.display = "block";
    $("roomCodeLabel").textContent = roomId;
    enableReadyButton(true);
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
    enableReadyButton(true);
  });
};

$("switchRolesBtn").onclick = () =>
  sendGameAction(roomId, { type: "SWITCH_ROLES" });

$("readyBtn").onclick = () => {
  // Send to server
  sendGameAction(roomId, { type: "PLAYER_READY" });

  // Immediately update UI locally
  enableReadyButton(false);
};

$("submitGuessBtn").onclick = () => {
  const g = $("guessInput").value.trim().toLowerCase();

  if (g.length !== 5) return shake($("guessInput")), toast("5 letters required");
  if (!window.ALLOWED_GUESSES?.has(g))
    return shake($("guessInput")), toast("Word not in dictionary");

  $("guessInput").value = "";
  sendGameAction(roomId, { type: "SUBMIT_GUESS", guess: g });
};

$("submitSetterNewBtn").onclick = () => {
  const w = $("newSecretInput").value.trim().toLowerCase();

  if (w.length !== 5) return shake($("newSecretInput")), toast("5 letters!");
  if (!window.ALLOWED_GUESSES?.has(w))
    return shake($("newSecretInput")), toast("Word not in dictionary");

  sendGameAction(roomId, { type: "SET_SECRET_NEW", secret: w });
  $("newSecretInput").value = "";
};

$("submitSetterSameBtn").onclick = () =>
  sendGameAction(roomId, { type: "SET_SECRET_SAME" });

$("newMatchBtn").onclick = () => {
  sendGameAction(roomId, { type: "NEW_MATCH" });
  hide("setterScreen");
  hide("guesserScreen");
  show("menu");
};
