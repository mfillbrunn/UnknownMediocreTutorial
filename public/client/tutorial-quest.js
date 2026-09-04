// UMT_TUTORIAL_REWORK_20260901: QUEST REWARD WALKTHROUGH
const QUEST_TUTORIAL_TOTAL = 10;

function questTutorialShow(text, {
  title = "Quest Tutorial",
  current = null,
  total = QUEST_TUTORIAL_TOTAL,
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
    tone: "guesser",
    placement,
    compact,
    mode,
    visualHtml,
    key: key || undefined
  });
}

let questSessionKey = null;
let questLastSeenAttempts = null;
let questAwaitingAck = false;
let questAckStepThreshold = null;
let questLastResultText = "";
let questOutcome = null;
let questLastPendingChoiceId = null;
let questRewardGuideStartStep = null;
let questTutorialFinished = false;
let questFinishedText = "";

function questSetRewardGuide(active, locked = false) {
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

function resetQuestSession(state) {
  const key = window.roomId || "quest";
  if (key === questSessionKey) return;
  questSessionKey = key;
  questLastSeenAttempts = Number(state.powerChoice?.inspector?.attempts) || 0;
  questAwaitingAck = false;
  questAckStepThreshold = null;
  questLastResultText = "";
  questOutcome = null;
  questLastPendingChoiceId = null;
  questRewardGuideStartStep = null;
  questTutorialFinished = false;
  questFinishedText = "";
  questSetRewardGuide(false);
  window.TutorialCore?.setStep(0);
}

function questCardHighlightTarget() {
  return document.querySelector(".pc-current-quest-card") || byId("pcCurrentQuestHost");
}

function questRewardTarget(selector) {
  const modal = byId("powerChoiceModal");
  return modal?.querySelector(selector) || modal;
}

function questPromptForGuess() {
  // UMT_SIMPLIFIED_TUTORIAL_COPY_20260902
  questSetRewardGuide(false);
  questTutorialShow(
    "See the letters light up? Now type APPLE. Keep an eye on the card - the moment your word ticks the box, it flips to MET. Then tap Submit Guess.",
    {
      title: "Meet the dare",
      current: 5,
      mode: "hide"
    }
  );
  window.TutorialCore.highlight(questCardHighlightTarget());
  window.TutorialCore.setWaiting({ label: "SUBMIT APPLE" });
}

function finishQuestTutorial(api, text, current = QUEST_TUTORIAL_TOTAL) {
  questSetRewardGuide(false);
  questTutorialFinished = true;
  questFinishedText = text;
  api.setNextTutorial("star");
  questTutorialShow(text, {
    title: "Quest Tutorial done",
    current,
    mode: "end"
  });
  api.highlight(questCardHighlightTarget());
}

function runQuestTutorial(state, role) {
  // UMT_SIMPLIFIED_TUTORIAL_COPY_20260902
  const api = window.TutorialCore;
  if (!api) return;
  api.clearHighlights();

  if (role !== "guesser") {
    questSetRewardGuide(false);
    api.setNextTutorial("star");
    questTutorialShow(
      "This one is hands-on, and it needs the Guesser screen.",
      { title: "Guesser only", mode: "end" }
    );
    return;
  }

  resetQuestSession(state);
  api.clearWaiting();
  const step = api.getStep();
  const quest = state.powerChoice?.inspector?.currentQuest;
  const attempts = Number(state.powerChoice?.inspector?.attempts) || 0;
  const pendingChoice = state.powerChoice?.pendingChoice;
  const pendingIsMine = !!(pendingChoice && pendingChoice.role === "guesser");

  if (pendingIsMine) questSetRewardGuide(true, true);
  else questSetRewardGuide(false);

  if (state.phase === "gameOver") {
    finishQuestTutorial(
      api,
      "The round ended, but you saw how a Quest and its reward choice work."
    );
    return;
  }

  if (questTutorialFinished) {
    questSetRewardGuide(false);
    api.setNextTutorial("star");
    questTutorialShow(questFinishedText, {
      title: "Quest Tutorial done",
      current: questOutcome === "fail" ? 6 : QUEST_TUTORIAL_TOTAL,
      mode: "end"
    });
    api.highlight(questCardHighlightTarget());
    return;
  }

  if (step === 0) {
    questTutorialShow(
      "A Quest is a bonus goal, and only the hunter gets them. Think of it as a little dare: guess a word that does this one thing. You get up to three a round, on guesses 2, 4 and 6.",
      {
        current: 1
      }
    );
    api.highlight(questCardHighlightTarget());
    api.setMode("advance");
    return;
  }

  if (step === 1) {
    questTutorialShow(
      "Pull it off and you win a reward. Ignore it if you would rather just chase the secret - a Quest is always optional, never mandatory.",
      {
        title: "Optional, not mandatory",
        current: 2
      }
    );
    api.highlight(questCardHighlightTarget());
    api.setMode("advance");
    return;
  }

  if (step === 2) {
    questTutorialShow(
      `Read the card before you type anything. Today's dare is: ${quest?.description || "Use only letters A through P."}`,
      {
        title: "Read the dare",
        current: 3
      }
    );
    api.highlight(questCardHighlightTarget());
    api.setMode("advance");
    return;
  }

  if (step === 3) {
    const highlightButton = document.querySelector(".pc-guide-highlight-btn");
    questTutorialShow(
      "Tap Highlight. It lights up the keyboard letters that count for this Quest, so you do not have to work it out in your head. Tap it again any time to switch the lights back off.",
      {
        title: "Use Highlight",
        current: 4,
        mode: highlightButton ? "hide" : "advance"
      }
    );
    api.highlight(highlightButton || questCardHighlightTarget());

    if (!highlightButton) {
      api.setMode("advance");
      return;
    }

    api.setWaiting({
      type: "questHighlight",
      label: "TAP HIGHLIGHT"
    });
    if (highlightButton.dataset.tutorialQuestHighlightArmed !== "true") {
      highlightButton.dataset.tutorialQuestHighlightArmed = "true";
      const armedStep = step;
      highlightButton.addEventListener("click", () => {
        if (api.getStep() !== armedStep) return;
        api.clearWaiting();
        api.setStep(armedStep + 1);
        requestAnimationFrame(() => {
          window.tutorialSteps?.(window.state, window.myRole);
        });
      }, { once: true });
    }
    return;
  }

  if (questAwaitingAck) {
    if (step >= questAckStepThreshold) {
      questAwaitingAck = false;
      questAckStepThreshold = null;
      if (questOutcome === "fail") {
        finishQuestTutorial(
          api,
          "That is a Quest. Meet the dare for a reward, or walk past it when finding the word matters more.",
          6
        );
        return;
      }
    } else {
      questTutorialShow(questLastResultText, {
        title: "Quest result",
        current: 6,
        mode: "advance"
      });
      api.highlight(questCardHighlightTarget());
      return;
    }
  }

  if (attempts > questLastSeenAttempts) {
    questLastSeenAttempts = attempts;
    const result = state.powerChoice?.inspector?.lastResult;
    const success = !!result?.success;
    questOutcome = success ? "success" : "fail";
    questLastResultText = success
      ? "MET - nice work. Your reward cards open up as soon as the turn finishes."
      : "Missed that one. No harm done: the guess still counts and the game carries on.";
    questAwaitingAck = true;
    questAckStepThreshold = step + 1;
    questTutorialShow(questLastResultText, {
      title: "Quest result",
      current: 6,
      mode: "advance"
    });
    api.highlight(questCardHighlightTarget());
    return;
  }

  if (questLastPendingChoiceId && !pendingChoice) {
    questLastPendingChoiceId = null;
    questRewardGuideStartStep = null;
    const resolution = state.powerChoice?.lastResolution;
    const selectedTitle = resolution?.title || "a reward";
    const selectedEffect =
      resolution?.detailText ||
      resolution?.description ||
      "It activated immediately.";
    finishQuestTutorial(
      api,
      `And that is the whole loop: read the dare, meet it, take a reward. You picked ${selectedTitle}. ${selectedEffect}`
    );
    return;
  }

  if (pendingIsMine) {
    if (questLastPendingChoiceId !== pendingChoice.id) {
      questLastPendingChoiceId = pendingChoice.id;
      questRewardGuideStartStep = step;
    }

    const guideStep = Math.max(0, step - (questRewardGuideStartStep ?? step));
    if (guideStep === 0) {
      questSetRewardGuide(true, true);
      questTutorialShow(
        "Three rewards. There is no trap here - all three genuinely help you. Have a read, then take whichever you like the look of.",
        {
          title: "Three rewards",
          current: 7,
          mode: "advance"
        }
      );
      api.highlight(questRewardTarget(".pc-card-grid"));
      return;
    }

    if (guideStep === 1) {
      questSetRewardGuide(true, true);
      questTutorialShow(
        "You keep exactly one. Most fire straight away. If a card says its target is random, the game picks the letter or tile for you - you are taking the luck along with the reward.",
        {
          title: "You keep one",
          current: 8,
          mode: "advance"
        }
      );
      api.highlight(questRewardTarget(".pc-card-grid"));
      return;
    }

    if (guideStep === 2) {
      questSetRewardGuide(true, true);
      questTutorialShow(
        "Like none of them? Refresh Choices deals three new cards. But you only get one refresh for the whole game, and it does not come back when you swap roles - so save it for a truly bad hand.",
        {
          title: "One redeal per game",
          current: 9,
          mode: "advance"
        }
      );
      api.highlight(questRewardTarget(".pc-refresh-choice-btn"));
      return;
    }

    questSetRewardGuide(true, false);
    questTutorialShow(
      "Go ahead and tap a card. That is the last step.",
      {
        title: "Pick a reward",
        current: 10,
        mode: "hide"
      }
    );
    api.highlight(questRewardTarget(".pc-card-grid"));
    api.setContinue({ show: false, mode: "hide" });
    return;
  }

  if (questOutcome === "success") {
    questTutorialShow(
      "Quest done. Once the Secretkeeper finishes their turn, your reward cards appear.",
      {
        title: "Reward coming next",
        current: 6,
        compact: true,
        mode: "hide",
        key: `quest-wait-${attempts}`
      }
    );
    api.setContinue({ show: false, mode: "hide" });
    return;
  }

  questPromptForGuess();
}

window.runQuestTutorial = runQuestTutorial;
