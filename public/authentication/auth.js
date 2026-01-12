const emailInput = $("authEmail");
const passwordInput = $("authPassword");
const status = $("authStatus");
const logoutBtn = $("logoutBtn");
window.socketReady = false;
window.authReady = false;
window.profileReady = false;
window.autoRejoinAttempted = false;



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
  const email = emailInput.value.trim();
  const password = passwordInput.value;

  if (!email || !password) {
    status.textContent = "Enter email and password";
    return;
  }

  const { data, error } = await window.supabase.auth.signUp({
    email,
    password
  });

  if (error) {
    status.textContent = error.message;
    return;
  }

  status.textContent = "Account created";

  if (data?.user) {
    const { error: profileError } = await window.supabase
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
  const { error } = await window.supabase.auth.signInWithPassword({
    email: emailInput.value,
    password: passwordInput.value
  });

  status.textContent = error ? error.message : "Logged in";
};

logoutBtn.onclick = logout;

window.supabase.auth.onAuthStateChange(async (event, session) => {
  window.currentUser = session?.user || null;

 if (event === "SIGNED_OUT") {
  window.authReady = false;
  window.profileReady = false;
  window.autoRejoinAttempted = false;
    renderMenuAccountStatus();
    showStartup();
    return;
  }

  if (event === "INITIAL_SESSION" || event === "SIGNED_IN") {
    window.authReady = true;
    renderMenuAccountStatus();
    showStartup();

    if (window.currentUser) {
      await loadMyProfile();
      window.profileReady = true;
      maybeAutoRejoin();
    }
  }
});




let profileLoadInProgress = false;

async function loadMyProfile() {
  if (!window.currentUser || profileLoadInProgress) return null;

  profileLoadInProgress = true;

  try {
    const { data, error } = await window.supabase
      .from("profiles")
      .select("*")
      .eq("id", window.currentUser.id)
      .single();

    if (error) throw error;

    window.myProfile = data;
    onProfileReady();
    return data;
  } catch (err) {
    console.error("Profile load failed:", err);
    return null;
  } finally {
    profileLoadInProgress = false;
    renderMenuAccountStatus();
  }
}


function renderMenuAccountStatus() {
  const el = $("menuAccountStatus");
  if (!el) return;

  if (!window.currentUser) {
    el.innerHTML = `
      <span class="account-logged-out">
        Not logged in —
        <button class="link-btn" id="menuLoginBtn">Log in</button>
      </span>
    `;
    return;
  }

  const p = window.myProfile;
  const name = p?.username || window.currentUser.email;

  const elo =
    p
      ? `Elo: 
         🚀 ${p.rating_bullet}
         ⚡⚡ ${p.rating_blitz}
         🧠 ${p.rating_deep}`
      : "Loading rating…";

  el.innerHTML = `
    <span class="account-logged-in">
      <strong>${name}</strong><br/>
      <small>${elo}</small>
      <button class="link-btn" id="menuLogoutBtn">Log out</button>
    </span>
  `;
  $("menuLogoutBtn").onclick = logout;

}



// Fetch past games
$("showPastGamesBtn")?.addEventListener("click", async () => {
  if (!window.currentUser) return;

  const { data, error } = await window.supabase
    .from("matches")
    .select("*")
    .or(`player_a.eq.${window.currentUser.id},player_b.eq.${window.currentUser.id}`)
    .order("created_at", { ascending: false })
    .limit(20);

  if (!error) renderPastGames(data);
});


function renderPastGames(matches) {
  const container = $("pastGamesContainer");
  if (!container) return;

  const myId = window.currentUser.id;

  container.innerHTML = matches.map(m => {
    const opponentName =
      m.opponent_name || "Opponent";

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
    const powers = summarizeMatchPowers(m.rounds || []);

    return `
      <div class="past-game-row" tabindex="0"
           onclick="openSummary('${m.id}')"
           onkeydown="if(event.key==='Enter') openSummary('${m.id}')">

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
          powers
            ? `<div class="past-game-powers">${powers}</div>`
            : ""
        }
      </div>
    `;
  }).join("");
}


function summarizeMatchPowers(rounds = []) {
  const used = new Set();

  rounds.forEach(r => {
    r.history?.forEach(h => {
      (h.powersSetter || []).forEach(p => used.add(p));
      (h.powersGuesser || []).forEach(p => used.add(p));
    });
  });

  if (!used.size) return "";

  return [...used]
    .map(powerToInlineIcon)
    .join(" ");
}
async function loadLeaderboard(mode) {
  const list = $("leaderboardList");
  if (!list) return;

  list.textContent = "Loading…";

  const ratingColumn = `rating_${mode}`;

  const { data, error } = await window.supabase
     .from("leaderboard_profiles")
      .select(`id, username, ${ratingColumn}`)
      .order(ratingColumn, { ascending: false })
      .limit(10);

  if (error) {
    console.error("Leaderboard load failed:", error);
    list.textContent = "Failed to load leaderboard";
    return;
  }

  renderLeaderboard(data, mode);
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
    // If leaderboard screen is visible, refresh it
  if (document.getElementById("leaderboardScreen")?.classList.contains("active")) {
    const activeTab =
      document.querySelector(".leaderboard-tab.active")?.dataset.mode;
    if (activeTab) loadLeaderboard(activeTab);
  }
}

async function logout() {
  autoRejoinAttempted = false;
  authReady = false;
  profileReady = false;

  localStorage.removeItem("roomId");

  await window.supabase.auth.signOut();

  window.currentUser = null;
  window.myProfile = null;
  clearRoom();

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

    window.roomId = storedRoomId;

    resetRoomUIState();
    onRejoinUI();

  });
}


socket.on("connect", async () => {
  console.log("🔌 Connected");

  const storedRoomId = localStorage.getItem("roomId");
  const user = window.currentUser;

  if (!storedRoomId || !user) return;

  const username =
    window.myProfile?.username ||
    user.email ||
    "Player";

  socket.emit(
    "joinRoom",
    {
      roomId: storedRoomId,
      userId: user.id,
      name: username
    },
    res => {
      if (!res?.ok) {
        console.warn("Auto-rejoin failed:", res?.error);
        localStorage.removeItem("roomId");
        return;
      }

      console.log("♻️ Rejoined room", storedRoomId);

      // IMPORTANT: sync local state
      window.roomId = storedRoomId;
    }
  );
  window.socketReady = true;
  maybeAutoRejoin();
});

