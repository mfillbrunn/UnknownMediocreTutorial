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
let rouletteInterval = null;
let rouletteWords = null;
window.state = null;
const VOWELS = new Set(["A", "E", "I", "O", "U"]);
window.lastTimeRemaining ??= { A: null, B: null };
window.isRejoining = false;  
// -----------------------------------------------------
// DOM HELPERS
// -----------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
  if (!roomId) {roomId= localStorage.getItem("roomId");}
  renderMenuAccountStatus();
  showStartup();
});
function toast(msg) {
  const t = $("toast");
  if (!t) {
    console.warn("toast() called but #toast not in DOM:", msg);
    return;
  }

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
(() => {
  const periodMs = 4500;
  const phaseMs = performance.now() % periodMs;
  document.documentElement.style.setProperty("--ff-phase", `${phaseMs / 1000}s`);
  document.documentElement.style.setProperty("--pv-phase", `${phaseMs / 1000}s`);
})();


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

function mySocketId() {
  return socket?.id || null;
}

function updateRoleCards() {
  if (!state?.roles || !state?.playerNames) return;

  $("setterName").textContent =
    getPlayerNameByCurrentRole(state.setter);

  $("guesserName").textContent =
    getPlayerNameByCurrentRole(state.guesser);
}


function getPlayerNameByCurrentRole(targetRole) {
  if (!state?.roles || !state?.playerNames) return "—";

  // targetRole is state.setter or state.guesser (e.g. "A" or "B")
  const socketId = Object.keys(state.roles)
    .find(id => state.roles[id] === targetRole);

  return socketId
    ? state.playerNames[socketId] || "—"
    : "—";
}

function enterLobbyAfterJoin() {
  window.isRejoining = false;  
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

function triggerPowerFX(type) {
  const body = document.body;

  body.classList.remove("power-fx");
  body.classList.forEach(c => {
    if (c.startsWith("power-")) body.classList.remove(c);
  });

  // force restart
  void body.offsetWidth;

  body.classList.add("power-fx", `power-${type}`);

  clearTimeout(triggerPowerFX._t);
  triggerPowerFX._t = setTimeout(() => {
    body.classList.remove("power-fx", `power-${type}`);
  }, 900);
}

function triggerSubmitFX(role) {
  let el = null;
  let cls = null;

  if (role === "spy") {
    el = document.getElementById("setterScreen");
    cls = "submit-spy";
  } else if (role === "inspector") {
    el = document.getElementById("guesserScreen");
    cls = "submit-inspector";
  }

  if (!el) return;

  el.classList.remove("submit-spy", "submit-inspector");
  void el.offsetWidth; // restart transition
  el.classList.add(cls);

  clearTimeout(triggerSubmitFX._t);
  triggerSubmitFX._t = setTimeout(() => {
    el.classList.remove(cls);
  }, 220);
}

// -----------------------------------------------------
// Start up
// -----------------------------------------------------

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

// Power UI hook (client-side effects)
let powerQueue = [];

onPowerUsed(data => {
  if (!PowerEngine._initialized) {
    powerQueue.push(data);
    return;
  }
  console.log(data.type);
  console.log(data.variant);
  triggerPowerFX(data.type, data.variant);

  const mod = PowerEngine.powers[data.type];
  mod?.effects?.onPowerUsed?.(data);
  PowerEngine.updateButtonStates(state, myRole);
  if (state.powers?.vowelRefreshActive && state.powers?.rouletteSecretActive){
    stopSecretRoulette();
    startSecretRoulette(state.powers.rouletteSecretFeasible);
    }
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
case "playerKicked":
  toast("Opponent disconnected too long. You win.");
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

    case "enterLobby":
      show("lobby");
      hide("menu");
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
  if (prevPhase !== "simultaneous" && state.phase === "simultaneous" && prevRenderState.length > 0) {
      prevRenderState = [];
      $("setterGuesserSubmitted").innerHTML = "";
      $("historyGuesser").innerHTML = "";
  }  
  window.myRole = myRole;
  if (myRole && !roleAssigned) {
    roleAssigned = true;
  }
  const setterCanEdit =  myRole === state.setter &&  ((state.phase === "normal" && state.turn === state.setter &&!!state.pendingGuess) || (state.phase === "simultaneous" && !state.secret && !state.simultaneousSecretSubmitted));
  if (setterCanEdit) {
    state.setterDraft = prevSetterDraft;
  } else {
    state.setterDraft = "";
  }
  if (!PowerEngine._initialized && roomId && myRole && state && state.phase !== "lobby") {
      PowerEngine.renderButtons(roomId);
      PowerEngine._initialized = true;
  }
  // Extra clearing after simultaneous round
  if ((prevPhase === "simultaneous" && state.phase === "normal") || (prevPhase !== "simultaneous" && state.phase === "simultaneous")){localGuesserDraft = "";}
  if (prevPhase !== state.phase) {stopSecretRoulette();}
  window.state = state;   
  updateRoleCards();
  updateHostControls();
  updateRankedUI();
  updateTimerAccess(); 
  updateTimerPresetUI();
  updateWaitingIndicator();
  updatePowerInfoState(state);
  updateTimerVisibility();
  updateAppHeader(state);
  updateUI();
  maybeStartRouletteFromState(state);
  if (state.phase === "simultaneous"){renderSetterRemainingBox(state, myRole, "");}
  if (state.phase === "normal"){renderSetterRemainingBox(state, myRole, state.secret);}
  remainingCache.setterOld = null;
});

// -----------------------------------------------------
// UI UPDATE PIPELINE
// -----------------------------------------------------
function updateUI() {
  if (!state) return;
  // Render power buttons once
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
  const roleLabel = myRole === "A" ? "Spy" : "Inspector";
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
  const setterName = getPlayerNameByCurrentRole(state.setter);
  KeepEnabled=true;
  NewEnabled=true;  
  $("setterScreen").querySelector(".screen-title").textContent = setterName;
  //$("setterRoleBadge")?.textContent = "Spy";
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
  if (state.powers?.rouletteSecretActive){return;}
 // If stealth is active, hide preview entirely
  const guess = state.pendingGuess;
  if (!guess) return;
  const isSetterTurn = state.turn === state.setter;
  if (!isSetterTurn) return;
  const typed = (state.setterDraft || "").toUpperCase();
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
  if (state.powers.stealthGuessActive){return;}
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
  if (!state.powers?.freezeActive || !state.powers?.rouletteSecretActive){
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
        if (window.isRejoining) {
          toast("Reconnecting...");
          return;
        }
        sendGameAction({ type: "SET_SECRET_SAME" });  
        resetEphemeralUIState();
        updateUI();
        triggerSubmitFX("spy");
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
  const w = (state.setterDraft || "").toUpperCase();
  if (w.length !== 5) {
    shakeDraftRow("setter");
    toast("5 letters!");
    return;
  }
  if (state?.powers?.assassinWord) {
    const assassin = state.powers.assassinWord.toUpperCase(); 
    if (countPositionalDifferences(w, assassin) < 2) {
      shakeDraftRow("setter");
      toast("Too similar to assassin word (needs 2 or more different letters)");
      return;
    }
  }
  if (!window.ALLOWED_SECRETS.has(w)) {
    shakeDraftRow("setter");
    if (window.ALLOWED_GUESSES.has(w.toUpperCase())){
      toast("Word not allowed as secret");
    }else{
      toast("Word not in dictionary");
    }
    return;
  }
  if (typeof window.isConsistentWithHistory === "function" && !window.isConsistentWithHistory(state.history, w, state)) {
    shakeDraftRow("setter");
    toast("Incompatible with previous feedback");
    //Check violations
    const violations = findConsistencyViolations(state.history, w);
    const { secretIndices } = violations;    
    if (secretIndices.size > 0) {
      flashConsistencyViolations(secretIndices);
    }
    return;
  }  
  if (window.isRejoining) {
    toast("Reconnecting...");
    return;
  }
  sendGameAction({type: "SET_SECRET_NEW",secret: w});
  stopSecretRoulette();
  state.setterDraft = "";  
  resetEphemeralUIState();
  updateUI();
  renderSetterRemainingBox(state, myRole, state.secret);
  triggerSubmitFX("spy");
  
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
 const guesserName = getPlayerNameByCurrentRole(state.guesser);
  
  $("guesserScreen").querySelector(".screen-title").textContent = guesserName;
  //$("guesserRoleBadge").textContent = "Inspector";
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
    const guessMakesSense = state.powers.nonsenseActive || window.ALLOWED_GUESSES.has(localGuesserDraft.toUpperCase());
    if (!guessMakesSense) {
      shakeDraftRow("guesser");
      toast("Not in dictionary");
      return;
    }    
    const result = validateGuesserGuess(localGuesserDraft.toUpperCase(),state.powers?.forceGuessOptions,window.ALLOWED_GUESSES);
    if (!result.ok) {
      toast(result.message);
      shakeDraftRow("guesser");
      return;
    }
    if (window.isRejoining) {
      toast("Reconnecting...");
      return;
    }
    sendGameAction({type: "SUBMIT_GUESS",guess: localGuesserDraft.toUpperCase()});
    triggerSubmitFX("inspector");
    if (state.phase !== "simultaneous") {localGuesserDraft = "";}
    resetEphemeralUIState();
  }
}

/// HOst CONtROLS
function getHostRole() {
  if (!state?.hostUserId || !myRole) return null;
   return state?.hostUserId === window.currentUser.id
    ? myRole
    : (myRole === "A" ? "B" : "A");
}

function updateHostControls() {
  if (!state || !state.roles || !state.playerNames) return;

  const playerIds = Object.keys(state.playerNames);
  const twoPlayers = playerIds.length === 2;

  // Resolve role → playerId
  const setterPlayerId = Object.keys(state.roles)
    .find(id => state.roles[id] === "A");

  const guesserPlayerId = Object.keys(state.roles)
    .find(id => state.roles[id] === "B");

  // Host badges
  const hostRole = getHostRole();
  $("setterHostBadge")?.classList.toggle(
    "hidden",
    hostRole !== "A"
  );
  $("guesserHostBadge")?.classList.toggle(
    "hidden",
    hostRole !== "B"
  );

  // Kick buttons (host only, opponent only, works for AI)
  const kickSetterBtn = $("kickSetterBtn");
  if (kickSetterBtn) {
    kickSetterBtn.classList.toggle(
      "hidden",
      !isHost() ||
      !twoPlayers ||
      setterPlayerId === socket.id
    );
  }

  const kickGuesserBtn = $("kickGuesserBtn");
  if (kickGuesserBtn) {
    kickGuesserBtn.classList.toggle(
      "hidden",
      !isHost() ||
      !twoPlayers ||
      guesserPlayerId === socket.id
    );
  }
}



function updateTimerAccess() {
  if (!state) return;
  document
    .querySelectorAll('input[name="timePreset"]')
    .forEach(input => {
      input.disabled = !isHost();
    });

  document
    .querySelectorAll('.timer-option')
    .forEach(opt => {
      opt.classList.toggle("disabled", !isHost());
    });
}


// -----------------------------------------------------
// BUTTONS
// -----------------------------------------------------


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

  quickJoin(payload, resp => {
    if (resp.ok) {
      roomId = resp.roomId;
      persistRoom(roomId);
      enterLobbyAfterJoin();
      return;
    }

    createRoom(payload, resp2 => {
      if (!resp2.ok) {
        toast(resp2.error || "Could not start game");
        return;
      }
      roomId = resp2.roomId;
      persistRoom(roomId);
      enterLobbyAfterJoin();
    });
  });
});


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
  return state && state.hostUserId === window.currentUser.id;
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
        sendGameAction({
          type: "SET_TIME_CONTROL",
          enabled: false,
  userId: window.currentUser.id
        });
      }

      if (v === "bullet") {
        sendGameAction({
          type: "SET_TIME_CONTROL",
          enabled: true,
          mode: "round",
          seconds: 90,
  userId: window.currentUser.id
        });
      }

      if (v === "blitz") {
        sendGameAction({
          type: "SET_TIME_CONTROL",
          enabled: true,
          mode: "round",
          seconds: 180,
  userId: window.currentUser.id
        });
      }

      if (v === "deep") {
        sendGameAction({
          type: "SET_TIME_CONTROL",
          enabled: true,
          mode: "chess",
          seconds: 900,
  userId: window.currentUser.id
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
function countPositionalDifferences(a, b) {
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) diff++;
  }
  return diff;
}

function startSecretRoulette(words) {
  if (!Array.isArray(words) || words.length === 0) return;
  if (rouletteInterval) return;
  toast("Push enter when you are ready to submit!");
  rouletteWords = words;

  let i = 0;
  rouletteInterval = setInterval(() => {
    if (
      !state ||
      !Array.isArray(rouletteWords) ||
      rouletteWords.length === 0
    ) {
      stopSecretRoulette();
      return;
    }

    const word = rouletteWords[i % rouletteWords.length];
    state.setterDraft = word;
    renderDraftRows({ state, role: "setter", container: $("draftSetter") });
    updateUI();
    i++;
  }, 70);
}

function stopSecretRoulette() {
  if (rouletteInterval) {
    clearInterval(rouletteInterval);
    rouletteInterval = null;
  }
  rouletteWords = [];
}


function maybeStartRouletteFromState(state) {
  if (
    myRole !== state.setter ||
    state.phase !== "normal" ||
    !state.powers?.rouletteSecretActive ||
    !Array.isArray(state.powers.rouletteSecretFeasible)
  ) {
    stopSecretRoulette();
    return;
  }
  startSecretRoulette(state.powers.rouletteSecretFeasible);
}

function updateAppHeader(state) {
  const roomCodeEl = document.querySelector(".header-room-code");
  const roleBadgeEl = document.querySelector(".header-role-badge");
  if (!state || !roomCodeEl || !roleBadgeEl) return;

  roomCodeEl.textContent = state.roomCode || "";

  let roleLabel = "";
  let roleClass = "";

  if (myRole === state.setter) {
    roleLabel = "SPY";
    roleClass = "role-setter";
  } else if (myRole === state.guesser) {
    roleLabel = "INSPECTOR";
    roleClass = "role-guesser";
  }

  roleBadgeEl.textContent = roleLabel;
  roleBadgeEl.className = `role-badge header-role-badge ${roleClass}`;
}
