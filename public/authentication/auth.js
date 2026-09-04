const status = $("authStatus");
const logoutBtn = $("logoutBtn");
window.socketReady = false;
window.autoRejoinAttempted = false;
// Deliberately NOT reset to null/false here: client/guest-identity.js runs
// first and has already installed a playable guest identity (with
// authReady/profileReady set to match). Blanking them would leave the app
// with no identity at all until Supabase answers -- and with none ever, if
// Supabase is unreachable.
window.authReady = window.authReady || false;
window.profileReady = window.profileReady || false;
window.currentUser = window.currentUser || null;
window.myProfile = window.myProfile || null;
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
      window.clearGuestIdentityFromSession?.();
      window.currentUser = data.session.user;
      window.authReady = true;
    } else {
      // No account: fall back to the guest identity rather than a null
      // user, so everything except the account-only suite stays playable.
      window.applyGuestIdentity?.();
    }

    updateAccountUI();
    renderMenuAccountStatus();

    // Came in on an invite link without an account — an invite is a
    // two-player game, so it still wants a real sign-in; the auth hooks
    // below pick the join back up once they do.
    if (!window.isSignedIn?.()) {
      window.maybeJoinPendingInvite?.();
    }
  } catch (err) {
    if (!isAbortError(err)) console.error(err);
    // Supabase unreachable/misconfigured: guest play is the whole point of
    // not requiring an account, so fall back to it rather than leaving the
    // player with no identity and every button inert.
    window.applyGuestIdentity?.();
    updateAccountUI();
    renderMenuAccountStatus();
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
      const parsed = JSON.parse(cachedProfile);
      // Only adopt a cached profile that belongs to the identity currently
      // in play. Without this, a leftover profile from a previous account
      // would rename the guest that guest-identity.js just set up.
      if (parsed && (!window.currentUser?.isGuest || parsed.id === window.currentUser.id)) {
        window.myProfile = parsed;
      }
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
  window.cancelRoomSync?.();

  localStorage.removeItem(
    "roomId"
  );

  window.roomId = null;
  window.state = null;
  state = null;

  window.isRejoining = false;
  window.gameSessionReady = true;
  window.autoRejoinAttempted =
    true;

  window.resetTransientGameUI?.();

  // Leaving the room this way (forced out by the server, rejoin declined,
  // or an unlimited-time "Leave") never fires a fresh tutorialSteps() call
  // for the room we just left, so a tutorial bubble left on screen would
  // otherwise sit there forever with no game underneath it.
  window.hideTutorial?.();

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

// Wrapped: if the Supabase client failed to construct (bad/absent config,
// blocked network), an uncaught throw here would abort the rest of this
// file -- taking logout, updateAccountUI and loadMyProfile with it. Guest
// play must survive that, so the failure is logged and the guest identity
// installed at boot simply stands.
try {
window.supabaseClient.auth.onAuthStateChange(async (event, session) => {
  console.log("AUTH EVENT:", event);

  if (session?.user) {
    window.clearGuestIdentityFromSession?.();
    window.currentUser = session.user;
  } else {
    window.currentUser = null;
  }

  if (event === "SIGNED_OUT") {
    window.autoRejoinAttempted = false;

    // Signing out drops back to guest play rather than to a dead-end
    // logged-out state -- everything but ranked/friends/stats still works.
    window.applyGuestIdentity?.();

    updateAccountUI();
    renderMenuAccountStatus();
    showStartup();
    return;
  }

  // ⛔ DO NOT mark authReady yet
  if (event === "INITIAL_SESSION") {
    // No session at all: the guest identity applied at boot stands, and
    // there is no profile to load.
    if (!session?.user) {
      window.applyGuestIdentity?.();
      updateAccountUI();
      renderMenuAccountStatus();
      return;
    }

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

      // First-time onboarding offer (see tutorial-progress.js) -- no-ops
      // instantly if already dismissed, or if there's an invite/game to
      // return to instead of a plain landing on the startup screen.
      window.maybeOfferOnboarding?.();

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
      // First-time onboarding offer (see tutorial-progress.js) -- same
      // "nothing else going on" guard this branch already used to decide
      // to show the plain startup screen in the first place.
      window.maybeOfferOnboarding?.();
    }

    await loadMyProfile();
    window.profileReady = true;

    if (!(window._pendingInviteCode && maybeJoinPendingInvite())) {
      maybeAutoRejoin();
    }
  }
});
} catch (err) {
  console.error("Auth listener unavailable — continuing as a guest:", err);
  window.applyGuestIdentity?.();
}

let profileLoadInProgress = false;

async function loadMyProfile() {
  // Guests have no profiles row to read (and their id is not a uuid), so
  // this would only ever be a failed round-trip for them.
  if (!window.isSignedIn?.() || profileLoadInProgress) return null;
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
  // Straight back to guest play -- logging out is not the same as being
  // locked out of the game.
  window.applyGuestIdentity?.();
  clearRoom();
  updateAccountUI();
  renderMenuAccountStatus();
  showStartup();
}

function updateAccountUI() {
  const root = $("accountScreen");
  if (!root) return;

  // A guest has a window.currentUser too, so "logged in" here has to mean
  // "has a real account" -- see client/guest-identity.js.
  const loggedIn = !!window.isSignedIn?.();

  const guestBox = root.querySelector("#guestAccountNotice");
  if (guestBox) {
    guestBox.classList.toggle("hidden", loggedIn);
    const nameEl = guestBox.querySelector("#guestAccountName");
    if (nameEl) nameEl.textContent = window.myProfile?.username || "Guest";
  }

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

