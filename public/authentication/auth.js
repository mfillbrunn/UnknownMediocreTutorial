const emailInput = $("authEmail");
const passwordInput = $("authPassword");
const status = $("authStatus");
const logoutBtn = $("logoutBtn");

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

logoutBtn.onclick = async () => {
  await window.supabase.auth.signOut();
  status.textContent = "Logged out";
  
};

window.supabase.auth.onAuthStateChange(async (_event, session) => {
  window.currentUser = session?.user || null;
  window.myProfile = null;

  // Initial render (email fallback is OK here)
  renderMenuAccountStatus();

  if (window.currentUser) {
    await loadMyProfile(); // will re-render when done
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
    renderMenuAccountStatus();
    updateRoleLabels?.();
    return data;
  } catch (err) {
    if (err?.name !== "AbortError") {
      console.error("Profile load failed:", err);
    }
    return null;
  } finally {
    profileLoadInProgress = false;
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
    $("menuLoginBtn").onclick = () => showScreen("accountScreen");
    return;
  }

  const name = window.myProfile?.username || window.currentUser.email;

  el.innerHTML = `
    <span class="account-logged-in">
      Logged in as <strong>${name}</strong>
      <button class="link-btn" id="menuLogoutBtn">Log out</button>
    </span>
  `;
}


// Fetch match history
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
    // -----------------------
    // Opponent
    // -----------------------
    const opponentId =
      m.player_a === myId ? m.player_b : m.player_a;

    const opponentName =
      m.opponent_name || "Opponent"; // best if you join names server-side

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

    // -----------------------
    // Score
    // -----------------------
    const score =
      m.player_a === myId
        ? `${m.score_a}–${m.score_b}`
        : `${m.score_b}–${m.score_a}`;

    // -----------------------
    // Time mode
    // -----------------------
    const timeMode = formatTimeMode(m.time_control);

    // -----------------------
    // Powers
    // -----------------------
    const powers = summarizeMatchPowers(m.rounds);

    return `
      <div class="history-row" onclick="openSummary('${m.id}')">
        <div class="history-main">
          <div class="history-opponent">
            vs <strong>${opponentName}</strong>
          </div>

          <div class="history-meta">
            <span class="history-date">
              ${new Date(m.created_at).toLocaleDateString()}
            </span>
            <span class="history-mode">
              ${m.ranked ? "🏆 Ranked" : "🎮 Casual"} · ${timeMode}
            </span>
          </div>
        </div>

        <div class="history-result">
          <span class="result-icon">${resultIcon}</span>
          <span class="result-text">${resultLabel}</span>
          <span class="result-score">${score}</span>
        </div>

        ${
          powers
            ? `<div class="history-powers">${powers}</div>`
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


