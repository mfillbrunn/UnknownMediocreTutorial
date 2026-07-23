// client/play-menu.js — Play submenu, split "quick repeat" button, ranked
// matchmaking UI, Rules screen, and Power Library screen.

// -----------------------------------------------------
// Last-chosen play mode (drives the split button's quick-repeat half)
// -----------------------------------------------------
window.rememberLastPlayMode = function (mode) {
  try {
    localStorage.setItem("lastPlayMode", JSON.stringify(mode));
  } catch {}
};

function getLastPlayMode() {
  try {
    return JSON.parse(localStorage.getItem("lastPlayMode") || "null");
  } catch {
    return null;
  }
}

function startPlayFriend() {
  window.rememberLastPlayMode({ mode: "friend" });
  const username =
    window.myProfile?.username || window.currentUser?.email || "Player";
  // Developer > Play's "Dev Mode" checkbox: read it before createRoom's
  // callback fires, since #playScreen (and the checkbox on it) may already
  // be hidden by the time the server responds.
  const wantsDevMode = !!$("devModeCheckbox")?.checked;
  createRoom({ userId: window.currentUser.id, name: username }, resp => {
    if (!resp.ok) {
      toast(resp.error || "Could not start game");
      return;
    }
    roomId = resp.roomId;
    persistRoom(roomId);
    // SET_DEV_MODE toggles state.devMode server-side (it starts false on a
    // fresh room) -- updateDevUI() picks up the resulting broadcast and
    // opens the power picker modal itself, same as manually toggling Dev
    // used to before its lobby button was removed.
    if (wantsDevMode) {
      sendGameAction({ type: "SET_DEV_MODE", userId: window.currentUser.id });
    }
    enterLobbyAfterJoin();
  });
}

// Quick Play -> "Play Human": join whatever open room is waiting, or (per
// the server's quickJoin handler) create a fresh one if none is. Shared by
// the new top-level quickPlayHumanBtn and the older #playScreen's
// quickJoinBtn (Developer > Play), so both stay in sync with one
// implementation instead of two copies of the same socket call.
function startQuickPlayHuman() {
  if (!requireAuth("quick play")) return;
  window.rememberLastPlayMode({ mode: "quickHuman" });

  const username =
    window.myProfile?.username || window.currentUser?.email || "Player";

  quickJoin({ userId: window.currentUser.id, name: username }, resp => {
    if (!resp.ok) return toast(resp.error);
    roomId = resp.roomId;
    persistRoom(roomId);
    enterLobbyAfterJoin();
  });
}
window.startQuickPlayHuman = startQuickPlayHuman;

function runLastPlayMode(last) {
  if (!last || !last.mode) {
    showScreen("quickPlayScreen");
    return;
  }
  if (last.mode === "quickHuman") {
    startQuickPlayHuman();
    return;
  }
  if (last.mode === "quickAi") {
    window._startQuickAI?.(last.difficulty || 1);
    return;
  }
  if (last.mode === "friend") {
    window.startAsyncInvite?.();
    return;
  }
  if (last.mode === "ai") {
    // Legacy value from before the Quick Play split -- still replay it the
    // same way so an existing localStorage entry doesn't just dead-end.
    window._startVsAI?.(last.difficulty || 1);
    return;
  }
  if (last.mode === "ranked") {
    startRankedQueue(last.preset || "blitz");
    return;
  }
  showScreen("quickPlayScreen");
}

$("quickPlayBtn")?.addEventListener("click", () => {
  if (!requireAuth("play")) return;
  showScreen("quickPlayScreen");
});

$("quickPlayHumanBtn")?.addEventListener("click", startQuickPlayHuman);

$("quickPlayAiBtn")?.addEventListener("click", () => {
  if (!requireAuth("play vs AI")) return;
  showScreen("quickPlayAiScreen");
});

$("playFriendMainBtn")?.addEventListener("click", () => {
  window.startAsyncInvite?.();
});

$("rankedMenuBtn")?.addEventListener("click", () => {
  if (!requireAuth("play ranked")) return;
  showScreen("rankedPlayScreen");
});

$("playQuickBtn")?.addEventListener("click", () => {
  if (!requireAuth("play")) return;
  runLastPlayMode(getLastPlayMode());
});

$("playFriendBtn")?.addEventListener("click", () => {
  if (!requireAuth("play a friend")) return;
  startPlayFriend();
});

// -----------------------------------------------------
// Ranked matchmaking
// -----------------------------------------------------
const RANKED_PRESET_LABELS = {
  bullet: "Bullet",
  blitz: "Blitz",
  deep: "Deep",
  none: "No Time"
};

function startRankedQueue(preset) {
  window.rememberLastPlayMode({ mode: "ranked", preset });
  window._rankedMatching = true;

  showScreen("rankedWaitingScreen");
  $("rankedSearchSpinner")?.classList.remove("hidden");
  const waitingText = $("rankedWaitingText");
  const countdownText = $("rankedCountdownText");
  if (waitingText) {
    waitingText.textContent = `Searching for a player (${RANKED_PRESET_LABELS[preset] || preset})…`;
    waitingText.classList.remove("hidden");
  }
  countdownText?.classList.add("hidden");

  window.rankedQueueJoin(preset, resp => {
    if (!resp?.ok) {
      toast(resp?.error || "Could not join ranked queue");
      cancelRankedQueue();
      showScreen("rankedPlayScreen");
    }
  });
}

function cancelRankedQueue() {
  window._rankedMatching = false;
  window.rankedQueueCancel?.();
  clearInterval(window._rankedCountdownTimer);
}

$("playRankedBtn")?.addEventListener("click", () => {
  if (!requireAuth("play ranked")) return;
  const preset =
    document.querySelector('input[name="rankedTimePreset"]:checked')?.value || "blitz";
  startRankedQueue(preset);
});

$("rankedCancelBtn")?.addEventListener("click", () => {
  cancelRankedQueue();
  showScreen("rankedPlayScreen");
});

window.onRankedMatchFound?.(({ roomId: matchedRoomId }) => {
  if (!matchedRoomId) return;

  roomId = matchedRoomId;
  window.roomId = matchedRoomId;
  persistRoom(matchedRoomId);

  $("rankedSearchSpinner")?.classList.add("hidden");
  const waitingText = $("rankedWaitingText");
  const countdownText = $("rankedCountdownText");
  if (waitingText) waitingText.textContent = "Opponent found!";
  countdownText?.classList.remove("hidden");

  let n = 3;
  const tick = () => {
    if (countdownText) countdownText.textContent = `Starting in ${n}…`;
    n--;
    if (n < 0) clearInterval(window._rankedCountdownTimer);
  };
  tick();
  clearInterval(window._rankedCountdownTimer);
  window._rankedCountdownTimer = setInterval(tick, 1000);
});

// -----------------------------------------------------
// How to Play hub (Tutorial / Rules / Powers)
// -----------------------------------------------------
$("howToPlayBtn")?.addEventListener("click", () => {
  showScreen("howToPlayScreen");
});

$("showRulesBtn")?.addEventListener("click", () => {
  showScreen("rulesScreen");
});

// Advanced Tutorial: launches a scripted interactive match (see
// socket-events.js's startFreshTutorial("advanced")) rather than showing a
// static screen -- same pattern as the Tutorial / Tutorial: Powers buttons.

// Mirrors the SETTER_POWERS/GUESSER_POWERS pools in
// server/core/phases/lobby.js — kept in sync manually, same as every other
// client/server power-pool duplication in this codebase (see also
// client/dev-powers.js). Only powers actually offered by random/draft mode
// belong in this reference screen — revealLetter and fieldReport moved to
// the always-on Quest system, and assassinWord/letterLockout are disabled
// from random/draft pools, so none of the four show up here anymore.
const POWER_LIB_SETTER_POWERS = [
  "hideTile", "suggestSecret", "confuseColors", "countOnly", "blindSpot",
  "vowelRefresh", "blindGuess", "fakeFeedback",
  "delayedIntel", "forceTimer"
];
const POWER_LIB_GUESSER_POWERS = [
  "suggestGuess", "rouletteSecret", "revealHistory",
  "stealthGuess", "revealGreen", "freezeSecret", "nonsense",
  "letterProbe", "revealLocation",
  "letterProfile"
];

// Preview batch for the per-power "Try it" tutorial (one setter power,
// one guesser power) -- see server/core/modes/tutorialMode.js's stage
// "power" and public/client/tutorial-ui.js's runPowerTutorial. Expand
// this list as more powers get their own tutorial wired up.
const POWER_TUTORIAL_AVAILABLE = new Set(["hideTile", "revealGreen"]);

let _powerLibTab = "setter";

$("showPowersBtn")?.addEventListener("click", () => {
  _powerLibTab = "setter";
  document.querySelectorAll(".power-lib-tab").forEach(b => {
    b.classList.toggle("active", b.dataset.powerLibTab === _powerLibTab);
  });
  renderPowerLibrary();
  showScreen("powersScreen");
});

document.querySelectorAll(".power-lib-tab").forEach(btn => {
  btn.addEventListener("click", () => {
    _powerLibTab = btn.dataset.powerLibTab;
    document.querySelectorAll(".power-lib-tab").forEach(b => {
      b.classList.toggle("active", b.dataset.powerLibTab === _powerLibTab);
    });
    renderPowerLibrary();
  });
});

// Powers with multiple mutually-exclusive unlock conditions (e.g. Reveal
// Letter's Row/Rare/Alpha/Doubles/Chain) pack every variant's description
// into one line-broken list here, since this reference screen is the only
// place all of them are shown together — everywhere else (in-game info,
// draft candidates) shows at most the one condition that's actually live.
function describePowerLibraryEntry(meta) {
  const variantKeys = meta.variants ? Object.keys(meta.variants) : [];
  if (!variantKeys.length) return meta.desc || "";

  const lines = [];
  if (meta.desc) lines.push(meta.desc);
  for (const key of variantKeys) {
    const v = meta.variants[key];
    lines.push(`<strong>${v.label}:</strong> ${v.desc}`);
  }
  return lines.join("<br><br>");
}

function renderPowerLibrary() {
  const list = $("powerLibraryList");
  if (!list) return;
  list.innerHTML = "";

  if (_powerLibTab === "quests") {
    for (const id in (window.QUEST_METADATA || {})) {
      const meta = window.QUEST_METADATA[id];
      if (!meta) continue;
      const examplesHtml = Array.isArray(meta.examples) && meta.examples.length
        ? `<div class="power-lib-quest-examples">e.g. ${meta.examples.join(" → ")}</div>`
        : "";
      const row = document.createElement("div");
      row.className = "power-info-row power-lib-row-guesser";
      row.innerHTML = `
        <span class="power-info-emoji">${meta.emoji || "🎯"}</span>
        <div class="power-info-body">
          <div class="power-info-title">${meta.label}</div>
          <div class="power-info-desc">${meta.desc || ""}</div>
          ${examplesHtml}
        </div>
      `;
      list.appendChild(row);
    }
    return;
  }

  const ids = _powerLibTab === "guesser" ? POWER_LIB_GUESSER_POWERS : POWER_LIB_SETTER_POWERS;
  const role = _powerLibTab === "guesser" ? "guesser" : "setter";

  for (const id of ids) {
    const meta = window.POWER_METADATA?.[id];
    if (!meta) continue;

    const row = document.createElement("div");
    row.className = `power-info-row power-lib-row-${role}`;
    const tryItBtn = POWER_TUTORIAL_AVAILABLE.has(id)
      ? `<button class="power-lib-try-btn" data-try-power="${id}" title="Try ${meta.label} in a short interactive tutorial">▶ Try it</button>`
      : "";
    row.innerHTML = `
      <span class="power-info-emoji">${meta.emoji || "⚡"}</span>
      <div class="power-info-body">
        <div class="power-info-title">${meta.label}</div>
        <div class="power-info-desc">${describePowerLibraryEntry(meta)}</div>
      </div>
      ${tryItBtn}
    `;
    list.appendChild(row);
  }

  list.querySelectorAll("[data-try-power]").forEach(btn => {
    btn.addEventListener("click", () => {
      window.startPowerTutorial?.(btn.dataset.tryPower);
    });
  });
}
