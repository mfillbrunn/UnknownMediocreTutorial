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
        <span>How many secret words can still work if you keep your current secret.</span>
      </div>
      <div class="tutorial-choice-card tutorial-new-card">
        <strong>NEW</strong>
        <span>How many can still work if you use the word in your draft.</span>
      </div>
    </div>
    <div class="tutorial-note-strip">
      Bigger is usually safer. An X means the draft cannot be used.
    </div>
  `;
}

function advancedLogVisual() {
  return `
    <div class="tutorial-note-strip">
      A power's name in the Log has a dotted underline. Tap it to expand the full result underneath.
    </div>
  `;
}

function advancedConstraintVisual() {
  return `
    <div class="tutorial-eli5-mini-list">
      <span><b>Green box</b> = that exact spot is solved</span>
      <span><b>Red squares</b> = that letter is somewhere in the word, just not in this spot</span>
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
        "You already know how to play. This tutorial shows a few extra buttons that make the game easier to use.",
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
        "Guide adds little hints on the screen. Turn it on whenever you forget what something means.",
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
        "Your guess is sent. Wait for the Spy.",
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
        `Type ${word}. Then tap Submit Guess.`,
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
        `You can drag a keyboard letter straight onto a box. Drag the letters of ${word} into the five boxes.`,
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
        "Tap one filled box. A small lock appears. Backspace cannot erase a locked letter.",
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
        "Tap the locked box again. The lock goes away.",
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
        "Your guess is sent. Wait for the Spy.",
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
      "Good. Next you will be the Spy. That is where the Log, the clue row, and the secret numbers are most useful.",
      {
        role: "guesser",
        title: "Inspector tools done",
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
        "Now you are the Spy. Drag and Lock works on the secret boxes too.",
        {
          role: "setter",
          title: "Spy tools",
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
        "Your secret is saved. Wait for the Inspector.",
        {
          role: "setter",
          title: "Spy tools",
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
        `Type ${word}. Then tap Submit New Secret.`,
        {
          role: "setter",
          title: "Spy tools",
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
          "The Inspector is still thinking.",
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
        "The guess is here. KEEP and NEW compare two options: keeping your current secret as-is, or switching to whatever you type in the draft below.",
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
        "Everything on this side of the screen -- the Log and more -- lives in one panel. Tap this button now to open or close it.",
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
        "Tap Log now.",
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
        "The Log lists everything that happened this match: every guess, every secret change, every power used.",
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
        "Tap the ⧉ button to show or hide the clue row above your board. It shows what both of you already know about the secret so far.",
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
        "That flag button concedes the round right now. As Inspector, conceding costs a 10-point penalty on top. As Spy, there's no extra penalty -- you're just giving up. Either way, the round ends immediately.",
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
        "Leave shows up whenever this game has no time limit, or you're facing the AI -- tap it to step away safely. The room stays alive, so you can pick the match back up later from My Games.",
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
        "One more thing about timed matches: if you ever run out of time, your last submitted guess or secret is used automatically and the round continues. Do that three times in one round, though, and it's an instant loss.",
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
      "You used the extra tools: Guide, Drag and Lock, KEEP and NEW, the side panel, the clue row, the Log, and Concede/Leave.",
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
      "This round is done. Next you will be the Spy, where KEEP versus NEW and the Log are most useful.",
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
    "Extra tools done. You can use these helpers whenever you want, but the main game still works the same way.",
    {
      role: "setter",
      title: "Advanced tutorial done",
      placement: "bottom",
      mode: "end"
    }
  );
  tutorialEndNextMode = "tutorial";
}
