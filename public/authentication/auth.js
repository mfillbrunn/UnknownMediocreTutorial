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
      .insert({
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



async function loadMyProfile() {
  if (!window.currentUser) return null;

  try {
    const { data, error } = await window.supabase
      .from("profiles")
      .select("*")
      .eq("id", window.currentUser.id)
      .single();

    if (error) throw error;

    window.myProfile = data;

    // 🔴 IMPORTANT: re-render UI AFTER profile loads
    renderMenuAccountStatus();
    updateRoleLabels?.(); // optional, if username shown elsewhere

    return data;
  } catch (err) {
    if (err.name !== "AbortError") {
      console.error("Profile load failed:", err);
    }
    return null;
  }
}


function renderMenuAccountStatus() {
  const el = $("menuAccountStatus");
  if (!el) return;

  // Not logged in
  if (!window.currentUser) {
    el.innerHTML = `
      <span class="account-logged-out">
        Not logged in —
        <button class="link-btn" id="menuLoginBtn">Log in</button>
      </span>
    `;

    $("menuLoginBtn").onclick = () => {
      showScreen("accountScreen");
    };

    return;
  }

  // Logged in
  const name = window.myProfile?.username || window.currentUser.email;

  el.innerHTML = `
    <span class="account-logged-in">
      Logged in as <strong>${name}</strong>
      <button class="link-btn" id="menuLogoutBtn">Log out</button>
    </span>
  `;

  $("menuLogoutBtn").onclick = async () => {
    await window.supabase.auth.signOut();
  };
}

