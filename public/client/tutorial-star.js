// Star Tutorial: a deep dive on the Spy's star/charge system, split out of
// the Advanced Tutorial's old single "Stars and charge" step. Setter-only,
// single round, entirely narrative -- spy-charge itself is disabled for
// every tutorial state (see spyChargeServer.js's createSpyChargeState:
// `enabled: !state.isTutorial`), so there's nothing live to earn stars
// against here. The examples below are illustrative words, not something
// the player's own draft actually gets scored on.

function starTutorialShow(text, {
  role = "setter",
  title = "Star Tutorial",
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

function starExampleVisual(word, stars, reason) {
  return `
    <div class="tutorial-choice-grid">
      <div class="tutorial-choice-card">
        <strong>${word}</strong>
        <span>${"★".repeat(stars)}${"☆".repeat(3 - stars)}</span>
      </div>
    </div>
    <div class="tutorial-note-strip">
      ${reason}
    </div>
  `;
}

function starMeterVisual() {
  return `
    <div class="tutorial-eli5-mini-list">
      <span><b>5 ★</b> unlocks your second power</span>
      <span><b>8 ★</b> gives a letter reset</span>
      <span><b>12 ★</b> gives a second letter reset</span>
      <span><b>+1 ★</b> for matching the small hint letter on your draft row</span>
    </div>
  `;
}

function runStarTutorial(state, role) {
  const api = window.TutorialCore;
  if (!api) return;

  api.clearHighlights();

  if (role !== "setter") {
    api.setNextTutorial("advanced");
    starTutorialShow(
      "This tutorial needs the Spy screen. End it and start the Star Tutorial again.",
      { title: "Wrong role", mode: "end" }
    );
    return;
  }

  const step = api.getStep();

  if (step === 0) {
    starTutorialShow(
      "Every time you choose a new secret, the game quietly rates how good that choice was -- from 0 to 3 stars.",
      { current: 1, total: 7 }
    );
    api.highlight(byId("setterCoverStars"));
    api.setMode("advance");
    return;
  }

  if (step === 1) {
    starTutorialShow(
      "Say the Inspector just guessed CRANE, and you're picking your next secret. Switching to STOVE is a fine, legal choice -- but plenty of other secret words would have looked exactly the same to the Inspector too. That usually earns just 1 star.",
      {
        title: "Example: 1 star",
        current: 2,
        total: 7,
        visualHtml: starExampleVisual(
          "STOVE",
          1,
          "Legal, but not very safe -- it narrows things down a lot."
        )
      }
    );
    api.setMode("advance");
    return;
  }

  if (step === 2) {
    starTutorialShow(
      "Switching to PLUMB instead might earn all 3 stars. It's just as legal, but it happens to keep far more secret words still possible -- so the Inspector learns much less from it than they would from STOVE.",
      {
        title: "Example: 3 stars",
        current: 3,
        total: 7,
        visualHtml: starExampleVisual(
          "PLUMB",
          3,
          "Just as legal, but keeps far more secret words alive."
        )
      }
    );
    api.setMode("advance");
    return;
  }

  if (step === 3) {
    starTutorialShow(
      "Here's how it's judged: out of every switch you could legally make, the game checks which one keeps the MOST secret words possible. The closer your pick is to that safest possible switch, the more stars you earn.",
      {
        title: "How stars are judged",
        current: 4,
        total: 7
      }
    );
    api.setMode("advance");
    return;
  }

  if (step === 4) {
    starTutorialShow(
      "Stars pile up in a meter across the round. You pick 2 powers at the start of a match -- your first pick starts active right away. Reach 5 total stars and your second pick unlocks too, for the rest of the round.",
      {
        title: "5 stars: your second power",
        current: 5,
        total: 7
      }
    );
    api.highlight(byId("spyChargeHud"));
    api.setMode("advance");
    return;
  }

  if (step === 5) {
    starTutorialShow(
      "You may remember this from the very first tutorial: 8 stars refreshes one letter's feedback, and 12 gives you a second refresh. There's also a hidden hint letter shown right on your draft row -- match it and you earn one bonus star on top of whatever your word already earned.",
      {
        title: "8, 12, and the bonus star",
        current: 6,
        total: 7,
        visualHtml: starMeterVisual()
      }
    );
    api.setMode("advance");
    return;
  }

  api.setNextTutorial("modes");
  starTutorialShow(
    "That's the whole Star system: pick sharp secrets, and the rewards take care of themselves.",
    {
      title: "Star Tutorial done",
      current: 7,
      total: 7,
      mode: "end"
    }
  );
}

window.runStarTutorial = runStarTutorial;
