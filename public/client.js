
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

// Rebuilds both keyboards from scratch right now (not lazily on next
// render), so leftover green/yellow/gray classes from the previous game
// don't flash on screen while waiting on the server round-trip for a new
// match/round.
function resetKeyboards() {
  ["keyboardSetter", "keyboardGuesser"].forEach(id => {
    const el = $(id);
    if (!el) return;
    delete el.__keys;
    if (typeof buildKeyboard === "function") buildKeyboard(el);
  });
}
(() => {
  const periodMs = 4500;
  const phaseMs = performance.now() % periodMs;
  document.documentElement.style.setProperty("--ff-phase", `${phaseMs / 1000}s`);
  document.documentElement.style.setProperty("--pv-phase", `${phaseMs / 1000}s`);
})();
function myUserId() {
  return window.currentUser?.id || null;
}

function myPlayer() {
  const uid = myUserId();
  return uid && state?.players ? state.players[uid] || null : null;
}

function getMyRole() {
  return myPlayer()?.role || null;
}

function getPlayerByUserId(userId) {
  return userId && state?.players ? state.players[userId] || null : null;
}

function getSetterPlayer() {
  return getPlayerByUserId(state?.setter);
}

function getGuesserPlayer() {
  return getPlayerByUserId(state?.guesser);
}

function shakeDraftRow(role) {
  let row, keyboard;

  if (role === "setter") {
    row = document.querySelector(".history-row.draft-row.setter-draft");
    keyboard = $("keyboardSetter");
  } else if (role === "guesser") {
    row = document.querySelector(".history-row.draft-row.guesser-draft");
    keyboard = $("keyboardGuesser");
  } else {
    return;
  }

  if (row) {
    // Restart animation if already running
    row.classList.remove("draft-shake");
    void row.offsetWidth; // force reflow
    row.classList.add("draft-shake");
  }

  if (keyboard) {
    keyboard.classList.remove("shake");
    void keyboard.offsetWidth;
    keyboard.classList.add("shake");
    setTimeout(() => keyboard.classList.remove("shake"), 220);
  }
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
  if (!state?.players) return;

  $("setterName").textContent = getSetterPlayer()?.name || "—";
  $("guesserName").textContent = getGuesserPlayer()?.name || "—";

  // Ready-state badge on role cards
  const setterCard  = document.querySelector(".role-card.setter");
  const guesserCard = document.querySelector(".role-card.guesser");
  const setterReady  = !!getSetterPlayer()?.ready;
  const guesserReady = !!getGuesserPlayer()?.ready;
  setterCard?.classList.toggle("is-ready",  setterReady);
  guesserCard?.classList.toggle("is-ready", guesserReady);
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
  // The shake animation is applied to #appContainer (not body): a transform
  // on an ancestor of a `position: fixed` element becomes that element's
  // containing block, which was dragging #powerPopup/#toast along with the
  // shake. Keeping the transform off body leaves those fixed overlays put.
  const container = $("appContainer");

  [body, container].forEach(el => {
    if (!el) return;
    el.classList.remove("power-fx");
    el.classList.forEach(c => {
      if (c.startsWith("power-")) el.classList.remove(c);
    });
  });

  // force restart
  void body.offsetWidth;

  body.classList.add("power-fx", `power-${type}`);
  container?.classList.add("power-fx", `power-${type}`);

  clearTimeout(triggerPowerFX._t);
  triggerPowerFX._t = setTimeout(() => {
    body.classList.remove("power-fx", `power-${type}`);
    container?.classList.remove("power-fx", `power-${type}`);
  }, 900);
}

// -----------------------------------------------------
// Start up
// -----------------------------------------------------

function showLobby() {
  // Sweep every menu screen (not just startupScreen) — any menu-mode screen
  // left active (e.g. the AI difficulty picker) would otherwise stay
  // stacked on top of the lobby since they're independently toggled.
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  show("lobby");
  updateWaitingIndicator();
  document.body.classList.remove("menu-mode");
}
function updateWaitingIndicator() {
  const el = $("waitingForPlayer");
  if (!el || !state || state.phase !== "lobby") return;

  const playerCount = Object.keys(state.players || {}).length;

  if (playerCount >= 2) {
    el.classList.add("hidden");
  } else {
    el.classList.remove("hidden");
  }
}

// Power UI hook (client-side effects)
let powerQueue = [];

onPowerUsed(data => {
  console.log(data.type);
  console.log(data.variant);
  console.log(!PowerEngine._initialized);
  if (!PowerEngine._initialized) {
    powerQueue.push(data);
    return;
  }
  triggerPowerFX(data.type, data.variant);
  const mod = PowerEngine.powers[data.type];
  mod?.effects?.onPowerUsed?.(data);
  PowerEngine.updateButtonStates(state, myRole, myUserId());
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
      toast("A player is ready");
      break;
    case "playerDisconnected":
      toast("Your opponent disconnected. Waiting to reconnect…");
      break;

    case "hideLobby":
      $("waitingForPlayer")?.classList.add("hidden");
      // Sweep every menu screen too: a ranked match can start directly out
      // of the matchmaking waiting screen, skipping the manual lobby.
      document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
      document.body.classList.remove("menu-mode");
      show(myRole === "setter" ? "setterScreen" : "guesserScreen");
      enableReadyButton(false);
      break;

      case "enterLobby":
        myRole = null;
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
  const prevHistoryLen = state?.history?.length ?? -1;
  state = JSON.parse(JSON.stringify(newState));
  if ((state.history?.length ?? 0) !== prevHistoryLen) {
    // A guess/decision just finalized (or a new round started) — any
    // mid-turn power events are now baked into state.history/matchRounds,
    // so drop the live buffer to avoid showing them twice in the log.
    window._livePowerEvents = [];
  }
  if (prevPhase !== "simultaneous" && state.phase === "simultaneous" && prevRenderState.length > 0) {
      prevRenderState = [];
      $("setterGuesserSubmitted").innerHTML = "";
      $("historyGuesser").innerHTML = "";
  }  
  const newMyRole = getMyRole();
  if (newMyRole !== myRole) {
    myRole = newMyRole;
    // Keep window.myRole authoritative too — it's read by socketClient.js's
    // power-popup logic, and the "roleAssigned" socket event alone doesn't
    // cover role swaps between rounds or AI rooms where it can fire before
    // roles are actually determined.
    window.myRole = newMyRole;
    updateRoleLabels();
  }
  const setterCanEdit =
  myUserId() === state.setter &&
  ((state.phase === "normal" && state.turn === state.setter && !!state.pendingGuess) ||
   (state.phase === "simultaneous" && !state.secret && !state.simultaneousSecretSubmitted));
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
  if (prevPhase !== state.phase) {stopSecretRoulette();}
  window.state = state;   
  updateRoleCards();
  updateHostControls();
  updateRankedUI();
  updateShuffleUI();
  updateDevUI();
  updateTimerAccess(); 
  updateTimerPresetUI();
  updateWaitingIndicator();
  updatePowerInfoState(state);
  updateTimerVisibility();
  updateAppHeader(state);
  updateLeaveGameButtons(state);
  updateLobbyHeader();
  updateGuideBanner();
  updateUI();
  updateSummary();
  maybeStartRouletteFromState(state);
  tutorialSteps(state, myRole);
  if (!state.isTutorial){  
    const bubble = byId("tutorialBubble");
    if (!bubble) return;
  bubble.classList.add("hidden");}
});

// -----------------------------------------------------
// UI UPDATE PIPELINE
// -----------------------------------------------------
function updateUI() {
  if (!state) return;
  updateScreens();
  InfoBadgeEngine.render(state, myRole);
  if (state.phase !== "lobby") hide("lobby");
  updateSecretLock();
  window.renderActionLog?.(state, myRole);
  window.renderNotesPanel?.(state);
}

function updateSecretLock() {
  const overlay = $("secretLockOverlay");
  if (!overlay) return;
  const locked = !!state?.simultaneousAllWrong;
  overlay.classList.toggle("hidden", !locked);
  if (locked && myRole === "setter") {
    // Prevent new secret entry
    NewEnabled = false;
  }
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
    // Ranked matchmaking briefly puts the freshly-created room through the
    // normal lobby phase server-side (role/time-control setup) before both
    // players are auto-readied. Don't let that flash the manual lobby UI
    // over the "match found" countdown screen.
    if (window._rankedMatching) return;
    enterMenuMode();
    show("lobby");
    hide("menu");
    hide("setterScreen");
    hide("guesserScreen");
    enableReadyButton(!!state.players?.[myUserId()]?.ready);
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
  if (myUserId() === state.setter) {
    show("setterScreen");
    hide("guesserScreen");
    updateSetterScreen();
  } else {
    show("guesserScreen");
    hide("setterScreen");
    updateGuesserScreen();
  }
PowerEngine.applyUI(state, myRole, myUserId());
}

// -----------------------------------------------------
// ROLE LABEL
// -----------------------------------------------------
function updateRoleLabels() {
  if (!myRole) return;
  const roleLabel = myRole === "setter" ? "Spy" : "Inspector";
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
  const setterName = getPlayerByUserId(state.setter)?.name || "—";
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

  // Sync from the authoritative per-state snapshot (correctly hidden
  // outside the decision step, e.g. at the start of a new simultaneous
  // round) rather than only from the live keystroke-preview channel,
  // which otherwise leaves stale data showing after a round changes.
  if (typeof renderSetterRemainingBox === "function") {
    renderSetterRemainingBox(state.setterRemainingBox || { visible: false });
  }

  if (myUserId() === state.setter) {
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
  if (state.powers?.rouletteSecretActive || state.powers?.stealthGuessActive){
    clearSetterPreview();
    return;
  }
 // If stealth is active, hide preview entirely
  const guess = state.pendingGuess;
  if (!guess) { clearSetterPreview(); return; }
  const isSetterTurn = state.turn === state.setter;
  if (!isSetterTurn) { clearSetterPreview(); return; }
  const typed = (state.setterDraft || "").toUpperCase();
  let fb, isIncomplete = false;
  if (typed.length === 5) {
    fb = predictFeedback(typed, guess);
  } else if (typed.length === 0) {
    fb = predictFeedback(state.secret, guess);
  } else {
    fb = predictFeedbackIncomplete(typed, guess);
    isIncomplete = true;
  }
  applyPreviewFeedback(fb, isIncomplete);
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
const PREVIEW_CLASSES = ["preview-green", "preview-yellow", "preview-gray", "preview-incomplete"];
function applyPreviewFeedback(fbArray, isIncomplete = false) {
  if (state.powers.stealthGuessActive){return;}
  const tiles = document.querySelectorAll("#draftSetter .pending-guess .history-tile");
  fbArray.forEach((fb, i) => {
    const tile = tiles[i];
    if (!tile) return;

    const colorClass =
      fb === "🟩" ? "preview-green" :
      fb === "🟨" ? "preview-yellow" :
      "preview-gray";
    const desired = isIncomplete ? [colorClass, "preview-incomplete"] : [colorClass];

    // This runs on every keystroke/render — removing and re-adding an
    // animated class restarts its animation, so only touch the DOM when
    // the actual desired classes changed (otherwise the pulse never gets
    // to finish even one cycle).
    const current = PREVIEW_CLASSES.filter(c => tile.classList.contains(c));
    const same =
      current.length === desired.length && desired.every(c => current.includes(c));
    if (same) return;

    tile.classList.remove(...PREVIEW_CLASSES);
    tile.classList.add(...desired);
  });
}
///SETTER INPUT
function emitSetterDraftPreview(draft) {
   console.log("emitSetterDraftPreview", {
    draft,
    roomId,
    myRole,
    setter: state.setter,
    hasSocket: !!socket
  });
  if (!socket || !roomId || myUserId() !== state.setter) return;
  socket.emit("setterDraftSecret", {roomId, draft});
}
function handleSetterInput(event) {
  if (window.isNotesActive?.() && window.notesInput?.(event)) return;
  if (!(state.powers?.freezeActive || state.powers?.rouletteSecretActive)) {
    const isNormalSetterTurn =
      myUserId() === state.setter &&
      state.phase === "normal" &&
      state.turn === state.setter &&
      !!state.pendingGuess;

    const isSimultaneousSecretEntry =
      state.phase === "simultaneous" &&
      !state.secret &&
      !state.simultaneousSecretSubmitted;

    if (!(isNormalSetterTurn || isSimultaneousSecretEntry)) return;

    const isEditing = event.type === "LETTER" || event.type === "BACKSPACE";

    if (isEditing && !state.setterDraft) {
      state.setterDraft = "";
    }

    const draft = state.setterDraft || "";

    if (event.type === "BACKSPACE") {
      state.setterDraft = draft.slice(0, -1);
      updateUI();
      emitSetterDraftPreview(state.setterDraft);
      return;
    }

    if (event.type === "LETTER") {
      if (draft.length < 5) {
        state.setterDraft = draft + event.value;
        updateUI();
        emitSetterDraftPreview(state.setterDraft);
      }
      return;
    }
  }

  if (event.type === "ENTER") {
    const draft = (state.setterDraft || "").trim().toUpperCase();

    if (draft.length === 0) {
      if (KeepEnabled) {
        state.setterDraft = "";
        emitSetterDraftPreview("");

        if (window.isRejoining) {
          toast("Reconnecting...");
          return;
        }

        sendGameAction({ type: "SET_SECRET_SAME" });
        resetEphemeralUIState();
        updateUI();
        return;
      }
    }

    if (NewEnabled) {
      emitSetterDraftPreview(draft);
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
    if (window.ALLOWED_GUESSES.has(w)){
      shakeDraftRow("setter");
      toast("Word not allowed as secret");
    }else{
      shakeDraftRow("setter");
      toast("Word not in dictionary");
    }
    return;
  }
  if (state.isTutorial && state.history.length < state.scriptedTurns) {
    if (w !== state.tutorialSecrets[state.history.length]){
      shakeDraftRow("setter");
      toast(`Type in ${state.tutorialSecrets[state.history.length]}`);      
      return;
    }
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
 const guesserName = getPlayerByUserId(state.guesser)?.name || "—";
  
  $("guesserScreen").querySelector(".screen-title").textContent = guesserName;
  //$("guesserRoleBadge").textContent = "Inspector";
setTurn("guesserScreen", false);
if (state.phase === "simultaneous") {setTurn("guesserScreen", !state.pendingGuess);}
if (state.phase === "normal" && state.turn === state.guesser) {setTurn("guesserScreen", true);} 

  const displayGuess = state.pendingGuess || localGuesserDraft;
 if (myUserId() === state.guesser) {
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
  if (window.isNotesActive?.() && window.notesInput?.(event)) return;
  if (state.pendingGuess) return;
  if (event.type === "BACKSPACE") {
    localGuesserDraft = localGuesserDraft.slice(0, -1);
    renderGuesserDraftOnly();
    return;  }

  if (event.type === "LETTER") {
    if (localGuesserDraft.length < 5) {
      localGuesserDraft += event.value;
      renderGuesserDraftOnly();
    }
    return;
  }
  const g = localGuesserDraft.toUpperCase();
  if (event.type === "ENTER") {    
      if (g.length !== 5) {
        toast("5 letters!");
        shakeDraftRow("guesser");
        return;
      }
    const guessMakesSense = state.powers.nonsenseActive || window.ALLOWED_GUESSES.has(g.toUpperCase());
    if (!guessMakesSense) {
      toast("Not in dictionary");
      shakeDraftRow("guesser");
      return;
    }    
    const result = validateGuesserGuess(g,state.powers?.forceGuessOptions,window.ALLOWED_GUESSES);
    if (!result.ok) {
      toast(result.message);
      shakeDraftRow("guesser");
      return;
    }
    if (state.isTutorial && state.history.length < state.scriptedTurns) {
      if (g !== state.tutorialGuesses[state.history.length]){
        toast(`Type in ${state.tutorialGuesses[state.history.length]}`);      
        shakeDraftRow("guesser");
        return;
      }
    }
    if (window.isRejoining) {
      toast("Reconnecting...");
      return;
    }
    sendGameAction({type: "SUBMIT_GUESS",guess: g});
    localGuesserDraft = "";
    resetEphemeralUIState();
  }
}

/// HOst CONtROLS
function getHostRole() {
  if (!state?.hostUserId) return null;
  return state.players?.[state.hostUserId]?.role || null;
}

function updateHostControls() {
  if (!state?.players) return;

  const players = Object.values(state.players);
  const twoPlayers = players.length === 2;

  const setterUserId = state.setter;
  const guesserUserId = state.guesser;

  const hostRole = getHostRole();

  $("setterHostBadge")?.classList.toggle("hidden", hostRole !== "setter");
  $("guesserHostBadge")?.classList.toggle("hidden", hostRole !== "guesser");

  const kickSetterBtn = $("kickSetterBtn");
  if (kickSetterBtn) {
    kickSetterBtn.classList.toggle(
      "hidden",
      !isHost() ||
      !twoPlayers ||
      setterUserId === myUserId()
    );
  }

  const kickGuesserBtn = $("kickGuesserBtn");
  if (kickGuesserBtn) {
    kickGuesserBtn.classList.toggle(
      "hidden",
      !isHost() ||
      !twoPlayers ||
      guesserUserId === myUserId()
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
// Play/Ranked menu wiring lives in client/play-menu.js


(function setupGuideToggle() {
  const btn = $("guideToggleBtn");
  if (!btn) return;

  // Load saved preference (default: on)
  const stored = localStorage.getItem("guideActive");
  const guideOn = stored === null ? true : stored === "true";

  document.body.classList.toggle("guide-on", guideOn);
  btn.classList.toggle("active", guideOn);

  btn.onclick = () => {
    const isOn = document.body.classList.toggle("guide-on");
    localStorage.setItem("guideActive", isOn);
    btn.classList.toggle("active", isOn);
    updateGuideBanner();
    // The remaining-words box's guide hint is baked into its innerHTML at
    // render time, so without this it wouldn't reflect the new guide state
    // until the next natural render (next keystroke or state update).
    if (typeof renderSetterRemainingBox === "function" && window.state?.setterRemainingBox) {
      renderSetterRemainingBox(window.state.setterRemainingBox);
    }
  };
})();

// -----------------------------------------------------
// GUIDE: phase + current-task banner
// -----------------------------------------------------
function getGuideInfo(state, role) {
  if (!state || !role) return null;

  if (state.phase === "simultaneous") {
    if (role === "setter") {
      const done = !!state.secret || state.simultaneousSecretSubmitted;
      return {
        phase: "Simultaneous Round",
        task: done
          ? "Secret locked in — waiting for your opponent's opening guess."
          : "Choose your secret word. Your opponent is guessing blind this round."
      };
    }
    const done = !!state.pendingGuess || state.simultaneousGuessSubmitted;
    return {
      phase: "Simultaneous Round",
      task: done
        ? "Guess submitted — waiting for the setter's secret."
        : "Submit your opening guess. You don't know the secret yet."
    };
  }

  if (state.phase === "normal") {
    if (role === "setter") {
      const isDecisionStep = state.turn === state.setter && !!state.pendingGuess;
      return {
        phase: "Guessing Round",
        task: isDecisionStep
          ? "Your turn: keep your secret, or switch to a new word consistent with all feedback so far."
          : "Waiting for the guesser to submit a guess."
      };
    }
    const isGuessTurn = state.turn === state.guesser;
    return {
      phase: "Guessing Round",
      task: isGuessTurn
        ? "Your turn: submit a guess."
        : "Waiting for the setter to decide whether to keep or change the secret."
    };
  }

  return null;
}

function updateGuideBanner() {
  const banner = $("guideBanner");
  if (!banner) return;

  const guideOn = document.body.classList.contains("guide-on");
  const info = guideOn ? getGuideInfo(state, myRole) : null;

  if (!info) {
    banner.classList.add("hidden");
    return;
  }

  $("guidePhase").textContent = info.phase;
  $("guideTask").textContent = info.task;
  banner.classList.remove("hidden");
}

(function setupLobbyInfoButtons() {
  document.querySelectorAll(".lobby-info-btn").forEach(btn => {
    btn.addEventListener("click", e => {
      e.stopPropagation();
      e.preventDefault();
      if (!btn.dataset.info) return;
      const title = (btn.getAttribute("aria-label") || "").replace(/^About\s+/i, "");
      window.showPowerPopup?.({
        emoji: "ℹ️",
        title,
        desc: btn.dataset.info
      });
    });
  });
})();

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

function enableReadyButton(isReady) {
  const btn = $("readyBtn");
  if (!btn) return;
  btn.disabled = false;
  btn.textContent = "I'm Ready";
  btn.classList.remove("waiting");
  btn.classList.toggle("lobby-ready-btn", !!isReady);
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

// notes.js runs in its own script scope and can't reassign the bare
// `localGuesserDraft` binding (writing window.localGuesserDraft only
// creates an unrelated global property) — go through this setter instead.
window.setGuesserDraft = function (word) {
  localGuesserDraft = word;
  renderGuesserDraftOnly();
};

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
    myUserId() !== state.setter ||
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

  // Spy/Inspector duplicated what the screen title + tile colors already
  // show. A running score reads at a glance and is actually new
  // information — how many guesses each of you has needed so far.
  if (state.phase === "gameOver" || state.phase === "lobby") {
    roleBadgeEl.textContent = "";
    roleBadgeEl.className = "role-badge header-role-badge";
    return;
  }

  const myId = myUserId();
  const opponentId = Object.keys(state.players || {}).find(id => id !== myId);
  const { points } = computeMatchResult(state, myId);
  const myPoints = points[myId] || 0;
  const oppPoints = opponentId ? points[opponentId] || 0 : 0;

  // Numbers only, no "You:"/"Opp:" labels — which one is "you" is instead
  // conveyed the same way the rest of the UI already marks "you" (bright/
  // bold vs. dim), so it stays readable without spelling it out.
  roleBadgeEl.innerHTML = `<span class="score-you">${myPoints}</span><span class="score-sep">–</span><span class="score-opp">${oppPoints}</span>`;
  roleBadgeEl.className = "role-badge header-role-badge";
}

// Unlimited-time games are meant to be stepped away from and resumed
// later (see "My Games") — surface an explicit, safe way to do that
// instead of relying on just closing the tab.
function updateLeaveGameButtons(state) {
  const show = !!state && state.timeControl?.enabled === false && !state.gameOver;
  document.querySelectorAll(".leave-game-btn").forEach(btn => {
    btn.classList.toggle("hidden", !show);
  });
}

document.querySelectorAll(".leave-game-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    byId("tutorialBubble")?.classList.add("hidden");
    // Just step away — the room stays alive server-side (unlimited-time
    // rooms are exempt from disconnect cleanup) so it shows back up in
    // "My Games" whenever the player wants to resume it.
    clearRoom();
  });
});
