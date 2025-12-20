// -----------------------------------------------------
// LOCAL CLIENT STATE
// -----------------------------------------------------
let roomId = null;
let myRole = null;      
let state = null;
let pendingState = null;
let roleAssigned = false;
let lastSimulSecret = false;
let lastSimulGuess = false;
window.state = null;
// -----------------------------------------------------
// DOM HELPERS
// -----------------------------------------------------
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
// -----------------------------------------------------
// LOAD WORD LIST FOR CLIENT-SIDE VALIDATION
// -----------------------------------------------------
window.ALLOWED_GUESSES = new Set();
fetch("/api/allowed-guesses")
  .then(r => r.json())
  .then(words => words.forEach(w => window.ALLOWED_GUESSES.add(w)));
// Load allowed secrets (solutions list)
// Load ALLOWED_SECRETS from the server
window.ALLOWED_SECRETS = new Set();
fetch("/api/allowed-secrets")
  .then(r => r.json())
  .then(words => words.forEach(w => window.ALLOWED_SECRETS.add(w)));

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
let powerQueue = [];

onPowerUsed(data => {
  if (!PowerEngine._initialized) {
    powerQueue.push(data);
    return;
  }
  const mod = PowerEngine.powers[data.type];
  mod?.effects?.onPowerUsed?.(data);
});

// After renderButtons is called:
if (!PowerEngine._initialized && roomId && roleAssigned) {
  PowerEngine.renderButtons(roomId);
  PowerEngine._initialized = true;

  // flush queue
  for (const p of powerQueue) {
    const mod = PowerEngine.powers[p.type];
    mod?.effects?.onPowerUsed?.(p);
  }
  powerQueue = [];
}

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

// State updates
onStateUpdate(newState => {
  if (!roleAssigned) {
    pendingState = JSON.parse(JSON.stringify(newState));
    return;
  }
  const prevSetterDraft = state?.setterDraft || "";
  state = JSON.parse(JSON.stringify(newState));
  // restore client-only draft
  state.setterDraft = prevSetterDraft;

  if (state.powers.assassinWord) {
    $("assassinModal").classList.remove("active");
  }
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
  if (!state) return;
  if (state.phase === "simultaneous") {
    lastSimulSecret = false;
    lastSimulGuess = false;
  }
  // Render power buttons once
if (!PowerEngine._initialized && roomId && roleAssigned) {
    PowerEngine.renderButtons(roomId);
    PowerEngine._initialized = true;
}


  updateMenu();
  updateScreens();
  updateTurnIndicators();
  updateSummary();
  updateRemainingWords();
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
  let guessForSetter = state.pendingGuess;
    if (state.powers && state.powers.stealthGuessActive && myRole === state.setter) {
      guessForSetter = "?????";
    }

$("pendingGuessDisplay").textContent =
  guessForSetter ? guessForSetter.toUpperCase() : "-";
 // FORCE TIMER COUNTDOWN VISUAL
// --- FORCE TIMER: STATE-LEVEL CHECK (not ticking UI) ---
  const bar = $("turnIndicatorSetter");

  if (state.powers.forceTimerActive) {
    // Show fallback text in case timerTick hasn't fired yet
    if (state.powers.forceTimerDeadline) {
      const remaining = Math.max(
        0,
        Math.floor((state.powers.forceTimerDeadline - Date.now()) / 1000)
      );
      bar.textContent = `TIME LEFT: ${remaining}s`;
      bar.classList.add("your-turn");
    }
  } else {
    // Timer is not active → follow normal UI
    if (state.turn === state.setter && state.phase === "normal") {
      bar.textContent = "YOUR TURN";
      bar.classList.add("your-turn");
    } else {
      bar.textContent = "WAIT";
      bar.classList.add("wait-turn");
    }
  }
  const isSetterTurn = (state.turn === state.setter);
  const isDecisionStep =
    isSetterTurn &&
    !!state.pendingGuess &&
    state.phase === "normal";

  const freezeActive =
    !!(state.powers && state.powers.freezeActive);

  let setterInputEnabled = false;

  // -------------------------------------------------------
  // PHASE-SPECIFIC BUTTON / INPUT LOGIC
  // -------------------------------------------------------
  // SIMULTANEOUS PHASE — only initial secret allowed, once
  if (state.phase === "simultaneous") {
    const secretSubmitted =
      !!state.secret || state.simultaneousSecretSubmitted;

    setterInputEnabled = !secretSubmitted;

    // SAME is never allowed in simultaneous
    $("submitSetterSameBtn").disabled = true;
    $("submitSetterSameBtn").classList.add("disabled-btn");

    // NEW allowed only until secret is submitted
    $("submitSetterNewBtn").disabled = !setterInputEnabled;
    $("submitSetterNewBtn").classList.toggle(
      "disabled-btn",
      !setterInputEnabled
    );
  }

  // NORMAL PHASE — decision step only
  else if (state.phase === "normal") {
    setterInputEnabled = isDecisionStep;

    $("submitSetterSameBtn").disabled = !isDecisionStep;
    $("submitSetterSameBtn").classList.toggle(
      "disabled-btn",
      !isDecisionStep
    );

    $("submitSetterNewBtn").disabled = !isDecisionStep;
    $("submitSetterNewBtn").classList.toggle(
      "disabled-btn",
      !isDecisionStep
    );
  }

  // LOBBY / GAMEOVER — everything off
  else {
    setterInputEnabled = false;

    $("submitSetterSameBtn").disabled = true;
    $("submitSetterSameBtn").classList.add("disabled-btn");

    $("submitSetterNewBtn").disabled = true;
    $("submitSetterNewBtn").classList.add("disabled-btn");
  }

  // -------------------------------------------------------
  // FREEZE SECRET OVERRIDE (normal phase)
  // -------------------------------------------------------
  if (freezeActive && state.phase === "normal") {
    // Setter cannot type or set NEW secret
    setterInputEnabled = false;

    $("submitSetterNewBtn").disabled = true;
    $("submitSetterNewBtn").classList.add("disabled-btn");

    // SAME button stays as configured above (still allowed in decision step)
  }
  // ----------------------------------------
// SETTER VIEW:
// ----------------------------------------
renderHistory({
  state,
  container: $("setterGuesserSubmitted"),
  role: "setter",
  guesserDraft:
    state.powers?.stealthGuessActive ? null : state.guesserDraft,
  setterDraft: state.setterDraft || ""
});
$("newSecretInput").value = state.setterDraft || "";
$("newSecretInput").disabled = true;
  // -------------------------------------------------------
  // KEYBOARD + PATTERN / PREVIEW
  // -------------------------------------------------------
  if (myRole === state.setter) {
    renderKeyboard({
    state,
    container: $("keyboardSetter"),
    draft: state.setterDraft || "",
    isGuesser: false,
    onInput: handleSetterInput
  });
  }
  const pat = getPattern(state, true);
  $("knownPatternSetter").textContent = formatPattern(pat);
  const must = getMustContainLetters(state);
  $("mustContainSetter").textContent =
    must.length ? must.join(", ") : "none";

  updateSetterPreview();
 }
function updateSetterPreview() {
 // If stealth is active, hide preview entirely
if (state.powers && state.powers.stealthGuessActive && myRole === state.setter) {
    $("setterPreview").textContent = "(guess hidden this round)";
    return;
  }

const preview = $("setterPreview");
  preview.innerHTML = "";

  const guess = state.pendingGuess;
  if (!guess) return;

  const typed = (state.setterDraft || "").toLowerCase();
  const isSetterTurn = state.turn === state.setter;

  if (!isSetterTurn) return;
  if (state.powers && state.powers.stealthGuessActive && myRole === state.setter) {
    preview.textContent = "(hidden this round)";
    return;
  }

  if (typed.length === 5) {
    const fb = predictFeedback(typed, guess);
    preview.textContent = `Preview (new): ${fb.join("")}`;
  } else if (state.secret.length === 5) {
    const fbSame = predictFeedback(state.secret, guess);
    preview.textContent = `Preview: ${fbSame.join("")}`;
  }
}
function handleSetterInput(event) {
  if (!state) return;

  const draft = state.setterDraft || "";

  if (event.type === "BACKSPACE") {
    state.setterDraft = draft.slice(0, -1);
    updateUI();
    return;
  }

  if (event.type === "LETTER") {
    if (draft.length < 5) {
      state.setterDraft = draft + event.value;
      updateUI();
    }
    return;
  }

if (event.type === "ENTER") {
  if (!state.pendingGuess) return;

  // Prefer SAME if allowed
  if (!$("submitSetterSameBtn").disabled) {
    $("submitSetterSameBtn").click();
    return;
  }

  // Otherwise fall back to NEW if allowed
  if (!$("submitSetterNewBtn").disabled) {
    $("submitSetterNewBtn").click();
    return;
  }
}

}
// -----------------------------------------------------
// GUESSER UI
// -----------------------------------------------------
function updateGuesserScreen() {
  renderHistory({
    state,
    container: $("historyGuesser"),
    role: "guesser",
    guesserDraft: state.guesserDraft || "",
    setterDraft: null
  });

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
if (myRole === state.guesser) {
  renderKeyboard({
    state,
    container: $("keyboardGuesser"),
    draft: state.guesserDraft || "",
    isGuesser: true,
    onInput: handleGuesserInput
  });
}
  let pattern = getPattern(state, false);

  const blindIdx = state.powers?.blindSpotIndex;
  if (typeof blindIdx === "number") {
    pattern[blindIdx] = "🟪";
  }

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

// 🔥 NEW: Detect assassin kill
const lastEntry = state.history[state.history.length - 1];
if (lastEntry && lastEntry.assassinTriggered) {
  html += `
    <p class="assassin-summary">
      ☠ The guesser guessed the assassin word 
      "${lastEntry.guess.toUpperCase()}" and was assassinated!
    </p>
  `;
}

html += `<p><b>Total guesses:</b> ${state.guessCount + 1}</p>`;

  html += `<table class="summary-table">`;
  html += `<tr><th>#</th><th>Secret</th><th>Guess</th><th>Feedback</th><th>Remaining</th></tr>`;

  for (let i = 0; i < state.history.length; i++) {
    const h = state.history[i];

    const secretCell =
      h.finalSecret ? h.finalSecret.toUpperCase() : "???";

    const guessCell =
      h.guess ? h.guess.toUpperCase() : "";

    const fbCell =
      Array.isArray(h.fb) ? h.fb.join("") : "";
     let remaining;

if (i === state.history.length - 1) {
  // Last guess always shows 0 remaining
  remaining = 0;
} else {
  remaining = computeRemainingAfterIndex(i);
}
    html += `
      <tr>
        <td>${i + 1}</td>
        <td>${secretCell}</td>
        <td>${guessCell}</td>
        <td>${fbCell}</td>
        <td>${remaining}</td>
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
function handleGuesserInput(event) {
  const draft = state.guesserDraft || "";

  if (event.type === "BACKSPACE") {
    sendGameAction(roomId, {
      type: "UPDATE_DRAFT",
      draft: draft.slice(0, -1)
    });
    return;
  }

  if (event.type === "LETTER") {
    if (draft.length < 5) {
      sendGameAction(roomId, {
        type: "UPDATE_DRAFT",
        draft: draft + event.value
      });
    }
    return;
  }

  if (event.type === "ENTER") {
    if (draft.length === 5) {
      sendGameAction(roomId, {
        type: "SUBMIT_GUESS",
        guess: draft.toLowerCase()
      });
    }
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
$("applyPowerCountBtn").onclick = () => {
   const n = parseInt($("powerCountInput").value, 10);
   if (!isNaN(n) && n > 0 && n <= 10) {
     sendGameAction(roomId, { type: "SET_POWER_COUNT", count: n });
   }
 };

$("submitSetterNewBtn").onclick = () => {
  const w = (state.setterDraft || "").toLowerCase();

  if (w.length !== 5) {
    shake($("submitSetterNewBtn"));
    toast("5 letters!");
    return;
  }

  if (!window.ALLOWED_GUESSES?.has(w)) {
    shake($("submitSetterNewBtn"));
    toast("Word not in dictionary");
    return;
  }

  sendGameAction(roomId, {
    type: "SET_SECRET_NEW",
    secret: w
  });

  // Clear setter draft after submission
  state.setterDraft = "";
  updateUI();
};


$("submitSetterSameBtn").onclick = () =>
  sendGameAction(roomId, { type: "SET_SECRET_SAME" });

$("newMatchBtn").onclick = () => {
  sendGameAction(roomId, { type: "NEW_MATCH" });
  const el = $("assassinWordDisplay");
if (el) el.textContent = "";
  hide("setterScreen");
  hide("guesserScreen");
  show("menu");
};
$("assassinSubmitBtn").onclick = () => {
  const roomId = $("assassinSubmitBtn").dataset.roomId;
  let w = $("assassinInput").value.trim().toLowerCase();

  if (w.length !== 5) {
    shake($("assassinInput"));
    toast("5 letters required");
    $("assassinInput").value = "";
    return;
  }

  if (!window.ALLOWED_GUESSES.has(w)) {
    shake($("assassinInput"));
    toast("Not in dictionary");
    $("assassinInput").value = "";
    return;
  }
  sendGameAction(roomId, {
    type: "USE_ASSASSIN_WORD",
    word: w,
    playerId: socket.id
  });
};

$("assassinCancelBtn").onclick = () => {
  $("assassinModal").classList.remove("active");
  $("assassinInput").value = "";
};
