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
      "Lining up the next practice word...",
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
      `Type ${word} and send it as your new secret. It is a bold swap${letter && position ? `, and it drops ${letter} into spot ${position} to hit the blue target` : ""} - two stars for the swap plus the blue bonus. Three in one turn.`,
      {
        title: "Go bold: 3 stars",
        current: 5,
        mode: "hide"
      }
    );
  } else {
    starTutorialShow(
      `Now try ${word}. Perfectly allowed, but it is a timid swap and it misses the blue target. Watch it pay out just one star.`,
      {
        title: "Play it safe: 1 star",
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
      "This one is hands-on, and it needs the Secretkeeper screen.",
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
      "The round ended early, but you saw the important part: how stars are earned and cashed in."
    );
    return;
  }

  if (starTutorialFinished) {
    starSetRewardGuide(false);
    api.setNextTutorial("advanced");
    starTutorialShow(
      "That is the Star track. Keep for a safe single star, or swap boldly for up to three. Rewards at 4, 8 and 12.",
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
      "Stars are the hider's reward track, and they come down to one choice each turn. Keeping your word is the safe move: always exactly one star. Changing is the bold move, and boldness pays.",
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
      "Swap to a word that leaves the hunter with lots of possibilities still open, and that is two stars. The counter updates as you type - if it drops to one, keeping is probably wiser.",
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
      "The blue target asks for one specific letter in one specific spot. Hit it with a changed word and that is a third star. Quiet tip: the target doubles as a hint, because there is always a strong word that matches it.",
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
      "Rewards land at 4, 8 and 12 stars - one reward at 4, one at 8, and two at 12.",
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
        title: "What that paid",
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
      starLastResultText = `Three stars: ${base || 2} for the bold swap, plus ${bonus || 1} for hitting the blue target.`;
      starLastResultCurrent = 5;
    } else if (accepted && previousPracticeStep === 1) {
      starLastResultText = "Just one star. Legal, but timid, and it missed the blue target. That is the whole trade in a nutshell.";
      starLastResultCurrent = 6;
    } else {
      starLastResultText = `That earned ${earned} stars, but it did not finish the exercise. Use the exact word we highlight on your next turn.`;
      starLastResultCurrent = previousPracticeStep === 0 ? 5 : 6;
    }

    starAwaitingAck = true;
    starAckStepThreshold = step + 1;
    starSetRewardGuide(pendingIsMine, pendingIsMine);
    starTutorialShow(starLastResultText, {
      title: "What that paid",
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
      "That is the full loop: make bold choices, bank stars, cross a milestone, and cash it in for something that keeps you hidden longer."
    );
    return;
  }

  if (pendingIsMine) {
    starLastPendingChoiceId = pendingChoice.id;
    starSetRewardGuide(true, false);
    starTutorialShow(
      "Four stars - your first reward is ready. Same idea as the hunter's Quest rewards, except these ones are built to keep you hidden. Read the three cards and take one.",
      {
        title: "Cash it in",
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
      "Opening your first reward...",
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
      "Waiting on the Guesser...",
      {
        title: practiceStep === 0 ? "Go bold: 3 stars" : "Play it safe: 1 star",
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
