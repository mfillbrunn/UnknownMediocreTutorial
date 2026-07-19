// client/draft.js — pre-round power draft screen (Draft Mode, always on)

window.renderDraftScreen = function (s) {
  const uid = myUserId();
  const candidates = s.draftCandidates?.[uid] || [];
  const myPicks = s.draftPicks?.[uid] || [];
  const iAmDone = !!s.draftDone?.[uid];
  const myRole = s.players?.[uid]?.role;

  const opponentId = Object.keys(s.players || {}).find(id => id !== uid);
  const opponentDone = opponentId ? !!s.draftDone?.[opponentId] : false;

  const roleLabel = $("draftRoleLabel");
  if (roleLabel) {
    roleLabel.textContent = myRole === "setter"
      ? "Drafting for: Spy"
      : "Drafting for: Inspector";
    roleLabel.classList.toggle("role-setter", myRole === "setter");
    roleLabel.classList.toggle("role-guesser", myRole === "guesser");
  }

  const list = $("draftCandidates");
  if (list) {
    list.innerHTML = "";
    candidates.forEach(powerId => {
      const meta = window.POWER_METADATA?.[powerId];
      // The candidate list is a quick skim, not the place for the full
      // rules text — show just the first sentence there, and save the
      // complete description for the info popup on click.
      const fullDesc = meta?.desc || "";
      const shortDesc = fullDesc.split(/(?<=\.)\s+/)[0] || fullDesc;
      const btn = document.createElement("button");
      btn.className = "draft-candidate-btn";
      btn.disabled = iAmDone;
      btn.classList.toggle("selected", myPicks.includes(powerId));
      btn.innerHTML = `
        <span class="draft-candidate-emoji">${meta?.emoji || ""}</span>
        <span class="draft-candidate-label">
          ${meta?.label || powerId}
          <button type="button" class="draft-candidate-info" aria-label="Power details">ⓘ</button>
        </span>
        <span class="draft-candidate-desc">${shortDesc}</span>
      `;
      btn.querySelector(".draft-candidate-info")?.addEventListener("click", e => {
        e.stopPropagation();
        window.showPowerPopup?.({
          emoji: meta?.emoji || "",
          title: meta?.label || powerId,
          desc: fullDesc
        });
      });
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

// No dedicated "powers drafted" popup here — the round-start popup
// (client.js, fired on every phase -> "simultaneous" transition) already
// shows the player's own role and their side's drafted/assigned powers.
