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
  return `
    <div class="tutorial-choice-grid">
      <div class="tutorial-choice-card tutorial-keep-card">
        <strong>KEEP</strong>
        <span>Use the secret you already have.</span>
      </div>
      <div class="tutorial-choice-card tutorial-new-card">
        <strong>CHANGE</strong>
        <span>Use the legal word in your draft.</span>
      </div>
    </div>
  `;
}

function advancedPanelVisual() {
  return `
    <div class="tutorial-tiny-steps">
      <span><b>Log:</b> guesses, secret changes, and power uses.</span>
      <span><b>Clue row:</b> the green and yellow rules every new secret must follow.</span>
    </div>
  `;
}

function advancedExitVisual() {
  return `
    <div class="tutorial-tiny-steps">
      <span><b>Concede:</b> end this round now.</span>
      <span><b>Leave:</b> step away from an untimed or AI match and return later.</span>
      <span><b>Clock:</b> repeated timeouts can lose the round.</span>
    </div>
  `;
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
  const round = state.history?.length ?? 0;

  if (round === 0) {
    if (tutorialSubStep === 0) {
      advancedTutorialShow(
        "You already know the rules. This tutorial only covers a few optional shortcuts. Guide adds small hints beside controls whenever you need a reminder.",
        {
          role: "guesser",
          title: "Guide",
          current: 1,
          total: 2,
          placement: "top",
          visualHtml: `
            <div class="tutorial-key-point">
              Extra tools are optional. Normal typing and tapping still work.
            </div>
          `
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
    const TOTAL_STEPS = 4;

    if (tutorialSubStep === 0) {
      advancedTutorialShow(
        `Build ${word}. You may tap letters or drag them into the five boxes.`,
        {
          role: "guesser",
          title: "Drag letters",
          current: 1,
          total: TOTAL_STEPS,
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
          total: TOTAL_STEPS,
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
          total: TOTAL_STEPS,
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
          total: TOTAL_STEPS,
          compact: true,
          placement: "top",
          mode: "hide",
          key: "advanced-guesser-drag-wait"
        }
      );
      stopKeyDemo();
    } else {
      advancedTutorialShow(
        `Now submit ${word}.`,
        {
          role: "guesser",
          title: "Finish the turn",
          current: 4,
          total: TOTAL_STEPS,
          placement: "top",
          mode: "hide"
        }
      );
    }
    highlightDraftRow("guesser");
    waitForGuessSubmission(round, `SUBMIT ${word}`);
    return;
  }

  if (round >= 2) {
    stopKeyDemo();
    advancedTutorialShow(
      "Guesser tools complete. Next you will see the Secretkeeper tools.",
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
  const round = state.history?.length ?? 0;

  if (round === 0) {
    if (tutorialSubStep === 0) {
      advancedTutorialShow(
        "Drag and Lock work on secret words too. Use them only when they make editing easier.",
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
    const TOTAL_STEPS = 6;

    if (tutorialSubStep === 0) {
      if (!state.pendingGuess) {
        advancedTutorialShow(
          "The Guesser is choosing a word.",
          {
            role: "setter",
            title: "Wait and plan",
            current: 1,
            total: TOTAL_STEPS,
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
        "KEEP uses your current secret. CHANGE uses the legal word in your five draft boxes.",
        {
          role: "setter",
          title: "Keep or change?",
          current: 1,
          total: TOTAL_STEPS,
          placement: "bottom",
          visualHtml: advancedRemainingVisual()
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
          total: TOTAL_STEPS,
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
        "Open Log to review guesses, secret changes, rewards, and power uses before deciding what to do next.",
        {
          role: "setter",
          title: "Open the Log",
          current: 3,
          total: TOTAL_STEPS,
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
        "The Log remembers what happened. The shared clue row keeps the green and yellow rules in one place.",
        {
          role: "setter",
          title: "Log and clue row",
          current: 4,
          total: TOTAL_STEPS,
          placement: "bottom",
          visualHtml: advancedPanelVisual()
        }
      );
      highlightSetterLog();
      highlightConstraintRowAndToggle("setter");
      tutorialContinueMode = "advance";
      return;
    }

    if (tutorialSubStep === 4) {
      advancedTutorialShow(
        "These controls end or pause play. You usually do not need them during a normal turn.",
        {
          role: "setter",
          title: "Concede, Leave, and clocks",
          current: 5,
          total: TOTAL_STEPS,
          placement: "bottom",
          visualHtml: advancedExitVisual()
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
        total: TOTAL_STEPS,
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
      "Extra Tools complete. Use Guide, Drag, Lock, the side panel, and the Log only when they help.",
      {
        role: "setter",
        title: "Extra Tools done",
        mode: "end",
        visualHtml: `
          <div class="tutorial-finish-checks">
            <span>✓ Guide explains unfamiliar controls</span>
            <span>✓ Drag and Lock make editing easier</span>
            <span>✓ Log and clue row help you review the turn</span>
          </div>
        `
      }
    );
    tutorialEndNextMode = "tutorial";
    return;
  }

  hideTutorial();
}

function runAdvancedSummaryTutorial() {
  clearHighlights();

  if (tutorialSubStep === 0) {
    advancedTutorialShow(
      "Round complete. The roles now swap, so you can practice the Secretkeeper tools.",
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
  clearHighlights();
  advancedTutorialShow(
    "Extra Tools complete. Return to Basics whenever you want a refresher.",
    {
      role: "setter",
      title: "Extra Tools done",
      placement: "bottom",
      mode: "end"
    }
  );
  tutorialEndNextMode = "tutorial";
}
