// client/invite.js — game invite links: share a room code as a URL, and
// auto-join it once the recipient is logged in (prompting login/signup
// first if they aren't).

window._pendingInviteCode = null;

(function captureInviteFromURL() {
  const params = new URLSearchParams(location.search);
  const code = params.get("join");
  if (!code) return;

  window._pendingInviteCode = code.trim().toUpperCase();

  // Strip it from the address bar so reloading/re-sharing the current
  // URL later doesn't repeat the auto-join.
  params.delete("join");
  const rest = params.toString();
  history.replaceState(null, "", location.pathname + (rest ? `?${rest}` : "") + location.hash);
})();

window.maybeJoinPendingInvite = function () {
  if (!window._pendingInviteCode) return false;

  if (!window.currentUser) {
    toast("Log in to join the game you were invited to");
    showScreen("accountScreen");
    return true;
  }

  const code = window._pendingInviteCode;
  window._pendingInviteCode = null; // consume once, whether it succeeds or not

  const username = window.myProfile?.username || window.currentUser?.email || "Player";
  joinRoom(code, { userId: window.currentUser.id, name: username }, res => {
    if (!res?.ok) {
      toast(res?.error || "Could not join that game");
      return;
    }
    window.roomId = code;
    persistRoom(code);
    enterLobbyAfterJoin();
  });

  return true;
};

async function shareOrCopyInviteLink(roomId, copiedMessage = "Invite link copied") {
  const link = `${location.origin}${location.pathname}?join=${roomId}`;

  if (navigator.share) {
    try {
      await navigator.share({ title: "Join my Vowel Play game", url: link });
      return;
    } catch { /* user cancelled or share failed — fall through to copy */ }
  }

  try {
    await navigator.clipboard.writeText(link);
    toast(copiedMessage);
  } catch {
    toast("Could not copy invite link");
  }
}

// "Invite a Friend" on the Play screen — a no-time-limit, casual, shuffled
// game the host doesn't need to stick around for: mark themselves ready
// up front, hand over the invite link, and let the friend pick it up
// whenever. Once they join and ready up, the round starts on its own and
// shows up in My Games for both of them.
window.startAsyncInvite = function () {
  if (!requireAuth("invite a friend")) return;
  window.rememberLastPlayMode?.({ mode: "friend" });

  const username = window.myProfile?.username || window.currentUser?.email || "Player";

  createRoom({ userId: window.currentUser.id, name: username }, resp => {
    if (!resp?.ok) {
      toast(resp?.error || "Could not create game");
      return;
    }

    window.roomId = resp.roomId;
    persistRoom(resp.roomId);

    sendGameAction({ type: "SET_SHUFFLE", shuffle: true, userId: window.currentUser.id });
    sendGameAction({ type: "SET_TIME_CONTROL", enabled: false, userId: window.currentUser.id });
    sendGameAction({ type: "PLAYER_READY", userId: window.currentUser.id });

    // The actions above echo back a state broadcast shortly after this
    // (still phase "lobby", since only one player has joined yet) — since
    // that lands asynchronously, it can arrive AFTER showStartup() below
    // and immediately re-force the lobby screen back on top of it. Worse,
    // once the friend actually joins and readies up, more broadcasts keep
    // arriving with the live game state — the whole point here is the
    // host doesn't have to sit through any of that, so suppress screen
    // forcing for this room entirely until they deliberately come back to
    // it (via My Games).
    window._asyncInviteRoomId = resp.roomId;

    // Share/copy right away (not after a delay) — navigator.share() needs
    // a live user-activation, which a setTimeout chain risks losing.
    shareOrCopyInviteLink(
      resp.roomId,
      "Invite link copied — the game starts as soon as your friend joins. Find it later in My Games."
    ).then(() => showStartup());
  });
};

document.getElementById("inviteAsyncBtn")?.addEventListener("click", () => {
  window.startAsyncInvite();
});
