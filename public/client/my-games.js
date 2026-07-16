// client/my-games.js — lists the player's in-progress unlimited-time
// games (they can be safely disconnected from and resumed any time) and
// lets them jump back into whichever one, highlighting whose turn it is.

window.showMyGames = async function () {
  if (!window.currentUser) return toast("Please log in first");

  showScreen("myGamesScreen");
  const screen = document.getElementById("myGamesScreen");
  if (!screen) return;

  screen.innerHTML = `<div class="menu-center"><p class="daily-date">Loading…</p></div>`;

  const games = await new Promise(resolve => {
    socket.emit("getMyActiveGames", { userId: window.currentUser.id }, resolve);
  });

  if (!Array.isArray(games) || games.length === 0) {
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

  const pending = games.filter(g => g.isPending);
  const active = games.filter(g => !g.isPending);
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

  screen.innerHTML = `
    <div class="menu-center">
      <h2 class="menu-title">My Games</h2>
      <p class="daily-date">♾️ Unlimited-time games in progress</p>
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
};

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

function _resumeMyGame(roomId) {
  const username = window.myProfile?.username || window.currentUser?.email || "Player";

  // Deliberately returning to a room started via "Invite a Friend" —
  // let normal screen updates resume for it.
  if (window._asyncInviteRoomId === roomId) window._asyncInviteRoomId = null;

  window.roomId = roomId;
  persistRoom(roomId);

  socket.emit(
    "joinRoom",
    { roomId, userId: window.currentUser.id, name: username },
    res => {
      if (!res?.ok) {
        toast(res?.error || "Could not resume that game");
        showStartup();
        return;
      }
      window.roomId = res.roomId || roomId;
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
