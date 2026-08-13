// Modes Tutorial: explains the power/quest draft at the start of a match,
// and exactly what does and doesn't carry over at the round-2 role swap.
// Entirely narrative, role-agnostic (the content covers both sides
// equally), single round -- same shape as tutorial-star.js.

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

function runModesTutorial(state, role) {
  const api = window.TutorialCore;
  if (!api) return;

  api.clearHighlights();

  const step = api.getStep();

  if (step === 0) {
    modesTutorialShow(
      "This tutorial explains the power draft you see before every match, and what happens to it at the halfway swap.",
      { current: 1, total: 7 }
    );
    api.setMode("advance");
    return;
  }

  if (step === 1) {
    modesTutorialShow(
      "At the start of a match, the Spy picks 2 of 3 powers. Whichever one you pick first starts active right away. Your second pick stays locked until you earn 5 stars that round.",
      {
        role: "setter",
        title: "The Spy's draft",
        current: 2,
        total: 7,
        visualHtml: modesSetterDraftVisual()
      }
    );
    api.setMode("advance");
    return;
  }

  if (step === 2) {
    modesTutorialShow(
      "Keep earning stars past 5 and there's more: 8 and 12 stars each give you a letter refresh. The Star Tutorial covers all of this in depth.",
      {
        role: "setter",
        title: "More stars, more rewards",
        current: 3,
        total: 7
      }
    );
    api.setMode("advance");
    return;
  }

  if (step === 3) {
    modesTutorialShow(
      "The Inspector's draft is simpler: pick 1 of 2 powers, plus 1 of 2 Quests -- an optional bonus objective for your guesses. The Quest Tutorial covers those in depth.",
      {
        role: "guesser",
        title: "The Inspector's draft",
        current: 4,
        total: 7
      }
    );
    api.setMode("advance");
    return;
  }

  if (step === 4) {
    modesTutorialShow(
      "Halfway through the match, you swap sides. Powers stay with the ROLE, not the player: whoever plays Spy in round 2 uses the same 2 powers chosen at the start, and whoever plays Inspector uses the same power chosen at the start -- even though you're each now on the other side.",
      {
        title: "The round 2 swap: powers",
        current: 5,
        total: 7
      }
    );
    api.setMode("advance");
    return;
  }

  if (step === 5) {
    modesTutorialShow(
      "Quests work differently: since round 2's Inspector is a different player experiencing it fresh, they get a brand new choice of 1 of 2 Quests. It does not carry over from round 1.",
      {
        role: "guesser",
        title: "The round 2 swap: quest",
        current: 6,
        total: 7,
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
      current: 7,
      total: 7,
      mode: "end"
    }
  );
}

window.runModesTutorial = runModesTutorial;
