
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
// Captured just before a state update that resolves the setter's pending
// guess into a scored history row -- see resolvePendingGuessFlight() below,
// which uses this to fly a clone of the pending row from here to where the
// new row lands instead of the old row just vanishing and a new one fading
// in disconnected from it.
let pendingGuessFlight = null;
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

// A tutorial's highlight rings (DOM classes toggled in tutorial-ui.js) and
// an unsubmitted guesser draft (localGuesserDraft, a plain module-level
// variable, not part of `state`) are both transient per-game UI state that
// outlives `state` itself -- clearRoom() nulling `state` doesn't touch
// either, so without this a highlight ring left over from an abandoned
// tutorial step, or letters someone was mid-typing, silently carried over
// into whatever game started next. Resets the raw variables directly
// rather than going through setGuesserDraft(), which re-renders using
// `state` -- by the time clearRoom() calls this, state is already null.
//
// Also called directly by the New Match / Replay button handlers
// (socket-events.js / summary.js), which -- unlike leaving a room -- never
// go through clearRoom() at all: NEW_MATCH/REPLAY_MATCH reuse the same
// room and just swap in a fresh server state. Hide Evidence's armed state
// (public/powerEngine/powers/hideTile.js) is module-scoped, not part of
// `state`, so it needs its own explicit reset here too.
window.resetTransientGameUI = function () {
  localGuesserDraft = "";
  guesserDraftLocks.clear();
  document.body.classList.remove(
  "blind-guess"
);
  window.clearHighlights?.();
  window.hideTileKbReset?.();
  
};
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
let lastOpeningMissLockNoticeAt = 0;

function isOpeningMissSecretLocked() {
  return (
    !!state?.simultaneousAllWrong &&
    !state?.powers
      ?.rouletteSecretActive
  );
}

function showOpeningMissLockNotice() {
  const now = Date.now();

  /*
   * Prevent a held keyboard key from opening several
   * overlapping notices.
   */
  if (
    now -
    lastOpeningMissLockNoticeAt <
    900
  ) {
    return;
  }

  lastOpeningMissLockNoticeAt =
    now;

  const iAmSetter = myUserId() === state?.setter;

  window.showBigAnnounce?.({
    icon: "🔒",

    title: iAmSetter
      ? "Your secret is locked"
      : "The Spy's secret is locked",

    sub: iAmSetter
      ? "The Inspector missed every letter in the opening guess. You must keep the same secret for this round."
      : "You missed every letter in your opening guess. The Spy must keep the same secret for this round.",

    roleClass: iAmSetter
      ? "role-setter"
      : "role-guesser",

    duration: 4200,
    compact: true
  });
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

  // Empty-slot "+": whichever role has no player yet is inherently the
  // opponent's seat (mine already occupies the other one) — swap its name
  // placeholder for a big "+" that opens Invite Friend / Add AI, instead of
  // just showing a dead "—".
  updateAddOpponentSlot("setter", !getSetterPlayer());
  updateAddOpponentSlot("guesser", !getGuesserPlayer());
}

function updateAddOpponentSlot(role, isEmpty) {
  const cap = role === "setter" ? "Setter" : "Guesser";
  const nameEl = $(role + "Name");
  const btn = $(`addOpponent${cap}Btn`);
  const menu = $(`addOpponent${cap}Menu`);
  if (!btn || !menu) return;

  nameEl?.classList.toggle("hidden", isEmpty);
  btn.classList.toggle("hidden", !isEmpty);
  if (!isEmpty) menu.classList.add("hidden");
}

function closeAddOpponentMenus() {
  $("addOpponentSetterMenu")?.classList.add("hidden");
  $("addOpponentGuesserMenu")?.classList.add("hidden");
  $("addOpponentSetterBtn")?.classList.remove("hidden");
  $("addOpponentGuesserBtn")?.classList.remove("hidden");
  // Re-hide whichever "+" shouldn't actually be showing (the role that has
  // a player) — updateAddOpponentSlot already keeps them in sync, but a
  // menu-close can happen without a fresh render in between.
  updateRoleCards();
}

["Setter", "Guesser"].forEach(cap => {
  const btn = $(`addOpponent${cap}Btn`);
  const menu = $(`addOpponent${cap}Menu`);
  btn?.addEventListener("click", e => {
    e.stopPropagation();
    btn.classList.add("hidden");
    menu?.classList.remove("hidden");
  });
  menu?.addEventListener("click", e => {
    const optBtn = e.target.closest(".add-opponent-option");
    if (!optBtn) return;
    if (optBtn.dataset.action === "other") {
      if (window.roomId) shareOrCopyInviteLink(window.roomId);
    } else if (optBtn.dataset.action === "friend") {
      window.showInviteFriendModal?.();
    }
    closeAddOpponentMenus();
  });
});

document.addEventListener("click", e => {
  if (e.target.closest(".add-opponent-menu") || e.target.closest(".add-opponent-btn")) return;
  closeAddOpponentMenus();
});

function enterLobbyAfterJoin() {
  window.isRejoining = false;
  // Guards against a stuck flag if a prior _startQuickAI run somehow never
  // left state.phase === "lobby" (see socket-events.js) -- every real
  // lobby entry point routes through here, so this is the one place a
  // leftover flag can't end up hiding a legitimate lobby.
  window._quickAiStarting = false;
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

// Passive/ambient powers that quietly update a badge every turn rather than
// being deliberately activated -- they still emit powerUsed (for the info
// badge / action log) but must NOT trigger the full-screen shake FX, which
// is meant for a real, one-off power activation. Informant (revealLocation)
// re-peeks on the guesser's turn and was shaking the screen on essentially
// every guess.
const AMBIENT_POWER_FX_SKIP = new Set(["revealLocation"]);

onPowerUsed(data => {
  if (!PowerEngine._initialized) {
    powerQueue.push(data);
    return;
  }
  if (!AMBIENT_POWER_FX_SKIP.has(data.type)) {
    triggerPowerFX(data.type, data.variant);
  }
  const mod = PowerEngine.powers[data.type];
  mod?.effects?.onPowerUsed?.(data);
  PowerEngine.updateButtonStates(state, myRole, myUserId());
  if (state.powers?.vowelRefreshActive && state.powers?.rouletteSecretActive){
    stopSecretRoulette();
    startSecretRoulette(state.powers.rouletteSecretFeasible);
    }
});


// After renderButtons is called:
if (!PowerEngine._initialized && window.roomId && roleAssigned) {
  PowerEngine.renderButtons(window.roomId);
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
      $("waitingForPlayer")?.classList.add("hidden");
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
  enableReadyButton(false);

  if (
    !_gameOverRevealInFlight &&
    !window._gameOverRevealInFlight &&
    (
      state?.phase === "gameOver" ||
      state?.phase === "roundSummary"
    )
  ) {
    updateScreens();
  }

  break;
  }
});

// State updates
onStateUpdate(newState => {
  const prevPhase = state?.phase;
  const prevSetterDraft = state?.setterDraft || "";
  const prevHistoryLen = state?.history?.length ?? -1;
  const prevPendingGuess = state?.pendingGuess || "";
  const wasOpeningMissLocked =
    !!state?.simultaneousAllWrong;

  if (
    prevPendingGuess &&
    state &&
    myUserId() === state.setter &&
    (newState.history?.length ?? 0) > prevHistoryLen
  ) {
    const pendingEl = document.querySelector(
      "#draftSetter .draft-row.pending-guess"
    );

    if (
      pendingEl &&
      pendingEl.offsetParent !== null
    ) {
      pendingGuessFlight = {
        rect: pendingEl.getBoundingClientRect(),
        guess: prevPendingGuess.toUpperCase()
      };
    }
  }

  state = JSON.parse(
    JSON.stringify(newState)
  );

  /*
   * Both players submitted during the opening simultaneous
   * phase. Neither opening draft should remain in the input row.
   */
  const leftSimultaneous =
    prevPhase === "simultaneous" &&
    state.phase !== "simultaneous";

  if (leftSimultaneous) {
    localGuesserDraft = "";
    state.setterDraft = "";

    guesserDraftLocks.clear();
    setterDraftLocks.clear();

    const guesserDraftContainer =
      $("draftGuesser");

    const guesserDraftRow =
      guesserDraftContainer
        ?.__draftRows
        ?.draft;

    if (guesserDraftRow) {
      guesserDraftRow.__slidingOut = false;

      guesserDraftRow.classList.remove(
        "row-slide-out",
        "row-slide-down",
        "row-slide-in"
      );

      guesserDraftRow.style.display = "none";
    }

    if (guesserDraftContainer) {
      guesserDraftContainer
        .__guesserSubmitSlideDone = true;
    }
  }

  /*
   * Used by fix 9 below.
   */
  if (
    !wasOpeningMissLocked &&
    state.simultaneousAllWrong
  ) {
    requestAnimationFrame(() => {
      showOpeningMissLockNotice();
    });
  }
  window.powerKbSyncTurn?.();
  if ((state.history?.length ?? 0) !== prevHistoryLen) {
    // A guess/decision just finalized (or a new round started) — any
    // mid-turn power events are now baked into state.history/matchRounds,
    // so drop the live buffer to avoid showing them twice in the log.
    window._livePowerEvents = [];
  }
  if (prevPhase !== "simultaneous" && state.phase === "simultaneous") {
      const setterHistEl = $("setterGuesserSubmitted");
      const guesserHistEl = $("historyGuesser");
      // renderHistory tracks its own previous-render snapshot per
      // container now (see ui/history.js) -- clear both explicitly so a
      // fresh round starts from a clean diff instead of comparing against
      // last round's rows.
      setterHistEl.__prevRenderState = [];
      guesserHistEl.__prevRenderState = [];
      setterHistEl.innerHTML = "";
      guesserHistEl.innerHTML = "";
  }
  // Round start: announce role + goal instead of the old generic "Game
  // Started" banner. prevPhase === undefined means this is the very first
  // state this page has ever seen (fresh load/rejoin) — skip the
  // announcement then, it should only fire for a round actually starting
  // while the player is watching.
  if (prevPhase !== undefined && prevPhase !== "simultaneous" && state.phase === "simultaneous") {
    const iAmSetter = myUserId() === state.setter;
    const describePowers = ids => (ids || []).map(id => {
      const variant = state.powers?.[id]?.mode || null;
      const meta = window.getPowerMeta ? window.getPowerMeta(id, variant) : window.POWER_METADATA?.[id];
      return { emoji: meta?.emoji, label: meta?.label || id, desc: meta?.short || meta?.desc };
    });
    const guesserPowers = describePowers(state.initialPowers?.guesser);
    const questType = state.powers?.quest?.type;
    const questMeta = questType ? window.QUEST_METADATA?.[questType] : null;
    if (questMeta) {
      guesserPowers.push({
        emoji: questMeta.emoji,
        label: `Quest: ${questMeta.label}`,
        desc: questMeta.desc
      });
    }
    const powerGroups = [
      { label: "Spy", roleClass: "role-setter", powers: describePowers(state.initialPowers?.setter) },
      { label: "Inspector", roleClass: "role-guesser", powers: guesserPowers }
    ];
    window.showBigAnnounce?.({
      icon: iAmSetter ? "🕵️" : "🔍",
      title: iAmSetter ? "You are the Spy" : "You are the Inspector",
      sub: iAmSetter ? "Keep your secret hidden." : "Find the secret word.",
      powerGroups,
      roleClass: iAmSetter ? "role-setter" : "role-guesser",
      duration: 15000,
      // No-time-limit games (including Daily Challenge) have no reason to
      // rush the player through reading their powers before this vanishes
      // on its own -- let them dismiss it themselves instead.
      persistent: state.timeControl?.enabled === false
    });
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
    // Notes is a setter-only feature (see ui/setter-sidebar.js's
    // ensureNotesOpen) that nothing used to close -- left active across a
    // round-swap into guesser, it silently ate every keystroke meant for
    // the real guesser keyboard (see notes.js's closeNotes comment).
    if (newMyRole !== "setter") window.closeNotes?.();
  }
  const setterCanEdit =
  myUserId() === state.setter &&
  ((state.phase === "normal" && state.turn === state.setter && !!state.pendingGuess) ||
   (state.phase === "simultaneous" && !state.secret && !state.simultaneousSecretSubmitted));
  // history.length unchanged means this broadcast is still about the same
  // decision as before -- keep whatever the player was already typing
  // instead of snapping back to the (now stale) copy this broadcast
  // carries. A genuinely new turn/round (history.length changed) always
  // trusts the fresh broadcast instead, which matters when the server
  // itself pre-fills the draft (e.g. a "Try it" power tutorial seeding a
  // mid-match scenario) -- carrying over a leftover local value would
  // silently overwrite that pre-fill.
  const stillSameDecision = (state.history?.length ?? 0) === prevHistoryLen;
  if (setterCanEdit && stillSameDecision) {
    state.setterDraft = prevSetterDraft;
  } else if (!setterCanEdit) {
    state.setterDraft = "";
    // Locks are only meant to survive repeated rejections within the same
    // decision turn -- once that turn actually ends, stale locks from it
    // shouldn't silently carry into whatever comes next.
    setterDraftLocks.clear();
  }
  // window.roomId, not the bare roomId -- this file's `let roomId` is a
  // module-scoped shadow of window.roomId, and plenty of room-join flows
  // (invite.js's startAsyncInvite/maybeJoinPendingInvite among them) only
  // ever set window.roomId. Reading the bare variable here left this gate
  // permanently false for those flows, so PowerEngine.renderButtons()
  // never ran and the power buttons/quest badge never got created for the
  // rest of the session -- reproducibly, only fixed by a reload.
  if (!PowerEngine._initialized && window.roomId && myRole && state && state.phase !== "lobby") {
      PowerEngine.renderButtons(window.roomId);
      PowerEngine._initialized = true;
  }
  // Extra clearing after simultaneous round
  if (prevPhase !== state.phase) {stopSecretRoulette();}
  window.state = state;   
  updateRoleCards();
  updateHostControls();
  updateDevUI();
  updatePowerModeUI();
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

if (!_gameOverRevealInFlight) {
  updateSummary();
}

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
  // Quest badge shows on both screens (see quest.js's InfoBadgeEngine
  // registration), but the "+1" pop and the visual card tile are only
  // meaningful to the guesser actually working toward it -- the setter's
  // copy stays the read-only text badge.
  window.updateQuestBadge?.(state, myRole);
  if (myRole === "guesser") window.maybeShowQuestProgressPop?.(state);
  if (state.phase !== "lobby") hide("lobby");
  updateSecretLock();
  updateSetterDraftInvalidOverlay();
  window.renderActionLog?.(state, myRole);
  window.renderNotesPanel?.(state);
  if (myRole === "setter") window.updateSetterIdleExpand?.(state);
}

// Live version of submitSetterNew()'s rejection checks (dictionary +
// isConsistentWithHistory), run on every draft change instead of only
// after the setter tries to submit -- so a doomed secret is visibly
// flagged (a big red X over the draft row) the instant it's fully typed,
// not just after a failed submit. Only fires once the draft is actually
// complete (5 real letters, no Drag Mode blank placeholders) and never
// while simultaneousAllWrong already covers the row with the lock icon --
// unless Break Cover (rouletteSecret) is overriding that lock (see
// updateSecretLock), in which case a real submission is possible again and
// should get the same live validation any other new secret would.
function updateSetterDraftInvalidOverlay() {
  const overlay = $("setterDraftInvalidOverlay");
  if (!overlay) return;

  const draft = (state?.setterDraft || "").toUpperCase();
  const filledCount = draft.split("").filter(c => c && c !== " ").length;
  const complete = filledCount === 5 && !draft.includes(" ");

  let invalid = false;
  if (
    complete &&
    myRole === "setter" &&
    !state?.isTutorial &&
    (!state?.simultaneousAllWrong || state?.powers?.rouletteSecretActive)
  ) {
    const notInDictionary = window.ALLOWED_SECRETS && !window.ALLOWED_SECRETS.has(draft);
    const inconsistent =
      typeof window.isConsistentWithHistory === "function" &&
      !window.isConsistentWithHistory(state.history, draft, state);
    invalid = notInDictionary || inconsistent;
  }

  overlay.classList.toggle("hidden", !invalid);
}

function updateSecretLock() {
  const overlay = $("secretLockOverlay");
  if (!overlay) return;
  // Break Cover (rouletteSecret) forces the setter's next secret to be a
  // random new one -- it explicitly overrides this lock server-side (see
  // normal.js) rather than colliding with it, so the client shouldn't show
  // the "locked, can't submit new" state (or actually disable NewEnabled)
  // while it's in effect either.
  const overridden = !!state?.powers?.rouletteSecretActive;
  const locked = !!state?.simultaneousAllWrong && !overridden;
  overlay.classList.toggle("hidden", !locked);
  // Only cover the bottom (secret) row when the pending-guess row above it
  // is actually showing — driven from the same state.pendingGuess check
  // that decides that row's own visibility in ui/draftrow.js, instead of a
  // DOM child-count CSS selector that can't distinguish visible rows from
  // ones hidden via style.display.
  overlay.classList.toggle("split-bottom", !!state?.pendingGuess);
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
let _lastScreenPhase = null;
let _gameOverRevealInFlight = false;

function updateScreens() {
  // The "Invite a Friend" async flow leaves this room's socket connection
  // live in the background after the host has already navigated away —
  // state broadcasts (the host's own setup actions, then later the
  // friend joining/readying/playing) keep arriving the whole time. None
  // of that should force any screen back onto the host; they left on
  // purpose. Cleared when they deliberately return via My Games.
  if (window._asyncInviteRoomId && window._asyncInviteRoomId === window.roomId) {
    return;
  }

  // A disconnect since the last screens update means the player wasn't
  // necessarily watching live -- replaying the ~6s flip+popup ceremony
  // once they reconnect made the win reveal feel like it fired late
  // (because relative to the actual win, it did: it only starts once
  // they're back, however long that took). See socketClient.js's
  // "disconnect" handler for where this gets set. Consumed unconditionally
  // on every call so it only ever affects the ONE update right after
  // reconnecting, not some later round's genuine live win.
  const skipRevealForReconnect = !!window._skipNextGameOverReveal;
  window._skipNextGameOverReveal = false;

  const enteringGameOverLive =
    state.phase === "gameOver" &&
    _lastScreenPhase !== "gameOver" &&
    _lastScreenPhase !== null && // null = very first render this page has done (fresh load/rejoin) — don't replay the reveal for a round that already ended
    !skipRevealForReconnect;
  _lastScreenPhase = state.phase;

  if (enteringGameOverLive && !_gameOverRevealInFlight) {
    const history = state.history || [];
    const lastEntry = history[history.length - 1];
    const secondLastEntry = history[history.length - 2];
    // Double Tap (resolveDoubleGuess in normal.js) pushes two entries
    // together in an order that has nothing to do with which one actually
    // won (it's randomized to not leak which guess was shown to the Spy)
    // -- checking only the literal last entry misses the win whenever the
    // winning guess happened to be pushed first, silently skipping this
    // whole reveal sequence.
    const winCandidates =
      lastEntry?.doubleGuessApplied && secondLastEntry?.doubleGuessApplied
        ? [lastEntry, secondLastEntry]
        : [lastEntry];
    const winningEntry = winCandidates.find(
      e => Array.isArray(e?.fb) && e.fb.every(f => f === "🟩")
    );
    const wonByGuess = !state.timeoutLoser && !!winningEntry;

    if (wonByGuess) {
      _gameOverRevealInFlight = true;
      // Read by tutorial-ui.js so it can hold off rendering the round-
      // summary tutorial (and its highlightRoundSummary() call) until the
      // summary screen this reveal delays is actually visible, instead of
      // popping up over the still-showing game screen mid-flip.
      window._gameOverRevealInFlight = true;

      // Keep the just-finished round's screen up (instead of jumping
      // straight to the summary) so the winning row's tile-flip reveal —
      // already wired up for every history row via CSS — actually plays
      // where the player can see it.
      if (myUserId() === state.setter) {
        show("setterScreen");
        hide("guesserScreen");
        updateSetterScreen();
      } else {
        show("guesserScreen");
        hide("setterScreen");
        updateGuesserScreen();
      }

      // The tile flip has to actually finish playing before the popup
      // shows — worst case (setter's view, where the winning row also
      // slides up into place via slideRowIntoPlace before any tile can
      // start flipping): 420ms slide + 1400ms stagger to the last tile's
      // cover-flip + 650ms for that tile's own flip = 2470ms, rounded up
      // for a small buffer.
      const FLIP_TOTAL_MS = 2000;
      const POPUP_DURATION_MS = 3200;

      const iAmGuesser = myUserId() === state.guesser;
      setTimeout(() => {
        window.showBigAnnounce?.({
          icon: iAmGuesser ? "🎉" : "💀",
          title: iAmGuesser ? "You found the secret!" : "Your secret was found!",
          sub: `The word was ${(winningEntry.finalSecret || state.secret || "").toUpperCase()}.`,
          roleClass: iAmGuesser ? "outcome-win" : "outcome-lose",
          duration: POPUP_DURATION_MS
        });
      }, FLIP_TOTAL_MS);

setTimeout(() => {
  _gameOverRevealInFlight = false;
  window._gameOverRevealInFlight = false;

  updateSummary();
  updateScreens();

  if (window.state && window.myRole) {
    tutorialSteps(
      window.state,
      window.myRole
    );
  }
}, FLIP_TOTAL_MS + POPUP_DURATION_MS + 200);
      return;
    }
  }

  if (_gameOverRevealInFlight) return;

  // Daily Challenge's setup (add AI, swap to Inspector, apply the day's
  // powers, disable the timer, ready up) is scripted and briefly leaves
  // state.phase === "lobby" — showing the real multiplayer lobby for that
  // window would flash it pointlessly. Bail out before hideAllScreens()
  // even runs, so whatever daily-challenge.js is already showing (a
  // loading message) stays put until the round actually starts.
  if (window._dailyStarting) {
    if (state.phase !== "lobby") window._dailyStarting = false;
    else return;
  }

  // Quick Play -> Play AI (see socket-events.js's _startQuickAI): same
  // "scripted setup briefly leaves state.phase === lobby" situation as
  // Daily Challenge above, same fix -- keep whatever screen is already up
  // (the difficulty picker) instead of flashing the real lobby UI.
  if (window._quickAiStarting) {
    if (state.phase !== "lobby") window._quickAiStarting = false;
    else return;
  }

  // Tutorial setup (add AI, switch roles, ready up) goes through the same
  // scripted "briefly leaves state.phase === lobby" window as the two
  // cases above -- same fix, so the lobby UI never flashes on the way in.
  if (window._tutorialStarting) {
    if (state.phase !== "lobby") window._tutorialStarting = false;
    else return;
  }

  hideAllScreens();
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
  if (state.phase === "draft") {
    enterMenuMode();
    show("draftScreen");
    hide("menu");
    hide("setterScreen");
    hide("guesserScreen");
    if (!myUserId()) {
      // renderDraftScreen looks up this player's own candidates/picks by
      // uid (state.draftCandidates[myUserId()]) — rendering it with no uid
      // yet resolved silently produces an empty, unclickable screen
      // instead of an error, and nothing here would ever prompt a retry on
      // its own. Try again shortly rather than leaving it stuck until some
      // unrelated state update (e.g. the other player picking) happens to
      // re-render it, or the player refreshes the page.
      setTimeout(() => { if (state?.phase === "draft") updateScreens(); }, 150);
      return;
    }
    window.renderDraftScreen?.(state);
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
  // NORMAL PHASE — decision step (respond to the pending guess by keeping the
  // current secret or switching to a new consistent word).
  else if (state.phase === "normal") {
    const canDecide = isDecisionStep;
    setterInputEnabled = canDecide;
    KeepEnabled=canDecide;
    NewEnabled=canDecide;
    setTurn("setterScreen", canDecide);
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
const historyRender = renderHistory({
  state,
  container: $("setterGuesserSubmitted"),
  role: "setter",
  autoScroll: !pendingGuessFlight,
  deferRevealWord:
    pendingGuessFlight?.guess || ""
})
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

  if (typeof renderSetterLetterProfileBox === "function") {
    renderSetterLetterProfileBox(state.setterLetterProfile || null);
  }

  if (typeof renderSetterMustContainBox === "function") {
    const greenLetters = new Set(
      (state.constraintData?.grid || [])
        .map(cell => cell?.green)
        .filter(Boolean)
    );
    renderSetterMustContainBox(state.constraintData?.mustContain, state.setterDraft, greenLetters);
  }

  if (myUserId() === state.setter) {
    renderKeyboard({
    state,
    container: $("keyboardSetter"),
    // displayGuess (not the raw state.pendingGuess) so Sneaky Guess's
    // "?????" masking actually holds -- this drives the keyboard's
    // key-current highlight, which was leaking every letter of the
    // hidden guess even while the draft row itself correctly stayed
    // blanked out.
    pendingGuess: displayGuess || "",
    isGuesser: false,
    onInput: handleSetterInput
  });
  }
  updateSetterPreview();
 resolvePendingGuessFlight(
  historyRender?.addedElements || []
);
 }
function historyRowWord(wrap) {
  return [
    ...wrap.querySelectorAll(".tile-letter")
  ]
    .map(el => el.textContent || "")
    .join("");
}

function startHistoryRowReveal(wrap) {
  if (!wrap) return;

  wrap.style.visibility = "";

  wrap.classList.remove(
    "row-enter",
    "reveal-waiting"
  );

  if (
    typeof window.revealHistoryRow ===
    "function"
  ) {
    window.revealHistoryRow(wrap);
  } else {
    wrap.querySelectorAll(
      ".history-tile-cover"
    ).forEach(el => el.remove());
  }
}

function resolvePendingGuessFlight(
  addedElements = []
) {
  if (!pendingGuessFlight) return;

  const capture = pendingGuessFlight;
  pendingGuessFlight = null;

  const container =
    $("setterGuesserSubmitted");

  const candidates =
    addedElements.length
      ? addedElements
      : [
          ...(container?.children || [])
        ].slice(-2);

  const target = candidates.find(
    row =>
      historyRowWord(row) === capture.guess
  );

  if (!container || !target) {
    container
      ?.querySelectorAll(".reveal-waiting")
      .forEach(startHistoryRowReveal);

    if (container) {
      container.scrollTop =
        container.scrollHeight;
    }

    return;
  }

  slideRowIntoPlace(
    target,
    capture.rect
  );
}

function slideRowIntoPlace(
  newRow,
  startRect
) {
  const scrollBox =
    newRow.closest(".history-scroll");

  const visualRow =
    newRow.querySelector(".history-row");

  if (
    !scrollBox ||
    !visualRow ||
    !startRect?.width ||
    !startRect?.height
  ) {
    startHistoryRowReveal(newRow);
    return;
  }

  newRow.classList.remove("row-enter");

  scrollBox.scrollTop =
    scrollBox.scrollHeight;

  const endRect =
    visualRow.getBoundingClientRect();

  if (!endRect.width || !endRect.height) {
    startHistoryRowReveal(newRow);
    return;
  }

  if (
    window.matchMedia?.(
      "(prefers-reduced-motion: reduce)"
    ).matches
  ) {
    startHistoryRowReveal(newRow);
    return;
  }

  document
    .querySelectorAll(
      ".history-flight-clone"
    )
    .forEach(el => el.remove());

  const flight =
    visualRow.cloneNode(true);

  flight.classList.add(
    "history-flight-clone"
  );

  flight.setAttribute(
    "aria-hidden",
    "true"
  );

  flight.querySelectorAll(
    ".history-tile-cover"
  ).forEach(el => el.remove());

  const sourceTiles =
    visualRow.querySelectorAll(
      ":scope > .history-tile"
    );

  const flightTiles =
    flight.querySelectorAll(
      ":scope > .history-tile"
    );

  sourceTiles.forEach(
    (source, index) => {
      const clone = flightTiles[index];
      if (!clone) return;

      const rect =
        source.getBoundingClientRect();

      const style =
        getComputedStyle(source);

      Object.assign(clone.style, {
        width: `${rect.width}px`,
        height: `${rect.height}px`,
        flex: `0 0 ${rect.width}px`,
        fontSize: style.fontSize,
        fontFamily: style.fontFamily,
        fontWeight: style.fontWeight,
        lineHeight: style.lineHeight,
        borderRadius: style.borderRadius,
        letterSpacing: style.letterSpacing
      });
    }
  );

  const rowStyle =
    getComputedStyle(visualRow);

  Object.assign(flight.style, {
    position: "fixed",
    left: `${endRect.left}px`,
    top: `${endRect.top}px`,
    width: `${endRect.width}px`,
    height: `${endRect.height}px`,
    gap: rowStyle.gap,
    margin: "0",
    zIndex: "100000",
    pointerEvents: "none",
    transformOrigin: "center center",
    willChange: "transform"
  });

  document.body.appendChild(flight);

  newRow.style.visibility = "hidden";

  const dx =
    startRect.left +
    startRect.width / 2 -
    (
      endRect.left +
      endRect.width / 2
    );

  const dy =
    startRect.top +
    startRect.height / 2 -
    (
      endRect.top +
      endRect.height / 2
    );

  const scaleX =
    startRect.width / endRect.width;

  const scaleY =
    startRect.height / endRect.height;

  flight.style.transform =
    `translate3d(${dx}px, ${dy}px, 0) ` +
    `scale(${scaleX}, ${scaleY})`;

  void flight.offsetWidth;

  let finished = false;
  let safetyTimer = null;

  const land = () => {
    if (finished) return;

    finished = true;
    clearTimeout(safetyTimer);

    flight.remove();
    startHistoryRowReveal(newRow);
  };

  requestAnimationFrame(() => {
    flight.style.transition =
      "transform 460ms " +
      "cubic-bezier(0.22, 1, 0.36, 1)";

    flight.style.transform =
      "translate3d(0, 0, 0) " +
      "scale(1, 1)";

    flight.addEventListener(
      "transitionend",
      event => {
        if (
          event.propertyName ===
          "transform"
        ) {
          land();
        }
      },
      { once: true }
    );

    safetyTimer =
      setTimeout(land, 650);
  });
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
  // Drag Mode and locked tiles can leave the draft filled out of order
  // (e.g. only position 3 filled) -- "complete"/"empty" have to be judged
  // by how many real letters are present, not by raw string length, which
  // is always 5 the moment any position has ever been touched (padded
  // with spaces for the rest).
  const filledCount = typed.split("").filter(c => c && c !== " ").length;
  let fb, isIncomplete = false;
  if (filledCount === 5 && !typed.includes(" ")) {
    fb = predictFeedback(typed, guess);
  } else if (filledCount === 0) {
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
// Ranks the three preview colors so a keystroke that pushes a tile UP
// (gray->yellow, gray->green, yellow->green) can be told apart from one
// that leaves it unchanged in kind or downgrades it — only an upgrade
// gets the little "hit" animation below.
const PREVIEW_COLOR_RANK = { "preview-gray": 0, "preview-yellow": 1, "preview-green": 2 };
const PREVIEW_HIT_DURATION_MS = { "tile-hit-yellow": 450, "tile-hit-green": 550 };
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

    // A keystroke just pushed this tile's color UP — give it a little
    // jump (yellow) or a bigger jump + shake (green) so typing a hit
    // *feels* like something, not just a color swap noticed after the
    // fact. A tile's very first-ever color assignment (current.length
    // === 0 -- right after a fresh pending guess appears and
    // clearSetterPreview() wiped every class) only skips the jump when it
    // settles on gray -- that's just the row settling into an
    // uninteresting baseline, not something worth celebrating. But if a
    // tile is *already* green/yellow the instant the row appears (the
    // current secret happens to already match there), that's a genuinely
    // informative baseline and deserves the same jump any other tile gets
    // when it turns that color later -- otherwise whichever tile(s)
    // happen to start pre-solved silently never get to play the
    // animation at all, while every other tile does.
    {
      const oldColor = current.find(c => c !== "preview-incomplete");
      const oldRank = current.length > 0 ? (PREVIEW_COLOR_RANK[oldColor] ?? 0) : -1;
      const newRank = PREVIEW_COLOR_RANK[colorClass] ?? 0;

      if (newRank > oldRank) {
        const hitClass =
          colorClass === "preview-green" ? "tile-hit-green" :
          colorClass === "preview-yellow" ? "tile-hit-yellow" :
          null;

        if (hitClass) {
          tile.classList.remove("tile-hit-yellow", "tile-hit-green");
          void tile.offsetWidth; // restart if a previous hit is still mid-animation
          tile.classList.add(hitClass);
          setTimeout(
            () => tile.classList.remove(hitClass),
            PREVIEW_HIT_DURATION_MS[hitClass]
          );
        }
      }
    }

    tile.classList.remove(...PREVIEW_CLASSES);
    tile.classList.add(...desired);
  });
}
///SETTER INPUT
function emitSetterDraftPreview(draft) {
  if (!socket || !roomId || myUserId() !== state.setter) return;
  socket.emit("setterDraftSecret", {roomId, draft});
}

// Draft tile locks (Drag Mode: click a filled tile to lock it) -- indices
// currently protected from BACKSPACE and clearSetterDraft(). Deliberately
// not synced to the server or reset by every render; only cleared when a
// fresh decision turn begins (see the setterCanEdit branch in
// onStateUpdate) so locks survive repeated rejections within the same
// turn, which is the whole point of locking a letter down.
let setterDraftLocks = new Set();
function isSetterDraftIndexLocked(index) {
  return setterDraftLocks.has(index);
}
window.isSetterDraftIndexLocked = isSetterDraftIndexLocked;
function toggleSetterDraftLock(index) {
  if (!Number.isInteger(index) || index < 0 || index > 4) return;
  const chars = (state.setterDraft || "").padEnd(5, " ").split("");
  if (chars[index] === " ") return; // nothing there to lock
  if (setterDraftLocks.has(index)) setterDraftLocks.delete(index);
  else setterDraftLocks.add(index);
  updateUI();
}
window.toggleSetterDraftLock = toggleSetterDraftLock;

// A rejected secret (bad word, inconsistent with history, too similar to
// the assassin word, or a server-side rejection that slipped past the
// client checks) shouldn't leave the setter to backspace through five
// dead letters by hand -- wipe the draft everywhere it's shown, except
// any letters they've explicitly locked in place.
function clearSetterDraft() {
  const chars = (state.setterDraft || "").padEnd(5, " ").split("");
  for (let i = 0; i < 5; i++) {
    if (!setterDraftLocks.has(i)) chars[i] = " ";
  }
  const next = chars.join("");
  // Nothing locked (the common case) -- collapse back to a clean "" like
  // before, instead of leaving a row of invisible spaces around.
  state.setterDraft = next.trim() === "" ? "" : next;
  emitSetterDraftPreview(state.setterDraft);
  window.clearNotesDraft?.();
  updateUI();
}
// Shared by handleSetterInput (typing) and setSetterDraftLetterAt (Drag
// Mode) -- both need to know whether the setter actually has a live draft
// to edit right now.
function canSetterEditDraftNow() {
  if (
  state.powers?.freezeActive ||
  state.powers?.rouletteSecretActive ||
  isOpeningMissSecretLocked()
) {
  return false;
}
  const isNormalSetterTurn =
    myUserId() === state.setter &&
    state.phase === "normal" &&
    state.turn === state.setter &&
    !!state.pendingGuess;
  const isSimultaneousSecretEntry =
    state.phase === "simultaneous" &&
    !state.secret &&
    !state.simultaneousSecretSubmitted;
  return isNormalSetterTurn || isSimultaneousSecretEntry;
}
// Drag Mode (see drag-mode.js): drops a letter at a specific tile
// position instead of appending it to the end like typing does. Unfilled
// positions to its left are padded with a space -- draftrow.js already
// renders a lone space the same as an empty tile, and submitSetterNew
// rejects a draft still containing one the same way it rejects an
// incomplete typed draft.
function setSetterDraftLetterAt(index, letter) {
  if (!Number.isInteger(index) || index < 0 || index > 4) return;
  if (!/^[A-Z]$/.test(letter)) return;
  if (!canSetterEditDraftNow()) return;
  if (
  isOpeningMissSecretLocked()
) {
  shakeDraftRow("setter");
  showOpeningMissLockNotice();
  return;
}
  const chars = (state.setterDraft || "").padEnd(5, " ").split("");
  chars[index] = letter;
  state.setterDraft = chars.join("");
  // The letter that was here is gone -- a stale lock on it would be
  // misleading, and re-locking the new letter is a deliberate action the
  // user can take again if they want it protected.
  setterDraftLocks.delete(index);
  updateUI();
  emitSetterDraftPreview(state.setterDraft);
}
window.setSetterDraftLetterAt = setSetterDraftLetterAt;

// Drag Mode tile-to-tile: relocates the letter at `from` to `to`,
// overwriting whatever was at `to` and leaving `from` blank -- a move, not
// a copy. Both endpoints lose any existing lock for the same reason
// setSetterDraftLetterAt does.
function moveSetterDraftLetter(from, to) {
  if (!Number.isInteger(from) || from < 0 || from > 4) return;
  if (!Number.isInteger(to) || to < 0 || to > 4) return;
  if (from === to) return;
  if (!canSetterEditDraftNow()) return;
    if (
    isOpeningMissSecretLocked()
  ) {
    shakeDraftRow("setter");
    showOpeningMissLockNotice();
    return;
}
  const chars = (state.setterDraft || "").padEnd(5, " ").split("");
  const letter = chars[from];
  if (letter === " ") return; // nothing to move

  chars[to] = letter;
  chars[from] = " ";
  state.setterDraft = chars.join("");
  setterDraftLocks.delete(from);
  setterDraftLocks.delete(to);
  updateUI();
  emitSetterDraftPreview(state.setterDraft);
}
window.moveSetterDraftLetter = moveSetterDraftLetter;

// Drag Mode, guesser side -- same mechanics as the setter's own draft tile
// locks/drag above, just operating on localGuesserDraft (a plain local
// variable, not synced state) instead of state.setterDraft.
let guesserDraftLocks = new Set();
function isGuesserDraftIndexLocked(index) {
  return guesserDraftLocks.has(index);
}
window.isGuesserDraftIndexLocked = isGuesserDraftIndexLocked;
function toggleGuesserDraftLock(index) {
  if (!Number.isInteger(index) || index < 0 || index > 4) return;
  const chars = (localGuesserDraft || "").padEnd(5, " ").split("");
  if (chars[index] === " ") return; // nothing there to lock
  if (guesserDraftLocks.has(index)) guesserDraftLocks.delete(index);
  else guesserDraftLocks.add(index);
  renderGuesserDraftOnly();
}
window.toggleGuesserDraftLock = toggleGuesserDraftLock;

// Mirrors canSetterEditDraftNow -- handleGuesserInput's own guard is just
// "!state.pendingGuess" (a submitted guess awaiting the setter's response),
// so that's the whole check here too.
function canGuesserEditDraftNow() {
  return myUserId() === state.guesser && !state.pendingGuess;
}

function setGuesserDraftLetterAt(index, letter) {
  if (!Number.isInteger(index) || index < 0 || index > 4) return;
  if (!/^[A-Z]$/.test(letter)) return;
  if (!canGuesserEditDraftNow()) return;

  const chars = (localGuesserDraft || "").padEnd(5, " ").split("");
  chars[index] = letter;
  guesserDraftLocks.delete(index);
  window.setGuesserDraft(chars.join(""));
}
window.setGuesserDraftLetterAt = setGuesserDraftLetterAt;

function moveGuesserDraftLetter(from, to) {
  if (!Number.isInteger(from) || from < 0 || from > 4) return;
  if (!Number.isInteger(to) || to < 0 || to > 4) return;
  if (from === to) return;
  if (!canGuesserEditDraftNow()) return;

  const chars = (localGuesserDraft || "").padEnd(5, " ").split("");
  const letter = chars[from];
  if (letter === " ") return; // nothing to move

  chars[to] = letter;
  chars[from] = " ";
  guesserDraftLocks.delete(from);
  guesserDraftLocks.delete(to);
  window.setGuesserDraft(chars.join(""));
}
window.moveGuesserDraftLetter = moveGuesserDraftLetter;

function handleSetterInput(event) {
  if (window.isNotesActive?.() && window.notesInput?.(event)) return;
  // Hide Evidence / Reset Letter: intercept the next keyboard tap while
  // armed, same interception shape power-keyboard.js uses for the
  // guesser's Recon Sweep / Double Tap.
  if (window.hideTileKbActive?.() && window.hideTileKbInput?.(event)) return;
  if (
  isOpeningMissSecretLocked()
) {
  if (
    event.type === "LETTER" ||
    event.type === "BACKSPACE"
  ) {
    shakeDraftRow("setter");
    showOpeningMissLockNotice();
    return;
  }

  /*
   * If stale letters somehow remain, clear them. A blank
   * Enter can continue through to SET_SECRET_SAME.
   */
  if (
    event.type === "ENTER" &&
    (
      state.setterDraft ||
      ""
    ).trim()
  ) {
    state.setterDraft = "";
    setterDraftLocks.clear();

    emitSetterDraftPreview("");
    updateUI();

    shakeDraftRow("setter");
    showOpeningMissLockNotice();

    return;
  }
}
  // Freeze/roulette deliberately skip only the typing block below and
  // fall through to the ENTER handling further down (e.g. so "keep same
  // secret" still works while frozen) -- canSetterEditDraftNow() can't be
  // reused for this outer guard since it also folds in that same
  // freeze/roulette check.
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

    // Position-based (not append/pop-last) so it plays nicely with Drag
    // Mode's tile fills and locked tiles, which can leave gaps anywhere,
    // not just at the end.
    if (event.type === "BACKSPACE") {
      const chars = draft.padEnd(5, " ").split("");
      for (let i = 4; i >= 0; i--) {
        if (chars[i] !== " " && !setterDraftLocks.has(i)) {
          chars[i] = " ";
          break;
        }
      }
      const next = chars.join("");
      state.setterDraft = next.trim() === "" ? "" : next;
      updateUI();
      emitSetterDraftPreview(state.setterDraft);
      if (!state.setterDraft) window.notifyTutorialDraftCleared?.();
      return;
    }

    if (event.type === "LETTER") {
      const chars = draft.padEnd(5, " ").split("");
      const idx = chars.indexOf(" ");
      if (idx !== -1) {
        chars[idx] = event.value;
        state.setterDraft = chars.join("");
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

        // Only clear the ephemeral submit-flow UI if this actually reached
        // the server -- sendGameAction silently no-ops (returns false)
        // while genuinely disconnected, and clearing here regardless used
        // to make the screen look like a normal successful submit even
        // though nothing was sent, with no way to tell the two apart until
        // the next action mysteriously failed.
        if (
          !sendGameAction(
            {
              type:
                "SET_SECRET_SAME"
            },
            result => {
              if (!result?.ok) {
                return;
              }

              resetEphemeralUIState();
              updateUI();
            }
          )
        ) {
          return;
        }

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
  // A space is Drag Mode's "not filled at this position yet" placeholder
  // (see setSetterDraftLetterAt) -- a draft still holding one is exactly
  // as incomplete as a too-short typed draft.
  if (w.length !== 5 || w.includes(" ")) {
    shakeDraftRow("setter");
    toast("5 letters!");
    return;
  }
  if (state?.powers?.assassinWord) {
    const assassin = state.powers.assassinWord.toUpperCase();
    if (countPositionalDifferences(w, assassin) < 2) {
      shakeDraftRow("setter");
      toast("Too similar to assassin word (needs 2 or more different letters)");
      clearSetterDraft();
      window.notifyTutorialRejectedSecret?.();
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
    clearSetterDraft();
    window.notifyTutorialRejectedSecret?.();
    return;
  }
  if (state.isTutorial && state.history.length < state.scriptedTurns) {
    const expected = state.tutorialSecrets[state.history.length];
    if (w !== expected) {
      shakeDraftRow("setter");
      toast(`Type in ${expected}`);
      window.notifyTutorialRejectedSecret?.();
      return;
    }
  }
  if (typeof window.isConsistentWithHistory === "function" && !window.isConsistentWithHistory(state.history, w, state)) {
    shakeDraftRow("setter");
    //Check violations
    const violations = findConsistencyViolations(state.history, w);
    const { secretIndices } = violations;
    if (secretIndices.size > 0) {
      flashConsistencyViolations(secretIndices);
    }
    const reasons = typeof explainSecretInconsistency === "function"
      ? explainSecretInconsistency(state.history, state.extraConstraints, w)
      : [];
    window.showBigAnnounce?.({
      icon: "🚫",
      title: "Not consistent with prior feedback",
      sub: reasons.length ? reasons.slice(0, 2) : ["Doesn't match the clues given so far."],
      roleClass: "role-setter",
      duration: 2200,
      compact: true
    });
    // The PICKY tutorial demo leaves the rejected word in place on purpose,
    // so the very next step can walk the player through clearing it by
    // hand with Backspace instead of finding it already gone.
    if (window.tutorialKeepRejectedDraft) {
      window.tutorialKeepRejectedDraft = false;
    } else {
      clearSetterDraft();
    }
    window.notifyTutorialRejectedSecret?.();
    return;
  }
  if (window.isRejoining) {
    toast("Reconnecting...");
    return;
  }
  // Same reasoning as the SET_SECRET_SAME branch above: don't wipe the
  // draft the player just typed unless it actually reached the server.
  if (
    !sendGameAction(
      {
        type: "SET_SECRET_NEW",
        secret: w
      },
      result => {
        if (!result?.ok) {
          return;
        }

        stopSecretRoulette();

        state.setterDraft = "";

        resetEphemeralUIState();
        updateUI();
      }
    )
  ) {
    return;
  }
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
if (typeof renderGuesserRemainingBox === "function") {
  renderGuesserRemainingBox(state.guesserRemainingBox || { visible: false });
}
if (typeof renderGuesserLetterProfileBox === "function") {
  renderGuesserLetterProfileBox(state.powers?.letterProfileGuesserStat || null);
}
if (state?.powers?.wiretapActive) {
  // Populate the live tap for the current draft (e.g. right after activating).
  window.emitWiretapDraft?.(localGuesserDraft);
}
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
  // Recon Sweep / Double Tap capture keystrokes on the on-screen keyboard
  // when armed, so their entry stays on the coloured keyboard (no modal).
  if (window.powerKbActive?.() && window.powerKbInput?.(event)) return;
  if (state.pendingGuess) return;

  // Position-based (not append/pop-last), same reasoning as
  // handleSetterInput -- Drag Mode's tile fills and locked tiles can leave
  // gaps anywhere, not just at the end.
  if (event.type === "BACKSPACE") {
    const chars = (localGuesserDraft || "").padEnd(5, " ").split("");
    for (let i = 4; i >= 0; i--) {
      if (chars[i] !== " " && !guesserDraftLocks.has(i)) {
        chars[i] = " ";
        break;
      }
    }
    const next = chars.join("");
    localGuesserDraft = next.trim() === "" ? "" : next;
    renderGuesserDraftOnly();
    return;
  }

  if (event.type === "LETTER") {
    const chars = (localGuesserDraft || "").padEnd(5, " ").split("");
    const idx = chars.indexOf(" ");
    if (idx !== -1) {
      chars[idx] = event.value;
      localGuesserDraft = chars.join("");
      renderGuesserDraftOnly();
    }
    return;
  }
  const g = localGuesserDraft.toUpperCase();
  if (event.type === "ENTER") {
      // A space is Drag Mode's "not filled at this position yet"
      // placeholder (see setGuesserDraftLetterAt) -- a draft still holding
      // one is exactly as incomplete as a too-short typed draft.
      if (g.length !== 5 || g.includes(" ")) {
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
    // This is the exact bug behind "type a guess, submit, get a bogus '5
    // letters!' error, have to reload": sendGameAction silently no-ops
    // (returns false) while genuinely disconnected, but this used to clear
    // the draft unconditionally right after calling it regardless of
    // whether the guess actually reached the server. The screen then
    // looked completely normal -- an empty, ready-to-type draft, same as
    // after any real successful submit -- while the server never got
    // anything and still expected the original guess. The next real
    // attempt hit the plain length check on an already-emptied draft.
    if (
      !sendGameAction(
        {
          type: "SUBMIT_GUESS",
          guess: g
        },
result => {
  if (!result?.ok) {
    return;
  }

  localGuesserDraft = "";
  guesserDraftLocks.clear();

  resetEphemeralUIState();
  updateUI();
}
      )
    ) {
      return;
    }
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
  // One instance in the outer app-header (menus) plus one duplicated into
  // each of setter/guesser's own headers (see index.html) -- all three
  // share this class and stay in sync via it, rather than moving a single
  // element between screens on every switch.
  const btns = document.querySelectorAll(".guide-toggle-btn:not(.keyboard-toggle-btn)");
  if (!btns.length) return;

  // Load saved preference (default: on)
  const stored = localStorage.getItem("guideActive");
  const guideOn = stored === null ? true : stored === "true";

  document.body.classList.toggle("guide-on", guideOn);
  btns.forEach(b => b.classList.toggle("active", guideOn));

  btns.forEach(btn => { btn.onclick = () => {
    const isOn = document.body.classList.toggle("guide-on");
    localStorage.setItem("guideActive", isOn);
    btns.forEach(b => b.classList.toggle("active", isOn));
    updateGuideBanner();

    // The must-contain box is guide-mode-only (hidden entirely when guide
    // is off) — without an explicit re-render here it wouldn't appear/
    // disappear until the next natural render (next keystroke or state
    // update).
    if (typeof renderSetterMustContainBox === "function" && window.state) {
      const greenLetters = new Set(
        (window.state.constraintData?.grid || [])
          .map(cell => cell?.green)
          .filter(Boolean)
      );
      renderSetterMustContainBox(
        window.state.constraintData?.mustContain,
        window.state.setterDraft,
        greenLetters
      );
    }
    // The Letter Profile box's header title is also guide-mode-only --
    // same reasoning: re-render both copies immediately instead of
    // waiting for the next natural state update to pick up the toggle.
    if (typeof renderSetterLetterProfileBox === "function" && window.state) {
      renderSetterLetterProfileBox(window.state.setterLetterProfile || null);
    }
    if (typeof renderGuesserLetterProfileBox === "function" && window.state) {
      renderGuesserLetterProfileBox(window.state.powers?.letterProfileGuesserStat || null);
    }
  }; });
})();

// Physical keyboard toggle (desktop-only, see .keyboard-toggle-btn's
// pointer:coarse media query hiding it on touch screens) -- opt-in
// (default off) since a stray keypress while just reading the board
// shouldn't start typing a guess/secret. When on, routes real keydown
// events through the exact same handleSetterInput/handleGuesserInput
// functions the on-screen keyboard already uses (see keyboard.js's
// onInput contract), so every existing guard in those functions (whose
// turn it is, Notes mode, Recon Sweep/Double Tap's power-keyboard
// capture, Drag Mode locks, tutorial scripting, ...) applies identically
// -- nothing here needs to know about any of that itself.
(function setupPhysicalKeyboard() {
  // One instance in the outer app-header (menus) plus one duplicated into
  // each of setter/guesser's own headers -- see setupGuideToggle's comment
  // above for why these stay as separate elements kept in sync by class
  // rather than one element moved between screens.
  const btns = document.querySelectorAll(".keyboard-toggle-btn");
  if (!btns.length) return;

  const stored = localStorage.getItem("physicalKeyboardActive");
  const keyboardOn = stored === "true"; // default: off

  document.body.classList.toggle("physical-keyboard-on", keyboardOn);
  btns.forEach(b => b.classList.toggle("active", keyboardOn));

  btns.forEach(btn => { btn.onclick = () => {
    const isOn = document.body.classList.toggle("physical-keyboard-on");
    localStorage.setItem("physicalKeyboardActive", isOn);
    btns.forEach(b => b.classList.toggle("active", isOn));
  }; });

  document.addEventListener("keydown", (e) => {
    if (!document.body.classList.contains("physical-keyboard-on")) return;
    if (!state) return;

    // Never hijack typing into a real text field (room code, chat, notes
    // textarea if it's ever a native one, account forms, ...) or a
    // keyboard shortcut the browser/OS already owns (Cmd/Ctrl+R, etc.).
    const tag = document.activeElement?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    let event;
    if (/^[a-zA-Z]$/.test(e.key)) {
      event = { type: "LETTER", value: e.key.toUpperCase() };
    } else if (e.key === "Backspace") {
      event = { type: "BACKSPACE" };
    } else if (e.key === "Enter") {
      event = { type: "ENTER" };
    } else {
      return;
    }

    const myId = myUserId();
    if (myId && myId === state.setter) {
      e.preventDefault();
      handleSetterInput(event);
    } else if (myId && myId === state.guesser) {
      e.preventDefault();
      handleGuesserInput(event);
    }
  });
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
        ? "Guess submitted — waiting for the Spy's secret."
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
          : "Waiting for the Inspector to submit a guess."
      };
    }
    const isGuessTurn = state.turn === state.guesser;
    return {
      phase: "Guessing Round",
      task: isGuessTurn
        ? "Your turn: submit a guess."
        : "Waiting for the Spy to decide whether to keep or change the secret."
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

// Analog-watch time control: hour position + legend text for each pickable
// preset ("deep" stays hidden from the dial, same as the old list UI).
const TIMER_CLOCK_INFO = {
  bullet: { icon: "🚀", label: "Bullet", desc: "90 secs / round", angle: 60 },
  blitz: { icon: "⚡", label: "Blitz", desc: "3 min / round", angle: 180 },
  none: { icon: "♾️", label: "Unlimited", desc: "No time limit", angle: 270 }
};

function updateTimerClockVisual(preset) {
  const info = TIMER_CLOCK_INFO[preset];

  const hand = $("timerClockHand");
  if (hand && info) {
    hand.style.setProperty("--hand-angle", `${info.angle}deg`);
  }

  const legend = $("timerClockLegend");
  if (legend) {
    legend.textContent = info
      ? `${info.icon} ${info.label} — ${info.desc}`
      : "Choose a time control";
  }
}

function updateTimerPresetUI() {
  if (!state?.timeControl) return;

  const preset = state.timeControl.preset || "none";

  document
    .querySelectorAll('input[name="timePreset"]')
    .forEach(radio => {
      radio.checked = radio.value === preset;
    });

  updateTimerClockVisual(preset);
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
      updateTimerClockVisual(v);

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

// Ranked screen's own timer-preset clock -- visually identical to the
// casual lobby's dial above, but a separate radio group/ids
// (rankedTimePreset) since this picks a preset for a room that doesn't
// exist yet rather than live-editing one already in progress: picking a
// marker here just updates the dial + legend, and playRankedBtn's click
// handler (play-menu.js) reads whichever radio is checked when it actually
// queues for a match.
function updateRankedTimerClockVisual(preset) {
  const info = TIMER_CLOCK_INFO[preset];

  const hand = $("rankedTimerClockHand");
  if (hand && info) {
    hand.style.setProperty("--hand-angle", `${info.angle}deg`);
  }

  const legend = $("rankedTimerClockLegend");
  if (legend) {
    legend.textContent = info
      ? `${info.icon} ${info.label} — ${info.desc}`
      : "Choose a time control";
  }
}
window.updateRankedTimerClockVisual = updateRankedTimerClockVisual;

document
  .querySelectorAll('input[name="rankedTimePreset"]')
  .forEach(radio => {
    radio.addEventListener("change", () => {
      if (radio.checked) updateRankedTimerClockVisual(radio.value);
    });
  });

updateRankedTimerClockVisual(
  document.querySelector('input[name="rankedTimePreset"]:checked')?.value || "blitz"
);

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

  // Wiretap live tap: while active, feed the current draft to the server so
  // it can report how many secrets would remain if this guess were made.
  if (state?.powers?.wiretapActive) {
    window.emitWiretapDraft?.(localGuesserDraft);
  }
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
  // Each screen (menu app-header, setter, guesser) now carries its own
  // .header-role-badge instance instead of sharing one global element in
  // the outer app-header -- only ever one is actually visible at a time
  // (its screen is .active), but updating every instance keeps whichever
  // one that is correct without needing to know which screen is showing.
  const roleBadgeEls = document.querySelectorAll(".header-role-badge");
  if (!state || !roleBadgeEls.length) return;

  if (roomCodeEl) roomCodeEl.textContent = state.roomCode || "";

  // Spy/Inspector duplicated what the screen title + tile colors already
  // show. A running score reads at a glance and is actually new
  // information — how many guesses each of you has needed so far.
  if (state.phase === "gameOver" || state.phase === "lobby") {
    roleBadgeEls.forEach(el => {
      el.textContent = "";
      el.className = "role-badge header-role-badge";
    });
    return;
  }

  const myId = myUserId();
  const opponentId = Object.keys(state.players || {}).find(id => id !== myId);
  const { points } = computeMatchResult(state, myId);
  let myPoints = points[myId] || 0;
  let oppPoints = opponentId ? points[opponentId] || 0 : 0;

  // computeMatchResult only tallies *completed* rounds — add the current
  // round's live guess count (resets to 0 each round, +1 per guess) to
  // whichever player is this round's Spy, the same way a completed
  // round's points are scored, so the score counts up in real time.
  if (typeof state.guessCount === "number") {
    if (state.setter === myId) myPoints += state.guessCount;
    else if (state.setter === opponentId) oppPoints += state.guessCount;
  }

  // Small YOU/OPP captions above each number -- the bright/dim color
  // distinction alone wasn't enough for at-a-glance clarity, so this
  // spells it out too, the same pattern the adjacent timer block already
  // uses for its own YOU/OPP labels.
  const html = `<span class="score-you"><span class="score-label">You</span>${myPoints}</span><span class="score-sep">–</span><span class="score-opp"><span class="score-label">Opp</span>${oppPoints}</span>`;
  roleBadgeEls.forEach(el => {
    el.innerHTML = html;
    el.className = "role-badge header-role-badge";
  });
}

// A "+1" that floats up from whichever score number just incremented, so a
// submitted guess reads as an event instead of only a silently-updated
// number. Appended to <body> (not inside the score badge itself) since
// updateAppHeader() rebuilds the badge's innerHTML on every state update,
// which would otherwise wipe the pop mid-animation. Scoped to the active
// screen since .header-role-badge now has one instance per screen and
// only the visible one has a meaningful bounding rect to float up from.
function showScorePop(isMe) {
  const cls = isMe ? ".score-you" : ".score-opp";
  const target = document.querySelector(`.screen.active ${cls}`) || document.querySelector(cls);
  if (!target) return;

  const rect = target.getBoundingClientRect();
  const pop = document.createElement("span");
  pop.className = "score-pop";
  pop.textContent = "+1";
  pop.style.left = `${rect.left + rect.width / 2}px`;
  pop.style.top = `${rect.top}px`;
  document.body.appendChild(pop);
  pop.addEventListener("animationend", () => pop.remove(), { once: true });
}
window.showScorePop = showScorePop;

// "Nice! +X more words" that floats up from the setter's remaining-words
// box when they change their secret to one that leaves strictly more
// words still possible than keeping the old one would have -- a reward
// nudge for actively throwing the guesser off instead of always keeping.
// Same append-to-body / animationend-cleanup pattern as showScorePop above
// (the box's innerHTML gets fully rebuilt on the next state update, which
// would otherwise cut the animation short).
const SECRET_REWARD_TIERS = [
  { min: 1, labels: ["Nice!", "Good job!"] },
  { min: 10, labels: ["Well done!", "Nice move!"] },
  { min: 30, labels: ["Great pick!", "Well played!"] },
  { min: 75, labels: ["Amazing!", "Awesome!"] }
];

function showSecretChangeRewardPop(diff) {
  if (!(diff > 0)) return;

  const anchor = document.getElementById("SetterRemainingBox");
  if (!anchor || anchor.hidden) return;

  let labels = SECRET_REWARD_TIERS[0].labels;
  for (const tier of SECRET_REWARD_TIERS) {
    if (diff >= tier.min) labels = tier.labels;
  }
  const label = labels[Math.floor(Math.random() * labels.length)];

  const rect = anchor.getBoundingClientRect();
  const pop = document.createElement("span");
  pop.className = "secret-reward-pop";
  pop.textContent = `${label} +${diff.toLocaleString()} more words`;
  pop.style.left = `${rect.left + rect.width / 2}px`;
  pop.style.top = `${rect.top}px`;
  document.body.appendChild(pop);
  pop.addEventListener("animationend", () => pop.remove(), { once: true });
}
window.showSecretChangeRewardPop = showSecretChangeRewardPop;

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
    // "My Games" whenever the player wants to resume it. clearRoom() only
    // wipes local state though -- the socket itself stayed subscribed to
    // the room, so the next server-side broadcast (e.g. an AI opponent's
    // autonomous move) still landed here and silently pulled the player
    // right back into the live game. Force a disconnect/reconnect so this
    // behaves the same as actually closing the tab (the case it's meant
    // to substitute for) -- the server's own "disconnect" handler already
    // does the right thing (pauses the room, doesn't remove the player)
    // without a real navigation away.
    clearRoom();
    socket.disconnect();
    socket.connect();
  });
});
