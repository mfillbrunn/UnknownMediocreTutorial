// client/draft.js — pre-round power draft screen

// Big corner badges for a picked candidate, instead of the old small text
// pill -- "kind" is a semantic key (not display text) so each one gets its
// own shape: "start" for the Spy's first (immediately-active) pick, "five"
// for their second (locked-until-the-power-threshold) pick, and "selected"
// for anything the Inspector picks -- power or Quest alike share the exact
// same checkmark icon, since for them there's only ever one meaningful
// state ("this is my pick"), not two different ones to tell apart.
//
// "five" is a legacy name from when the power threshold was 5 stars (see
// spyChargeServer.js's POWER_UNLOCK_AT) -- kept as-is since renaming it
// everywhere it's threaded through is a bigger diff than the badge itself,
// but the displayed number below always reflects the real threshold.
function buildDraftPickBadge(kind) {
  if (kind === "start") {
    return `<span class="draft-pick-slot draft-pick-start" aria-label="Starts active">START</span>`;
  }

  if (kind === "five") {
    return `
      <span class="draft-pick-slot draft-pick-five" aria-label="Unlocks at 8 stars">
        <span class="draft-pick-five-star" aria-hidden="true">★</span>
        <span class="draft-pick-five-num" aria-hidden="true">8</span>
      </span>
    `;
  }

  if (kind === "selected") {
    return `<span class="draft-pick-slot draft-pick-selected" aria-label="Selected">✓</span>`;
  }

  return "";
}

function renderDraftCandidateList(
  container,
  {
    candidates,
    picks,
    done,
    metaFor,
    onPick,
    pickLabel
  }
) {
  container.innerHTML = "";

  candidates.forEach(id => {
    const meta = metaFor(id);
    const fullDesc = meta?.desc || "";
    const shortDesc = meta?.short || fullDesc;
    const selectedIndex = picks.indexOf(id);
    const selected = selectedIndex >= 0;
    const pickKind = selected ? pickLabel?.(selectedIndex) : "";

const btn =
  document.createElement(
    "button"
  );

btn.className =
  "draft-candidate-btn";

btn.disabled = done;

/*
 * This candidate renderer is also used
 * for Quests. Apply a power palette only
 * when this ID belongs to a power.
 */
if (
  window.POWER_METADATA?.[id]
) {
  window.applyPowerPalette?.(
    btn,
    id
  );
}
    if (window.QUEST_METADATA?.[id]) {
      btn.classList.add("quest-themed");
      btn.dataset.questType = id;
    }
    btn.classList.toggle("selected", selected);

    btn.innerHTML = `
      ${buildDraftPickBadge(pickKind)}
      <span class="draft-candidate-emoji">${meta?.emoji || ""}</span>
      <span class="draft-candidate-label">
        ${meta?.label || id}
        <span class="draft-candidate-info" role="button" tabindex="0" aria-label="Details">ⓘ</span>
      </span>
      <span class="draft-candidate-desc">${shortDesc}</span>
    `;

    const info = btn.querySelector(".draft-candidate-info");

    const showInfo = event => {
      event.stopPropagation();
      window.showPowerPopup?.({
        emoji: meta?.emoji || "",
        title: meta?.label || id,
        desc: fullDesc
      });
    };

    info?.addEventListener("click", showInfo);
    info?.addEventListener("keydown", event => {
      if (event.key === "Enter" || event.key === " ") showInfo(event);
    });

    btn.addEventListener("click", () => {
      if (!done) onPick(id);
    });

    container.appendChild(btn);
  });
}

window.renderDraftScreen = function (state) {
  const userId = myUserId();
  const myRole = state.players?.[userId]?.role;
  const isGuesser = myRole !== "setter";
  const powerTarget = isGuesser ? 1 : 2;

  const candidates = state.draftCandidates?.[userId] || [];
  const myPicks = state.draftPicks?.[userId] || [];
  const questCandidates = state.draftQuestCandidates?.[userId] || [];
  const myQuestPicks = state.draftQuestPicks?.[userId] || [];
  const iAmDone = !!state.draftDone?.[userId];
  const opponentId = Object.keys(state.players || {}).find(id => id !== userId);
  const opponentDone = opponentId ? !!state.draftDone?.[opponentId] : false;

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
      : "Pick 2 of 3 powers. Your first pick starts active; your second unlocks when the charge meter reaches 8 stars.";
  }

  const list = $("draftCandidates");
  if (list) {
    renderDraftCandidateList(list, {
      candidates,
      picks: myPicks,
      done: iAmDone,
      metaFor: id => window.POWER_METADATA?.[id],
      pickLabel: index => {
        if (isGuesser) return "selected";
        return index === 0 ? "start" : "five";
      },
      onPick: powerId => sendGameAction({
        type: "DRAFT_PICK",
        power: powerId,
        userId: window.currentUser.id
      })
    });
  }

  const questSection = $("draftQuestSection");
  if (questSection) questSection.hidden = !isGuesser;

  if (isGuesser) {
    const questList = $("draftQuestCandidates");

    if (questList) {
      renderDraftCandidateList(questList, {
        candidates: questCandidates,
        picks: myQuestPicks,
        done: iAmDone,
        metaFor: id => window.QUEST_METADATA?.[id],
        pickLabel: () => "selected",
        onPick: questId => sendGameAction({
          type: "DRAFT_PICK_QUEST",
          quest: questId,
          userId: window.currentUser.id
        })
      });
    }
  }

  const powerReady = myPicks.length === powerTarget;
  const questReady = !isGuesser || myQuestPicks.length === 1;
  const allReady = powerReady && questReady;

  const doneBtn = $("draftDoneBtn");
  if (doneBtn) {
    doneBtn.disabled = iAmDone || !allReady;
    doneBtn.textContent = iAmDone ? "Waiting for opponent…" : "Lock In";
    doneBtn.onclick = () => {
      if (!allReady) return;

      sendGameAction({
        type: "DRAFT_DONE",
        userId: window.currentUser.id
      });
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
      status.textContent = `Powers ${myPicks.length}/2`;
    }
  }
};

socket.on("draftTick", ({ remainingMs }) => {
  const label = $("draftTimerLabel");
  if (!label) return;

  const seconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;

  label.textContent = `${minutes}:${String(remainder).padStart(2, "0")}`;
  label.classList.toggle("draft-timer-low", seconds <= 10);
});
