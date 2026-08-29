// Advanced tutorial: extra buttons and shortcuts, explained one at a time.

function advancedTutorialShow(text, {
  role = window.myRole,
  title = "Extra tools",
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
        <span>Uses your current secret.</span>
      </div>
      <div class="tutorial-choice-card tutorial-new-card">
        <strong>NEW</strong>
        <span>Uses the word in your draft.</span>
      </div>
    </div>
  `;
}

function advancedLogVisual() {
  return `
    <div class="tutorial-note-strip">
      Tap a dotted power name to see what it did.
    </div>
  `;
}

function advancedConstraintVisual() {
  return `
    <div class="tutorial-eli5-mini-list">
      <span><b>Green</b> = correct letter and spot</span>
      <span><b>Yellow</b> = letter is in the word, but not here</span>
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
        "You know the game. Now learn the handy tools.",
        {
          role: "guesser",
          current: 1,
          total: 3,
          placement: "top"
        }
      );
      tutorialContinueMode = "advance";
      return;
    }

    if (tutorialSubStep === 1) {
      advancedTutorialShow(
        "Guide puts small hints next to buttons.",
        {
          role: "guesser",
          title: "Guide",
          current: 2,
          total: 3,
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
          current: 3,
          total: 3,
          compact: true,
          placement: "top",
          mode: "hide",
          key: "advanced-inspector-opening-wait"
        }
      );
      stopKeyDemo();
    } else {
      advancedTutorialShow(
        `Type ${word}, then tap Submit.`,
        {
          role: "guesser",
          title: "Start the round",
          current: 3,
          total: 3,
          placement: "top",
          mode: "hide"
        }
      );
      startKeyDemo(
        `advanced-inspector-${word}`,
        () => tutorialWordKeyEls("guesser", word, localGuesserDraft)
      );
    }

    highlightKeyboardGuesser();
    waitForGuessSubmission(round, `TYPE ${word}`);
    return;
  }

  if (round === 1) {
    const word = state.tutorialGuesses?.[1] || "CUMIN";

    if (tutorialSubStep === 0) {
      advancedTutorialShow(
        `Drag each letter of ${word} into a box.`,
        {
          role: "guesser",
          title: "Drag letters",
          current: 1,
          total: 4,
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
        "Tap a filled box to lock it. Backspace skips locked boxes.",
        {
          role: "guesser",
          title: "Lock a letter",
          current: 2,
          total: 4,
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
        "Tap it again to unlock it.",
        {
          role: "guesser",
          title: "Unlock a letter",
          current: 3,
          total: 4,
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
          total: 4,
          compact: true,
          placement: "top",
          mode: "hide"
        }
      );
    } else {
      advancedTutorialShow(
        `Now submit ${word}.`,
        {
          role: "guesser",
          title: "Drag and Lock done",
          current: 4,
          total: 4,
          placement: "top",
          mode: "hide"
        }
      );
    }

    highlightKeyboardGuesser();
    waitForGuessSubmission(round);
    return;
  }

  if (round >= 2) {
    stopKeyDemo();
    advancedTutorialShow(
      "Next, try the Secretkeeper tools.",
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
        "The same Drag and Lock tools work for secrets.",
        {
          role: "setter",
          title: "Secretkeeper tools",
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
          title: "Secretkeeper tools",
          current: 2,
          total: 2,
          compact: true,
          placement: "top",
          mode: "hide",
          key: "advanced-spy-opening-wait"
        }
      );
      stopKeyDemo();
    } else {
      advancedTutorialShow(
        `Type ${word}, then tap Submit.`,
        {
          role: "setter",
          title: "Secretkeeper tools",
          current: 2,
          total: 2,
          placement: "top",
          mode: "hide"
        }
      );
      startKeyDemo(
        `advanced-spy-${word}`,
        () => tutorialWordKeyEls("setter", word, window.state?.setterDraft)
      );
    }

    highlightDraftRow("setter");
    waitForSecretSubmission(round, `TYPE ${word}`);
    return;
  }

  if (round === 1) {
    const candidate = (state.tutorialSecrets?.[1] || "LEMUR").toUpperCase();
    const TOTAL_STEPS = 9;

    if (tutorialSubStep === 0) {
      if (!state.pendingGuess) {
        advancedTutorialShow(
          "The Guesser is thinking.",
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
        "KEEP uses your current secret. NEW uses the word in the draft row.",
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
        "Tap this arrow to open or close the side panel.",
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
        "Tap Log.",
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
        "Log shows guesses, secret changes, and powers.",
        {
          role: "setter",
          title: "Read the Log",
          current: 4,
          total: TOTAL_STEPS,
          placement: "bottom",
          visualHtml: advancedLogVisual()
        }
      );
      highlightSetterLog();
      tutorialContinueMode = "advance";
      return;
    }

    if (tutorialSubStep === 4) {
      advancedTutorialShow(
        "Tap ⧉ to show or hide the shared clue row.",
        {
          role: "setter",
          title: "The clue row",
          current: 5,
          total: TOTAL_STEPS,
          placement: "bottom",
          visualHtml: advancedConstraintVisual()
        }
      );
      highlightConstraintRowAndToggle("setter");
      tutorialContinueMode = "advance";
      return;
    }

    if (tutorialSubStep === 5) {
      advancedTutorialShow(
        "Concede ends the round now. An Guesser also gets a 10-point penalty.",
        {
          role: "setter",
          title: "Concede",
          current: 6,
          total: TOTAL_STEPS,
          placement: "bottom"
        }
      );
      highlightEl(document.querySelector('#setterScreen .concedeBtn'));
      tutorialContinueMode = "advance";
      return;
    }

    if (tutorialSubStep === 6) {
      advancedTutorialShow(
        "Leave saves an untimed or AI match so you can return later.",
        {
          role: "setter",
          title: "Leave",
          current: 7,
          total: TOTAL_STEPS,
          placement: "bottom"
        }
      );
      highlightEl(byId("leaveGameBtnSetter"));
      tutorialContinueMode = "advance";
      return;
    }

    if (tutorialSubStep === 7) {
      clearHighlights();
      advancedTutorialShow(
        "Run out of time: the last word is used. Three timeouts lose the round.",
        {
          role: "setter",
          title: "Running out of time",
          current: 8,
          total: TOTAL_STEPS,
          placement: "bottom"
        }
      );
      tutorialContinueMode = "advance";
      return;
    }

    advancedTutorialShow(
      `Now submit ${candidate}.`,
      {
        role: "setter",
        title: "Finish the turn",
        current: 9,
        total: TOTAL_STEPS,
        placement: "top",
        mode: "hide"
      }
    );
    highlightDraftRow("setter");
    waitForSecretSubmission(round, `SUBMIT ${candidate}`);
    return;
  }

  if (round >= 2) {
    advancedTutorialShow(
      "Done! You used Guide, Drag, Lock, KEEP/NEW, Log, and the clue row.",
      {
        role: "setter",
        title: "Extra tools done",
        mode: "end",
        visualHtml: `
          <div class="tutorial-finish-checks">
            <span>✓ Guide when you need help</span>
            <span>✓ KEEP and NEW to compare choices</span>
            <span>✓ Concede or Leave when you need to step away</span>
          </div>
        `
      }
    );
    tutorialEndNextMode = "tutorial";
    return;
  }

  hideTutorial();
}

function runAdvancedSummaryTutorial(state) {
  clearHighlights();

  if (tutorialSubStep === 0) {
    advancedTutorialShow(
      "Round done. Next, you play as the Secretkeeper.",
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
      title: "Swap jobs",
      current: 2,
      total: 2,
      placement: "bottom",
      mode: "hide"
    }
  );
  highlightNextRoundBtn();
  tutorialContinueMode = "hide";
}

function runAdvancedMatchTutorial(state) {
  clearHighlights();
  advancedTutorialShow(
    "Advanced tools done. Use them when they help.",
    {
      role: "setter",
      title: "Advanced tutorial done",
      placement: "bottom",
      mode: "end"
    }
  );
  tutorialEndNextMode = "tutorial";
}
