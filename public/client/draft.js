// client/draft.js — pre-round power draft screen (Draft Mode, always on)
//
// Setter: offered 3 powers, picks 2 (unchanged). Guesser: offered 2
// powers (picks 1) AND, independently, 2 Quests (picks 1) -- two separate
// candidate/pick lists (state.draftCandidates/draftPicks for powers,
// state.draftQuestCandidates/draftQuestPicks for quests), rendered as two
// sections on the same screen. See server/core/phases/draft.js for the
// matching DRAFT_PICK / DRAFT_PICK_QUEST / DRAFT_DONE handling.

function renderDraftCandidateList(container, { candidates, picks, done, metaFor, onPick }) {
  container.innerHTML = "";
  candidates.forEach(id => {
    const meta = metaFor(id);
    const fullDesc = meta?.desc || "";
    const shortDesc = meta?.short || fullDesc;
    const btn = document.createElement("button");
    btn.className = "draft-candidate-btn";
    btn.disabled = done;
    btn.classList.toggle("selected", picks.includes(id));
    btn.innerHTML = `
      <span class="draft-candidate-emoji">${meta?.emoji || ""}</span>
      <span class="draft-candidate-label">
        ${meta?.label || id}
        <button type="button" class="draft-candidate-info" aria-label="Details">ⓘ</button>
      </span>
      <span class="draft-candidate-desc">${shortDesc}</span>
    `;
    btn.querySelector(".draft-candidate-info")?.addEventListener("click", e => {
      e.stopPropagation();
      window.showPowerPopup?.({
        emoji: meta?.emoji || "",
        title: meta?.label || id,
        desc: fullDesc
      });
    });
    btn.onclick = () => {
      if (done) return;
      onPick(id);
    };
    container.appendChild(btn);
  });
}

window.renderDraftScreen = function (s) {
  const uid = myUserId();
  const myRole = s.players?.[uid]?.role;
  const isGuesser = myRole !== "setter";

  const candidates = s.draftCandidates?.[uid] || [];
  const myPicks = s.draftPicks?.[uid] || [];
  const questCandidates = s.draftQuestCandidates?.[uid] || [];
  const myQuestPicks = s.draftQuestPicks?.[uid] || [];
  const iAmDone = !!s.draftDone?.[uid];

  const opponentId = Object.keys(s.players || {}).find(id => id !== uid);
  const opponentDone = opponentId ? !!s.draftDone?.[opponentId] : false;

  const roleLabel = $("draftRoleLabel");
  if (roleLabel) {
    roleLabel.textContent = isGuesser
      ? "Drafting for: Inspector"
      : "Drafting for: Spy";
    roleLabel.classList.toggle("role-setter", !isGuesser);
    roleLabel.classList.toggle("role-guesser", isGuesser);
  }

  const instruction = $("draftInstruction");
  if (instruction) {
    instruction.textContent = isGuesser
      ? "Pick 1 of the 2 powers below for your side."
      : "Pick 2 of the 3 powers below for your side.";
  }

  const list = $("draftCandidates");
  if (list) {
    renderDraftCandidateList(list, {
      candidates,
      picks: myPicks,
      done: iAmDone,
      metaFor: id => window.POWER_METADATA?.[id],
      onPick: powerId => sendGameAction({
        type: "DRAFT_PICK",
        power: powerId,
        userId: window.currentUser.id
      })
    });
  }

  const questSection = $("draftQuestSection");
  if (questSection) {
    questSection.hidden = !isGuesser;
  }
  if (isGuesser) {
    const questList = $("draftQuestCandidates");
    if (questList) {
      renderDraftCandidateList(questList, {
        candidates: questCandidates,
        picks: myQuestPicks,
        done: iAmDone,
        metaFor: id => window.QUEST_METADATA?.[id],
        onPick: questId => sendGameAction({
          type: "DRAFT_PICK_QUEST",
          quest: questId,
          userId: window.currentUser.id
        })
      });
    }
  }

  const requiredPowerPicks = isGuesser ? 1 : 2;
  const powerReady = myPicks.length === requiredPowerPicks;
  const questReady = !isGuesser || myQuestPicks.length === 1;
  const allReady = powerReady && questReady;

  const doneBtn = $("draftDoneBtn");
  if (doneBtn) {
    doneBtn.disabled = iAmDone || !allReady;
    doneBtn.textContent = iAmDone ? "Waiting for opponent…" : "Lock In";
    doneBtn.onclick = () => {
      if (!allReady) return;
      sendGameAction({ type: "DRAFT_DONE", userId: window.currentUser.id });
    };
  }

  const status = $("draftStatus");
  if (status) {
    if (iAmDone) {
      status.textContent = opponentDone
        ? "Both sides locked in — starting…"
        : "Locked in. Waiting for opponent…";
    } else if (isGuesser) {
      status.textContent = `Power ${myPicks.length}/1 · Quest ${myQuestPicks.length}/1`;
    } else {
      status.textContent = `Pick 2 (${myPicks.length}/2 selected)`;
    }
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
