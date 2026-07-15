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

document.getElementById("inviteBtn")?.addEventListener("click", async () => {
  if (!window.roomId) return;

  const link = `${location.origin}${location.pathname}?join=${window.roomId}`;

  if (navigator.share) {
    try {
      await navigator.share({ title: "Join my VS Wordle game", url: link });
      return;
    } catch { /* user cancelled or share failed — fall through to copy */ }
  }

  try {
    await navigator.clipboard.writeText(link);
    toast("Invite link copied");
  } catch {
    toast("Could not copy invite link");
  }
});
