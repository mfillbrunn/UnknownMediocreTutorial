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
       🧠 ${p.rating_deep}
       ♾️ ${p.rating_notime}`
    : "Loading rating…";

  el.innerHTML = `
    <span class="account-logged-in">
      <strong>${name}</strong><br/>
      <small>${elo}</small><br/>
      <button class="link-btn menu-logout-btn">Log out</button>
    </span>
  `;

  el.querySelector(".menu-logout-btn").onclick = logout;
}

// Fetch past games
$("showPastGamesBtn")?.addEventListener("click", async (e) => {
  e.preventDefault();
  e.stopPropagation();

  const btn = $("showPastGamesBtn");
  const container = $("pastGamesContainer");
  if (!btn || !container) return;

  // Auth not ready → show message and exit
  if (!authFullyReady()) {
    container.classList.remove("hidden");
    container.textContent = "Please wait…";
    return;
  }

  const myId = window.currentUser?.id;
  if (!myId) return;

  // Toggle OFF
  if (pastGamesVisible) {
    container.classList.add("hidden");
    pastGamesVisible = false;
    btn.textContent = "Show Past Games";
    return;
  }

  // Toggle ON
  container.classList.remove("hidden");
  pastGamesVisible = true;
  btn.textContent = "Hide Past Games";

  // Already loaded → just show
  if (pastGamesLoaded) return;

  // First-time load
  container.textContent = "Loading…";

  try {
    const { data, error } = await window.supabaseClient
      .from("matches")
      .select(`
        id,
        created_at,
        ranked,
        time_control,
        player_a,
        player_b,
        winner,
        score_a,
        score_b,
        rounds,
        player_a_profile:profiles!matches_player_a_fkey(username),
        player_b_profile:profiles!matches_player_b_fkey(username)
      `)
      .or(`player_a.eq.${myId},player_b.eq.${myId}`)
      .order("created_at", { ascending: false })
      .limit(20);

    console.log("PAST GAMES RESULT", { data, error });

    if (error) throw error;

    renderPastGames(data);
    pastGamesLoaded = true;

  } catch (err) {
    if (isAbortError(err)) {
      pastGamesLoaded = false;
      setTimeout(() => {
        $("showPastGamesBtn")?.click();
      }, 200);
      return;
    }

    console.error("Past games load failed:", err);
    container.textContent = "Failed to load games";
  }
});


function getPowersByRoleFromRounds(rounds = [], myId, match) {
  const byRole = {
    setter: new Set(),
    guesser: new Set()
  };

  rounds.forEach(r => {
    if (!Array.isArray(r.powers)) return;

    const setterRole =
      (r.setter === "A" && match.player_a === myId) ||
      (r.setter === "B" && match.player_b === myId)
        ? "setter"
        : "guesser";

    const guesserRole = setterRole === "setter" ? "guesser" : "setter";

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

function renderPastGames(matches) {
  const container = $("pastGamesContainer");
  if (!container || !window.currentUser) return;

  const myId = window.currentUser.id;

  container.innerHTML = matches.map(m => {
    const opponentName =
      m.player_a === myId
        ? m.player_b_profile?.username
        : m.player_a_profile?.username
      || "Opponent";

    // -----------------------
    // Result
    // -----------------------
    let resultLabel = "Tie";
    let resultIcon = "↔️";

    if (m.winner) {
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
      getPowersByRoleFromRounds(m.rounds || [], myId, m);

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

