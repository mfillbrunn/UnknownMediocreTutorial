// client/my-games.js — lists the player's in-progress unlimited-time
// games (they can be safely disconnected from and resumed any time) and
// lets them jump back into whichever one, highlighting whose turn it is.

// Green mail badge on the My Games button — checked on login and whenever
// the player lands back on the main menu, so it doesn't need a live
// subscription per game to stay reasonably fresh.
window.refreshMyGamesNotification = function () {
  const badge = document.getElementById("myGamesNotifyBadge");
  if (!badge) return;
  if (!window.currentUser) {
    badge.classList.add("hidden");
    return;
  }

  socket.emit("getMyActiveGames", { userId: window.currentUser.id }, games => {
    const hasTurn = Array.isArray(games) && games.some(g => g.isMyTurn && !g.isPending);
    badge.classList.toggle("hidden", !hasTurn);
  });
};

window.showMyGames = async function () {
  if (!window.currentUser) return toast("Please log in first");

  showScreen("myGamesScreen");
  const screen = document.getElementById("myGamesScreen");
  if (!screen) return;

  screen.innerHTML = `<div class="menu-center"><p class="daily-date">Loading…</p></div>`;

  const [games, invites] = await Promise.all([
    new Promise(resolve => {
      socket.emit("getMyActiveGames", { userId: window.currentUser.id }, resolve);
    }),
    window._fetchGameInvites ? window._fetchGameInvites(window.currentUser.id) : []
  ]);

  const gameList = Array.isArray(games) ? games : [];

  if (gameList.length === 0 && !invites.length) {
    screen.innerHTML = `<div class="menu-center">
      <h2 class="menu-title">My Games</h2>
      <p class="daily-completed-msg">
        No unlimited-time games in progress. Start one with the
        "Unlimited" time control — you can disconnect any time and
        pick it back up here.
      </p>
      <button class="menu-btn" onclick="showStartup()">Back</button>
    </div>`;
    return;
  }

  const pending = gameList.filter(g => g.isPending);
  const active = gameList.filter(g => !g.isPending);
  const casual = active.filter(g => !g.ranked);
  const ranked = active.filter(g => g.ranked);

  const section = (title, list) => {
    if (!list.length) return "";
    return `
      <div class="my-games-section">
        <h3 class="my-games-section-title">${title}</h3>
        <div class="my-games-list">${list.map(_renderGameRow).join("")}</div>
      </div>
    `;
  };

  const invitesSection = invites.length ? `
    <div class="my-games-section">
      <h3 class="my-games-section-title">Game Invites</h3>
      <div class="my-games-list">${invites.map(_renderInviteRow).join("")}</div>
    </div>
  ` : "";

  screen.innerHTML = `
    <div class="menu-center">
      <h2 class="menu-title">My Games</h2>
      <p class="daily-date">♾️ Unlimited-time games in progress</p>
      ${invitesSection}
      ${section("Waiting for a friend", pending)}
      ${section("Casual", casual)}
      ${section("Ranked", ranked)}
      <button class="menu-btn" onclick="showStartup()">Back</button>
    </div>
  `;

  screen.querySelectorAll(".my-game-row").forEach(btn => {
    btn.addEventListener("click", () => _resumeMyGame(btn.dataset.roomId));
  });

  screen.querySelectorAll(".my-game-abandon-btn").forEach(btn => {
    btn.addEventListener("click", e => {
      e.stopPropagation();
      _abandonMyGame(btn.dataset.roomId);
    });
  });

  screen.querySelectorAll(".my-game-invite-join-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      await window._acceptGameInvite(btn.dataset.inviteId, btn.dataset.roomId);
    });
  });

  screen.querySelectorAll(".my-game-invite-decline-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      await window._declineGameInvite(btn.dataset.inviteId);
      window.showMyGames();
    });
  });
};

function _renderInviteRow(inv) {
  return `
    <div class="my-game-row-wrap">
      <span class="my-game-row">
        <span class="my-game-main">
          <span class="my-game-opponent">${inv.sender?.username || "?"} invited you</span>
        </span>
      </span>
      <button class="my-game-abandon-btn my-game-invite-join-btn" data-invite-id="${inv.id}" data-room-id="${inv.room_id}">Join</button>
      <button class="my-game-abandon-btn my-game-invite-decline-btn" data-invite-id="${inv.id}" title="Decline this invite">Decline</button>
    </div>
  `;
}

function _formatStartDate(ts) {
  if (!ts) return "";
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function _renderGameRow(g) {
  if (g.isPending) {
    return `
      <div class="my-game-row-wrap">
        <button class="my-game-row pending" data-room-id="${g.roomId}">
          <span class="my-game-main">
            <span class="my-game-opponent">Room ${g.roomId}</span>
            <span class="my-game-date">Share the link again from here if you need to</span>
          </span>
          <span class="my-game-turn-badge">Waiting for join…</span>
        </button>
        <button class="my-game-abandon-btn" data-room-id="${g.roomId}" title="Cancel this invite">Cancel</button>
      </div>
    `;
  }

  const dateLabel = _formatStartDate(g.startedAt);
  return `
    <div class="my-game-row-wrap">
      <button class="my-game-row ${g.isMyTurn ? "your-turn" : ""}" data-room-id="${g.roomId}">
        <span class="my-game-main">
          <span class="my-game-opponent">vs ${g.opponentName}</span>
          ${dateLabel ? `<span class="my-game-date">Started ${dateLabel}</span>` : ""}
        </span>
        <span class="my-game-turn-badge">${g.isMyTurn ? "Your turn" : "Waiting…"}</span>
      </button>
      ${g.ranked ? "" : `<button class="my-game-abandon-btn" data-room-id="${g.roomId}" title="End this game for good">Abandon</button>`}
    </div>
  `;
}

function _resumeMyGame(targetRoomId) {
  const username = window.myProfile?.username || window.currentUser?.email || "Player";

  // Deliberately returning to a room started via "Invite a Friend" —
  // let normal screen updates resume for it.
  if (window._asyncInviteRoomId === targetRoomId) window._asyncInviteRoomId = null;

  // Not just window.roomId — client.js's own `roomId` (declared with
  // `let`, so it's a separate global binding, not a window property) is
  // what PowerEngine's one-time button-render guard actually checks.
  // Leaving it unset here is exactly why the power buttons (and other
  // roomId-gated UI) stayed missing until a full page reload re-derived
  // it from localStorage.
  roomId = targetRoomId;
  window.roomId = targetRoomId;
  persistRoom(targetRoomId);

  socket.emit(
    "joinRoom",
    { roomId: targetRoomId, userId: window.currentUser.id, name: username },
    res => {
      if (!res?.ok) {
        toast(res?.error || "Could not resume that game");
        showStartup();
        return;
      }
      roomId = res.roomId || targetRoomId;
      window.roomId = res.roomId || targetRoomId;
      onRejoinUI();
    }
  );
}

function _abandonMyGame(roomId) {
  if (!confirm("Abandon this game for good? This can't be undone.")) return;

  socket.emit(
    "abandonGame",
    { roomId, userId: window.currentUser.id },
    res => {
      if (!res?.ok) {
        toast(res?.error || "Could not abandon that game");
        return;
      }
      toast("Game abandoned");
      window.showMyGames();
    }
  );
}

document.getElementById("myGamesBtn")?.addEventListener("click", () => {
  window.showMyGames();
});
