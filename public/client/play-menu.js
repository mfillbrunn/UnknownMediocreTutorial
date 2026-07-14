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
  createRoom({ userId: window.currentUser.id, name: username }, resp => {
    if (!resp.ok) {
      toast(resp.error || "Could not start game");
      return;
    }
    roomId = resp.roomId;
    persistRoom(roomId);
    enterLobbyAfterJoin();
  });
}

function runLastPlayMode(last) {
  if (!last || !last.mode) {
    showScreen("playScreen");
    return;
  }
  if (last.mode === "friend") {
    startPlayFriend();
    return;
  }
  if (last.mode === "ai") {
    window._startVsAI?.(last.difficulty || 1);
    return;
  }
  if (last.mode === "ranked") {
    startRankedQueue(last.preset || "blitz");
    return;
  }
  showScreen("playScreen");
}

$("playMainBtn")?.addEventListener("click", () => {
  if (!requireAuth("play")) return;
  showScreen("playScreen");
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
      showScreen("playScreen");
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
  const preset = $("rankedSpeedSelect")?.value || "blitz";
  startRankedQueue(preset);
});

$("rankedCancelBtn")?.addEventListener("click", () => {
  cancelRankedQueue();
  showScreen("playScreen");
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
// How to Play (rules + power library + tutorial launch, combined)
// -----------------------------------------------------
$("howToPlayBtn")?.addEventListener("click", () => {
  renderPowerLibrary();
  showScreen("howToPlayScreen");
});

function renderPowerLibrary() {
  const list = $("powerLibraryList");
  if (!list) return;

  const sections = { setter: [], guesser: [] };

  for (const id in (window.POWER_METADATA || {})) {
    const meta = window.POWER_METADATA[id];
    if (!meta) continue;
    const role = window.PowerEngine?.powers?.[id]?.role || "guesser";

    const row = document.createElement("div");
    row.className = `power-info-row power-lib-row-${role}`;
    row.innerHTML = `
      <span class="power-info-emoji">${meta.emoji || "⚡"}</span>
      <div class="power-info-body">
        <div class="power-info-title">${meta.label}</div>
        <div class="power-info-desc">${meta.desc || ""}</div>
      </div>
    `;
    sections[role]?.push(row);
  }

  list.innerHTML = "";

  const spyHeader = document.createElement("div");
  spyHeader.className = "power-info-section power-info-header-setter";
  spyHeader.textContent = "Spy Powers";
  list.appendChild(spyHeader);
  sections.setter.forEach(r => list.appendChild(r));

  const inspectorHeader = document.createElement("div");
  inspectorHeader.className = "power-info-section power-info-header-guesser";
  inspectorHeader.textContent = "Inspector Powers";
  list.appendChild(inspectorHeader);
  sections.guesser.forEach(r => list.appendChild(r));
}
