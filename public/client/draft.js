// client/draft.js — pre-round power draft screen (Draft Mode)

$("draftModeBadge")?.addEventListener("click", () => {
  if (!state || !window.currentUser) return;
  if (state.hostUserId !== window.currentUser.id) return;

  sendGameAction({
    type: "SET_DRAFT_MODE",
    draftMode: !state.draftMode,
    userId: window.currentUser.id
  });
});

window.updateDraftModeUI = function () {
  const badge = $("draftModeBadge");
  if (!badge || !state || !window.currentUser) return;

  const on = state.draftMode !== false;
  const isHost = state.hostUserId === window.currentUser.id;

  badge.textContent = on ? "🎴 Draft: On" : "🎴 Draft: Off";
  badge.classList.toggle("ranked-on", on);
  badge.classList.toggle("ranked-off", !on);
  badge.classList.toggle("readonly", !isHost);
};

window.renderDraftScreen = function (s) {
  const uid = myUserId();
  const candidates = s.draftCandidates?.[uid] || [];
  const myPicks = s.draftPicks?.[uid] || [];
  const iAmDone = !!s.draftDone?.[uid];

  const opponentId = Object.keys(s.players || {}).find(id => id !== uid);
  const opponentDone = opponentId ? !!s.draftDone?.[opponentId] : false;

  const list = $("draftCandidates");
  if (list) {
    list.innerHTML = "";
    candidates.forEach(powerId => {
      const meta = window.POWER_METADATA?.[powerId];
      const btn = document.createElement("button");
      btn.className = "draft-candidate-btn";
      btn.disabled = iAmDone;
      btn.classList.toggle("selected", myPicks.includes(powerId));
      btn.innerHTML = `
        <span class="draft-candidate-emoji">${meta?.emoji || ""}</span>
        <span class="draft-candidate-label">${meta?.label || powerId}</span>
        <span class="draft-candidate-desc">${meta?.desc || ""}</span>
      `;
      btn.onclick = () => {
        if (iAmDone) return;
        sendGameAction({
          type: "DRAFT_PICK",
          power: powerId,
          userId: window.currentUser.id
        });
      };
      list.appendChild(btn);
    });
  }

  const doneBtn = $("draftDoneBtn");
  if (doneBtn) {
    doneBtn.disabled = iAmDone || myPicks.length !== 2;
    doneBtn.textContent = iAmDone ? "Waiting for opponent…" : "Lock In";
    doneBtn.onclick = () => {
      if (myPicks.length !== 2) return;
      sendGameAction({ type: "DRAFT_DONE", userId: window.currentUser.id });
    };
  }

  const status = $("draftStatus");
  if (status) {
    status.textContent = iAmDone
      ? (opponentDone ? "Both sides locked in — starting…" : "Locked in. Waiting for opponent…")
      : `Pick 2 (${myPicks.length}/2 selected)`;
  }
};

socket.on("draftTick", ({ remainingMs }) => {
  const label = $("draftTimerLabel");
  if (!label) return;
  const secs = Math.max(0, Math.ceil(remainingMs / 1000));
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  label.textContent = `${m}:${String(s).padStart(2, "0")}`;
  label.classList.toggle("draft-timer-low", secs <= 10);
});

socket.on("draftRevealed", ({ setter, guesser }) => {
  const fmt = ids => (ids || [])
    .map(id => window.POWER_METADATA?.[id]?.label || id)
    .join(", ");

  window.showBigAnnounce?.({
    icon: "🎴",
    title: "Powers drafted!",
    sub: `Spy: ${fmt(setter.powers) || "—"}. Inspector: ${fmt(guesser.powers) || "—"}.`,
    roleClass: "outcome-win",
    duration: 3200
  });
});
