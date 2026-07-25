// client/daily-challenge.js

// Same navigator.share() -> clipboard fallback -> toast pattern as
// invite.js's shareOrCopyInviteLink, just with a Wordle-style result
// summary instead of a join link.
async function _shareDailyResult(config, r) {
  const outcome = r.tie ? "Tied" : r.won ? "Won" : "Lost";
  const diffLabel = r.difficulty ? ` vs ${dailyDifficultyMeta(r.difficulty).label} AI` : "";
  const text = [
    `Vowel Play — Daily Challenge ${config.date}`,
    `Score: ${r.score}:${r.opponentScore ?? 0} (${formatDailyTime(r.time)}) — ${outcome}${diffLabel}`,
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

// AI difficulty (1 Easy / 2 Medium / 3 Hard) -> label + a color used both
// as the completed-result chip and (see the ranking subtab) the dot next to
// each entry. Kept in sync with index.html's difficulty-easy/-medium/-hard
// button classes and the daily difficulty picker.
const DAILY_DIFFICULTY = {
  1: { label: "Easy", color: "#22c55e" },
  2: { label: "Medium", color: "#f59e0b" },
  3: { label: "Hard", color: "#ef4444" }
};
function dailyDifficultyMeta(difficulty) {
  return DAILY_DIFFICULTY[difficulty] || { label: "AI", color: "#9ca3af" };
}
window.dailyDifficultyMeta = dailyDifficultyMeta;

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
      <div class="screen-back-header">
        <button class="menu-btn screen-back-btn" onclick="showStartup()">← Back</button>
      </div>
      <p>Could not load daily challenge.</p>
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
        <div class="screen-back-header">
          <button class="menu-btn screen-back-btn" onclick="showStartup()">← Back</button>
          <h2 class="menu-title" style="flex:1;text-align:center">Daily Challenge</h2>
        </div>
        <p class="daily-date">☀️ ${config.date}</p>
        <p class="daily-completed-msg">
          You already played today's challenge and abandoned it. Come back tomorrow!
        </p>
      </div>`;
      return;
    }

    const diffMeta = r?.difficulty ? dailyDifficultyMeta(r.difficulty) : null;
    const difficultyRow = diffMeta
      ? `<div class="daily-result-row">
            <span class="daily-result-label">Opponent</span>
            <span class="daily-result-value">
              <span class="daily-diff-dot" style="background:${diffMeta.color}"></span>${diffMeta.label} AI
            </span>
          </div>`
      : "";

    const resultBlock = r
      ? `<div class="daily-result-block">
          <p class="daily-result-outcome big">${r.tie ? "It was a tie!" : r.won ? "You won! 🎉" : "You lost this one."}</p>
          <div class="daily-result-row">
            <span class="daily-result-label">Score</span>
            <span class="daily-result-value">${r.score}:${r.opponentScore ?? 0}</span>
          </div>
          <div class="daily-result-row">
            <span class="daily-result-label">Time</span>
            <span class="daily-result-value">${formatDailyTime(r.time)}</span>
          </div>
          ${difficultyRow}
          <div class="daily-result-actions">
            <button id="dailyRankingsBtn" class="menu-btn small">🏆 Rankings</button>
            <button id="shareDailyBtn" class="menu-btn primary small">Share Result 📤</button>
          </div>
        </div>`
      : `<div class="daily-result-actions">
          <button id="dailyRankingsBtn" class="menu-btn small">🏆 Rankings</button>
        </div>`;

    screen.innerHTML = `<div class="menu-center">
      <div class="screen-back-header">
        <button class="menu-btn screen-back-btn" onclick="showStartup()">← Back</button>
        <h2 class="menu-title" style="flex:1;text-align:center">Daily Challenge</h2>
      </div>
      <p class="daily-date">☀️ ${config.date}</p>
      <p class="daily-completed-msg">
        You've already played today's challenge. Come back tomorrow!
      </p>
      ${resultBlock}
    </div>`;

    if (r) {
      document.getElementById("shareDailyBtn")?.addEventListener("click", () => {
        _shareDailyResult(config, r);
      });
    }
    document.getElementById("dailyRankingsBtn")?.addEventListener("click", () => {
      _showDailyRankings(config);
    });
    return;
  }

  if (status?.status === "in-progress" && status.roomId) {
    _resumeDailyGame(status.roomId);
    return;
  }

  // Each pill doubles as a tap target for its own description -- same
  // popup used for "power used" announcements elsewhere (showPowerPopup),
  // so a player can check what a power/quest actually does before ever
  // starting the match, without needing to visit the separate Powers
  // screen. Looked up by id on click rather than baking the description
  // into a data-attribute, so there's no HTML-escaping to get wrong.
  const spyPills = (config.setterPowers || []).map(p => {
    const m = window.POWER_METADATA?.[p];
    return `<span class="daily-power-pill spy daily-pill-info" data-power="${p}">${m?.emoji || ""} ${m?.label || p} <span class="daily-pill-info-icon">ⓘ</span></span>`;
  }).join("");

  const insPills = (config.guesserPowers || []).map(p => {
    const m = window.POWER_METADATA?.[p];
    return `<span class="daily-power-pill inspector daily-pill-info" data-power="${p}">${m?.emoji || ""} ${m?.label || p} <span class="daily-pill-info-icon">ⓘ</span></span>`;
  }).join("");

  const questMeta = config.questType ? window.QUEST_METADATA?.[config.questType] : null;
  const questPill = questMeta
    ? `<span class="daily-power-pill quest daily-pill-info" data-quest="${config.questType}">${questMeta.emoji || "🎯"} ${questMeta.label} <span class="daily-pill-info-icon">ⓘ</span></span>`
    : "";

  screen.innerHTML = `
    <div class="menu-center">
      <div class="screen-back-header">
        <button class="menu-btn screen-back-btn" onclick="showStartup()">← Back</button>
        <h2 class="menu-title" style="flex:1;text-align:center">Daily Challenge</h2>
      </div>
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
        ${questPill ? `
        <div class="daily-powers-row">
          <span class="daily-role-label quest">Quest</span>
          <div class="daily-powers">${questPill}</div>
        </div>` : ""}
      </div>

      <p class="daily-ai-label">Choose your opponent</p>
      <div class="daily-difficulty-row">
        <button class="menu-btn difficulty-easy" data-difficulty="1">Easy</button>
        <button class="menu-btn difficulty-medium" data-difficulty="2">Medium</button>
        <button class="menu-btn difficulty-hard" data-difficulty="3">Hard</button>
      </div>
      <button id="dailyRankingsBtn" class="menu-btn small" style="margin-top:14px">🏆 Rankings</button>
    </div>
  `;

  screen.querySelectorAll("[data-difficulty]").forEach(btn => {
    btn.addEventListener("click", () => {
      _startDailyGame(config, Number(btn.dataset.difficulty));
    });
  });
  document.getElementById("dailyRankingsBtn")?.addEventListener("click", () => {
    _showDailyRankings(config);
  });

  screen.querySelectorAll(".daily-pill-info").forEach(pill => {
    pill.addEventListener("click", () => {
      const powerId = pill.dataset.power;
      const meta = powerId
        ? window.POWER_METADATA?.[powerId]
        : window.QUEST_METADATA?.[pill.dataset.quest];
      if (!meta) return;
      window.showPowerPopup?.({
        emoji: meta.emoji || (powerId ? "⚡" : "🎯"),
        title: powerId ? meta.label : `Quest: ${meta.label}`,
        desc: meta.desc
      });
    });
  });
};

// Daily rankings subtab: everyone who has played today, sorted best-first
// (higher score, then faster time), each with a colored dot for the AI
// difficulty they beat. Toggle between All and Friends. Reads the
// daily_results Supabase table (written server-side on completion, see
// gameOver.js); degrades to a friendly message if the table is missing or
// nobody has played yet.
let _dailyRankScope = "all";

async function _showDailyRankings(config) {
  const screen = document.getElementById("dailyScreen");
  if (!screen) return;

  screen.innerHTML = `<div class="menu-center">
    <div class="screen-back-header">
      <button id="dailyRankBackBtn" class="menu-btn screen-back-btn">← Back</button>
      <h2 class="menu-title" style="flex:1;text-align:center">Daily Rankings</h2>
    </div>
    <p class="daily-date">☀️ ${config.date}</p>
    <div class="daily-rank-tabs">
      <button class="daily-rank-tab ${_dailyRankScope === "all" ? "active" : ""}" data-scope="all">All</button>
      <button class="daily-rank-tab ${_dailyRankScope === "friends" ? "active" : ""}" data-scope="friends">Friends</button>
    </div>
    <div class="daily-rank-legend">
      <span><span class="daily-diff-dot" style="background:${DAILY_DIFFICULTY[1].color}"></span>Easy</span>
      <span><span class="daily-diff-dot" style="background:${DAILY_DIFFICULTY[2].color}"></span>Medium</span>
      <span><span class="daily-diff-dot" style="background:${DAILY_DIFFICULTY[3].color}"></span>Hard</span>
    </div>
    <div id="dailyRankList" class="daily-rank-list"><p class="daily-rank-msg">Loading…</p></div>
  </div>`;

  document.getElementById("dailyRankBackBtn")?.addEventListener("click", () => {
    window.showDailyChallenge?.();
  });
  screen.querySelectorAll(".daily-rank-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      _dailyRankScope = tab.dataset.scope;
      _showDailyRankings(config);
    });
  });

  const listEl = document.getElementById("dailyRankList");
  const sb = window.supabaseClient;
  if (!sb) {
    listEl.innerHTML = `<p class="daily-rank-msg">Rankings aren't available right now.</p>`;
    return;
  }

  let rows;
  try {
    const { data, error } = await sb
      .from("daily_results")
      .select("user_id, date, score, opponent_score, time_seconds, won, tie, difficulty")
      .eq("date", config.date);
    if (error) throw error;
    // Belt-and-suspenders re-check on top of the .eq() above -- a stale
    // row (e.g. an old onConflict upsert mismatch, or a date column that
    // doesn't compare the way .eq() assumes) should never be able to slip
    // a previous day's score into today's board.
    rows = (data || []).filter(r => r.date === config.date);
  } catch (e) {
    console.error("[daily rankings] read failed:", e?.message || e);
    listEl.innerHTML = `<p class="daily-rank-msg">Rankings aren't available yet.</p>`;
    return;
  }

  // Friends filter (always keep yourself in view).
  if (_dailyRankScope === "friends") {
    let friendIds = new Set();
    try {
      const friends = (await window._fetchFriends?.(window.currentUser?.id)) || [];
      friendIds = new Set(friends.map(f => f.id));
    } catch { /* fall through with just self */ }
    friendIds.add(window.currentUser?.id);
    rows = rows.filter(r => friendIds.has(r.user_id));
  }

  if (!rows.length) {
    listEl.innerHTML = `<p class="daily-rank-msg">${
      _dailyRankScope === "friends"
        ? "No friends have played today yet."
        : "No one has played today's challenge yet."
    }</p>`;
    return;
  }

  // Attach usernames (separate lookup so we don't depend on a FK embed).
  let names = {};
  try {
    const ids = [...new Set(rows.map(r => r.user_id))];
    const { data: profs } = await sb.from("profiles").select("id, username").in("id", ids);
    (profs || []).forEach(p => { names[p.id] = p.username; });
  } catch { /* usernames optional */ }

  // Points: how many guesses the AI needed to crack your secret (r.score,
  // credited to you as setter) minus how many guesses you needed to crack
  // the AI's (r.opponent_score, credited to the AI as setter) -- higher
  // means you were both a tougher setter and a sharper guesser than your
  // opponent that day.
  const pointsOf = r => (r.score ?? 0) - (r.opponent_score ?? 0);

  // Points desc, then harder-difficulty-first (beating a tougher AI at the
  // same point total is the better result), then faster time.
  rows.sort((a, b) =>
    (pointsOf(b) - pointsOf(a)) ||
    ((b.difficulty ?? 0) - (a.difficulty ?? 0)) ||
    ((a.time_seconds ?? 1e9) - (b.time_seconds ?? 1e9))
  );

  const myId = window.currentUser?.id;
  const header = `
    <div class="daily-rank-row daily-rank-header">
      <span class="daily-rank-pos">#</span>
      <span class="daily-rank-name">Player</span>
      <span class="daily-rank-points">Points</span>
      <span class="daily-rank-diff">Diff</span>
      <span class="daily-rank-time">Time</span>
    </div>`;
  listEl.innerHTML = header + rows.map((r, i) => {
    const diff = dailyDifficultyMeta(r.difficulty);
    const name = names[r.user_id] || (r.user_id === myId ? "You" : "Player");
    const isMe = r.user_id === myId;
    const points = pointsOf(r);
    return `
      <div class="daily-rank-row ${isMe ? "me" : ""}">
        <span class="daily-rank-pos">${i + 1}</span>
        <span class="daily-rank-name">${name}${isMe ? " (you)" : ""}</span>
        <span class="daily-rank-points">${points > 0 ? "+" : ""}${points}</span>
        <span class="daily-rank-diff">
          <span class="daily-diff-dot" style="background:${diff.color}" title="${diff.label} AI"></span>
        </span>
        <span class="daily-rank-time">${formatDailyTime(r.time_seconds)}</span>
      </div>`;
  }).join("");
}
window._showDailyRankings = _showDailyRankings;

// difficulty: player's choice from the three buttons above -- overrides
// config.aiDifficulty, the value the daily seed would otherwise have
// picked (see dailyConfig.js). Only the AI's strength is left up to the
// player; the day's powers/quest/starting secret stay whatever the seed
// picked, so the challenge itself is still the same for everyone today.
function _startDailyGame(config, difficulty) {
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

    sendGameAction({ type: "ADD_AI", difficulty: difficulty || config.aiDifficulty, userId: window.currentUser.id });

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
