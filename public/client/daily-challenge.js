// client/daily-challenge.js

// Same navigator.share() -> clipboard fallback -> toast pattern as
// invite.js's shareOrCopyInviteLink, just with a Wordle-style result
// summary instead of a join link.
async function _shareDailyResult(config, r) {
  const outcome = r.tie ? "Tied" : r.won ? "Won" : "Lost";
  const text = [
    `Vowel Play — Daily Challenge ${config.date}`,
    `Score: ${r.score}:${r.opponentScore ?? 0} (${formatDailyTime(r.time)}) — ${outcome}`,
    location.origin
  ].join("\n");

  if (navigator.share) {
    try {
      await navigator.share({ title: "Vowel Play Daily Challenge", text });
      return;
    } catch { /* user cancelled or share failed — fall through to copy */ }
  }

  try {
    await navigator.clipboard.writeText(text);
    toast("Result copied to clipboard");
  } catch {
    toast("Could not copy result");
  }
}

function formatDailyTime(totalSeconds) {
  const secs = Math.round(totalSeconds || 0);
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

window.showDailyChallenge = async function () {
  if (!window.currentUser) return toast("Please log in first");

  showScreen("dailyScreen");
  const screen = document.getElementById("dailyScreen");
  if (!screen) return;

  screen.innerHTML = `<div class="menu-center"><p class="daily-date">Loading…</p></div>`;

  let config;
  try {
    config = await fetch("/api/daily").then(r => r.json());
  } catch {
    screen.innerHTML = `<div class="menu-center">
      <p>Could not load daily challenge.</p>
      <button class="menu-btn" onclick="showStartup()">Back</button>
    </div>`;
    return;
  }

  const status = await new Promise(resolve => {
    socket.emit(
      "getDailyStatus",
      { userId: window.currentUser.id, date: config.date },
      resolve
    );
  });

  if (status?.status === "completed") {
    const r = status.result;

    // Abandoning a started daily room (My Games > Abandon) counts as
    // "already played" too -- markDailyAbandoned() records this instead
    // of a real score, since there's no result to show or share.
    if (r?.abandoned) {
      screen.innerHTML = `<div class="menu-center">
        <h2 class="menu-title">Daily Challenge</h2>
        <p class="daily-date">☀️ ${config.date}</p>
        <p class="daily-completed-msg">
          You already played today's challenge and abandoned it. Come back tomorrow!
        </p>
        <button class="menu-btn" onclick="showStartup()">Back</button>
      </div>`;
      return;
    }

    const resultBlock = r
      ? `<div class="daily-result-block">
          <div class="daily-result-row">
            <span class="daily-result-label">Score</span>
            <span class="daily-result-value">${r.score}:${r.opponentScore ?? 0}</span>
          </div>
          <div class="daily-result-row">
            <span class="daily-result-label">Time</span>
            <span class="daily-result-value">${formatDailyTime(r.time)}</span>
          </div>
          <p class="daily-result-outcome">${r.tie ? "It was a tie!" : r.won ? "You won! 🎉" : "You lost this one."}</p>
          <button id="shareDailyBtn" class="menu-btn primary small" style="margin-top:8px">Share Result 📤</button>
        </div>`
      : "";

    screen.innerHTML = `<div class="menu-center">
      <h2 class="menu-title">Daily Challenge</h2>
      <p class="daily-date">☀️ ${config.date}</p>
      <p class="daily-completed-msg">
        You've already played today's challenge. Come back tomorrow!
      </p>
      ${resultBlock}
      <button class="menu-btn" onclick="showStartup()">Back</button>
    </div>`;

    if (r) {
      document.getElementById("shareDailyBtn")?.addEventListener("click", () => {
        _shareDailyResult(config, r);
      });
    }
    return;
  }

  if (status?.status === "in-progress" && status.roomId) {
    _resumeDailyGame(status.roomId);
    return;
  }

  const spyPills = (config.setterPowers || []).map(p => {
    const m = window.POWER_METADATA?.[p];
    return `<span class="daily-power-pill spy">${m?.emoji || ""} ${m?.label || p}</span>`;
  }).join("");

  const insPills = (config.guesserPowers || []).map(p => {
    const m = window.POWER_METADATA?.[p];
    return `<span class="daily-power-pill inspector">${m?.emoji || ""} ${m?.label || p}</span>`;
  }).join("");

  const questMeta = config.questType ? window.QUEST_METADATA?.[config.questType] : null;
  const questPill = questMeta
    ? `<span class="daily-power-pill quest">${questMeta.emoji || "🎯"} ${questMeta.label}</span>`
    : "";

  const diffLabels = { 1: "🤖 Beginner", 2: "🧠 The Thinker", 3: "🔥 The Sneak" };
  const diffLabel  = diffLabels[config.aiDifficulty] || "AI";

  screen.innerHTML = `
    <div class="menu-center">
      <h2 class="menu-title">Daily Challenge</h2>
      <p class="daily-date">☀️ ${config.date}</p>

      <div class="daily-powers-block">
        <div class="daily-powers-row">
          <span class="daily-role-label spy">Spy</span>
          <div class="daily-powers">${spyPills || "<span style='opacity:.4'>—</span>"}</div>
        </div>
        <div class="daily-powers-row">
          <span class="daily-role-label inspector">Inspector</span>
          <div class="daily-powers">${insPills || "<span style='opacity:.4'>—</span>"}</div>
        </div>
        <div class="daily-powers-row">
          <span class="daily-role-label inspector">Quest</span>
          <div class="daily-powers">${questPill || "<span style='opacity:.4'>—</span>"}</div>
        </div>
      </div>

      <p class="daily-ai-label">vs ${diffLabel}</p>

      <button id="startDailyBtn" class="menu-btn primary" style="margin-top:8px">
        Play Today's Challenge
      </button>
      <button class="menu-btn" onclick="showStartup()">Back</button>
    </div>
  `;

  document.getElementById("startDailyBtn")?.addEventListener("click", () => {
    _startDailyGame(config);
  });
};

function _startDailyGame(config) {
  const username = window.myProfile?.username || window.currentUser?.email || "Player";

  // The whole setup (adding the AI, swapping to Inspector, applying the
  // day's powers, disabling the timer, marking ready) is a scripted
  // sequence with no real "waiting for another player" step — showing the
  // normal multiplayer lobby for the ~150ms it takes to land would just
  // flash it on screen for no reason. Suppress it; updateScreens() skips
  // the lobby UI while this is set, until the round actually starts.
  window._dailyStarting = true;

  socket.emit("createRoom", { userId: window.currentUser.id, name: username }, resp => {
    if (!resp?.ok) {
      window._dailyStarting = false;
      return toast(resp?.error || "Could not create room");
    }

    window.roomId = resp.roomId;
    persistRoom(resp.roomId);

    sendGameAction({ type: "ADD_AI", difficulty: config.aiDifficulty, userId: window.currentUser.id });

    setTimeout(() => {
      sendGameAction({ type: "SWITCH_ROLES", userId: window.currentUser.id });
    }, 40);

    setTimeout(() => {
      sendGameAction({
        type: "SET_DAILY_POWERS",
        setterPowers: config.setterPowers,
        guesserPowers: config.guesserPowers,
        date: config.date,
        userId: window.currentUser.id
      });
    }, 80);

    // Daily Challenge always runs with no time limit.
    setTimeout(() => {
      sendGameAction({ type: "SET_TIME_CONTROL", enabled: false, userId: window.currentUser.id });
    }, 110);

    setTimeout(() => {
      sendGameAction({ type: "PLAYER_READY", userId: window.currentUser.id, mode: "daily" });
    }, 150);

    // Not enterLobbyAfterJoin() — that shows the multiplayer lobby screen,
    // which is exactly the flash this is avoiding. Stay on dailyScreen
    // (with a loading message) until the round starts; updateScreens()
    // picks up the transition once the server state moves off "lobby".
    window.isRejoining = false;
    const screenEl = document.getElementById("dailyScreen");
    if (screenEl) {
      screenEl.innerHTML = `<div class="menu-center"><p class="daily-date">Starting today's challenge…</p></div>`;
    }
  });
}

// Rejoin an in-progress daily-challenge room instead of starting a new one
// (e.g. the player left mid-game and came back later the same day).
function _resumeDailyGame(targetRoomId) {
  const username = window.myProfile?.username || window.currentUser?.email || "Player";

  // Not just window.roomId — see the identical fix in my-games.js's
  // _resumeMyGame for why the plain global binding matters too.
  roomId = targetRoomId;
  window.roomId = targetRoomId;
  persistRoom(targetRoomId);

  socket.emit(
    "joinRoom",
    { roomId: targetRoomId, userId: window.currentUser.id, name: username },
    res => {
      if (!res?.ok) {
        toast(res?.error || "Could not resume today's challenge");
        showStartup();
        return;
      }
      roomId = res.roomId || targetRoomId;
      window.roomId = res.roomId || targetRoomId;
      onRejoinUI();
    }
  );
}
