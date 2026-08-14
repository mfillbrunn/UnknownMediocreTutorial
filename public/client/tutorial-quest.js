(() => {
  "use strict";

  const TUTORIAL_WORD = "WACKY";

  let sessionKey = null;
  let phaseKey = null;

  function core() {
    return window.TutorialCore;
  }

  function questBadge() {
    return document.querySelector(
      "#guesserPowerContainer .quest-badge-tile"
    );
  }

  function constraintRow() {
    return document.getElementById("constraintRowGuesser");
  }

  function readGuesserDraft() {
    const row = document.querySelector(
      "#draftGuesser .history-row.guesser-draft"
    );

    if (!row) return "";

    return [...row.querySelectorAll(".history-tile")]
      .map(tile => tile.textContent?.trim() || "")
      .join("");
  }

  function setPhase(nextPhase, state) {
    const api = core();
    if (!api) return;

    const nextSession =
      state.matchStartedAt || window.roomId || "quest";

    if (nextSession !== sessionKey) {
      sessionKey = nextSession;
      phaseKey = null;
    }

    if (nextPhase === phaseKey) return;

    phaseKey = nextPhase;
    api.setStep(0);
    api.clearWaiting();
    api.stopKeyDemo();
  }

  function phaseProgress(phase, step) {
    if (phase === "build") {
      return {
        current: Math.min(step + 1, 5),
        total: 5
      };
    }

    if (phase === "ready") {
      return {
        current: Math.min(step + 1, 2),
        total: 2
      };
    }

    return {
      current: Math.min(step + 1, 2),
      total: 2
    };
  }

  function show(text, phase, step, options = {}) {
    const progress = phaseProgress(phase, step);

    core()?.show(text, {
      key: `quest-eli5-${phase}-${step}`,
      title: "Quest: bonus challenge",
      tone: "guesser",
      progressCurrent: progress.current,
      progressTotal: progress.total,
      ...options
    });
  }

  function questIdeaVisual() {
    return `
      <div class="tutorial-role-goal">
        <span class="tutorial-role-icon">🎯</span>
        <span><strong>A small bonus job</strong><small>Your normal guesses fill it up automatically.</small></span>
      </div>
    `;
  }

  function questChoiceVisual() {
    return `
      <div class="tutorial-choice-grid">
        <div class="tutorial-choice-card">
          <strong>CLAIM EARLY</strong>
          <span>Get one yellow clue now.</span>
        </div>
        <div class="tutorial-choice-card">
          <strong>FINISH</strong>
          <span>Get one exact green clue.</span>
        </div>
      </div>
    `;
  }

  function renderBuildPhase(state, status) {
    const api = core();
    const step = api.getStep();
    const phase = "build";

    if (step === 0) {
      show(
        "In this tutorial, we'll explain quests. Quests are only available to the Inspector. They give you extra conditions on your guesses, and if you satisfy those conditions, you get a bonus. You don't have to do them -- you can guess normally. But if you do, you get rewarded.",
        phase,
        step,
        {
          placement: "bottom",
          visualHtml: questIdeaVisual()
        }
      );
      api.highlight(questBadge());
      api.setMode("advance");
      return;
    }

    if (step === 1) {
      show(
        `This Quest wants 6 different rare letters: Q, J, X, Z, W, K, or V. You already have ${status?.label || "4/6"}.`,
        phase,
        step,
        {
          placement: "bottom"
        }
      );
      api.highlight(questBadge());
      api.setMode("advance");
      return;
    }

    if (step === 2) {
      show(
        "Before you finish, tap the Quest card. It'll show you exactly which rare letters you still need.",
        phase,
        step,
        {
          placement: "bottom",
          mode: "hide"
        }
      );
      api.highlight(questBadge());
      api.waitForModalDismissed();
      return;
    }

    if (step === 3) {
      show(
        `Some quests also have a Highlight button inside that popup. Tap the Quest card again, then tap "Highlight remaining rare letters on keyboard" -- it'll light up W and K for you right on the keyboard.`,
        phase,
        step,
        {
          placement: "bottom",
          mode: "hide"
        }
      );
      api.highlight(questBadge());
      api.waitForModalDismissed();
      return;
    }

    if (state.pendingGuess) {
      show(
        "Your guess is sent. The Quest checks it now.",
        phase,
        step,
        {
          placement: "top",
          compact: true,
          mode: "hide",
          key: "quest-eli5-build-wait"
        }
      );
      api.stopKeyDemo();
      api.waitForGuess(state.history?.length ?? 0);
      return;
    }

    show(
      `Type ${TUTORIAL_WORD}. It has both W and K, the last two rare letters you need. Then tap Submit Guess.`,
      phase,
      step,
      {
        placement: "top",
        mode: "hide"
      }
    );

    api.highlightKeyboardGuesser();
    api.startKeyDemo(
      "quest-eli5-wacky",
      () => api.wordKeyEls(
        "guesser",
        TUTORIAL_WORD,
        readGuesserDraft()
      )
    );
    api.waitForGuess(state.history?.length ?? 0);
  }

  function renderReadyPhase() {
    const api = core();
    const step = api.getStep();
    const phase = "ready";

    if (step === 0) {
      show(
        "The Quest card is green. That means the job is done and the green reward is ready.",
        phase,
        step,
        {
          placement: "bottom"
        }
      );
      api.highlight(questBadge());
      api.setMode("advance");
      return;
    }

    show(
      "Tap the green Quest card. Then tap Use.",
      phase,
      step,
      {
        placement: "bottom",
        mode: "hide"
      }
    );
    api.highlight(questBadge());
    api.setWaiting({
      type: "questClaim",
      label: "CLAIM QUEST",
      modalTargetId: "powerActionUseBtn"
    });
  }

  function renderGreenRewardPhase(state) {
    const api = core();
    const step = api.getStep();
    const phase = "green-reward";
    const quest = state.powers.quest;

    if (step === 0) {
      const result = quest.resultLetter
        ? `${quest.resultLetter} belongs in box ${(quest.resultIndex ?? 0) + 1}.`
        : "You received one exact green clue.";

      show(
        `${result} Green means the letter and the box are both correct.`,
        phase,
        step,
        {
          placement: "bottom"
        }
      );
      api.highlight(constraintRow());
      api.setMode("advance");
      return;
    }

    api.setNextTutorial("advanced");
    show(
      "That is a Quest: make normal guesses, fill the Quest, then claim the clue.",
      phase,
      step,
      {
        placement: "bottom",
        mode: "end"
      }
    );
  }

  function renderEarlyRewardPhase(state) {
    const api = core();
    const step = api.getStep();
    const phase = "early-reward";
    const letter = state.powers.quest.resultLetter;

    if (step === 0) {
      show(
        letter
          ? `${letter} is in the secret, but we do not know which box it belongs in. That is a yellow clue.`
          : "You claimed early, but there was no new letter left to show.",
        phase,
        step,
        {
          placement: "bottom"
        }
      );
      api.highlight(constraintRow());
      api.setMode("advance");
      return;
    }

    api.setNextTutorial("advanced");
    show(
      "Claiming early spends the Quest. Yellow gives the letter. Finishing gives the letter and its exact box.",
      phase,
      step,
      {
        placement: "bottom",
        mode: "end",
        visualHtml: questChoiceVisual()
      }
    );
  }

  function runQuestTutorial(state, role) {
    const api = core();
    if (!api) return;

    api.clearHighlights();

    if (role !== "guesser") {
      api.setNextTutorial("advanced");
      show(
        "This tutorial needs the Inspector screen. End it and start Quest Tutorial again.",
        "wrong-role",
        0,
        {
          mode: "end"
        }
      );
      return;
    }

    const quest = state.powers?.quest;

    if (!quest?.type) {
      api.setNextTutorial("advanced");
      show(
        "The Quest did not load. End this tutorial and try it again.",
        "missing",
        0,
        {
          mode: "end"
        }
      );
      return;
    }

    const nextPhase = quest.used
      ? quest.claimedEarly
        ? "early-reward"
        : "green-reward"
      : quest.ready
        ? "ready"
        : "build";

    setPhase(nextPhase, state);

    if (nextPhase === "green-reward") {
      renderGreenRewardPhase(state);
      return;
    }

    if (nextPhase === "early-reward") {
      renderEarlyRewardPhase(state);
      return;
    }

    if (nextPhase === "ready") {
      renderReadyPhase();
      return;
    }

    renderBuildPhase(
      state,
      window.computeQuestStatus?.(state)
    );
  }

  window.runQuestTutorial = runQuestTutorial;
})();
