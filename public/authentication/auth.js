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
$("showHistoryBtn")?.addEventListener("click", async () => {
  if (!window.currentUser) return;

  const { data, error } = await window.supabase
    .from("matches")
    .select("*")
    .or(`player_a.eq.${window.currentUser.id},player_b.eq.${window.currentUser.id}`)
    .order("created_at", { ascending: false })
    .limit(20);

  if (!error) renderMatchHistory(data);
});


function renderMatchHistory(matches) {
  const container = $("historyContainer");
  if (!container) return;

  container.innerHTML = matches.map(m => `
    <div class="history-row">
      ${new Date(m.created_at).toLocaleDateString()}
      ${m.ranked ? "🏆" : "🎮"}
      ${m.mode}
      <button onclick="openSummary('${m.id}')">View</button>
    </div>
  `).join("");
}



