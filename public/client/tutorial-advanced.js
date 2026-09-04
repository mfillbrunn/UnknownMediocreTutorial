// UMT_REQUESTED_FIXES_20260901: ADVANCED UI LABEL
// Streamlined Advanced UI Tutorial: only the controls that are hard to
// discover -- dragging letters, locking a tile, the side column, and the
// constraint row -- with one idea on each screen.
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
  // UMT_REQUESTED_FIXES_20260901: no more Guide-toggle step -- that button
  // no longer exists in the real UI, so round 0 is just a warm-up guess
  // (needed to advance the practice match into round 1, where Drag and
  // Lock are actually taught) with no separate sub-step of its own.
  const round = state.history?.length ?? 0;

  if (round === 0) {
    const word = state.tutorialGuesses?.[0] || "CHAMP";
    if (state.simultaneousGuessSubmitted) {
      advancedTutorialShow(
        "Sent. Waiting on the Secretkeeper.",
        {
          role: "guesser",
          title: "Warm-up guess",
          compact: true,
          placement: "top",
          mode: "hide",
          key: "advanced-guesser-opening-wait"
        }
      );
      stopKeyDemo();
    } else {
      advancedTutorialShow(
        `Nothing here is a new rule - just shortcuts. Type ${word}, then tap Submit Guess.`,
        {
          role: "guesser",
          title: "Warm-up guess",
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
        `Let's build ${word}. Tap the letters like normal, or drag them straight into the boxes - whichever feels better to you.`,
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
        "Tap a filled box to lock that letter in place. Backspace then skips right over it, so you can rewrite the rest of the word around it.",
        {
          role: "guesser",
          title: "Pin a letter",
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
        "Tap that box again to release it.",
        {
          role: "guesser",
          title: "Release it",
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
        "Sent. Waiting on the Secretkeeper.",
        {
          role: "guesser",
          title: "Drag and lock done",
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
        `Word's ready. Tap Submit Guess to send ${word}.`,
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
      "That's the hunter's toolkit: drag and lock. Next up, the tools you get while hiding.",
      {
        role: "guesser",
        title: "Hunter tools done",
        compact: true,
        mode: "hide"
      }
    );
    return;
  }

  hideTutorial();
}

function runAdvancedTutorialSetter(state) {
  // UMT_REQUESTED_FIXES_20260901: trimmed to just the side column and the
  // constraint row -- Keep/Change, the Log tab, and the exit/clock
  // controls are either covered in the Basics Tutorial already or rare
  // enough not to need a dedicated stop here.
  const round = state.history?.length ?? 0;

  if (round === 0) {
    const word = state.tutorialSecrets?.[0] || "BLIMP";
    if (state.simultaneousSecretSubmitted) {
      advancedTutorialShow(
        "Saved. Waiting on the Guesser.",
        {
          role: "setter",
          title: "Warm-up secret",
          compact: true,
          placement: "top",
          mode: "hide",
          key: "advanced-secretkeeper-opening-wait"
        }
      );
      stopKeyDemo();
    } else {
      advancedTutorialShow(
        `Drag and Lock work over here too. Type ${word}, then tap Submit New Secret.`,
        {
          role: "setter",
          title: "Warm-up secret",
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
          "The Guesser is picking a word.",
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
        "Tap the arrow to slide the side column open or closed.",
        {
          role: "setter",
          title: "Side column",
          current: 1,
          total: totalSteps,
          placement: "bottom"
        }
      );
      highlightSidebarToggleBtn();
      tutorialContinueMode = "advance";
      return;
    }

    if (tutorialSubStep === 1) {
      advancedTutorialShow(
        "It holds the Log - guesses, secret swaps, rewards, powers, all in one place - plus your own powers and other setter tools.",
        {
          role: "setter",
          title: "What's inside",
          current: 2,
          total: totalSteps,
          placement: "bottom"
        }
      );
      highlightSidebarToggleBtn();
      tutorialContinueMode = "advance";
      return;
    }

    if (tutorialSubStep === 2) {
      advancedTutorialShow(
        "Below the board sits the constraint row: one tile per letter, showing everything you have learned about the secret so far.",
        {
          role: "setter",
          title: "Constraint row",
          current: 3,
          total: totalSteps,
          placement: "bottom"
        }
      );
      highlightConstraintRowAndToggle("setter");
      tutorialContinueMode = "advance";
      return;
    }

    if (tutorialSubStep === 3) {
      advancedTutorialShow(
        "Solved a position? It shows that letter plainly in green, just like a normal tile.",
        {
          role: "setter",
          title: "Solved positions",
          current: 4,
          total: totalSteps,
          placement: "bottom"
        }
      );
      highlightConstraintRowAndToggle("setter");
      tutorialContinueMode = "advance";
      return;
    }

    if (tutorialSubStep === 4) {
      advancedTutorialShow(
        "Still unsolved? You might see small red squares instead. Each one names a letter a yellow clue has already ruled out there.",
        {
          role: "setter",
          title: "Red squares",
          current: 5,
          total: totalSteps,
          placement: "bottom"
        }
      );
      highlightConstraintRowAndToggle("setter");
      tutorialContinueMode = "advance";
      return;
    }

    if (tutorialSubStep === 5) {
      advancedTutorialShow(
        "Here's the rule a red square is really saying: that letter showed yellow there before, so it can never land in that spot again.",
        {
          role: "setter",
          title: "Reading a red square",
          current: 6,
          total: totalSteps,
          placement: "bottom"
        }
      );
      highlightConstraintRowAndToggle("setter");
      tutorialContinueMode = "advance";
      return;
    }

    advancedTutorialShow(
      `Last step: type ${candidate} and send it as your new secret.`,
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
      "That's the toolkit: drag, lock, the side column, the constraint row. All optional, none of them change the rules. Keep the ones that make the game feel easier.",
      {
        role: "setter",
        title: "Toolkit done",
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
      "Round done. Roles swap now, so you can try the hiding tools.",
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
    "Toolkit complete. Shortcuts only, never extra rules. Pop back to Basics any time you want a refresher.",
    {
      role: "setter",
      title: "Toolkit done",
      placement: "bottom",
      mode: "end"
    }
  );
  tutorialEndNextMode = "tutorial";
}
