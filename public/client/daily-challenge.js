// client/daily-challenge.js

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

function formatDailyTime(totalSeconds) {
  const secs = Math.round(totalSeconds || 0);
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// playMode -> the short mode label shown throughout the screen ("Mode:
// ..."). "both" reads as "Full game" rather than the internal id, matching
// the spec example ("Mode: Full game").
function _dailyModeLabel(playMode) {
  if (playMode === "setter") return "Secretkeeper only";
  if (playMode === "guesser") return "Guesser only";
  return "Full game";
}

// A single-role challenge has exactly one legal role for the whole match;
// "both" shows the actual order (round 1 -> round 2) from firstRole.
function _dailyRoleLabel(config) {
  if (config.playMode === "setter") return "Secretkeeper";
  if (config.playMode === "guesser") return "Guesser";
  return config.firstRole === "setter"
    ? "Secretkeeper → Guesser"
    : "Guesser → Secretkeeper";
}

function _dailySetupRow(label, valueHtml) {
  return `<div class="daily-result-row">
    <span class="daily-result-label">${label}</span>
    <span class="daily-result-value">${valueHtml}</span>
  </div>`;
}

function _dailyWordOrChoose(word) {
  return word
    ? `<span class="daily-setup-word">${String(word).toUpperCase()}</span>`
    : `<span class="daily-setup-choose">You choose</span>`;
}

// Only shows the rows relevant to `config.playMode` -- a Guesser-only
// challenge never mentions a Secretkeeper secret (the human never sets
// one), a Secretkeeper-only challenge never mentions a guess. Never shows
// the AI Secretkeeper's actual secret (the server's /api/daily response
// never sends that value in the first place -- see server/index.js) --
// and since it's always fixed for the day, there's no separate row
// calling that out either.
function _dailyOpeningSetupHtml(config) {
  const humanPlaysGuesser = config.playMode !== "setter";
  const humanPlaysSetter = config.playMode !== "guesser";
  const rows = [];

  if (humanPlaysGuesser) {
    rows.push(_dailySetupRow("Your first guess", _dailyWordOrChoose(config.humanOpeningGuess)));
  }
  if (humanPlaysSetter) {
    rows.push(_dailySetupRow("Your first secret", _dailyWordOrChoose(config.humanOpeningSecret)));
  }
  if (humanPlaysSetter) {
    rows.push(_dailySetupRow(
      "AI first guess",
      config.aiOpeningGuess ? `<span class="daily-setup-word">${config.aiOpeningGuess.toUpperCase()}</span>` : "—"
    ));
  }

  const anyPredefined =
    (humanPlaysGuesser && config.humanOpeningGuess) ||
    (humanPlaysSetter && config.humanOpeningSecret);

  return `
    <div class="daily-setup-title">Opening setup</div>
    ${rows.join("")}
    ${anyPredefined
      ? `<p class="daily-setup-note">Today's opening move is already set -- the match starts right after it resolves.</p>`
      : ""}
  `;
}

// Same navigator.share() -> clipboard fallback -> toast pattern as
// invite.js's shareOrCopyInviteLink, just with a Wordle-style result
// summary instead of a join link.
async function _shareDailyResult(config, r) {
  const modeLabel = _dailyModeLabel(config.playMode);

  let scoreLine;
  if (r?.abandoned) {
    // An abandoned attempt never recorded a score (see
    // dailyTracking.js's markDailyAbandoned) -- share that honestly
    // instead of printing a fabricated 0.
    scoreLine = "Didn't finish this one.";
  } else if (config.playMode === "both") {
    const diff = r.scoreDifference ?? 0;
    const outcome = diff > 0 ? "Won" : diff < 0 ? "Lost" : "Tied";
    scoreLine = `Setter ${r.setterScore ?? 0} · Guesser ${r.guesserScore ?? 0} (diff ${diff > 0 ? "+" : ""}${diff}) — ${outcome}`;
  } else if (config.playMode === "setter") {
    scoreLine = `Secretkeeper score: ${r.setterScore ?? 0}`;
  } else {
    scoreLine = `Guesser score: ${r.guesserScore ?? 0}`;
  }

  const diffLabel = !r?.abandoned && r?.difficulty ? ` vs ${dailyDifficultyMeta(r.difficulty).label} AI` : "";
  const timeLine = !r?.abandoned ? ` — ${formatDailyTime(r.time)}${diffLabel}` : "";

  const text = [
    `Vowel Play — Daily Challenge ${config.date}`,
    `${modeLabel}${timeLine}`,
    scoreLine,
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
    // of a real score, so there's no score/time to show here. Rankings
    // and Share are still offered though -- there's no reason losing your
    // own result should also cut you off from seeing how others did or
    // sharing that you gave today's challenge a shot.
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
        <button id="dailyRankingsBtn" class="menu-btn small">🏆 Rankings</button>
        <div class="daily-result-actions" style="max-width:260px;margin:14px auto 0">
          <button id="shareDailyBtn" class="menu-btn primary small">Share Result 📤</button>
        </div>
      </div>`;
      document.getElementById("shareDailyBtn")?.addEventListener("click", () => {
        _shareDailyResult(config, r);
      });
      document.getElementById("dailyRankingsBtn")?.addEventListener("click", () => {
        _showDailyRankings(config);
      });
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

    const modeLabel = _dailyModeLabel(config.playMode);
    const roleLabel = _dailyRoleLabel(config);

    // Winner/loser language only applies to the "both" full-game
    // challenge, where a real setter-vs-guesser score comparison exists --
    // a one-role challenge just has a raw score, and calling it a "win" or
    // "loss" would be misleading (there's nothing on the other side of the
    // ledger to actually beat).
    let outcomeHtml = "";
    let scoreRowsHtml = "";
    if (config.playMode === "both" && r) {
      const diff = Number(r.scoreDifference) || 0;
      const outcome = diff > 0 ? "You won! 🎉" : diff < 0 ? "You lost this one." : "It was a tie!";
      outcomeHtml = `<p class="daily-result-outcome big">${outcome}</p>`;
      scoreRowsHtml = `
        <div class="daily-result-row">
          <span class="daily-result-label">Secretkeeper score</span>
          <span class="daily-result-value">${r.setterScore}</span>
        </div>
        <div class="daily-result-row">
          <span class="daily-result-label">Guesser score</span>
          <span class="daily-result-value">${r.guesserScore}</span>
        </div>
        <div class="daily-result-row">
          <span class="daily-result-label">Score difference</span>
          <span class="daily-result-value">${diff > 0 ? "+" : ""}${diff}</span>
        </div>`;
    } else if (r) {
      const score = config.playMode === "setter" ? r.setterScore : r.guesserScore;
      scoreRowsHtml = `
        <div class="daily-result-row">
          <span class="daily-result-label">Score</span>
          <span class="daily-result-value">${score}</span>
        </div>`;
    }

    const resultBlock = r
      ? `<div class="daily-result-block">
          ${outcomeHtml}
          <div class="daily-result-row">
            <span class="daily-result-label">Mode</span>
            <span class="daily-result-value">${modeLabel}</span>
          </div>
          <div class="daily-result-row">
            <span class="daily-result-label">Role${config.playMode === "both" ? " order" : ""}</span>
            <span class="daily-result-value">${roleLabel}</span>
          </div>
          ${scoreRowsHtml}
          <div class="daily-result-row">
            <span class="daily-result-label">Time</span>
            <span class="daily-result-value">${formatDailyTime(r.time)}</span>
          </div>
          ${difficultyRow}
          <div class="daily-result-actions">
            <button id="shareDailyBtn" class="menu-btn primary small">Share Result 📤</button>
          </div>
        </div>`
      : "";

    // Same standalone button (markup, class) as the pre-completion screen
    // below -- it used to be squeezed into a flex row inside the
    // (narrower, 260px-capped) result block alongside Share, which shrank
    // it to half-width there but not here. Placed above the result block
    // (not at the very end) so it stays reachable without scrolling past
    // score/time/share first.
    screen.innerHTML = `<div class="menu-center">
      <div class="screen-back-header">
        <button class="menu-btn screen-back-btn" onclick="showStartup()">← Back</button>
        <h2 class="menu-title" style="flex:1;text-align:center">Daily Challenge</h2>
      </div>
      <p class="daily-date">☀️ ${config.date}</p>
      <p class="daily-completed-msg">
        You've already played today's challenge. Come back tomorrow!
      </p>
      <button id="dailyRankingsBtn" class="menu-btn small">🏆 Rankings</button>
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

  // A real check failure (a DB error, a dropped connection) must never be
  // treated the same as "you haven't played today" -- silently falling
  // through to the fresh-start screen below would let a player who
  // already completed today's challenge attempt to claim it again instead
  // of seeing an honest "try again" message.
  if (status?.status === "error" || !status) {
    screen.innerHTML = `<div class="menu-center">
      <div class="screen-back-header">
        <button class="menu-btn screen-back-btn" onclick="showStartup()">← Back</button>
        <h2 class="menu-title" style="flex:1;text-align:center">Daily Challenge</h2>
      </div>
      <p>${status?.error || "Could not check today's challenge status."}</p>
      <button id="dailyRetryBtn" class="menu-btn" style="margin-top:10px">Try Again</button>
    </div>`;
    document.getElementById("dailyRetryBtn")?.addEventListener("click", () => {
      window.showDailyChallenge?.();
    });
    return;
  }

  screen.innerHTML = `
    <div class="menu-center">
      <div class="screen-back-header">
        <button class="menu-btn screen-back-btn" onclick="showStartup()">← Back</button>
        <h2 class="menu-title" style="flex:1;text-align:center">Daily Challenge</h2>
      </div>
      <p class="daily-date">☀️ ${config.date}</p>

      <div class="daily-setup-block">
        <div class="daily-setup-title">Today's challenge</div>
        <div class="daily-result-row">
          <span class="daily-result-label">Mode</span>
          <span class="daily-result-value">${_dailyModeLabel(config.playMode)}</span>
        </div>
        ${_dailyOpeningSetupHtml(config)}
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
};

// Daily rankings subtab: everyone who has played today, sorted by the
// mode-appropriate metric (REFINEMENT_SPEC section 9) -- a given date only
// ever has ONE play mode (it's part of the shared deterministic
// configuration, see dailyConfig.js), so every row on the board is already
// comparable; there's no mixing of setter-only and guesser-only scores to
// guard against. Toggle between All and Friends. Reads the daily_results
// Supabase table (written server-side on completion, see gameOver.js);
// degrades to a friendly message if the table is missing or nobody has
// played yet.
let _dailyRankScope = "all";

// Ranking rules per playMode (REFINEMENT_SPEC section 9):
//   setter:  1) higher setter_score        2) faster time
//   guesser: 1) lower guesser_score         2) faster time
//   both:    1) higher score_difference     2) lower guesser_score
//            3) higher setter_score         4) faster time
function _dailyRankCompare(playMode, a, b) {
  const aDnf = a.status === "abandoned";
  const bDnf = b.status === "abandoned";
  if (aDnf !== bDnf) return aDnf ? 1 : -1;
  if (aDnf && bDnf) return 0;

  const setterOf = row => row.setter_score ?? row.score ?? 0;
  const guesserOf = row => row.guesser_score ?? row.opponent_score ?? 0;
  const diffOf = row => row.score_difference ?? (setterOf(row) - guesserOf(row));
  const timeOf = row => row.time_seconds ?? 1e9;

  if (playMode === "setter") {
    return setterOf(b) - setterOf(a) || timeOf(a) - timeOf(b);
  }
  if (playMode === "guesser") {
    return guesserOf(a) - guesserOf(b) || timeOf(a) - timeOf(b);
  }
  return (
    diffOf(b) - diffOf(a) ||
    guesserOf(a) - guesserOf(b) ||
    setterOf(b) - setterOf(a) ||
    timeOf(a) - timeOf(b)
  );
}

function _dailyRankMetricLabel(playMode) {
  if (playMode === "setter") return "Score";
  if (playMode === "guesser") return "Score";
  return "Diff";
}

function _dailyRankMetricOf(playMode, row) {
  const setterOf = r => r.setter_score ?? r.score ?? 0;
  const guesserOf = r => r.guesser_score ?? r.opponent_score ?? 0;
  if (playMode === "setter") return setterOf(row);
  if (playMode === "guesser") return guesserOf(row);
  const diff = row.score_difference ?? (setterOf(row) - guesserOf(row));
  return diff > 0 ? `+${diff}` : `${diff}`;
}

async function _showDailyRankings(config) {
  const screen = document.getElementById("dailyScreen");
  if (!screen) return;

  screen.innerHTML = `<div class="menu-center">
    <div class="screen-back-header">
      <button id="dailyRankBackBtn" class="menu-btn screen-back-btn">← Back</button>
      <h2 class="menu-title" style="flex:1;text-align:center">Daily Rankings</h2>
    </div>
    <p class="daily-date">☀️ ${config.date} · ${_dailyModeLabel(config.playMode)}</p>
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
    const playModeColumns = "user_id, date, status, score, opponent_score, setter_score, guesser_score, score_difference, time_seconds, won, tie, difficulty";
    let { data, error } = await sb
      .from("daily_results")
      .select(playModeColumns)
      .eq("date", config.date);

    if (error) {
      // The setter_score/guesser_score/score_difference columns come from
      // a migration that has to be applied by hand against the live
      // database (see supabase/migrations/202608280001_daily_challenge_playmode.sql)
      // -- until that's actually been run, selecting them fails outright
      // and would otherwise make the WHOLE rankings list look empty
      // ("no one has played today") instead of just missing those three
      // fields. Retry with only the legacy columns, same fallback
      // dailyTracking.js's server-side reads already use.
      console.warn("[daily rankings] full-schema read failed, retrying with legacy columns only:", error);
      const legacyColumns = "user_id, date, status, score, opponent_score, time_seconds, won, tie, difficulty";
      const legacy = await sb.from("daily_results").select(legacyColumns).eq("date", config.date);
      if (legacy.error) throw legacy.error;
      data = legacy.data;
    }

    // Belt-and-suspenders re-check on top of the .eq() above -- a stale
    // row (e.g. an old onConflict upsert mismatch, or a date column that
    // doesn't compare the way .eq() assumes) should never be able to slip
    // a previous day's score into today's board.
    rows = (data || []).filter(r => r.date === config.date);
    rows = rows.filter(row => row.status !== "in_progress");
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

  rows.sort((a, b) => _dailyRankCompare(config.playMode, a, b));

  const myId = window.currentUser?.id;
  const metricLabel = _dailyRankMetricLabel(config.playMode);
  const header = `
    <div class="daily-rank-row daily-rank-header">
      <span class="daily-rank-pos">#</span>
      <span class="daily-rank-name">Player</span>
      <span class="daily-rank-points">${metricLabel}</span>
      <span class="daily-rank-diff">Diff</span>
      <span class="daily-rank-time">Time</span>
    </div>`;

  // Attach usernames (separate lookup so we don't depend on a FK embed).
  let names = {};
  try {
    const ids = [...new Set(rows.map(r => r.user_id))];
    const { data: profs } = await sb.from("profiles").select("id, username").in("id", ids);
    (profs || []).forEach(p => { names[p.id] = p.username; });
  } catch { /* usernames optional */ }

  listEl.innerHTML = header + rows.map((r, i) => {
    const diff = dailyDifficultyMeta(r.difficulty);
    const isDnf = r.status === "abandoned";
    const name = names[r.user_id] || (r.user_id === myId ? "You" : "Player");
    const isMe = r.user_id === myId;
    const metric = _dailyRankMetricOf(config.playMode, r);
    return `
      <div class="daily-rank-row ${isMe ? "me" : ""}">
        <span class="daily-rank-pos">${i + 1}</span>
        <span class="daily-rank-name">${name}${isMe ? " (you)" : ""}</span>
        <span class="daily-rank-points">${isDnf ? "DNF" : metric}</span>
        <span class="daily-rank-diff">
          <span class="daily-diff-dot" style="background:${diff.color}" title="${diff.label} AI"></span>
        </span>
        <span class="daily-rank-time">${isDnf ? "—" : formatDailyTime(r.time_seconds)}</span>
      </div>`;
  }).join("");
}
window._showDailyRankings = _showDailyRankings;

// Play mode, role order, and every opening word/quest/reward still come
// from the server's deterministic daily seed (see dailyConfig.js), so
// every player gets the exact same challenge there -- the server
// independently recomputes and enforces all of that (see lobby.js's
// ADD_AI/SET_DAILY_POWERS handlers), so a tampered client sending
// different values for any of it would just be ignored. AI difficulty is
// the one part of the day's setup the player actually picks (the
// difficulty button clicked on the challenge screen); the server trusts
// it as long as it's a real 1/2/3 level (see lobby.js's ADD_AI handler),
// falling back to the day's own seeded difficulty otherwise. The client
// no longer sends SWITCH_ROLES either -- ADD_AI itself now assigns both
// seats' roles from the day's config (playMode/firstRole) server-side.
function _startDailyGame(config, difficulty) {
  const username =
    window.myProfile?.username ||
    window.currentUser?.email ||
    "Player";

  const chosenDifficulty = difficulty || config.aiDifficulty;

  window._dailyStarting = true;

  socket.emit(
    "createRoom",
    {
      userId:
        window.currentUser.id,

      name: username
    },
    resp => {
      if (!resp?.ok) {
        window._dailyStarting =
          false;

        toast(
          resp?.error ||
          "Could not create room"
        );

        return;
      }

      /*
       * The room exists, but do not persist it until the
       * server grants today's one allowed attempt.
       */
      roomId = resp.roomId;
      window.roomId = resp.roomId;

      socket
        .timeout(8000)
        .emit(
          "claimDailyAttempt",
          {
            roomId: resp.roomId,

            userId:
              window.currentUser.id,

            date:
              config.date,

            difficulty:
              chosenDifficulty
          },
          (
            error,
            claim
          ) => {
            if (
              error ||
              !claim?.ok
            ) {
              window._dailyStarting =
                false;

              localStorage.removeItem(
                "roomId"
              );

              roomId = null;
              window.roomId = null;

              toast(
                claim?.code ===
                  "DAILY_ALREADY_STARTED"
                  ? "You have already used today's Daily Challenge attempt."
                  : (
                      claim?.error ||
                      "Could not start today's challenge"
                    )
              );

              window
                .showDailyChallenge
                ?.();

              return;
            }

            persistRoom(
              resp.roomId
            );

            sendGameAction({
              type: "ADD_AI",

              difficulty:
                chosenDifficulty,

              // The server ignores `difficulty` above and recomputes it
              // (along with each side's role) from this date instead
              // whenever dailyDate is present (see lobby.js's ADD_AI
              // handler) -- both are part of the day's shared,
              // deterministic configuration, not something a rewritten
              // client should be able to pick for itself.
              dailyDate:
                config.date,

              userId:
                window.currentUser.id
            });

            setTimeout(() => {
              sendGameAction({
                type:
                  "SET_DAILY_POWERS",

                date:
                  config.date,

                userId:
                  window.currentUser.id
              });
            }, 60);

            setTimeout(() => {
              sendGameAction({
                type:
                  "SET_TIME_CONTROL",

                enabled: false,

                userId:
                  window.currentUser.id
              });
            }, 90);

            setTimeout(() => {
              sendGameAction({
                type:
                  "PLAYER_READY",

                userId:
                  window.currentUser.id,

                mode: "daily"
              });
            }, 130);

            window.isRejoining =
              false;

            const screenEl =
              document.getElementById(
                "dailyScreen"
              );

            if (screenEl) {
              screenEl.innerHTML = `
                <div class="menu-center">
                  <p class="daily-date">
                    Starting today's challenge…
                  </p>
                </div>
              `;
            }
          }
        );
    }
  );
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
