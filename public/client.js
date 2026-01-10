// -----------------------------------------------------
// LOCAL CLIENT STATE
// -----------------------------------------------------
let roomId = null;
let myRole = null;      
let state = null;
let localGuesserDraft = "";
let roleAssigned = false;
let lastSimulSecret = false;
let lastSimulGuess = false;
let KeepEnabled = true;
let NewEnabled = true;
window.state = null;
const VOWELS = new Set(["A", "E", "I", "O", "U"]);
window.lastTimeRemaining ??= { A: null, B: null };
// -----------------------------------------------------
// DOM HELPERS
// -----------------------------------------------------
const show = id => {
  const el = $(id);
  if (!el) {console.warn(`show(): element #${id} not found`); return;}
  el.classList.add("active");
};
const hide = id => {
  const el = $(id);
  if (!el) {console.warn(`hide(): element #${id} not found`); return;}
  el.classList.remove("active");
};

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
/*  const saved = localStorage.getItem("playerName");
  if (saved && $("playerNameInput")) {
    $("playerNameInput").value = saved;
  }*/
  renderMenuAccountStatus();
  showStartup();
});

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

function enterMenuMode() {
  document.body.classList.add("menu-mode");
}
function exitMenuMode() {
  document.body.classList.remove("menu-mode");
}
function getPlayerName() {
  if (window.myProfile?.username) {
    return window.myProfile.username;
  }

  // Fallback (should rarely happen)
  return "Player";
}


function updateRoleCards() {
  if (!state || !state.roles || !state.playerNames) return;

  const setterPlayerId = Object.keys(state.roles)
    .find(id => state.roles[id] === "A");

  const guesserPlayerId = Object.keys(state.roles)
    .find(id => state.roles[id] === "B");

  const setterEl = $("setterName");
  if (setterEl) {
    setterEl.textContent =
      setterPlayerId ? state.playerNames[setterPlayerId] : "—";
  }

  const guesserEl = $("guesserName");
  if (guesserEl) {
    guesserEl.textContent =
      guesserPlayerId ? state.playerNames[guesserPlayerId] : "—";
  }
}

function getPlayerNameByRole(role) {
  if (!state || !state.roles || !state.playerNames) return "—";

  const playerId = Object.keys(state.roles)
    .find(id => state.roles[id] === role);

  return playerId ? state.playerNames[playerId] || "—" : "—";
}


function enterLobbyAfterJoin() {
  showLobby();
}

function requireAuth(actionName = "continue") {
  if (!window.currentUser) {
    toast(`Please log in to ${actionName}`);
    showScreen("accountScreen");
    return false;
  }
  return true;
}
window.showScreen = (id) => {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  document.getElementById(id).classList.add("active");
};

// -----------------------------------------------------
// Start up
// -----------------------------------------------------
function showStartup() {
  show("startupScreen");
  hide("lobby");
  hide("menu");
  hide("setterScreen");
  hide("guesserScreen");
  document.body.classList.add("menu-mode");
}

function showLobby() {
  hide("startupScreen");
  show("lobby");
  updateWaitingIndicator(); 
  document.body.classList.remove("menu-mode");
}
function updateWaitingIndicator() {
  const el = $("waitingForPlayer");
  if (!el || !state || state.phase !== "lobby") return;

  const playerCount = Object.keys(state.roles || {}).length;

  if (playerCount >= 2) {
    el.classList.add("hidden");
  } else {
    el.classList.remove("hidden");
  }
}


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
      $("waitingForPlayer")?.classList.add("hidden");
      break;

  case "rolesSwitched":
    toast("Roles have been switched.");
    break;

case "playerLeft": {
      const msg =
        evt.reason === "kicked"
          ? "Your opponent was kicked."
          : evt.reason === "disconnect"
          ? "Your opponent disconnected."
          : "Your opponent left the room.";
    
      toast(msg);
      break;
    }

    case "playerReady":
      toast(`Player ${evt.role} is READY`);
      if (evt.playerId === socket.id) {
        enableReadyButton(false);
      }
      break;
    case "playerDisconnected":
      toast("Your opponent disconnected. Waiting to reconnect…");
      break;

    case "hideLobby":
      $("waitingForPlayer")?.classList.add("hidden");
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

// State updates
onStateUpdate(newState => {
  const prevPhase = state?.phase;
  const prevSetterDraft = state?.setterDraft || "";
  state = JSON.parse(JSON.stringify(newState));
  const roleFromState = state.roles?.[socket.id] ?? null;
  if (roleFromState) myRole = roleFromState;
  window.myRole = myRole;
  if (myRole && !roleAssigned) {
    roleAssigned = true;
  }
  if (prevPhase === "simultaneous" && state.phase=== "normal"){
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
  updateRoleCards();
  updateHostControls();
  updateRankedUI();
  updateTimerAccess(); 
  updateTimerPresetUI();
  updateWaitingIndicator();
  updatePowerInfoState(state);
  updateTimerVisibility();
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
if (!PowerEngine._initialized && roomId && myRole) {
    PowerEngine.renderButtons(roomId);
    PowerEngine._initialized = true;
}
  updateLobbyHeader();
  updateScreens();
  updateSummary();
  InfoBadgeEngine.render(state, myRole);
  if (state.phase !== "lobby") hide("lobby");
}

// -----------------------------------------------------
// Update updateLobbyHeader
// -----------------------------------------------------
function updateLobbyHeader() {
  $("roomCodeLabel").textContent = roomId;
}

// -----------------------------------------------------
// Screen Visibility
// -----------------------------------------------------
function updateScreens() {
  if (state.phase === "lobby") {
    enterMenuMode(); 
    show("lobby");
    hide("menu");
    hide("setterScreen");
    hide("guesserScreen");
    enableReadyButton(!state.ready?.[socket.id]);
    PowerEngine.applyUI(state, myRole, roomId);
    return;
  }
  enableReadyButton(false);
  exitMenuMode();
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
  const setterName = getPlayerNameByRole("A");
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
    if (secretIndices){
      flashConsistencyViolations(secretIndices);
      if (violations.secretIndices.size > 0 ||violations.history.length > 0) {
        flashConsistencyViolations(violations);
      }
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
  const guesserName = getPlayerNameByRole("B");
  
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
    renderGuesserDraftOnly();
    return;
  }

  if (event.type === "LETTER") {
    if (localGuesserDraft.length < 5) {
      localGuesserDraft += event.value;
      renderGuesserDraftOnly();
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

$("quickPlayBtn")?.addEventListener("click", () => {
  if (!requireAuth("quick play")) return;
  const username =
  window.myProfile?.username ||
  window.currentUser?.email ||
  "Player";
  const payload = {
    userId: window.currentUser.id,
    name: username
  };
  clearRoom();
  quickJoin(
    { userId: window.currentUser.id, name: username },
    resp => {
      if (!resp.ok) return toast(resp.error);
      roomId = resp.roomId;
      persistRoom(roomId);
      enterLobbyAfterJoin();
    }
  );


    // No room available → create one
   createRoom({ userId: window.currentUser.id, name: username },
  resp => { if (!resp.ok) return toast(resp.error);
        roomId = resp.roomId;
        persistRoom(roomId);
        enterLobbyAfterJoin();
      }
    );


});

function updateHostControls() {
  if (!state || !state.roles || !state.playerNames) return;

  const meHost = isHost();

  // Player count (by playerId)
  const playerIds = Object.keys(state.playerNames);
  const twoPlayers = playerIds.length === 2;

  // Resolve role → playerId
  const setterPlayerId = Object.keys(state.roles)
    .find(id => state.roles[id] === "A");

  const guesserPlayerId = Object.keys(state.roles)
    .find(id => state.roles[id] === "B");

  // Host badges
  const setterHostBadge = $("setterHostBadge");
  if (setterHostBadge) {
    setterHostBadge.classList.toggle(
      "hidden",
      state.host !== setterPlayerId
    );
  }

  const guesserHostBadge = $("guesserHostBadge");
  if (guesserHostBadge) {
    guesserHostBadge.classList.toggle(
      "hidden",
      state.host !== guesserPlayerId
    );
  }

  // Kick buttons (host only, opponent only, only if 2 players)
  const kickSetterBtn = $("kickSetterBtn");
  if (kickSetterBtn) {
    kickSetterBtn.classList.toggle(
      "hidden",
      !meHost || !twoPlayers || setterPlayerId === socket.id
    );
  }

  const kickGuesserBtn = $("kickGuesserBtn");
  if (kickGuesserBtn) {
    kickGuesserBtn.classList.toggle(
      "hidden",
      !meHost || !twoPlayers || guesserPlayerId === socket.id
    );
  }
}

function updateTimerAccess() {
  if (!state) return;

  const meHost = isHost();

  document
    .querySelectorAll('input[name="timePreset"]')
    .forEach(input => {
      input.disabled = !meHost;
    });

  document
    .querySelectorAll('.timer-option')
    .forEach(opt => {
      opt.classList.toggle("disabled", !meHost);
    });
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


function isHost() {
  return state && state.host === socket.id;
}
function updateTimerPresetUI() {
  if (!state?.timeControl) return;

  const preset = state.timeControl.preset || "none";

  document
    .querySelectorAll('input[name="timePreset"]')
    .forEach(radio => {
      radio.checked = radio.value === preset;
    });
}

function enableReadyButton(enabled) {
  const btn = $("readyBtn");
  if (!btn) return;
  btn.disabled = !enabled;
  if (!enabled) {
    btn.classList.add("waiting");
    btn.textContent = "Waiting...";
  } else {
    btn.classList.remove("waiting");
    btn.textContent = "I'm Ready";
  }
}


document
  .querySelectorAll('input[name="timePreset"]')
  .forEach(radio => {
    radio.addEventListener("change", () => {
      const v = radio.value;

      if (v === "none") {
        sendGameAction(roomId, {
          type: "SET_TIME_CONTROL",
          enabled: false
        });
      }

      if (v === "bullet") {
        sendGameAction(roomId, {
          type: "SET_TIME_CONTROL",
          enabled: true,
          mode: "round",
          seconds: 60
        });
      }

      if (v === "blitz") {
        sendGameAction(roomId, {
          type: "SET_TIME_CONTROL",
          enabled: true,
          mode: "round",
          seconds: 180
        });
      }

      if (v === "deep") {
        sendGameAction(roomId, {
          type: "SET_TIME_CONTROL",
          enabled: true,
          mode: "chess",
          seconds: 900
        });
      }
    });
  });

function renderGuesserDraftOnly() {
  renderDraftRows({
    state,
    role: "guesser",
    container: $("draftGuesser"),
    localGuesserDraft
  });

  // Optionally update keyboard highlights only
  renderKeyboard({
    state,
    container: $("keyboardGuesser"),
    pendingGuess: localGuesserDraft,
    isGuesser: true,
    onInput: handleGuesserInput
  });
}

