const status = $("authStatus");
const logoutBtn = $("logoutBtn");
window.socketReady = false;
window.authReady = false;
window.profileReady = false;
window.autoRejoinAttempted = false;
window.currentUser = null;
window.myProfile = null;
let authInitInProgress = false;

function authFullyReady() {
  return window.authReady && window.profileReady && window.socketReady;
}

(async () => {
  if (authInitInProgress) return;
  authInitInProgress = true;

  try {
    const { data } = await window.supabaseClient.auth.getSession();

    if (data.session?.user) {
      window.currentUser = data.session.user;
      window.authReady = true;
    } else {
      window.currentUser = null;
      window.authReady = false;
    }

    updateAccountUI();
    renderMenuAccountStatus();

    // Not logged in at all and came in on an invite link — surface the
    // login/signup prompt now; the auth hooks below pick the join back
    // up once they actually sign in.
    if (!window.currentUser) {
      window.maybeJoinPendingInvite?.();
    }
  } catch (err) {
    if (!isAbortError(err)) console.error(err);
  } finally {
    authInitInProgress = false;
  }
})();


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
  window.roomId = null;
  window.state = null;
  state = null;
  window.autoRejoinAttempted = true;
  hide?.("game");
  hide?.("lobby");
  showStartup?.();
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

window.supabaseClient.auth.onAuthStateChange(async (event, session) => {
  console.log("AUTH EVENT:", event);

  window.currentUser = session?.user || null;

  if (event === "SIGNED_OUT") {
    window.authReady = false;
    window.profileReady = false;
    window.autoRejoinAttempted = false;

    updateAccountUI();
    renderMenuAccountStatus();
    showStartup();
    return;
  }

  // ⛔ DO NOT mark authReady yet
  if (event === "INITIAL_SESSION") {
    if (!session?.user) return;

    // Let Supabase finish wiring the token
    setTimeout(async () => {
      window.authReady = true;

      await loadMyProfile();
      window.profileReady = true;

      updateAccountUI();
      renderMenuAccountStatus();

      // If a game/lobby stateUpdate already arrived over the socket before
      // auth resolved, every render that ran up to now read myUserId() as
      // null — e.g. the draft screen looks up its candidates/picks by uid
      // and silently renders empty for a null key, leaving nothing
      // clickable until some later, unrelated state broadcast (like the
      // other player picking) happens to trigger a re-render. Re-render
      // now that the real uid is available so nothing is stuck waiting on
      // that.
      window.updateUI?.();

      if (!(window._pendingInviteCode && maybeJoinPendingInvite())) {
        maybeAutoRejoin();
      }

      window.refreshMyGamesNotification?.();

      // 🔁 retry loaders
      if (pendingLeaderboardMode) loadLeaderboard(pendingLeaderboardMode);

    }, 0);

    return;
  }

  if (event === "SIGNED_IN") {
    window.authReady = true;

    updateAccountUI();
    renderMenuAccountStatus();
    // Same reasoning as the INITIAL_SESSION branch above: re-render
    // whatever's already on screen now that myUserId() is finally correct.
    window.updateUI?.();

    // Supabase re-fires "SIGNED_IN" whenever a backgrounded tab regains
    // focus (it revalidates the session), not just on an actual login —
    // so this can't unconditionally jump to the startup screen, or it
    // yanks the player out of a live game just from switching tabs. Only
    // do that when there's no game to return to and no pending invite;
    // maybeAutoRejoin()/maybeJoinPendingInvite() below handle getting
    // into a game that exists.
    if (!window._pendingInviteCode && !window.roomId && !localStorage.getItem("roomId")) {
      showStartup();
    }

    await loadMyProfile();
    window.profileReady = true;

    if (!(window._pendingInviteCode && maybeJoinPendingInvite())) {
      maybeAutoRejoin();
    }
  }
});

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
  window.currentUser = null;
  window.myProfile = null;
  clearRoom();
  updateAccountUI();
  renderMenuAccountStatus();
  showStartup();
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
}

window.onProfileReady = onProfileReady;
window.logout = logout;

