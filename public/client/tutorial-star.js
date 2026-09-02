// UMT_TUTORIAL_REWORK_20260901: TWO-ACTION STAR WALKTHROUGH
const STAR_TUTORIAL_MAX = 12;
const STAR_TUTORIAL_REWARD_AT = 4;
const STAR_TUTORIAL_TOTAL = 5;

function starTutorialShow(text, {
  title = "Star Tutorial",
  current = null,
  total = STAR_TUTORIAL_TOTAL,
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
    tone: "setter",
    placement,
    compact,
    mode,
    visualHtml,
    key: key || undefined
  });
}

let starSessionKey = null;
let starLastSeenHistoryLen = null;
let starAwaitingAck = false;
let starAckStepThreshold = null;
let starLastResultText = "";
let starLastResultCurrent = 3;
let starLastPendingChoiceId = null;
let starTutorialFinished = false;
let starLastPracticeStep = 0;

function starPracticeStep(value) {
  return Math.max(0, Math.min(2, Math.trunc(Number(value) || 0)));
}

function starSetRewardGuide(active, locked = false) {
  const enabled = !!active;
  const shouldLock = enabled && !!locked;
  document.body.classList.toggle("tutorial-reward-choice-guide", enabled);
  document.body.classList.toggle("tutorial-reward-choice-locked", shouldLock);

  const syncInert = () => {
    const card = document.querySelector("#powerChoiceModal .pc-modal-card");
    if (!card) return;
    if (shouldLock) card.setAttribute("inert", "");
    else card.removeAttribute("inert");
  };
  syncInert();
  if (enabled) requestAnimationFrame(syncInert);
}

function resetStarSession(state) {
  const key = window.roomId || "star";
  if (key === starSessionKey) return;
  starSessionKey = key;
  starLastSeenHistoryLen = state.history?.length ?? 0;
  starAwaitingAck = false;
  starAckStepThreshold = null;
  starLastResultText = "";
  starLastResultCurrent = 3;
  starLastPendingChoiceId = null;
  starTutorialFinished = false;
  starLastPracticeStep = starPracticeStep(state.powers?.spyCharge?.tutorialPracticeStep);
  starSetRewardGuide(false);
  window.TutorialCore?.setStep(0);
}

function spyMeterHighlightTarget() {
  const screen = byId("setterScreen");
  const toggle = byId("setterSidebarToggle");
  const collapsed = !!(
    screen?.classList.contains("setter-sidebar-collapsed") ||
    toggle?.getAttribute("aria-expanded") === "false"
  );
  const id = collapsed ? "setterSidebarChargeMini" : "pcSpyChargeCard";
  return byId(id) || byId("pcSpyChargeCard") || byId("setterSidebarChargeMini");
}

function starRewardTarget(selector) {
  const modal = byId("powerChoiceModal");
  return modal?.querySelector(selector) || modal;
}

function starMeterVisual(total) {
  const safeTotal = Math.max(0, Math.min(STAR_TUTORIAL_MAX, Number(total) || 0));
  return `
    <div class="tutorial-summary-explainer tutorial-star-explainer">
      <span class="tutorial-summary-number">${safeTotal}</span>
      <span><strong>stars now</strong><small>The first reward opens at ${STAR_TUTORIAL_REWARD_AT}.</small></span>
    </div>
  `;
}

function starRulesVisual() {
  return `
    <div class="tutorial-tiny-steps">
      <span><b>Keep:</b> always exactly 1 yellow star.</span>
      <span><b>Weak Change:</b> 1 yellow star.</span>
      <span><b>Good Change:</b> 2 yellow stars.</span>
      <span><b>Bonus target:</b> +1 blue star when its letter is in the shown position.</span>
    </div>
  `;
}

function starPromptForPractice(api, charge, practiceStep, total) {
  const hint = charge?.hint || {};
  const rawWord = practiceStep === 0 ? hint.word : hint.worseWord;
  const word = rawWord ? String(rawWord).toUpperCase() : "";
  const letter = hint.letter ? String(hint.letter).toUpperCase() : "";
  const position = Number.isInteger(hint.position) ? hint.position + 1 : null;

  if (!word) {
    starTutorialShow(
      "Preparing the next scripted practice word...",
      {
        title: "Earn stars",
        current: practiceStep === 0 ? 3 : 4,
        compact: true,
        mode: "hide",
        key: `star-hint-wait-${practiceStep}-${window.state?.history?.length || 0}`
      }
    );
    api.highlight(spyMeterHighlightTarget());
    api.setContinue({ show: false, mode: "hide" });
    return;
  }

  if (practiceStep === 0) {
    starTutorialShow(
      `Enter ${word}, then tap Submit New Secret. This is a good Change${letter && position ? ` and puts ${letter} in position ${position}` : ""}: 2 yellow stars plus the blue bonus star, for exactly 3 stars.`,
      {
        title: "Practice a 3-star Change",
        current: 3,
        mode: "hide",
        visualHtml: starMeterVisual(total)
      }
    );
  } else {
    starTutorialShow(
      `Enter ${word}, then tap Submit New Secret. This is intentionally a weaker Change and misses the bonus target, so it earns exactly 1 yellow star.`,
      {
        title: "Practice a 1-star Change",
        current: 4,
        mode: "hide",
        visualHtml: starMeterVisual(total)
      }
    );
  }

  api.highlight(spyMeterHighlightTarget());
  api.setWaiting({ label: `SUBMIT ${word}` });
}

function finishStarTutorial(api, text) {
  starSetRewardGuide(false);
  starTutorialFinished = true;
  api.setNextTutorial("advanced");
  starTutorialShow(text, {
    title: "Star Tutorial done",
    current: STAR_TUTORIAL_TOTAL,
    mode: "end"
  });
  api.highlight(spyMeterHighlightTarget());
}

function runStarTutorial(state, role) {
  const api = window.TutorialCore;
  if (!api) return;

  api.clearHighlights();
  if (role !== "setter") {
    starSetRewardGuide(false);
    api.setNextTutorial("advanced");
    starTutorialShow(
      "This hands-on tutorial runs on the Secretkeeper screen.",
      { title: "Secretkeeper only", mode: "end" }
    );
    return;
  }

  resetStarSession(state);
  api.clearWaiting();

  const step = api.getStep();
  const charge = state.powers?.spyCharge || {};
  const total = Math.max(0, Math.min(STAR_TUTORIAL_MAX, Number(charge.total) || 0));
  const historyLen = state.history?.length ?? 0;
  const practiceStep = starPracticeStep(charge.tutorialPracticeStep);
  const pendingChoice = state.powerChoice?.pendingChoice;
  const pendingIsMine = !!(pendingChoice && pendingChoice.role === "setter");

  if (pendingIsMine) starSetRewardGuide(true, false);
  else starSetRewardGuide(false);

  if (state.phase === "gameOver") {
    finishStarTutorial(
      api,
      "The round ended, but you practiced both star outcomes and the first reward."
    );
    return;
  }

  if (starTutorialFinished) {
    starSetRewardGuide(false);
    api.setNextTutorial("advanced");
    starTutorialShow(
      "Done. Keep always gives 1 star; a Change gives 1 or 2 yellow stars, plus a third blue star when it hits the bonus position.",
      {
        title: "Star Tutorial done",
        current: STAR_TUTORIAL_TOTAL,
        mode: "end"
      }
    );
    api.highlight(spyMeterHighlightTarget());
    return;
  }

  if (step === 0) {
    starTutorialShow(
      "Stars are the Secretkeeper's reward meter. A Keep always earns exactly 1 star. A Change can earn 1, 2, or 3 stars.",
      {
        current: 1,
        visualHtml: starMeterVisual(total)
      }
    );
    api.highlight(spyMeterHighlightTarget());
    api.setMode("advance");
    return;
  }

  if (step === 1) {
    starTutorialShow(
      "A weak Change earns 1 yellow star. A good Change earns 2 yellow stars. Put the shown bonus letter in the shown position to add the third, blue bonus star.",
      {
        current: 2,
        visualHtml: starRulesVisual()
      }
    );
    api.highlight(spyMeterHighlightTarget());
    api.setMode("advance");
    return;
  }

  if (starAwaitingAck) {
    if (step >= starAckStepThreshold) {
      starAwaitingAck = false;
      starAckStepThreshold = null;
      starSetRewardGuide(pendingIsMine, false);
    } else {
      starSetRewardGuide(pendingIsMine, pendingIsMine);
      starTutorialShow(starLastResultText, {
        title: "Stars earned",
        current: starLastResultCurrent,
        visualHtml: starMeterVisual(total),
        mode: "advance"
      });
      api.highlight(spyMeterHighlightTarget());
      return;
    }
  }

  if (historyLen > starLastSeenHistoryLen) {
    starLastSeenHistoryLen = historyLen;
    const previousPracticeStep = starLastPracticeStep;
    starLastPracticeStep = practiceStep;
    const latest = state.history?.[historyLen - 1] || {};
    const earned = Math.max(0, Number(latest.starsEarned) || 0);
    const base = Math.max(0, Number(latest.baseStarsEarned) || 0);
    const bonus = Math.max(0, Number(latest.bonusStarsEarned) || 0);
    const accepted = practiceStep > previousPracticeStep;

    if (accepted && previousPracticeStep === 0) {
      starLastResultText = `Exactly 3 stars: ${base || 2} yellow stars for the good Change, plus ${bonus || 1} blue bonus star for the correct letter position.`;
      starLastResultCurrent = 3;
    } else if (accepted && previousPracticeStep === 1) {
      starLastResultText = "Exactly 1 yellow star. That Change was legal but intentionally weaker, and it missed the bonus position.";
      starLastResultCurrent = 4;
    } else {
      starLastResultText = `That decision earned ${earned} tutorial stars and did not complete this exercise. Use the exact highlighted word on the next Secretkeeper turn.`;
      starLastResultCurrent = previousPracticeStep === 0 ? 3 : 4;
    }

    starAwaitingAck = true;
    starAckStepThreshold = step + 1;
    starSetRewardGuide(pendingIsMine, pendingIsMine);
    starTutorialShow(starLastResultText, {
      title: "Stars earned",
      current: starLastResultCurrent,
      visualHtml: starMeterVisual(total),
      mode: "advance"
    });
    api.highlight(spyMeterHighlightTarget());
    return;
  }

  if (starLastPendingChoiceId && !pendingChoice) {
    starLastPendingChoiceId = null;
    finishStarTutorial(
      api,
      "Reward selected. You completed the full star loop with one 3-star Change, one 1-star Change, and one reward pick."
    );
    return;
  }

  if (pendingIsMine) {
    starLastPendingChoiceId = pendingChoice.id;
    starSetRewardGuide(true, false);
    starTutorialShow(
      "Four total stars open the first reward. Choose one card to finish - this tutorial stops after this single reward.",
      {
        title: "Pick one reward",
        current: 5,
        mode: "hide",
        visualHtml: starMeterVisual(total)
      }
    );
    api.highlight(starRewardTarget(".pc-card-grid"));
    api.setContinue({ show: false, mode: "hide" });
    return;
  }

  if (practiceStep >= 2) {
    starTutorialShow(
      "Opening your first reward choice...",
      {
        title: "Reward ready",
        current: 5,
        compact: true,
        mode: "hide",
        key: `star-reward-wait-${historyLen}`
      }
    );
    api.setContinue({ show: false, mode: "hide" });
    return;
  }

  if (!state.pendingGuess) {
    starTutorialShow(
      "Waiting for the Guesser's next word...",
      {
        title: practiceStep === 0 ? "Practice a 3-star Change" : "Practice a 1-star Change",
        current: practiceStep === 0 ? 3 : 4,
        compact: true,
        mode: "hide",
        key: `star-wait-${practiceStep}-${historyLen}`
      }
    );
    api.setContinue({ show: false, mode: "hide" });
    return;
  }

  starPromptForPractice(api, charge, practiceStep, total);
}

window.runStarTutorial = runStarTutorial;
