// UMT_TUTORIAL_REWORK_20260901: QUEST REWARD WALKTHROUGH
const QUEST_TUTORIAL_TOTAL = 8;

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
  questSetRewardGuide(false);
  questTutorialShow(
    "Type APPLE, then tap Submit Guess. It follows this practice Quest's rule.",
    {
      title: "Try the Quest",
      current: 3,
      mode: "hide",
      visualHtml: `
        <div class="tutorial-key-point">
          A Quest is optional in a normal match. Your guess still works if you ignore it.
        </div>
      `
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
      current: questOutcome === "fail" ? 4 : QUEST_TUTORIAL_TOTAL,
      mode: "end"
    });
    api.highlight(questCardHighlightTarget());
    return;
  }

  if (step === 0) {
    questTutorialShow(
      "A Quest is a small optional rule for one guess. Quests normally appear on guesses 2, 4, and 6. Complete one to earn a reward choice.",
      {
        current: 1,
        visualHtml: `
          <div class="tutorial-tiny-steps">
            <span><b>Follow it:</b> earn a reward.</span>
            <span><b>Ignore it:</b> make the guess you think is strongest.</span>
          </div>
        `
      }
    );
    api.highlight(questCardHighlightTarget());
    api.setMode("advance");
    return;
  }

  if (step === 1) {
    questTutorialShow(
      `Read the active card before guessing. This practice Quest says: ${quest?.description || "Use only letters A through P."}`,
      {
        current: 2,
        visualHtml: `
          <div class="tutorial-key-point">
            Quests are bonuses, not requirements. Skip one when a different guess would teach you more.
          </div>
        `
      }
    );
    api.highlight(questCardHighlightTarget());
    api.setMode("advance");
    return;
  }

  if (questAwaitingAck) {
    if (step >= questAckStepThreshold) {
      questAwaitingAck = false;
      questAckStepThreshold = null;
      if (questOutcome === "fail") {
        finishQuestTutorial(
          api,
          "Done. Quests are optional: follow one for a reward, or skip it when another guess is better.",
          4
        );
        return;
      }
    } else {
      questTutorialShow(questLastResultText, {
        title: "Quest result",
        current: 4,
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
      ? "Quest complete. The reward window opens as soon as the turn is ready."
      : "Quest missed. That is okay - the guess still counts and the match continues.";
    questAwaitingAck = true;
    questAckStepThreshold = step + 1;

    questTutorialShow(questLastResultText, {
      title: "Quest result",
      current: 4,
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
      `Done. You completed a Quest and selected ${selectedTitle}. ${selectedEffect}`
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
        "The turn pauses at this reward window. These three cards are your current offer, and you will choose exactly one.",
        {
          title: "Reward window",
          current: 5,
          mode: "advance",
          visualHtml: `
            <div class="tutorial-key-point">
              Read each title and description before choosing. Nothing is applied until you select a card.
            </div>
          `
        }
      );
      api.highlight(questRewardTarget(".pc-modal-card"));
      return;
    }

    if (guideStep === 1) {
      questSetRewardGuide(true, true);
      questTutorialShow(
        "You choose the card. Its named effect activates immediately. When a description says random, the game automatically picks an eligible letter, tile, or target - there is no second choice.",
        {
          title: "Choose one effect",
          current: 6,
          mode: "advance"
        }
      );
      api.highlight(questRewardTarget(".pc-card-grid"));
      return;
    }

    if (guideStep === 2) {
      questSetRewardGuide(true, true);
      questTutorialShow(
        "Refresh Choices replaces all three cards with one new roll, including rarity. It does not activate a reward, and each player can refresh only once for the entire game.",
        {
          title: "Refresh Choices",
          current: 7,
          mode: "advance",
          visualHtml: `
            <div class="tutorial-key-point">
              A refresh can still roll the same rarity or even repeat a card. Use it only when the current offer is not useful.
            </div>
          `
        }
      );
      api.highlight(questRewardTarget(".pc-refresh-choice-btn"));
      return;
    }

    questSetRewardGuide(true, false);
    questTutorialShow(
      "Now choose one reward card. The tutorial finishes after that single choice resolves.",
      {
        title: "Pick a reward",
        current: 8,
        mode: "hide"
      }
    );
    api.highlight(questRewardTarget(".pc-card-grid"));
    api.setContinue({ show: false, mode: "hide" });
    return;
  }

  if (questOutcome === "success") {
    questTutorialShow(
      "Waiting for the Secretkeeper to finish the turn...",
      {
        title: "Reward coming next",
        current: 4,
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
