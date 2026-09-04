// UMT_TUTORIAL_REWORK_20260901: TWO-ACTION STAR WALKTHROUGH
const STAR_TUTORIAL_MAX = 12;
const STAR_TUTORIAL_REWARD_AT = 4;
const STAR_TUTORIAL_TOTAL = 7;

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
  // Kept for compatibility; the simplified tutorial uses plain text only.
  return "";
}

function starPromptForPractice(api, charge, practiceStep, total) {
  // UMT_SIMPLIFIED_TUTORIAL_COPY_20260902
  const hint = charge?.hint || {};
  const rawWord = practiceStep === 0 ? hint.word : hint.worseWord;
  const word = rawWord ? String(rawWord).toUpperCase() : "";
  const letter = hint.letter ? String(hint.letter).toUpperCase() : "";
  const position = Number.isInteger(hint.position) ? hint.position + 1 : null;

  if (!word) {
    starTutorialShow(
      "Preparing the next practice word...",
      {
        title: "Earn stars",
        current: practiceStep === 0 ? 5 : 6,
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
      `Type ${word} and submit it as the new secret. It is a strong Change${letter && position ? ` and puts ${letter} in position ${position}` : ""}, so it earns two base stars plus the blue bonus star: three stars total.`,
      {
        title: "Try a 3-star Change",
        current: 5,
        mode: "hide"
      }
    );
  } else {
    starTutorialShow(
      `Now type ${word} and submit it. This word is legal, but it is a weaker Change and misses the blue target, so it earns one star.`,
      {
        title: "See a 1-star Change",
        current: 6,
        mode: "hide"
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
  // UMT_SIMPLIFIED_TUTORIAL_COPY_20260902
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
      "The round ended, but you practiced the star system and its first reward."
    );
    return;
  }

  if (starTutorialFinished) {
    starSetRewardGuide(false);
    api.setNextTutorial("advanced");
    starTutorialShow(
      "That is the Star system: Keep for a safe one star, or Change for up to three. Rewards arrive at 4, 8, and 12 stars.",
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
      "Stars help the Secretkeeper. Keeping last turn's secret always earns one star. To earn more, change the secret instead.",
      {
        current: 1
      }
    );
    api.highlight(spyMeterHighlightTarget());
    api.setMode("advance");
    return;
  }

  if (step === 1) {
    starTutorialShow(
      "A strong Change -- one that leaves close to the largest number of possible secrets -- earns a second star. The preview updates while you type; if it shows only one, keeping may be safer.",
      {
        title: "What makes a Change strong",
        current: 2
      }
    );
    api.highlight(spyMeterHighlightTarget());
    api.setMode("advance");
    return;
  }

  if (step === 2) {
    starTutorialShow(
      "The blue target asks for one letter in one position. Match it with a changed secret to earn a third star. It is also a clue: one of the strongest available secrets can satisfy that target.",
      {
        current: 3
      }
    );
    api.highlight(spyMeterHighlightTarget());
    api.setMode("advance");
    return;
  }

  if (step === 3) {
    starTutorialShow(
      "Stars unlock rewards along the way: at 4 stars and again at 8, you choose one reward from a set of cards. At 12 stars you get to choose two.",
      {
        title: "Star rewards",
        current: 4
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
      starLastResultText = `Exactly three stars: ${base || 2} for the strong Change, plus ${bonus || 1} blue bonus star for matching the target.`;
      starLastResultCurrent = 5;
    } else if (accepted && previousPracticeStep === 1) {
      starLastResultText = "Exactly one star. The Change was legal, but weaker, and it missed the blue target.";
      starLastResultCurrent = 6;
    } else {
      starLastResultText = `That decision earned ${earned} tutorial stars and did not complete this exercise. Use the exact highlighted word on the next Secretkeeper turn.`;
      starLastResultCurrent = previousPracticeStep === 0 ? 5 : 6;
    }

    starAwaitingAck = true;
    starAckStepThreshold = step + 1;
    starSetRewardGuide(pendingIsMine, pendingIsMine);
    starTutorialShow(starLastResultText, {
      title: "Stars earned",
      current: starLastResultCurrent,
      mode: "advance"
    });
    api.highlight(spyMeterHighlightTarget());
    return;
  }

  if (starLastPendingChoiceId && !pendingChoice) {
    starLastPendingChoiceId = null;
    finishStarTutorial(
      api,
      "Reward selected. You have seen the full loop: earn stars with Secretkeeper decisions, cross a milestone, and choose a reward that helps prolong the hunt."
    );
    return;
  }

  if (pendingIsMine) {
    starLastPendingChoiceId = pendingChoice.id;
    starSetRewardGuide(true, false);
    starTutorialShow(
      "You reached four stars, so the first Secretkeeper reward is ready. Read the three cards and choose one. It works just like the Guesser's Quest reward, but these effects help you keep the secret hidden longer.",
      {
        title: "Pick one reward",
        current: 7,
        mode: "hide"
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
        current: 7,
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
        title: practiceStep === 0 ? "Try a 3-star Change" : "See a 1-star Change",
        current: practiceStep === 0 ? 5 : 6,
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
