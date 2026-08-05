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
      "#guesserPowerContainer " +
      ".quest-badge-tile"
    );
  }

  function constraintRow() {
    return document.getElementById(
      "constraintRowGuesser"
    );
  }

  function readGuesserDraft() {
    const row =
      document.querySelector(
        "#draftGuesser " +
        ".history-row.guesser-draft"
      );

    if (!row) {
      return "";
    }

    return [
      ...row.querySelectorAll(
        ".history-tile"
      )
    ]
      .map(
        tile =>
          tile.textContent?.trim() ||
          ""
      )
      .join("");
  }

  function setPhase(
    nextPhase,
    state
  ) {
    const api = core();

    if (!api) {
      return;
    }

    const nextSession =
      state.matchStartedAt ||
      window.roomId ||
      "quest";

    if (
      nextSession !== sessionKey
    ) {
      sessionKey = nextSession;
      phaseKey = null;
    }

    if (
      nextPhase === phaseKey
    ) {
      return;
    }

    phaseKey = nextPhase;

    api.setStep(0);
    api.clearWaiting();
    api.stopKeyDemo();
  }

  function show(
    text,
    phase,
    step,
    options = {}
  ) {
    core()?.show(text, {
      key:
        `quest-${phase}-${step}`,

      ...options
    });
  }

  function renderBuildPhase(
    state,
    status
  ) {
    const api = core();
    const step = api.getStep();
    const phase = "build";

    if (step === 0) {
      show(
        "When you are the Inspector, " +
        "you also get a Quest. A Quest " +
        "is a bonus challenge that " +
        "watches your guesses " +
        "automatically. You do not " +
        "need to turn it on first.",

        phase,
        step,

        {
          mode: "advance"
        }
      );

      api.highlight(
        questBadge()
      );

      return;
    }

    if (step === 1) {
      show(
        "This Quest is Rare Letters. " +
        "Use 5 different letters from " +
        "Q, J, X, Z, W, K, and V " +
        "across your guesses. You are " +
        `already at ${
          status?.label || "4/5"
        }. The Spy can see your Quest ` +
        "and progress too.",

        phase,
        step,

        {
          mode: "advance"
        }
      );

      api.highlight(
        questBadge()
      );

      return;
    }

    if (step === 2) {
      show(
        "The yellow Quest card means " +
        "you are one step away. You " +
        "may claim it early for one " +
        "yellow letter, but that " +
        "spends the Quest and gives " +
        "up the stronger green reward. " +
        "For this tutorial, finish the " +
        "Quest instead.",

        phase,
        step,

        {
          mode: "advance"
        }
      );

      api.highlight(
        questBadge()
      );

      return;
    }

    if (step === 3) {
      show(
        "Tap the Quest card to see " +
        "exactly what's needed and " +
        "your current progress. When " +
        "you're done looking, tap the " +
        "X to close it — we'll finish " +
        "the Quest the normal way " +
        "instead of claiming early.",

        phase,
        step,

        {
          mode: "hide"
        }
      );

      api.highlight(
        questBadge()
      );

      api.waitForModalDismissed(
        "powerActionCloseBtn"
      );

      return;
    }

    if (state.pendingGuess) {
      show(
        "Your guess is submitted. " +
        "The Quest checks it " +
        "immediately while the Spy " +
        "decides what to do.",

        phase,
        step,

        {
          mode: "hide"
        }
      );

      api.stopKeyDemo();

      api.waitForGuess(
        state.history?.length ?? 0
      );

      return;
    }

    show(
      `Type ${TUTORIAL_WORD} and ` +
      "press Enter. Its W is the " +
      "fifth rare letter you need.",

      phase,
      step,

      {
        mode: "hide"
      }
    );

    api.highlightKeyboardGuesser();

    api.startKeyDemo(
      "quest-wacky",

      () =>
        api.wordKeyEls(
          "guesser",
          TUTORIAL_WORD,
          readGuesserDraft()
        )
    );

    api.waitForGuess(
      state.history?.length ?? 0
    );
  }

  function renderReadyPhase() {
    const api = core();
    const step = api.getStep();
    const phase = "ready";

    if (step === 0) {
      show(
        "Quest complete. The card is " +
        "now green and says Ready. " +
        "The reward is not added " +
        "automatically—you choose " +
        "when to claim it.",

        phase,
        step,

        {
          mode: "advance"
        }
      );

      api.highlight(
        questBadge()
      );

      return;
    }

    show(
      "Tap the green Quest card, " +
      "then tap Use to claim your " +
      "free green letter.",

      phase,
      step,

      {
        mode: "hide"
      }
    );

    api.highlight(
      questBadge()
    );

    api.setWaiting({
      type: "questClaim",

      label: "CLAIM QUEST",

      modalTargetId:
        "powerActionUseBtn"
    });
  }

  function renderGreenRewardPhase(
    state
  ) {
    const api = core();
    const step = api.getStep();
    const phase = "green-reward";

    const quest =
      state.powers.quest;

    if (step === 0) {
      const result =
        quest.resultLetter
          ? (
              `${quest.resultLetter} ` +
              "is green in position " +
              `${
                (
                  quest.resultIndex ??
                  0
                ) + 1
              }.`
            )
          : (
              "A free green letter " +
              "was added."
            );

      show(
        `${result} The green clue ` +
        "appears in the constraint " +
        "row, right above your " +
        "history. It tells you the " +
        "exact letter and exact " +
        "position.",

        phase,
        step,

        {
          mode: "advance"
        }
      );

      api.highlight(
        constraintRow()
      );

      return;
    }

    if (step === 1) {
      show(
        "That green clue stays useful " +
        "for the rest of the round.",

        phase,
        step,

        {
          mode: "advance"
        }
      );

      api.highlight(
        constraintRow()
      );

      return;
    }

    api.setNextTutorial("advanced");

    show(
      "That is the Quest system: " +
      "make progress with normal " +
      "guesses, decide whether to " +
      "take an early yellow when " +
      "you are one step away, or " +
      "finish the challenge and " +
      "claim the full green reward.",

      phase,
      step,

      {
        mode: "end"
      }
    );
  }

  function renderEarlyRewardPhase(
    state
  ) {
    const api = core();
    const step = api.getStep();
    const phase = "early-reward";

    const letter =
      state.powers.quest
        .resultLetter;

    if (step === 0) {
      show(
        letter
          ? (
              "You claimed early, so " +
              `${letter} was added as ` +
              "a yellow clue in the " +
              "constraint row. It is in " +
              "the secret, but its " +
              "position is still " +
              "unknown."
            )
          : (
              "You claimed early, but " +
              "there was no new letter " +
              "left to reveal."
            ),

        phase,
        step,

        {
          mode: "advance"
        }
      );

      api.highlight(
        constraintRow()
      );

      return;
    }

    if (step === 1) {
      show(
        "Claiming early spends the " +
        "Quest. Use that option when " +
        "one useful yellow letter now " +
        "is worth more than waiting " +
        "for the exact green letter " +
        "later.",

        phase,
        step,

        {
          mode: "advance"
        }
      );

      api.highlight(
        questBadge()
      );

      return;
    }

    api.setNextTutorial("advanced");

    show(
      "That is the Quest system. " +
      "In most rounds, you will " +
      "choose between taking the " +
      "early yellow or finishing " +
      "the challenge for the " +
      "stronger green reward.",

      phase,
      step,

      {
        mode: "end"
      }
    );
  }

  function runQuestTutorial(
    state,
    role
  ) {
    const api = core();

    if (!api) {
      return;
    }

    api.clearHighlights();

    if (role !== "guesser") {
      api.setNextTutorial("advanced");

      show(
        "This tutorial needs you to " +
        "be the Inspector. Leave and " +
        "start the Quest Tutorial " +
        "again.",

        "wrong-role",
        0,

        {
          mode: "end"
        }
      );

      return;
    }

    const quest =
      state.powers?.quest;

    if (!quest?.type) {
      api.setNextTutorial("advanced");

      show(
        "The Quest did not load " +
        "correctly. End the tutorial " +
        "and start it again.",

        "missing",
        0,

        {
          mode: "end"
        }
      );

      return;
    }

    const nextPhase =
      quest.used
        ? (
            quest.claimedEarly
              ? "early-reward"
              : "green-reward"
          )
        : quest.ready
          ? "ready"
          : "build";

    setPhase(
      nextPhase,
      state
    );

    if (
      nextPhase ===
      "green-reward"
    ) {
      renderGreenRewardPhase(
        state
      );

      return;
    }

    if (
      nextPhase ===
      "early-reward"
    ) {
      renderEarlyRewardPhase(
        state
      );

      return;
    }

    if (
      nextPhase === "ready"
    ) {
      renderReadyPhase(state);
      return;
    }

    renderBuildPhase(
      state,

      window
        .computeQuestStatus
        ?.(state)
    );
  }

  window.runQuestTutorial =
    runQuestTutorial;
})();
