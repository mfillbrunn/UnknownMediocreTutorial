const status = $("authStatus");
const logoutBtn = $("logoutBtn");
window.socketReady = false;
window.authReady = false;
window.profileReady = false;
window.autoRejoinAttempted = false;
window.currentUser = null;
window.myProfile = null;
let pastGamesVisible = false;
let pastGamesLoaded = false;
let authInitInProgress = false;

if (!window.supabaseClient || !window.supabaseClient.auth) {
  throw new Error("Supabase client not initialized before auth.js");
}
function authReadyForData() {
  return window.authReady && window.profileReady;
}

function authReadyForSocket() {
  return window.authReady && window.socketReady;
}

if (window.authReady && window.currentUser) {
  loadMyProfile().then(() => {
    window.profileReady = true;
    updateAccountUI();
    renderMenuAccountStatus();
  });
}


function formatTimeMode(tc) {
  if (!tc || tc.enabled === false || tc.rankMode === "notime") {
    return "No Time";
  }

  switch (tc.rankMode) {
    case "bullet":
      return "Bullet (1 min / round)";
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

/*function openSummary(matchId) {
  show("menu");
  hide("setterScreen");
  hide("guesserScreen");
  hide("lobby");

  loadMatchSummary(matchId);
}

window.openSummary = openSummary;

async function loadMatchSummary(matchId) {
  const { data, error } = await window.supabaseClient
    .from("matches")
    .select("*")
    .eq("id", matchId)
    .single();

  if (error) {
    console.error("Failed to load match summary:", error);
    return;
  }
onclick="openSummary('${m.id}')"
           onkeydown="if(event.key==='Enter') openSummary('${m.id}')"
  $("roundSummary").textContent =
    `Match ${matchId} — ${data.win_reason || "Completed"}`;
}
*/
function isAbortError(err) {
   return (
     err?.name === "AbortError" ||
     err?.message?.includes("AbortError")
   );
 }

// ===== APP BOOTUP =====
(() => {
  const cachedProfile = localStorage.getItem("myProfile");

  if (cachedProfile) {
    try {
      window.myProfile = JSON.parse(cachedProfile);
    } catch {
      localStorage.removeItem("myProfile");
    }
  }
})();


window.getUserId = function () {
  return window.currentUser?.id || null;
};
function persistRoom(roomId) {
  localStorage.setItem("roomId", roomId);
}

function clearRoom() {
  localStorage.removeItem("roomId");
}

$("signupBtn").onclick = async () => {
  const emailEl = $("authEmail");
  const passwordEl = $("authPassword");
  const usernameEl = $("usernameInput");

  if (!emailEl || !passwordEl || !usernameEl) {
    status.textContent = "Please enter email, password, and username";
    return;
  }

  const email = emailEl.value.trim();
  const password = passwordEl.value;
  const username = usernameEl.value.trim();

  if (!email || !password || !username) {
    status.textContent = "Email, password, and username required";
    return;
  }

  const { data, error } = await window.supabaseClient.auth.signUp({
    email,
    password
  });

  if (error) {
    status.textContent = error.message;
    return;
  }

  status.textContent = "Account created";

  if (data?.user) {
    const { error: profileError } = await window.supabaseClient
      .from("profiles")
      .upsert({
        id: data.user.id,
        username: email.split("@")[0],
        rating_bullet: 1200,
        rating_blitz: 1200,
        rating_notime: 1200,
        rating_deep: 1200,
        games_played_bullet: 0,
        games_played_blitz: 0,
        games_played_notime: 0,
        games_played_deep: 0,
        wins_bullet: 0,
        wins_blitz: 0,
        wins_notime: 0,
        wins_deep: 0
      });

    if (profileError) {
      status.textContent = "Profile creation failed";
    }
  }
};

$("loginBtn").onclick = async () => {
  console.log("LOGIN CLICK", Date.now());
  const emailEl = $("authEmail");
  const passwordEl = $("authPassword");

  if (!emailEl || !passwordEl) {
    status.textContent = "Please enter email and password";
    return;
  }

  const email = emailEl.value.trim();
  const password = passwordEl.value;

  if (!email || !password) {
    status.textContent = "Email and password required";
    return;
  }

  status.textContent = "Logging in…";

  try {
    const { error } = await window.supabaseClient.auth.signInWithPassword({
      email,
      password
    });

    if (error) throw error;

    // Do NOT set auth state manually here
    // onAuthStateChange will handle everything
    status.textContent = "Logged in";

  } catch (err) {
    if (isAbortError(err)) return;
    status.textContent = err.message;
  }
};

logoutBtn.onclick = logout;
let profileLoadInProgress = false;

async function loadMyProfile() {
  if (!window.currentUser || profileLoadInProgress) return null;
  profileLoadInProgress = true;

  try {
    const { data, error } = await window.supabaseClient
      .from("profiles")
      .select("id, username, rating_bullet, rating_blitz, rating_notime, rating_deep")
      .eq("id", window.currentUser.id)
      .maybeSingle();

    if (error) throw error;

    // ✅ If missing, create it
    if (!data) {
      const email = window.currentUser.email || "";
      const username = email ? email.split("@")[0] : "player";

      const { data: created, error: createErr } = await window.supabaseClient
        .from("profiles")
        .insert({
          id: window.currentUser.id,
          username,
          rating_bullet: 1200,
          rating_blitz: 1200,
          rating_notime: 1200,
          rating_deep: 1200
        })
        .select("id, username, rating_bullet, rating_blitz, rating_notime, rating_deep")
        .single();

      if (createErr) throw createErr;

      window.myProfile = created;
      localStorage.setItem("myProfile", JSON.stringify(created));
      onProfileReady();
      updateAccountUI();
      return created;
    }

    window.myProfile = data;
    localStorage.setItem("myProfile", JSON.stringify(data));
    onProfileReady();
    updateAccountUI();
    return data;

  } finally {
    profileLoadInProgress = false;
  }
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
    ? `Elo:
       🚀 ${p.rating_bullet}
       ⚡⚡ ${p.rating_blitz}
       🧠 ${p.rating_deep}`
    : "Loading rating…";

  el.innerHTML = `
    <span class="account-logged-in">
      <strong>${name}</strong><br/>
      <small>${elo}</small>
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
  if (!authReadyForData()) {
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
  if (!authReadyForData()) {
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
function onProfileReady() {
  renderMenuAccountStatus();
 }

async function logout() {
  localStorage.removeItem("myProfile");
  autoRejoinAttempted = false;
  authReady = false;
  profileReady = false;

  localStorage.removeItem("roomId");

  await window.supabaseClient.auth.signOut();
  pastGamesVisible = false;
  pastGamesLoaded = false;  
  const container = $("pastGamesContainer");
  if (container) {
    container.classList.add("hidden");
    container.innerHTML = "";
  }
  window.currentUser = null;
  window.myProfile = null;
  clearRoom();
  updateAccountUI();
  renderMenuAccountStatus();
  showStartup();
}



function maybeAutoRejoin() {
  if (window.autoRejoinAttempted) return;
  if (!window.socketReady) return;
  if (!window.authReady) return;

  const roomId = localStorage.getItem("roomId");
  if (!roomId || !window.currentUser) return;

  window.autoRejoinAttempted = true;
  tryAutoRejoin();
}

function tryAutoRejoin() {
  const storedRoomId = localStorage.getItem("roomId");
  const user = window.currentUser;
  if (!storedRoomId || !user) return;
  if (!socket.connected) return;

  const username = window.myProfile?.username || user.email || "Player";

  socket.emit("joinRoom", { roomId: storedRoomId, userId: user.id, name: username }, res => {
    if (!res?.ok) {
      console.warn("Auto-rejoin failed:", res?.error);
      localStorage.removeItem("roomId");
      window.autoRejoinAttempted = false; // allow retry on next connect
      return;
    }

    window.roomId = res.roomId || storedRoomId;
    onRejoinUI();

  });
}
function updateAccountUI() {
  const root = $("accountScreen");
  if (!root) return;

  const loggedIn =
    !!window.currentUser &&
    !!window.currentUser.id &&
    window.authReady;

  root.querySelector("#authInputs")
    ?.classList.toggle("hidden", loggedIn);

  root.querySelector("#signupBtn")
    ?.classList.toggle("hidden", loggedIn);

  root.querySelector("#loginBtn")
    ?.classList.toggle("hidden", loggedIn);

  root.querySelector("#logoutBtn")
    ?.classList.toggle("hidden", !loggedIn);

  root.querySelector("#showPastGamesBtn")
    ?.classList.toggle("hidden", !loggedIn);
}



socket.on("connect", () => {
  console.log("🔌 Connected");
  window.socketReady = true;
  maybeAutoRejoin();
});
window.renderMenuAccountStatus = renderMenuAccountStatus;
window.onProfileReady = onProfileReady;
window.logout = logout;
window.showStartup = showStartup;
