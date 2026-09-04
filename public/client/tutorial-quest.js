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
    "Perfect - the useful keyboard letters are highlighted. Type APPLE. When a five-letter draft satisfies the Quest, the card says MET. Then tap Submit Guess.",
    {
      title: "Complete the Quest",
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
      "This hands-on tutorial runs on the Guesser screen.",
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
      "Quests are optional helpers for the Guesser. A Quest appears on every second guess -- normally guesses 2, 4, and 6 -- for at most three Quests in a round.",
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
      "Meet its conditions to earn a reward, or ignore it whenever another guess is better -- a Quest is never mandatory.",
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
      `Read the active card before guessing. This practice Quest says: ${quest?.description || "Use only letters A through P."}`,
      {
        title: "Read the condition",
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
      "Tap Highlight now. It marks the keyboard letters that matter for this Quest. This is a very useful helper, and you can turn the highlights off again whenever you like.",
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
          "Done. Quests are optional: meet one for a reward, or skip it when another guess is better.",
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
      ? "Quest complete. The MET label confirmed that you satisfied the conditions. Your reward choices open as soon as the turn is ready."
      : "Quest missed. That is okay - the guess still counts and the match continues.";
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
      `That is it. You completed a Quest and selected ${selectedTitle}. ${selectedEffect}`
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
        "Here are three reward options. All of them help. Read each card's title and description before choosing one.",
        {
          title: "Three reward choices",
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
        "You choose one card. Most rewards work immediately. When a reward says that its target is random, the game chooses that letter, tile, or target for you.",
        {
          title: "Choose one effect",
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
        "Do not like the offer? Refresh Choices replaces all three cards. You get only one refresh for the entire game, even after you swap roles, so save it for an offer you truly dislike.",
        {
          title: "One refresh per game",
          current: 9,
          mode: "advance"
        }
      );
      api.highlight(questRewardTarget(".pc-refresh-choice-btn"));
      return;
    }

    questSetRewardGuide(true, false);
    questTutorialShow(
      "Now click one reward card. The tutorial ends after the choice takes effect.",
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
      "The Quest is complete. Wait for the Secretkeeper to finish the turn, and then the reward choices will open.",
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
