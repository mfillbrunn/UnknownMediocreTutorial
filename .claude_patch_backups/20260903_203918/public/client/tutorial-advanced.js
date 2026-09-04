// UMT_REQUESTED_FIXES_20260901: ADVANCED UI LABEL
// Streamlined Advanced UI Tutorial: only the controls that are hard to
// discover, with one idea or action on each screen.
function advancedTutorialShow(text, {
  role = window.myRole,
  title = "Advanced UI",
  current = null,
  total = null,
  placement = "auto",
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

function advancedRemainingVisual() {
  // The simplified Advanced UI tutorial uses plain text only.
  return "";
}

function advancedPanelVisual() {
  // The simplified Advanced UI tutorial uses plain text only.
  return "";
}

function advancedExitVisual() {
  // The simplified Advanced UI tutorial uses plain text only.
  return "";
}

function runAdvancedTutorial(state, role) {
  clearHighlights();
  if (role === "guesser") {
    runAdvancedTutorialGuesser(state);
  } else {
    runAdvancedTutorialSetter(state);
  }
}

function runAdvancedTutorialGuesser(state) {
  // UMT_SIMPLIFIED_TUTORIAL_COPY_20260902
  const round = state.history?.length ?? 0;

  if (round === 0) {
    if (tutorialSubStep === 0) {
      advancedTutorialShow(
        "Extra Tools are optional shortcuts. Guide adds small labels beside unfamiliar controls. Turn it on whenever you need a reminder; normal typing and tapping still work.",
        {
          role: "guesser",
          title: "Guide",
          current: 1,
          total: 2,
          placement: "top"
        }
      );
      highlightGuideToggle("guesser");
      tutorialContinueMode = "advance";
      return;
    }

    const word = state.tutorialGuesses?.[0] || "CHAMP";
    if (state.simultaneousGuessSubmitted) {
      advancedTutorialShow(
        "Guess sent. Wait for the Secretkeeper.",
        {
          role: "guesser",
          title: "Start the round",
          current: 2,
          total: 2,
          compact: true,
          placement: "top",
          mode: "hide",
          key: "advanced-guesser-opening-wait"
        }
      );
      stopKeyDemo();
    } else {
      advancedTutorialShow(
        `Type ${word}, then tap Submit Guess.`,
        {
          role: "guesser",
          title: "Start the round",
          current: 2,
          total: 2,
          placement: "top",
          mode: "hide"
        }
      );
      startKeyDemo(
        `advanced-guesser-${word}`,
        () => tutorialWordKeyEls("guesser", word, localGuesserDraft)
      );
    }
    highlightKeyboardGuesser();
    waitForGuessSubmission(round, `TYPE ${word}`);
    return;
  }

  if (round === 1) {
    const word = state.tutorialGuesses?.[1] || "CUMIN";
    const totalSteps = 4;

    if (tutorialSubStep === 0) {
      advancedTutorialShow(
        `Build ${word}. You can tap letters as usual, or drag them into the five boxes.`,
        {
          role: "guesser",
          title: "Drag letters",
          current: 1,
          total: totalSteps,
          placement: "top",
          mode: "hide"
        }
      );
      highlightDraftRow("guesser");
      highlightKeyboardGuesser();
      startDragDemo(word);
      startKeyDemo(
        `advanced-drag-${word}`,
        () => tutorialWordKeyEls("guesser", word, localGuesserDraft)
      );
      waitForDraftFilled();
      return;
    }

    if (tutorialSubStep === 1) {
      stopDragDemo();
      stopKeyDemo();
      advancedTutorialShow(
        "Tap one filled box to lock that letter. Backspace skips locked boxes.",
        {
          role: "guesser",
          title: "Lock a letter",
          current: 2,
          total: totalSteps,
          placement: "top",
          mode: "hide"
        }
      );
      highlightDraftRow("guesser");
      waitForTileLocked();
      return;
    }

    if (tutorialSubStep === 2) {
      advancedTutorialShow(
        "Tap the locked box again to unlock it.",
        {
          role: "guesser",
          title: "Unlock it",
          current: 3,
          total: totalSteps,
          placement: "top",
          mode: "hide"
        }
      );
      highlightDraftRow("guesser");
      waitForTileUnlocked();
      return;
    }

    if (state.pendingGuess) {
      advancedTutorialShow(
        "Guess sent. Wait for the Secretkeeper.",
        {
          role: "guesser",
          title: "Drag and Lock done",
          current: 4,
          total: totalSteps,
          compact: true,
          placement: "top",
          mode: "hide",
          key: "advanced-guesser-drag-wait"
        }
      );
      stopKeyDemo();
    } else {
      advancedTutorialShow(
        `The word is ready. Tap Submit Guess to send ${word}.`,
        {
          role: "guesser",
          title: "Finish the turn",
          current: 4,
          total: totalSteps,
          placement: "top",
          mode: "hide"
        }
      );
      startKeyDemo(
        `advanced-submit-${word}`,
        () => tutorialWordKeyEls("guesser", word, localGuesserDraft)
      );
    }
    highlightDraftRow("guesser");
    waitForGuessSubmission(round, `SUBMIT ${word}`);
    return;
  }

  if (round >= 2) {
    stopKeyDemo();
    advancedTutorialShow(
      "Guesser shortcuts complete. Next you will see the Secretkeeper tools.",
      {
        role: "guesser",
        title: "Guesser tools done",
        compact: true,
        mode: "hide"
      }
    );
    return;
  }

  hideTutorial();
}

function runAdvancedTutorialSetter(state) {
  // UMT_SIMPLIFIED_TUTORIAL_COPY_20260902
  const round = state.history?.length ?? 0;

  if (round === 0) {
    if (tutorialSubStep === 0) {
      advancedTutorialShow(
        "Drag and Lock work on secret words too. They are optional; use them only when they make editing easier.",
        {
          role: "setter",
          title: "Secretkeeper shortcuts",
          current: 1,
          total: 2,
          placement: "top"
        }
      );
      highlightDraftRow("setter");
      tutorialContinueMode = "advance";
      return;
    }

    const word = state.tutorialSecrets?.[0] || "BLIMP";
    if (state.simultaneousSecretSubmitted) {
      advancedTutorialShow(
        "Secret saved. Wait for the Guesser.",
        {
          role: "setter",
          title: "Start the round",
          current: 2,
          total: 2,
          compact: true,
          placement: "top",
          mode: "hide",
          key: "advanced-secretkeeper-opening-wait"
        }
      );
      stopKeyDemo();
    } else {
      advancedTutorialShow(
        `Type ${word}, then tap Submit New Secret.`,
        {
          role: "setter",
          title: "Start the round",
          current: 2,
          total: 2,
          placement: "top",
          mode: "hide"
        }
      );
      startKeyDemo(
        `advanced-secretkeeper-${word}`,
        () => tutorialWordKeyEls("setter", word, window.state?.setterDraft)
      );
    }
    highlightDraftRow("setter");
    waitForSecretSubmission(round, `TYPE ${word}`);
    return;
  }

  if (round === 1) {
    const candidate = (state.tutorialSecrets?.[1] || "LEMUR").toUpperCase();
    const totalSteps = 6;

    if (tutorialSubStep === 0) {
      if (!state.pendingGuess) {
        advancedTutorialShow(
          "The Guesser is choosing a word.",
          {
            role: "setter",
            title: "Wait for a guess",
            current: 1,
            total: totalSteps,
            placement: "bottom",
            compact: true,
            mode: "hide",
            key: `advanced-wait-${round}`
          }
        );
        setContinue({ show: false, mode: "hide" });
        return;
      }
      advancedTutorialShow(
        "Keep uses your current secret. Change uses the legal word in your five draft boxes. The nearby preview helps compare the two choices.",
        {
          role: "setter",
          title: "Keep or change?",
          current: 1,
          total: totalSteps,
          placement: "bottom"
        }
      );
      highlightSetterRemainingBox();
      tutorialContinueMode = "advance";
      return;
    }

    if (tutorialSubStep === 1) {
      advancedTutorialShow(
        "Tap the arrow to open the side panel. Tap it again whenever you want more room for the board.",
        {
          role: "setter",
          title: "Side panel",
          current: 2,
          total: totalSteps,
          placement: "bottom",
          mode: "hide"
        }
      );
      highlightSidebarToggleBtn();
      waitForSidebarToggled();
      return;
    }

    if (tutorialSubStep === 2) {
      advancedTutorialShow(
        "Open Log to review guesses, secret changes, rewards, and power uses.",
        {
          role: "setter",
          title: "Open the Log",
          current: 3,
          total: totalSteps,
          placement: "bottom",
          mode: "hide"
        }
      );
      highlightLogTabButton();
      waitForLogTabOpened();
      return;
    }

    if (tutorialSubStep === 3) {
      advancedTutorialShow(
        "The Log records what happened. The clue row collects the green and yellow rules that every new secret must obey.",
        {
          role: "setter",
          title: "Log and clue row",
          current: 4,
          total: totalSteps,
          placement: "bottom"
        }
      );
      highlightSetterLog();
      highlightConstraintRowAndToggle("setter");
      tutorialContinueMode = "advance";
      return;
    }

    if (tutorialSubStep === 4) {
      advancedTutorialShow(
        "Concede ends the round. Leave exits an untimed or AI match. In timed games, repeated timeouts can lose the round. You normally do not need these controls during a turn.",
        {
          role: "setter",
          title: "Exit and clock controls",
          current: 5,
          total: totalSteps,
          placement: "bottom"
        }
      );
      highlightEl(document.querySelector("#setterScreen .concedeBtn"));
      highlightEl(byId("leaveGameBtnSetter"));
      tutorialContinueMode = "advance";
      return;
    }

    advancedTutorialShow(
      `Finish the practice turn: enter ${candidate}, then submit the new secret.`,
      {
        role: "setter",
        title: "Finish the turn",
        current: 6,
        total: totalSteps,
        placement: "top",
        mode: "hide"
      }
    );
    highlightDraftRow("setter");
    startKeyDemo(
      `advanced-secretkeeper-${candidate}`,
      () => tutorialWordKeyEls("setter", candidate, window.state?.setterDraft)
    );
    waitForSecretSubmission(round, `SUBMIT ${candidate}`);
    return;
  }

  if (round >= 2) {
    advancedTutorialShow(
      "Extra Tools complete. Guide, Drag, Lock, the side panel, and the Log are all optional - use only the ones that help you.",
      {
        role: "setter",
        title: "Extra Tools done",
        mode: "end"
      }
    );
    tutorialEndNextMode = "tutorial";
    return;
  }

  hideTutorial();
}

function runAdvancedSummaryTutorial() {
  // UMT_SIMPLIFIED_TUTORIAL_COPY_20260902
  clearHighlights();

  if (tutorialSubStep === 0) {
    advancedTutorialShow(
      "Round complete. The roles now swap so you can see the Secretkeeper tools.",
      {
        role: "guesser",
        title: "Round finished",
        current: 1,
        total: 2,
        placement: "bottom"
      }
    );
    highlightRoundSummary();
    tutorialContinueMode = "advance";
    return;
  }

  advancedTutorialShow(
    "Tap Next Round.",
    {
      role: "setter",
      title: "Swap roles",
      current: 2,
      total: 2,
      placement: "bottom",
      mode: "hide"
    }
  );
  highlightNextRoundBtn();
  tutorialContinueMode = "hide";
}

function runAdvancedMatchTutorial() {
  // UMT_SIMPLIFIED_TUTORIAL_COPY_20260902
  clearHighlights();
  advancedTutorialShow(
    "Extra Tools complete. They are optional shortcuts, not extra rules. Return to Basics whenever you want a refresher.",
    {
      role: "setter",
      title: "Extra Tools done",
      placement: "bottom",
      mode: "end"
    }
  );
  tutorialEndNextMode = "tutorial";
}

