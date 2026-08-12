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

function advancedChargeVisual() {
  return `
    <div class="tutorial-eli5-mini-list">
      <span><b>0–3 ★</b> for a strong new secret</span>
      <span><b>+1 ★</b> for matching the small letter target</span>
      <span><b>5 ★</b> unlocks your second power</span>
      <span><b>8 and 12 ★</b> give letter resets</span>
    </div>
  `;
}

function advancedToolsVisual() {
  return `
    <div class="tutorial-eli5-mini-list">
      <span><b>Clue row</b> = a small summary of what is known</span>
      <span><b>Log</b> = a list of what happened</span>
      <span><b>?</b> = help for your powers</span>
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
      "Good. Next you will be the Spy. That is where Notes and the secret numbers are most useful.",
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

    if (tutorialSubStep === 0) {
      advancedTutorialShow(
        "Notes is a scratchpad. Words in Notes are not submitted. Use it while the Inspector is thinking.",
        {
          role: "setter",
          title: "Notes",
          current: 1,
          total: 9,
          placement: "bottom",
          visualHtml: `
            <div class="tutorial-note-strip">
              Think of Notes like a little list of secret ideas.
            </div>
          `
        }
      );
      highlightNotesPanel();
      tutorialContinueMode = "advance";
      return;
    }

    if (tutorialSubStep === 1) {
      advancedTutorialShow(
        `Type ${candidate} in the five small Notes boxes. Press Enter to save it.`,
        {
          role: "setter",
          title: "Save a note",
          current: 2,
          total: 9,
          placement: "bottom",
          mode: "hide"
        }
      );
      highlightNotesDraft();
      startKeyDemo(
        `advanced-note-${candidate}`,
        () => tutorialWordKeyEls("setter", candidate, notesDraftText())
      );
      waitForNoteAdded(candidate);
      return;
    }

    if (tutorialSubStep === 2) {
      stopKeyDemo();
      advancedTutorialShow(
        "A green word still fits all old clues. The small number shows how many secret words would stay possible if you used it. Bigger is usually safer.",
        {
          role: "setter",
          title: "Read your notes",
          current: 3,
          total: 9,
          placement: "bottom"
        }
      );
      highlightNotesList();
      tutorialContinueMode = "advance";
      return;
    }

    if (tutorialSubStep === 3) {
      if (!state.pendingGuess) {
        advancedTutorialShow(
          "The Inspector is still thinking. You can keep adding ideas to Notes while you wait.",
          {
            role: "setter",
            title: "Wait and plan",
            current: 4,
            total: 9,
            placement: "bottom",
            compact: true,
            mode: "hide",
            key: `advanced-note-wait-${round}`
          }
        );
        highlightNotesList();
        setContinue({ show: false, mode: "hide" });
        return;
      }

      advancedTutorialShow(
        "The guess is here. KEEP and NEW help you compare your two choices.",
        {
          role: "setter",
          title: "Keep or change?",
          current: 4,
          total: 9,
          placement: "bottom",
          visualHtml: advancedRemainingVisual()
        }
      );
      highlightSetterRemainingBox();
      tutorialContinueMode = "advance";
      return;
    }

    if (tutorialSubStep === 4) {
      advancedTutorialShow(
        `Tap ${candidate} in Notes. It will copy into your secret boxes. It will not submit yet.`,
        {
          role: "setter",
          title: "Use a saved word",
          current: 5,
          total: 9,
          placement: "bottom",
          mode: "hide"
        }
      );
      highlightSavedNote(candidate);
      waitForNoteSelected(candidate);
      return;
    }

    if (tutorialSubStep === 5) {
      advancedTutorialShow(
        "The word is now in your draft. You can still change it or clear it before you submit.",
        {
          role: "setter",
          title: "Check the draft",
          current: 6,
          total: 9,
          placement: "top"
        }
      );
      highlightDraftRow("setter");
      tutorialContinueMode = "advance";
      return;
    }

    if (tutorialSubStep === 6) {
      advancedTutorialShow(
        "A strong new secret earns stars. The small letter target can give one bonus star. Stars fill the meter and unlock rewards.",
        {
          role: "setter",
          title: "Stars and charge",
          current: 7,
          total: 9,
          placement: "bottom",
          visualHtml: advancedChargeVisual()
        }
      );
      highlightSpyChargeMeter();
      highlightSetterCoverStars();
      tutorialContinueMode = "advance";
      return;
    }

    if (tutorialSubStep === 7) {
      advancedTutorialShow(
        "These three helpers are always nearby.",
        {
          role: "setter",
          title: "Small helpers",
          current: 8,
          total: 9,
          placement: "bottom",
          visualHtml: advancedToolsVisual()
        }
      );
      highlightConstraintRowAndToggle("setter");
      highlightSetterLog();
      highlightPowerInfoBtn("setter");
      tutorialContinueMode = "advance";
      return;
    }

    advancedTutorialShow(
      `Now submit ${candidate}.`,
      {
        role: "setter",
        title: "Finish the turn",
        current: 9,
        total: 9,
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
      "You used the extra tools: Guide, Drag and Lock, Notes, KEEP and NEW, stars, the clue row, the Log, and power help.",
      {
        role: "setter",
        title: "Extra tools done",
        mode: "end",
        visualHtml: `
          <div class="tutorial-finish-checks">
            <span>✓ Guide when you need help</span>
            <span>✓ Notes while the Inspector thinks</span>
            <span>✓ KEEP and NEW to compare choices</span>
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
      "This round is done. Next you will be the Spy, where Notes and KEEP versus NEW are most useful.",
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
