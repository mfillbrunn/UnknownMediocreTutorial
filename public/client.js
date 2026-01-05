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
const VOWELS = new Set(["A", "E", "I", "O", "U"]);

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
  if (!element) return;
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

function shakeDraftRow(role) {
  let row;

  if (role === "setter") {
    row = document.querySelector(".history-row.draft-row.setter-draft");
  } else if (role === "guesser") {
    row = document.querySelector(".history-row.draft-row.guesser-draft");
  } else {
    return;
  }

  if (!row) return;

  // Restart animation if already running
  row.classList.remove("draft-shake");
  void row.offsetWidth; // force reflow
  row.classList.add("draft-shake");
}



///Simplified turn indicator
function setTurn(screenId, isYourTurn) {
  const screen = document.getElementById(screenId);
  if (!screen) return;

  screen.classList.toggle("is-your-turn", isYourTurn);
  screen.classList.toggle("is-not-your-turn", !isYourTurn);
}

// -----------------------------------------------------
// AUTO-REJOIN
// -----------------------------------------------------
window.addEventListener("load", () => {
  const savedRoom = localStorage.getItem("vswordle_room");
  document.body.classList.add("menu-mode");
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
        window.myRole = "A"; 
        toast("You are now the Setter!");
      } else if (evt.guesserId === myId) {
        myRole = "B";
        window.myRole = "B"; 
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
      document.body.classList.remove("menu-mode");
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

// State updates
onStateUpdate(newState => {
  if (!window.myRole) {
    window.myRole = myRole;
  }
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
  const setterCanEdit =  myRole === state.setter &&  ((state.phase === "normal" && state.turn === state.setter &&!!state.pendingGuess) || (state.phase === "simultaneous" && !state.secret && !state.simultaneousSecretSubmitted));
  if (setterCanEdit) {
    state.setterDraft = prevSetterDraft;
  } else {
    state.setterDraft = "";
  }
  // Clear guesser draft once it is no longer editable
  if (state.phase === "normal" && state.pendingGuess && state.turn !== state.guesser) {localGuesserDraft = "";}
  window.state = state; 
  updatePowerInfoState(state);
  updateUI();
  if (state.phase === "simultaneous"){renderSetterRemainingBox(state, myRole, "");}
  if (state.phase === "normal"){renderSetterRemainingBox(state, myRole, state.secret);}
  remainingCache.setterOld = null;
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
  updateSummary();
  InfoBadgeEngine.render(state, myRole);
  if (state.phase !== "lobby") hide("lobby");
}

// -----------------------------------------------------
// Update Menu
// -----------------------------------------------------
function updateMenu() {
  $("menuRoomCode").textContent = roomId || "-";
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
  const typed = (state.setterDraft || "").toLowerCase();
  if (state.powers?.stealthGuessActive && myRole === state.setter) {
    return;
  }  
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
      renderSetterRemainingBox(state, myRole, state.setterDraft);
      return;
    }
    if (event.type === "LETTER") {
      remainingCache.setterCurrent = null;
      if (draft.length < 5) {
        state.setterDraft = draft + event.value;
        updateUI();
        renderSetterRemainingBox(state, myRole, state.setterDraft);
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
        resetEphemeralUIState();
        updateUI();
        renderSetterRemainingBox(state, myRole, state.secret);
        return;
      }
    }
    if (NewEnabled) {
      renderSetterRemainingBox(state, myRole, draft);
      submitSetterNew();
      return;
    }
      shakeDraftRow("setter");
      toast("Can't submit new secret");
      return;      
  }
}

/// SUBMIT NEW SECRET FUNCTION
function submitSetterNew() {
  const w = (state.setterDraft || "").toLowerCase();
  if (w.length !== 5) {
    shakeDraftRow("setter");
    toast("5 letters!");
    return;
  }
  if (!window.ALLOWED_GUESSES.has(w)) {
    shakeDraftRow("setter");
    toast("Word not in dictionary");
    return;
  }
  if (typeof window.isConsistentWithHistory === "function" && !window.isConsistentWithHistory(state.history, w, state)) {
    shakeDraftRow("setter");
    toast("Incompatible with previous feedback");
    //Check violations
    const { secretIndices } =  findConsistencyViolations(state.history, w);
    flashConsistencyViolations(secretIndices);
    if (violations.secretIndices.size > 0 ||violations.history.length > 0) {
      flashConsistencyViolations(violations);
    }
    return;
  }  
  sendGameAction(roomId, {type: "SET_SECRET_NEW",secret: w});
  state.setterDraft = "";  
  resetEphemeralUIState();
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
        shakeDraftRow("guesser");
        toast("5 letters!");
        return;
      }
    if (!window.ALLOWED_GUESSES.has(localGuesserDraft.toLowerCase())) {
      shakeDraftRow("guesser");
      toast("Not in dictionary");
      return;
    }    
    const result = validateGuesserGuess(localGuesserDraft.toLowerCase(),state.powers?.forcedGuess,window.ALLOWED_GUESSES);
    if (!result.ok) {
      toast(result.message);
      shakeDraftRow("guesser");
      return;
    }
    sendGameAction(roomId, {type: "SUBMIT_GUESS",guess: localGuesserDraft.toLowerCase()});
    resetEphemeralUIState();
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

window.quickJoin = function (cb) {
  socket.emit("quickJoin", cb);
};

$("quickJoinBtn").onclick = () => {
  quickJoin(resp => {
    if (!resp.ok) return toast(resp.error);

    roomId = resp.roomId;
    $("roomInfo").style.display = "block";
    $("roomCodeLabel").textContent = roomId;
    enableReadyButton(true);
  });
};

$("switchRolesBtn").onclick = () =>
  sendGameAction(roomId, { type: "SWITCH_ROLES" });

$("readyBtn").onclick = () => {
  // Send to server
  const name = $("playerNameInput")?.value?.trim() || "";
  
  sendGameAction(roomId, {
    type: "PLAYER_READY",
    name
  });

  // Immediately update UI locally
  enableReadyButton(false);
};
$("applyPowerCountBtn").onclick = () => {
   const n = parseInt($("powerCountInput").value, 10);
   if (!isNaN(n) && n > 0 && n <= 10) {
     sendGameAction(roomId, { type: "SET_POWER_COUNT", count: n });
   }
 };

$("newMatchBtn").onclick = () => {
  sendGameAction(roomId, { type: "NEW_MATCH" });
  const el = $("assassinWordDisplay");
if (el) el.textContent = "";
  hide("setterScreen");
  hide("guesserScreen");
  show("menu");
};

$("shareResultBtn").onclick = async () => {
  try {
    const text = buildShareText(state, myRole);
    await navigator.clipboard.writeText(text);
    toast("Result copied to clipboard");
  } catch (err) {
    console.error("Clipboard copy failed:", err);
    toast("Could not copy result");
  }
};

