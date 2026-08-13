// Modes Tutorial: explains the power/quest draft, using the REAL draft
// screen (not the gameplay screens) for the steps that are actually about
// drafting -- the human (Inspector, by default) makes real picks on the
// real #draftScreen, gated by polling the real draft state directly
// (state.draftPicks/draftQuestPicks/draftDone), the same "watch real
// state, no extra notify hooks needed" approach tutorial-star.js uses for
// its own live secret changes. Everything after the draft (the round-2
// swap explanation) stays narrative, same as before.

function modesTutorialShow(text, {
  role = window.myRole,
  title = "Modes Tutorial",
  current = null,
  total = null,
  placement = "bottom",
  compact = false,
  mode = "advance",
  visualHtml = "",
  key = null
} = {}) {
  showTutorial(text, {
    title,
    progressCurrent: current,
    progressTotal: total,
    tone: role === "setter" ? "setter" : "guesser",
    placement,
    compact,
    mode,
    visualHtml,
    key: key || undefined
  });
}

function modesSetterDraftVisual() {
  return `
    <div class="tutorial-eli5-mini-list">
      <span><b>1st pick</b> = active from the start</span>
      <span><b>2nd pick</b> = locked until 5 ★</span>
    </div>
  `;
}

function modesSwapVisual() {
  return `
    <div class="tutorial-choice-grid">
      <div class="tutorial-choice-card">
        <strong>Powers</strong>
        <span>Stay with the role. Whoever plays Spy uses the powers picked for Spy; whoever plays Inspector uses the powers picked for Inspector.</span>
      </div>
      <div class="tutorial-choice-card">
        <strong>Quest</strong>
        <span>Does not carry over. Round 2's Inspector is a new player, so they choose a fresh Quest.</span>
      </div>
    </div>
  `;
}

let modesSessionKey = null;

function resetModesSession() {
  const key = window.roomId || "modes";
  if (key === modesSessionKey) return;
  modesSessionKey = key;
  window.TutorialCore?.setStep(0);
}

function runModesTutorial(state, role) {
  const api = window.TutorialCore;
  if (!api) return;

  api.clearHighlights();
  resetModesSession(state);

  // Cleared unconditionally, not just in branches that no longer need it
  // -- see tutorial-star.js's identical fix for why: the Continue button's
  // click handler silently no-ops whenever tutorialWaitingFor is still
  // set from a *previous* gated step (e.g. "Tap Lock In"'s wait), which
  // would otherwise permanently block every later mode:"advance" step's
  // Continue button, including the very next one below. Re-armed below in
  // the specific branches that still need it.
  api.clearWaiting();

  const step = api.getStep();
  const userId = window.currentUser?.id;
  const inDraft = state.phase === "draft";

  if (step === 0) {
    modesTutorialShow(
      "This tutorial explains the power draft you're looking at right now, and what happens to it at the halfway swap.",
      { current: 1, total: 9 }
    );
    api.setMode("advance");
    return;
  }

  // Steps 1-3 only make sense while the real draft screen is actually up.
  // If it's already gone by the time we get here (a rejoin, a slow
  // network catching the tutorial up past this point in one jump), just
  // skip straight past them instead of waiting on state that will never
  // arrive.
  if (step >= 1 && step <= 3 && !inDraft) {
    api.setStep(4);
    return runModesTutorial(state, role);
  }

  if (step === 1) {
    const picked = (state.draftPicks?.[userId]?.length || 0) > 0;

    if (picked) {
      api.setStep(2);
      return runModesTutorial(state, role);
    }

    modesTutorialShow(
      "Pick 1 of the 2 powers below for your side.",
      { role: "guesser", title: "Your draft: power", current: 2, total: 9, mode: "hide" }
    );
    api.highlight(byId("draftCandidates"));
    api.setWaiting({ label: "PICK A POWER" });
    return;
  }

  if (step === 2) {
    const picked = (state.draftQuestPicks?.[userId]?.length || 0) > 0;

    if (picked) {
      api.setStep(3);
      return runModesTutorial(state, role);
    }

    modesTutorialShow(
      "Now pick 1 of the 2 Quests below -- an optional bonus objective for your guesses. The Quest Tutorial covers these in depth.",
      { role: "guesser", title: "Your draft: quest", current: 3, total: 9, mode: "hide" }
    );
    api.highlight(byId("draftQuestCandidates"));
    api.setWaiting({ label: "PICK A QUEST" });
    return;
  }

  if (step === 3) {
    if (!inDraft) {
      api.setStep(4);
      return runModesTutorial(state, role);
    }

    modesTutorialShow(
      "Tap Lock In to confirm your picks.",
      { role: "guesser", title: "Your draft: confirm", current: 4, total: 9, mode: "hide" }
    );
    api.highlight(byId("draftDoneBtn"));
    api.setWaiting({ label: "LOCK IN" });
    return;
  }

  if (step === 4) {
    modesTutorialShow(
      "While you were picking, the Spy locked in their own draft too: 2 of 3 powers. Whichever one they pick first starts active right away; their second pick stays locked until they earn 5 stars that round.",
      {
        role: "setter",
        title: "The Spy's draft",
        current: 5,
        total: 9,
        visualHtml: modesSetterDraftVisual()
      }
    );
    api.setMode("advance");
    return;
  }

  if (step === 5) {
    modesTutorialShow(
      "Keep earning stars past 5 and there's more: 8 and 12 stars each give you a letter refresh. The Star Tutorial covers all of this in depth.",
      {
        role: "setter",
        title: "More stars, more rewards",
        current: 6,
        total: 9
      }
    );
    api.setMode("advance");
    return;
  }

  if (step === 6) {
    modesTutorialShow(
      "Halfway through the match, you swap sides. Powers stay with the ROLE, not the player: whoever plays Spy in round 2 uses the same 2 powers chosen at the start, and whoever plays Inspector uses the same power chosen at the start -- even though you're each now on the other side.",
      {
        title: "The round 2 swap: powers",
        current: 7,
        total: 9
      }
    );
    api.setMode("advance");
    return;
  }

  if (step === 7) {
    modesTutorialShow(
      "Quests work differently: since round 2's Inspector is a different player experiencing it fresh, they get a brand new choice of 1 of 2 Quests. It does not carry over from round 1.",
      {
        role: "guesser",
        title: "The round 2 swap: quest",
        current: 8,
        total: 9,
        visualHtml: modesSwapVisual()
      }
    );
    api.setMode("advance");
    return;
  }

  api.setNextTutorial("advanced");
  modesTutorialShow(
    "That's the whole draft: pick your 2 Spy powers wisely, pick your Inspector power and Quest, and remember powers stay with the role when you swap sides.",
    {
      title: "Modes Tutorial done",
      current: 9,
      total: 9,
      mode: "end"
    }
  );
}

window.runModesTutorial = runModesTutorial;
