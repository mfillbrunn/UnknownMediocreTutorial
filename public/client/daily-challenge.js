// client/daily-challenge.js

window.showDailyChallenge = async function () {
  if (!window.currentUser) return toast("Please log in first");

  showScreen("dailyScreen");
  const screen = document.getElementById("dailyScreen");
  if (!screen) return;

  screen.innerHTML = `<div class="menu-center"><p class="daily-date">Loading…</p></div>`;

  let config;
  try {
    config = await fetch("/api/daily").then(r => r.json());
  } catch {
    screen.innerHTML = `<div class="menu-center">
      <p>Could not load daily challenge.</p>
      <button class="menu-btn" onclick="showStartup()">Back</button>
    </div>`;
    return;
  }

  const spyPills = (config.setterPowers || []).map(p => {
    const m = window.POWER_METADATA?.[p];
    return `<span class="daily-power-pill spy">${m?.emoji || ""} ${m?.label || p}</span>`;
  }).join("");

  const insPills = (config.guesserPowers || []).map(p => {
    const m = window.POWER_METADATA?.[p];
    return `<span class="daily-power-pill inspector">${m?.emoji || ""} ${m?.label || p}</span>`;
  }).join("");

  const diffLabels = { 1: "🤖 Beginner", 2: "🧠 The Thinker", 3: "🔥 The Sneak" };
  const diffLabel  = diffLabels[config.aiDifficulty] || "AI";

  screen.innerHTML = `
    <div class="menu-center">
      <h2 class="menu-title">Daily Challenge</h2>
      <p class="daily-date">☀️ ${config.date}</p>

      <div class="daily-powers-block">
        <div class="daily-powers-row">
          <span class="daily-role-label spy">Spy</span>
          <div class="daily-powers">${spyPills || "<span style='opacity:.4'>—</span>"}</div>
        </div>
        <div class="daily-powers-row">
          <span class="daily-role-label inspector">Inspector</span>
          <div class="daily-powers">${insPills || "<span style='opacity:.4'>—</span>"}</div>
        </div>
      </div>

      <p class="daily-ai-label">vs ${diffLabel}</p>

      <button id="startDailyBtn" class="menu-btn primary" style="margin-top:8px">
        Play Today's Challenge
      </button>
      <button class="menu-btn" onclick="showStartup()">Back</button>
    </div>
  `;

  document.getElementById("startDailyBtn")?.addEventListener("click", () => {
    _startDailyGame(config);
  });
};

function _startDailyGame(config) {
  const username = window.myProfile?.username || window.currentUser?.email || "Player";

  socket.emit("createRoom", { userId: window.currentUser.id, name: username }, resp => {
    if (!resp?.ok) return toast(resp?.error || "Could not create room");

    window.roomId = resp.roomId;
    persistRoom(resp.roomId);

    sendGameAction({ type: "ADD_AI", difficulty: config.aiDifficulty, userId: window.currentUser.id });

    setTimeout(() => {
      sendGameAction({ type: "SWITCH_ROLES", userId: window.currentUser.id });
    }, 40);

    setTimeout(() => {
      sendGameAction({
        type: "SET_DAILY_POWERS",
        setterPowers: config.setterPowers,
        guesserPowers: config.guesserPowers,
        date: config.date,
        userId: window.currentUser.id
      });
    }, 80);

    setTimeout(() => {
      sendGameAction({ type: "PLAYER_READY", userId: window.currentUser.id, mode: "daily" });
    }, 120);

    enterLobbyAfterJoin();
  });
}
