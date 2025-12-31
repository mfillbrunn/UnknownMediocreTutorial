// -----------------------------------------------------
// LOCAL CLIENT STATE
// -----------------------------------------------------
let roomId = null;
let myRole = null;      
let state = null;
let pendingState = null;
let localGuesserDraft = "";
let roleAssigned = false;
let lastSimulSecret = false;
let lastSimulGuess = false;
let KeepEnabled = true;
let NewEnabled = true;
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
function resetKeyboards() {
  const ks = $("keyboardSetter");
  const kg = $("keyboardGuesser");

  if (ks) delete ks.__keys;
  if (kg) delete kg.__keys;
}
document.addEventListener("DOMContentLoaded", () => {
  const saved = localStorage.getItem("playerName");
  if (saved && $("playerNameInput")) {
    $("playerNameInput").value = saved;
  }
});
let lastTimeRemaining = { A: null, B: null };

function renderChessClocks() {
  if (!state || !state.timeRemaining) return;
    if (!state.timeControl?.enabled) {
      $("timerSetter")?.classList.add("hidden");
      $("timerGuesser")?.classList.add("hidden");
      return;
    } else {
      $("timerSetter")?.classList.remove("hidden");
      $("timerGuesser")?.classList.remove("hidden");
    }
  const setter = state.setter;
  const guesser = state.guesser;

  applyTimer("timerSetter", setter);
  applyTimer("timerGuesser", guesser);
}

function applyTimer(elementId, role) {
  const el = $(elementId);
  if (!el) return;

  const seconds = state.timeRemaining[role];
  el.textContent = formatTime(seconds);

  // Active highlight
  el.classList.toggle("active", state.activeTimer === role);

  // Warnings
  el.classList.remove("warn-30", "warn-10");
  if (seconds <= 10) el.classList.add("warn-10");
  else if (seconds <= 30) el.classList.add("warn-30");

  // Increment detection
  const prev = lastTimeRemaining[role];
  if (prev !== null && seconds > prev) {
    triggerIncrementEffect(el, seconds - prev);
  }

  lastTimeRemaining[role] = seconds;
}
function triggerIncrementEffect(el, delta) {
  // Flash the timer
  el.classList.add("increment");
  setTimeout(() => el.classList.remove("increment"), 400);

  // Floating +Xs
  const badge = document.createElement("div");
  badge.className = "timer-increment-badge";
  badge.textContent = `+${delta}s`;

  el.parentElement.style.position = "relative";
  el.parentElement.appendChild(badge);

  setTimeout(() => badge.remove(), 800);
}

///Simplified turn indicator
function setTurn(screenId, isYourTurn) {
  const screen = document.getElementById(screenId);
  if (!screen) return;

  screen.classList.toggle("is-your-turn", isYourTurn);
  screen.classList.toggle("is-not-your-turn", !isYourTurn);
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

    case "rolesSwitched": {
      const myId = socket.id;

      if (evt.setterId === myId) {
        myRole = "A";
        toast("You are now the Setter!");
      } else if (evt.guesserId === myId) {
        myRole = "B";
        toast("You are now the Guesser!");
      }

      resetKeyboards();
      updateRoleLabels();
      updateUI();
      break;
    }

    case "playerReady":
      toast(`Player ${evt.role} is READY`);
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
  const prevPhase = state?.phase;
  state = JSON.parse(JSON.stringify(newState));
  // restore client-only draft
  if (prevPhase === "simultaneous" && state.phase === "normal") {
    localGuesserDraft = "";
  }
const setterCanEdit =
  myRole === state.setter &&  (
    // Normal phase: setter’s turn with pending guess
    (state.phase === "normal" &&
      state.turn === state.setter &&
      !!state.pendingGuess) ||

    // Simultaneous phase: setter has not submitted yet
    (state.phase === "simultaneous" &&
      !state.secret &&
      !state.simultaneousSecretSubmitted)
  );

  if (setterCanEdit) {
    state.setterDraft = prevSetterDraft;
  } else {
    state.setterDraft = "";
  }
  // Clear guesser draft once it is no longer editable
  if (state.phase === "normal" && state.pendingGuess && state.turn !== state.guesser) {
    localGuesserDraft = "";
  }
  window.state = state; 
  updateUI();
  remainingCache.setterOld = null;
  remainingCache.setterCurrent = null;
});

// -----------------------------------------------------
// COLOR PICKER
// -----------------------------------------------------

const colorPicker = $("playerColorPicker");
const useCustomColor = $("useCustomColor");

// Load saved preference
const savedColor = localStorage.getItem("vswordle_player_color");
const savedUseCustom = localStorage.getItem("vswordle_use_custom_color") === "true";

useCustomColor.checked = savedUseCustom;
colorPicker.disabled = !savedUseCustom;

if (savedColor) {
  colorPicker.value = savedColor;
}

if (savedUseCustom && savedColor) {
  applyPlayerColor(savedColor);
}

// Toggle custom color on/off
useCustomColor.onchange = () => {
  const enabled = useCustomColor.checked;
  localStorage.setItem("vswordle_use_custom_color", enabled);
  colorPicker.disabled = !enabled;

  if (!enabled) {
    resetPlayerColor();   // 👈 back to defaults
  } else {
    applyPlayerColor(colorPicker.value);
  }
};

// Live color updates
colorPicker.oninput = e => {
  const color = e.target.value;
  localStorage.setItem("vswordle_player_color", color);
  if (useCustomColor.checked) {
    applyPlayerColor(color);
  }
};

function resetPlayerColor() {
  const target =
    myRole === "A"
      ? $("setterScreen")
      : $("guesserScreen");

  if (!target) return;

  // Remove overrides → CSS defaults apply again
  target.style.removeProperty("--role-accent");
  target.style.removeProperty("--role-accent-strong");
  target.style.removeProperty("--btn-primary");
  target.style.removeProperty("--btn-primary-hover");
  target.style.removeProperty("--btn-primary-glow");
}

function applyPlayerColor(color) {
  const target =
    myRole === "A"
      ? $("setterScreen")
      : $("guesserScreen");

  if (!target) return;

  target.style.setProperty("--role-accent", color);
  target.style.setProperty("--role-accent-strong", color);
  target.style.setProperty("--btn-primary", color);
  target.style.setProperty("--btn-primary-hover", color);
  target.style.setProperty("--btn-primary-glow", color + "aa");
}
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
  // Update chess clocks
    if (state.timeRemaining) {
      const setterTimer = $("timerSetter");
      const guesserTimer = $("timerGuesser");
    
      if (setterTimer) {
        setterTimer.textContent =
          formatTime(state.timeRemaining[state.setter]);
        setterTimer.classList.toggle(
          "active",
          state.activeTimer === state.setter
        );
      }
    
      if (guesserTimer) {
        guesserTimer.textContent =
          formatTime(state.timeRemaining[state.guesser]);
        guesserTimer.classList.toggle(
          "active",
          state.activeTimer === state.guesser
        );
      }
    }
  if (state.phase === "lobby") {
    $("timerSetter")?.classList.add("hidden");
    $("timerGuesser")?.classList.add("hidden");
  } else {
    $("timerSetter")?.classList.remove("hidden");
    $("timerGuesser")?.classList.remove("hidden");
  }
  updateMenu();
  updateScreens();
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
  
  if (state.phase === "gameOver" || state.phase === "roundSummary") {
    hide("setterScreen");
    hide("guesserScreen");
    show("menu");
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
updatePowerInfoState(state);  
PowerEngine.applyUI(state, myRole, roomId);
}

// -----------------------------------------------------
// ROLE LABEL
// -----------------------------------------------------
function updateRoleLabels() {
  if (!myRole) return;
  const roleLabel = myRole === "A" ? "Setter" : "Guesser";
  const lobbyEl = $("lobbyRoleLabel");
  if (lobbyEl) {
    lobbyEl.textContent = roleLabel;
  }
  const menuEl = $("menuPlayerRole");
  if (menuEl) {
    menuEl.textContent = roleLabel;
  }
}

// -----------------------------------------------------
// SETTER UI
// -----------------------------------------------------
function updateSetterScreen() {
  const setterName = state.playerNames?.[state.setter] || "Setter";
  KeepEnabled=true;
  NewEnabled=true;

  $("setterScreen").querySelector(".screen-title").textContent = setterName;
  $("setterRoleBadge").textContent = "Setter";
  const fgModal = $("forceGuessModal");
    if (fgModal) {
      if (!state.powers?.forcedGuessOptions) {
        fgModal.classList.remove("active");
      }
    }
    const displayGuess =state.powers?.stealthGuessActive? "?????": state.pendingGuess;
   const isSetterTurn = state.turn === state.setter;
  const isDecisionStep =isSetterTurn &&!!displayGuess &&state.phase === "normal";
  let setterInputEnabled = false;
  // -------------------------------------------------------
  // PHASE-SPECIFIC BUTTON / INPUT LOGIC
  // -------------------------------------------------------
  // SIMULTANEOUS PHASE — only initial secret allowed, once
  setTurn("setterScreen", false); 
  if (state.phase === "simultaneous") {
    const secretSubmitted =!!state.secret || state.simultaneousSecretSubmitted;
    setterInputEnabled = !secretSubmitted;    
    KeepEnabled=false;
    NewEnabled=setterInputEnabled;
    setTurn("setterScreen", !state.secret); 
  }
  // NORMAL PHASE — decision step only
  else if (state.phase === "normal") {
    setterInputEnabled = isDecisionStep;
    KeepEnabled=isDecisionStep;
    NewEnabled=isDecisionStep;
    setTurn("setterScreen", isDecisionStep); 
  }
  // LOBBY / GAMEOVER — everything off
  else {
    setterInputEnabled = false;
    KeepEnabled=false;
    NewEnabled=false;
  }

  // ----------------------------------------
// SETTER VIEW:
// ----------------------------------------
 renderHistory({
  state,
  container: $("setterGuesserSubmitted"),
  role: "setter"
});
renderConstraintRow({
  state,
  container: $("constraintRowSetter"),
  isSetterView: true
});
renderDraftRows({
  state,
  role: "setter",
  container: $("draftSetter")
});
  
  if (myRole === state.setter) {
    renderKeyboard({
    state,
    container: $("keyboardSetter"),
    pendingGuess: state.pendingGuess || "",
    isGuesser: false,
    onInput: handleSetterInput
  });
  }  
  updateSetterPreview();
 }

///SETTER FEEDBACK PREVIEW FUNCTION
function updateSetterPreview() {
 // If stealth is active, hide preview entirely
  const guess = state.pendingGuess;
  if (!guess) return;
  const isSetterTurn = state.turn === state.setter;
  if (!isSetterTurn) return;
  updateRemainingWords(typed);
  if (state.powers?.stealthGuessActive && myRole === state.setter) {
    return;
  }
  const typed = (state.setterDraft || "").toLowerCase();
  let isIncomplete = false;
  clearSetterPreview();
  if (typed.length === 5) {
    const fb = predictFeedback(typed, guess);
    applyPreviewFeedback(fb);
  } else if (typed.length === 0) {
    const fbSame = predictFeedback(state.secret, guess);
    applyPreviewFeedback(fbSame);
  } else if (typed.length >= 1) {
    const fbIncomplete = predictFeedbackIncomplete(typed, guess);
    applyPreviewFeedback(fbIncomplete);
    isIncomplete = true;
  }
  if (isIncomplete) {
    const tiles = document.querySelectorAll("#draftSetter .pending-guess .history-tile");
    tiles.forEach(t => t.classList.add("preview-incomplete"));
  }
}
function clearSetterPreview() {
  const tiles = document.querySelectorAll("#draftSetter .pending-guess .history-tile");
  tiles.forEach(t => {
    t.classList.remove(
      "preview-green",
      "preview-yellow",
      "preview-gray",
      "preview-incomplete"
    );
  });
}
function applyPreviewFeedback(fbArray) {
  const tiles = document.querySelectorAll("#draftSetter .pending-guess .history-tile");
  fbArray.forEach((fb, i) => {
    const tile = tiles[i];
    if (!tile) return;
    if (fb === "🟩") tile.classList.add("preview-green");
    else if (fb === "🟨") tile.classList.add("preview-yellow");
    else tile.classList.add("preview-gray");
  });
}
///SETTER INPUT
function handleSetterInput(event) {
  if (!state.powers?.freezeActive){
    const isNormalSetterTurn =  myRole === state.setter && state.phase === "normal" && state.turn === state.setter && !!state.pendingGuess;
    const isSimultaneousSecretEntry = state.phase === "simultaneous" && !state.secret && !state.simultaneousSecretSubmitted;
    if (!(isNormalSetterTurn || isSimultaneousSecretEntry)) return;
    const isEditing = event.type === "LETTER" || event.type === "BACKSPACE";
      // First edit: clear ghosted secret
      if (isEditing && !state.setterDraft) {
        state.setterDraft = "";
      }
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
  }
  if (event.type === "ENTER") {
    const draft = (state.setterDraft || "").trim();
    if (draft.length === 0) {
      if (KeepEnabled) {
        state.setterDraft = "";        
        sendGameAction(roomId, { type: "SET_SECRET_SAME" });
        updateUI();
        return;
      }
    }
    if (NewEnabled) {
      submitSetterNew();
      return;
    }
      shake($("keyboardSetter"));
      toast("Can't submit new secret");
      return;      
  }
}

/// SUBMIT NEW SECRET FUNCTION
function submitSetterNew() {
  const w = (state.setterDraft || "").toLowerCase();
  if (w.length !== 5) {
    shake($("keyboardSetter"));
    toast("5 letters!");
    return;
  }
  if (!window.ALLOWED_GUESSES.has(w)) {
    shake($("keyboardSetter"));
    toast("Word not in dictionary");
    return;
  }
  if (typeof window.isConsistentWithHistory === "function" && !window.isConsistentWithHistory(state.history, w, state)) {
    shake($("keyboardSetter"));
    toast("Incompatible with previous feedback");
    return;
  }  
  sendGameAction(roomId, {type: "SET_SECRET_NEW",secret: w});
  state.setterDraft = "";
  updateUI();
}


// -----------------------------------------------------
// GUESSER UI
// -----------------------------------------------------
function updateGuesserScreen() {
  renderHistory({
  state,
  container: $("historyGuesser"),
  role: "guesser"
});
renderConstraintRow({
  state,
  container: $("constraintRowGuesser"),
  isSetterView: false
});
renderDraftRows({
  state,
  role: "guesser",
  container: $("draftGuesser"),
  localGuesserDraft
});
  const guesserName =  state.playerNames?.[state.guesser] || "Guesser";
  
  $("guesserScreen").querySelector(".screen-title").textContent = guesserName;
$("guesserRoleBadge").textContent = "Guesser";
setTurn("guesserScreen", false);
if (state.phase === "simultaneous") {setTurn("guesserScreen", !state.pendingGuess);}
if (state.phase === "normal" && state.turn === state.guesser) {setTurn("guesserScreen", true);} 
  
const badge = $("guesserForcedGuessBadge");
if (!badge) return;
if (state.powers?.forcedGuess && myRole === state.guesser) {
  const fg = state.powers.forcedGuess;
  badge.textContent = `Forced Guess: ${formatForceGuessOption(fg)}`;
  badge.hidden = false;
} else {
  badge.hidden = true;
}
  const displayGuess = state.pendingGuess || localGuesserDraft;
 if (myRole === state.guesser) {
  renderKeyboard({
    state,
    container: $("keyboardGuesser"),
    pendingGuess: displayGuess,
    isGuesser: true,
    onInput: handleGuesserInput
  });
}  
}

///GUESSER INPUT
function handleGuesserInput(event) {
  if (state.pendingGuess) return;
  if (event.type === "BACKSPACE") {
    localGuesserDraft = localGuesserDraft.slice(0, -1);
    updateUI();
    return;
  }

  if (event.type === "LETTER") {
    if (localGuesserDraft.length < 5) {
      localGuesserDraft += event.value;
      updateUI();
    }
    return;
  }

  if (event.type === "ENTER") {
      if (localGuesserDraft.length !== 5) {
        shake($("keyboardGuesser"));
        toast("5 letters!");
        return;
      }
    if (!window.ALLOWED_GUESSES.has(localGuesserDraft.toLowerCase())) {
      shake($("keyboardGuesser"));
      toast("Not in dictionary");
      return;
    }    
    sendGameAction(roomId, {
        type: "SUBMIT_GUESS",
        guess: localGuesserDraft.toLowerCase()
      });
    
  }
}
// -----------------------------------------------------
// BUTTONS
// -----------------------------------------------------
(function setupConstraintToggle() {
  const buttons = document.querySelectorAll(".constraint-toggle-btn");
  if (!buttons.length) return;

  // Load saved preference (default: visible)
  const hidden = localStorage.getItem("hideConstraints") === "true";
  document.body.classList.toggle("hide-constraints", hidden);

  buttons.forEach(btn => {
    btn.classList.toggle("off", hidden);

    btn.onclick = () => {
      const isHidden = document.body.classList.toggle("hide-constraints");
      localStorage.setItem("hideConstraints", isHidden);

      // Keep all buttons in sync
      buttons.forEach(b => b.classList.toggle("off", isHidden));
    };
  });
})();

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
$("applyPowerCountBtn").onclick = () => {
   const n = parseInt($("powerCountInput").value, 10);
   if (!isNaN(n) && n > 0 && n <= 10) {
     sendGameAction(roomId, { type: "SET_POWER_COUNT", count: n });
   }
 };




$("playerNameInput").onchange = () => {
  const name = $("playerNameInput").value.trim();
  if (!name) return;
  localStorage.setItem("playerName", name);
  sendGameAction(roomId, {
    type: "SET_PLAYER_NAME",
    name
  });
};

$("newMatchBtn").onclick = () => {
  sendGameAction(roomId, { type: "NEW_MATCH" });
  const el = $("assassinWordDisplay");
if (el) el.textContent = "";
  hide("setterScreen");
  hide("guesserScreen");
  show("menu");
};

function formatForceGuessOption(o) {
  switch (o.type) {
    case "containsTwo":
      return `Contains ${o.letters.join(" + ")}`;
    case "startsWith":
      return `Starts with ${o.letter}`;
    case "endsWith":
      return `Ends with ${o.letter}`;
    case "doubleLetter":
      return "Double letter";
    case "minVowels":
      return "At least 3 vowels";
    case "maxVowels":
      return "At most 1 vowel";
    case "firstLastSame":
      return "First = Last";
    case "palindrome":
      return "Palindrome";
  }
}
function formatForceGuessBadge(o) {
  return formatForceGuessOption(o);
}

// ---------------------------------------
// Force Timer UI tick (client-only)
// ---------------------------------------
setInterval(() => {
  if (window.state?.powers?.forceTimerActive) {
    updateUI(); // <-- this already triggers power uiEffects
  }
}, 250);

function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
