// /public/client/statistics.js



function formatTimeMode(tc) {
  if (!tc || tc.enabled === false || tc.rankMode === "notime") {
    return "No Time";
  }

  switch (tc.rankMode) {
    case "bullet":
      return "Bullet (90 secs / round)";
    case "blitz":
      return "Blitz (3 min / round)";
    case "deep":
      return "Deep (15 min total)";
  }

  if (tc.mode === "round" && Number.isFinite(tc.roundSeconds)) {
    const min = Math.floor(tc.roundSeconds / 60);
    return `${min} min / round`;
  }

  if (tc.mode === "chess" && Number.isFinite(tc.initialSeconds)) {
    const min = Math.floor(tc.initialSeconds / 60);
    const inc = Number.isFinite(tc.incrementSeconds)
      ? ` +${tc.incrementSeconds}s`
      : "";
    return `${min} min${inc}`;
  }

  return "Custom";
}

function renderMenuAccountStatus () {
  const el = $("menuAccountStatus");
  if (!el) return;

  el.innerHTML = "";

  if (!window.currentUser) {
    el.innerHTML = `
      <span class="account-logged-out">
        Not logged in —
        <button class="link-btn menu-login-btn">Log in</button>
      </span>
    `;
    el.querySelector(".menu-login-btn").onclick =
      () => showScreen("accountScreen");
    return;
  }

  const p = window.myProfile;
  const name = p?.username || window.currentUser.email;

  const elo = p
    ? `🚀 ${p.rating_bullet}
       ⚡ ${p.rating_blitz}
       ♾️ ${p.rating_notime}`
    : "Loading rating…";

  el.innerHTML = `
    <span class="account-logged-in">
      <strong>${name}</strong><br/>
      <small>${elo}</small><br/>
      <button class="link-btn menu-friends-btn">Friends 👥</button>
      <button class="link-btn menu-logout-btn">Log out</button>
    </span>
  `;

  el.querySelector(".menu-friends-btn").onclick = () => window.showFriendsScreen?.();
  el.querySelector(".menu-logout-btn").onclick = logout;
}

// Labels for state.aiDifficulty (1/2/3) -- kept in sync with
// server/core/rooms.js's AI_DIFFICULTY_NAMES and index.html's pickers.
const AI_DIFFICULTY_LABELS = { 1: "Easy", 2: "Medium", 3: "Hard" };

// Fetch this player's finished matches and render them into `container`.
// Used by the My Games screen's "Past Games" subtab. `sourceFilter` is
// "all" | "human" | "ai", matching the My Games source-filter tabs.
async function fetchAndRenderPastGames(container, sourceFilter = "all") {
  if (!container) return;

  // Auth not ready → show message and exit
  if (!authFullyReady()) {
    container.textContent = "Please wait…";
    return;
  }

  const myId = window.currentUser?.id;
  if (!myId) return;

  container.textContent = "Loading…";

  try {
    let query = window.supabaseClient
      .from("matches")
      .select(`
        id,
        match_id,
        created_at,
        ranked,
        time_control,
        player_a,
        player_b,
        winner,
        is_ai,
        ai_difficulty,
        winner_is_ai,
        score_a,
        score_b,
        rounds,
        player_a_profile:profiles!matches_player_a_fkey(username),
        player_b_profile:profiles!matches_player_b_fkey(username)
      `)
      .or(`player_a.eq.${myId},player_b.eq.${myId}`)
      .order("created_at", { ascending: false })
      .limit(20);

    if (sourceFilter === "human") query = query.eq("is_ai", false);
    if (sourceFilter === "ai") query = query.eq("is_ai", true);

    const { data, error } = await query;

    if (error) throw error;

    const uniqueMatches = [
  ...new Map(
    (data || []).map(match => [
      match.match_id ||
      match.id,
      match
    ])
  ).values()
];

renderPastGames(
  uniqueMatches,
  container
);
    container.dataset.loaded = "1";

  } catch (err) {
    if (isAbortError(err)) {
      delete container.dataset.loaded;
      setTimeout(() => fetchAndRenderPastGames(container, sourceFilter), 200);
      return;
    }

    console.error("Past games load failed:", err);
    container.textContent = "Failed to load games";
  }
}
window.fetchAndRenderPastGames = fetchAndRenderPastGames;

function getPowersByRoleFromRounds(rounds = [], myId) {
  const byRole = {
    setter: new Set(),
    guesser: new Set()
  };

  rounds.forEach(r => {
    if (!Array.isArray(r.powers)) return;

    r.powers.forEach(pid => {
      const power = PowerEngine.powers?.[pid];
      const meta = window.POWER_METADATA?.[pid];
      if (!power || !meta) return;

      // PowerEngine defines which role can use it
    byRole[power.role].add(pid);
    });
  });

  return {
    setter: [...byRole.setter],
    guesser: [...byRole.guesser]
  };
}

function renderPastGames(matches, container) {
  if (!container || !window.currentUser) return;

  if (!matches.length) {
    container.textContent = "No finished games yet.";
    return;
  }

  const myId = window.currentUser.id;

  container.innerHTML = matches.map(m => {
    const opponentName = m.is_ai
      ? `AI${m.ai_difficulty ? ` (${AI_DIFFICULTY_LABELS[m.ai_difficulty] || m.ai_difficulty})` : ""}`
      : (m.player_a === myId
          ? m.player_b_profile?.username
          : m.player_a_profile?.username) || "Opponent";

    // -----------------------
    // Result
    // -----------------------
    let resultLabel = "Tie";
    let resultIcon = "↔️";

    if (m.is_ai && m.winner_is_ai) {
      resultLabel = "Loss";
      resultIcon = "❌";
    } else if (m.winner) {
      const didWin = m.winner === myId;
      resultLabel = didWin ? "Win" : "Loss";
      resultIcon = didWin ? "🏆" : "❌";
    }

    const score =
      m.player_a === myId
        ? `${m.score_a}–${m.score_b}`
        : `${m.score_b}–${m.score_a}`;

    const timeMode = formatTimeMode(m.time_control);

    // -----------------------
    // Powers (ROUND-BASED, SPEC-COMPLIANT)
    // -----------------------
    const { setter, guesser } =
      getPowersByRoleFromRounds(m.rounds || [], myId);

    let powersLine = null;
    if (setter.length || guesser.length) {
      const setterIcons = setter.length
        ? setter.map(powerToInlineIcon).join(" ")
        : "—";

      const guesserIcons = guesser.length
        ? guesser.map(powerToInlineIcon).join(" ")
        : "—";

      powersLine = `${setterIcons} | ${guesserIcons}`;
    }

    // -----------------------
    // Final secrets per round
    // -----------------------
    const secretsLine = (m.rounds || [])
      .map((r, i) => {
        const secret =
          r?.history?.[r.history.length - 1]?.finalSecret;
        if (!secret) return null;
        return `R${i + 1}: ${secret.toUpperCase()}`;
      })
      .filter(Boolean)
      .join(" · ");

    return `
      <div class="past-game-row" tabindex="0">
        <div class="past-game-main">
          <div class="past-game-opponent">
            vs <strong>${opponentName}</strong>
          </div>
          <div class="past-game-meta">
            <span class="past-game-date">
              ${new Date(m.created_at).toLocaleDateString()}
            </span>
            <span class="past-game-mode">
              ${m.ranked ? "🏆 Ranked" : "🎮 Casual"} · ${timeMode}
            </span>
          </div>
        </div>

        <div class="past-game-result">
          <span class="result-icon">${resultIcon}</span>
          <span class="result-text">${resultLabel}</span>
          <span class="result-score">${score}</span>
        </div>

        ${
          powersLine
            ? `<div class="past-game-powers">${powersLine}</div>`
            : ""
        }

        ${
          secretsLine
            ? `<div class="past-game-rounds">${secretsLine}</div>`
            : ""
        }
      </div>
    `;
  }).join("");
}

// Fetch a larger batch of this player's finished matches (not just the 20
// shown in Past Games) and render the My Games "Stats" subtab from them.
// `sourceFilter` is "all" | "human" | "ai", matching the source-filter tabs.
async function fetchAndRenderStats(container, sourceFilter = "all") {
  if (!container) return;

  if (!authFullyReady()) {
    container.textContent = "Please wait…";
    return;
  }

  const myId = window.currentUser?.id;
  if (!myId) return;

  container.textContent = "Loading…";

  try {
    let query = window.supabaseClient
      .from("matches")
      .select("player_a, player_b, winner, is_ai, winner_is_ai, rounds")
      .or(`player_a.eq.${myId},player_b.eq.${myId}`)
      .order("created_at", { ascending: false })
      .limit(500);

    if (sourceFilter === "human") query = query.eq("is_ai", false);
    if (sourceFilter === "ai") query = query.eq("is_ai", true);

    const { data, error } = await query;

    if (error) throw error;

    renderStats(data, container);
    container.dataset.loaded = "1";

  } catch (err) {
    if (isAbortError(err)) {
      delete container.dataset.loaded;
      setTimeout(() => fetchAndRenderStats(container, sourceFilter), 200);
      return;
    }

    console.error("Stats load failed:", err);
    container.textContent = "Failed to load statistics";
  }
}
window.fetchAndRenderStats = fetchAndRenderStats;

// Crunches raw match rows into the My Games stats numbers. All counts are
// from `myId`'s perspective:
//  - "secret" stats only look at rounds where myId was the setter.
//  - "opening guess" stats only look at rounds where myId was the guesser.
//  - "winningest" = the word that appears in the most matches myId went on
//    to win overall (not a per-round win, since this game only scores wins
//    at the match level).
//  - avgGuessesToFindSecret: per round as guesser, unconditional.
//  - avgGuessesWhenYouWin: per round as guesser, only within matches myId won.
//  - avgSecretChanges: per round as setter, how often they swapped secrets.
function computeMyGameStats(matches, myId) {
  const secretUsage = new Map();
  const secretWins = new Map();
  const guessUsage = new Map();
  const guessWins = new Map();

  let guesserRoundGuessSum = 0, guesserRoundCount = 0;
  let winRoundGuessSum = 0, winRoundCount = 0;
  let setterRoundCount = 0, secretChangeSum = 0;

  matches.forEach(m => {
    const won = m.winner === myId;

    (m.rounds || []).forEach(r => {
      if (r.setter === myId) {
        const word = (r.startingSecret || r.secret || "").toUpperCase();
        if (word) {
          secretUsage.set(word, (secretUsage.get(word) || 0) + 1);
          if (won) secretWins.set(word, (secretWins.get(word) || 0) + 1);
        }
        setterRoundCount++;
        secretChangeSum += r.secretChanges || 0;
      }

      if (r.guesser === myId) {
        const opening = r.history?.[0]?.guess?.toUpperCase();
        if (opening) {
          guessUsage.set(opening, (guessUsage.get(opening) || 0) + 1);
          if (won) guessWins.set(opening, (guessWins.get(opening) || 0) + 1);
        }
        if (Number.isFinite(r.guessCount)) {
          guesserRoundGuessSum += r.guessCount;
          guesserRoundCount++;
          if (won) {
            winRoundGuessSum += r.guessCount;
            winRoundCount++;
          }
        }
      }
    });
  });

  const topByCount = map => {
    let best = null, bestCount = 0;
    map.forEach((count, word) => {
      if (count > bestCount) { best = word; bestCount = count; }
    });
    return best ? { word: best, count: bestCount } : null;
  };

  return {
    gamesPlayed: matches.length,
    mostCommonSecret: topByCount(secretUsage),
    mostCommonOpeningGuess: topByCount(guessUsage),
    mostWinningSecret: topByCount(secretWins),
    mostWinningOpeningGuess: topByCount(guessWins),
    avgGuessesToFindSecret: guesserRoundCount ? guesserRoundGuessSum / guesserRoundCount : null,
    avgGuessesWhenYouWin: winRoundCount ? winRoundGuessSum / winRoundCount : null,
    avgSecretChanges: setterRoundCount ? secretChangeSum / setterRoundCount : null
  };
}

function renderStats(matches, container) {
  if (!container || !window.currentUser) return;

  if (!matches.length) {
    container.textContent = "No finished games yet.";
    return;
  }

  const stats = computeMyGameStats(matches, window.currentUser.id);
  const fmtNum = n => (n == null ? "—" : n.toFixed(1));

  const wordCard = (label, sub, s) => `
    <div class="stat-card">
      <div class="stat-label">${label}</div>
      <div class="stat-value">${s ? s.word : "—"}</div>
      <div class="stat-sub">${s ? `${s.count} game${s.count === 1 ? "" : "s"}` : sub}</div>
    </div>
  `;

  const numCard = (label, value, sub) => `
    <div class="stat-card">
      <div class="stat-label">${label}</div>
      <div class="stat-value">${value}</div>
      <div class="stat-sub">${sub}</div>
    </div>
  `;

  container.innerHTML = `
    <div class="stats-grid">
      ${wordCard("Most Common Secret", "No secrets yet", stats.mostCommonSecret)}
      ${wordCard("Most Common Opening Guess", "No guesses yet", stats.mostCommonOpeningGuess)}
      ${wordCard("Most Winning Secret", "No wins yet", stats.mostWinningSecret)}
      ${wordCard("Most Winning Opening Guess", "No wins yet", stats.mostWinningOpeningGuess)}
      ${numCard("Avg Guesses to Find Secret", fmtNum(stats.avgGuessesToFindSecret), "as Inspector, per round")}
      ${numCard("Avg Guesses When You Win", fmtNum(stats.avgGuessesWhenYouWin), "as Inspector, in won matches")}
      ${numCard("Avg Secret Changes", fmtNum(stats.avgSecretChanges), "per round as Spy")}
    </div>
    <div class="stats-footnote">Based on your last ${stats.gamesPlayed} game${stats.gamesPlayed === 1 ? "" : "s"}.</div>
  `;
}
window.renderStats = renderStats;

function summarizeMatchPowers(rounds = []) {
  const used = new Set();

  rounds.forEach(r => {
  if (!r || !Array.isArray(r.history)) return;
  r.history.forEach(h => {
      (h.powersSetter || []).forEach(p => used.add(p));
      (h.powersGuesser || []).forEach(p => used.add(p));
    });
  });

  if (!used.size) return "";

  return [...used]
    .map(powerToInlineIcon)
    .join(" ");
}
let leaderboardLoadInProgress = false;
let pendingLeaderboardMode = null;

async function loadLeaderboard(mode) {
  const list = $("leaderboardList");
  if (!list) return;

  // Auth not ready → queue request and exit
  if (!authFullyReady()) {
    list.textContent = "Please wait…";
    pendingLeaderboardMode = mode;
    return;
  }

  // Prevent overlapping loads
  if (leaderboardLoadInProgress) {
    pendingLeaderboardMode = mode;
    return;
  }

  leaderboardLoadInProgress = true;
  pendingLeaderboardMode = null;

  list.textContent = "Loading…";

  try {
    const ratingColumn = `rating_${mode}`;

    const { data, error } = await window.supabaseClient
      .from("leaderboard_profiles")
      .select(`id, username, ${ratingColumn}`)
      .order(ratingColumn, { ascending: false })
      .limit(10);

    if (error) throw error;

    renderLeaderboard(data, mode);

  } catch (err) {
    if (isAbortError(err)) {
      pendingLeaderboardMode = mode;
      return;
    }

    console.error("Leaderboard load failed:", err);
    list.textContent = "Failed to load leaderboard";

  } finally {
    leaderboardLoadInProgress = false;

    // Retry the most recent queued request
    if (pendingLeaderboardMode) {
      const next = pendingLeaderboardMode;
      pendingLeaderboardMode = null;
      loadLeaderboard(next);
    }
  }
}



function renderLeaderboard(rows, mode) {
  const list = $("leaderboardList");
  if (!list) return;

  if (!rows.length) {
    list.textContent = "No data yet";
    return;
  }

  list.innerHTML = rows
    .map((p, i) => `
      <div class="leaderboard-row">
        <span class="leaderboard-rank">#${i + 1}</span>
        <span class="leaderboard-name">${p.username || "Player"}</span>
        <span class="leaderboard-rating">
          ${p[`rating_${mode}`]}
        </span>
      </div>
    `)
    .join("");
}
document.querySelectorAll(".leaderboard-tab").forEach(btn => {
  btn.addEventListener("click", () => {
    document
      .querySelectorAll(".leaderboard-tab")
      .forEach(b => b.classList.remove("active"));

    btn.classList.add("active");
    loadLeaderboard(btn.dataset.mode);
  });
});

window.renderMenuAccountStatus = renderMenuAccountStatus;
window.showStartup = showStartup;

