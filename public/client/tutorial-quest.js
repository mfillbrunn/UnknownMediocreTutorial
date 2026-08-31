// Streamlined Quest Tutorial: one optional rule, one practice guess, one reward.
function questTutorialShow(text, {
  title = "Quest Tutorial",
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
let questTutorialFinished = false;
let questFinishedText = "";

function resetQuestSession(state) {
  const key = window.roomId || "quest";
  if (key === questSessionKey) return;
  questSessionKey = key;
  questLastSeenAttempts = Number(state.powerChoice?.inspector?.attempts) || 0;
  questAwaitingAck = false;
  questAckStepThreshold = null;
  questLastResultText = "";
  questOutcome = null;
  questLastPendingChoiceId = state.powerChoice?.pendingChoice?.id || null;
  questTutorialFinished = false;
  questFinishedText = "";
  window.TutorialCore?.setStep(0);
}

function questCardHighlightTarget() {
  return document.querySelector(".pc-current-quest-card") || byId("pcCurrentQuestHost");
}

function questPromptForGuess() {
  questTutorialShow(
    "Type APPLE, then tap Submit Guess. It follows this practice Quest's rule.",
    {
      title: "Try the Quest",
      current: 3,
      total: 5,
      mode: "hide",
      visualHtml: `
        <div class="tutorial-key-point">
          The Quest is optional in a normal match. Your guess still works if you ignore it.
        </div>
      `
    }
  );
  window.TutorialCore.highlight(questCardHighlightTarget());
  window.TutorialCore.setWaiting({ label: "SUBMIT APPLE" });
}

function runQuestTutorial(state, role) {
  const api = window.TutorialCore;
  if (!api) return;
  api.clearHighlights();

  if (role !== "guesser") {
    api.setNextTutorial("star");
    questTutorialShow(
      "This short tutorial runs on the Guesser screen.",
      { title: "Guesser only", mode: "end" }
    );
    return;
  }

  resetQuestSession(state);
  api.clearWaiting();

  if (state.phase === "gameOver") {
    api.setNextTutorial("star");
    questTutorialShow(
      "The round ended, but you saw how a Quest works.",
      { title: "Quest Tutorial done", current: 5, total: 5, mode: "end" }
    );
    return;
  }

  if (questTutorialFinished) {
    api.setNextTutorial("star");
    questTutorialShow(questFinishedText, {
      title: "Quest Tutorial done",
      current: questOutcome === "fail" ? 4 : 5,
      total: 5,
      mode: "end"
    });
    api.highlight(questCardHighlightTarget());
    return;
  }

  const step = api.getStep();
  const quest = state.powerChoice?.inspector?.currentQuest;
  const attempts = Number(state.powerChoice?.inspector?.attempts) || 0;
  const pendingChoice = state.powerChoice?.pendingChoice;
  const pendingIsMine = pendingChoice && pendingChoice.role === "guesser";

  if (step === 0) {
    questTutorialShow(
      "A Quest is a small optional rule for one guess. Quests normally appear on guesses 2, 4, and 6. Complete one to earn a reward choice.",
      {
        current: 1,
        total: 5,
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
        total: 5,
        visualHtml: `
          <div class="tutorial-key-point">
            Quests are bonuses, not requirements. It is okay to skip one when another guess would teach you more.
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
    } else {
      questTutorialShow(questLastResultText, {
        title: "Quest result",
        current: 4,
        total: 5,
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
      ? "Quest complete. Your reward choice opens when the turn is ready."
      : "Quest missed. That is okay—the guess still counts and the match continues.";
    questAwaitingAck = true;
    questAckStepThreshold = step + 1;

    if (!success) {
      questTutorialFinished = true;
      questFinishedText = "Done. Quests are optional: follow one for a reward, or skip it when a different guess is better.";
    }

    questTutorialShow(questLastResultText, {
      title: "Quest result",
      current: 4,
      total: 5,
      mode: "advance"
    });
    api.highlight(questCardHighlightTarget());
    return;
  }

  if (questLastPendingChoiceId && !pendingChoice) {
    questLastPendingChoiceId = null;
    questTutorialFinished = true;
    const resolution = state.powerChoice?.lastResolution;
    const selectedTitle = resolution?.title || "a reward";
    const selectedEffect =
      resolution?.detailText ||
      resolution?.description ||
      "It activated immediately.";
    questFinishedText = `Done. You completed a Quest and selected ${selectedTitle}. ${selectedEffect}`;
    api.setNextTutorial("star");
    questTutorialShow(questFinishedText, {
      title: "Quest Tutorial done",
      current: 5,
      total: 5,
      mode: "end"
    });
    api.highlight(questCardHighlightTarget());
    return;
  }

  if (pendingIsMine) {
    questLastPendingChoiceId = pendingChoice.id;
    questTutorialShow(
      "Pick one reward card. It activates immediately unless its description says otherwise.",
      {
        title: "Pick a reward",
        current: 5,
        total: 5,
        mode: "hide"
      }
    );
    api.highlight(questCardHighlightTarget());
    api.setContinue({ show: false, mode: "hide" });
    return;
  }

  if (questOutcome === "success") {
    questTutorialShow(
      "Waiting for the Secretkeeper to finish the turn...",
      {
        title: "Reward coming next",
        current: 4,
        total: 5,
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
