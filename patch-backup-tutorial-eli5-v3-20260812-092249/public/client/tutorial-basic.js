// Basic tutorial only: core Inspector + Spy rules.

function basicTutorialShow(text, {
  role = window.myRole,
  section = role === "setter" ? "Spy" : "Inspector",
  current = null,
  total = null,
  visualHtml = "",
  placement = "auto",
  compact = false,
  mode = "advance",
  key = null
} = {}) {
  showTutorial(text, {
    title: `${section} basics`,
    progressCurrent: current,
    progressTotal: total,
    visualHtml,
    tone: role === "setter" ? "setter" : "guesser",
    placement,
    compact,
    mode,
    key: key || undefined
  });
}

function basicFeedbackLegend() {
  return `
    <div class="tutorial-feedback-legend" aria-label="Feedback colors">
      <div class="tutorial-feedback-item">
        <span class="tutorial-mini-tile tile-green">A</span>
        <span><strong>Green</strong><small>right letter, right spot</small></span>
      </div>
      <div class="tutorial-feedback-item">
        <span class="tutorial-mini-tile tile-yellow">A</span>
        <span><strong>Yellow</strong><small>right letter, different spot</small></span>
      </div>
      <div class="tutorial-feedback-item">
        <span class="tutorial-mini-tile tile-gray">A</span>
        <span><strong>Grey</strong><small>not in the secret</small></span>
      </div>
    </div>
  `;
}

function basicSpyChoices() {
  return `
    <div class="tutorial-choice-grid">
      <div class="tutorial-choice-card">
        <strong>KEEP</strong>
        <span>Use the same secret again.</span>
      </div>
      <div class="tutorial-choice-card">
        <strong>CHANGE</strong>
        <span>Enter a different legal secret.</span>
      </div>
    </div>
  `;
}

function runBasicTutorial(state, role) {
  if (role === "setter") {
    runBasicSpyTutorial(state);
  } else {
    runBasicInspectorTutorial(state);
  }
}

function runBasicInspectorTutorial(state) {
  const round = state.history?.length ?? 0;
  clearHighlights();

  if (round === 0) {
    const word = state.tutorialGuesses?.[0] || "CHAMP";

    if (tutorialSubStep === 0) {
      basicTutorialShow(
        "Find the Spy's hidden 5-letter word. Fewer guesses means a better Inspector score.",
        {
          role: "guesser",
          current: 1,
          total: 4,
          placement: "top",
          visualHtml: `
            <div class="tutorial-role-goal">
              <span class="tutorial-role-icon">🔍</span>
              <span><strong>Inspector goal</strong><small>Find the secret quickly.</small></span>
            </div>
          `
        }
      );
      tutorialContinueMode = "advance";
      return;
    }

    if (state.simultaneousGuessSubmitted) {
      basicTutorialShow(
        "Guess sent. The Spy is choosing their opening secret at the same time.",
        {
          role: "guesser",
          current: 2,
          total: 4,
          placement: "top",
          compact: true,
          mode: "hide",
          key: "basic-inspector-opening-wait"
        }
      );
      stopKeyDemo();
    } else {
      basicTutorialShow(
        `Type ${word}, then tap Submit Guess.`,
        {
          role: "guesser",
          current: 2,
          total: 4,
          placement: "top",
          mode: "hide"
        }
      );
      startKeyDemo(
        `basic-inspector-${word}`,
        () => tutorialWordKeyEls("guesser", word, localGuesserDraft)
      );
    }

    highlightKeyboardGuesser();
    waitForGuessSubmission(round, `TYPE ${word}`);
    return;
  }

  if (round === 1) {
    const word = state.tutorialGuesses?.[1] || "CAIRN";

    if (tutorialSubStep === 0) {
      basicTutorialShow(
        "Each tile is a clue. Read the colors, then use them in your next guess.",
        {
          role: "guesser",
          current: 3,
          total: 4,
          placement: "bottom",
          visualHtml: basicFeedbackLegend()
        }
      );
      highlightHistoryGuesser();
      tutorialContinueMode = "advance";
      return;
    }

    if (state.pendingGuess) {
      basicTutorialShow(
        "Guess sent. The Spy is deciding whether to keep or change their secret.",
        {
          role: "guesser",
          current: 4,
          total: 4,
          placement: "top",
          compact: true,
          mode: "hide",
          key: "basic-inspector-second-wait"
        }
      );
      stopKeyDemo();
    } else {
      basicTutorialShow(
        `Use the clues and try ${word}.`,
        {
          role: "guesser",
          current: 4,
          total: 4,
          placement: "top",
          mode: "hide"
        }
      );
      startKeyDemo(
        `basic-inspector-${word}`,
        () => tutorialWordKeyEls("guesser", word, localGuesserDraft)
      );
    }

    highlightKeyboardGuesser();
    waitForGuessSubmission(round, `TYPE ${word}`);
    return;
  }

  if (round === 2) {
    const word = "CUMIN";

    if (state.pendingGuess) {
      basicTutorialShow(
        "One last wait—the Spy is answering your guess.",
        {
          role: "guesser",
          current: 4,
          total: 4,
          placement: "top",
          compact: true,
          mode: "hide",
          key: "basic-inspector-final-wait"
        }
      );
      stopKeyDemo();
    } else {
      basicTutorialShow(
        `You have enough information now. Finish the round with ${word}.`,
        {
          role: "guesser",
          current: 4,
          total: 4,
          placement: "top",
          mode: "hide"
        }
      );
      startKeyDemo(
        `basic-inspector-${word}`,
        () => tutorialWordKeyEls("guesser", word, localGuesserDraft)
      );
    }

    highlightKeyboardGuesser();
    waitForGuessSubmission(round, `TYPE ${word}`);
    return;
  }

  hideTutorial();
}

function runBasicSpyTutorial(state) {
  const round = state.history?.length ?? 0;
  clearHighlights();

  if (round === 0) {
    const word = state.tutorialSecrets?.[0] || "BLIMP";

    if (tutorialSubStep === 0) {
      basicTutorialShow(
        "Now you are the Spy. Your job is to keep a legal secret hidden for as many Inspector guesses as possible.",
        {
          role: "setter",
          current: 1,
          total: 5,
          placement: "top",
          visualHtml: `
            <div class="tutorial-role-goal">
              <span class="tutorial-role-icon">🕵️</span>
              <span><strong>Spy goal</strong><small>Make the Inspector need more guesses.</small></span>
            </div>
          `
        }
      );
      tutorialContinueMode = "advance";
      return;
    }

    if (state.simultaneousSecretSubmitted) {
      basicTutorialShow(
        "Secret submitted. The Inspector is entering their opening guess at the same time.",
        {
          role: "setter",
          current: 2,
          total: 5,
          placement: "top",
          compact: true,
          mode: "hide",
          key: "basic-spy-opening-wait"
        }
      );
      stopKeyDemo();
    } else {
      basicTutorialShow(
        `Type ${word}, then tap Submit New Secret.`,
        {
          role: "setter",
          current: 2,
          total: 5,
          placement: "top",
          mode: "hide"
        }
      );
      startKeyDemo(
        `basic-spy-${word}`,
        () => tutorialWordKeyEls("setter", word, window.state?.setterDraft)
      );
    }

    highlightKeyboardSetter();
    waitForSecretSubmission(round, `TYPE ${word}`);
    return;
  }

  if (round === 1) {
    const word = state.tutorialSecrets?.[1] || "LEMUR";

    if (!state.pendingGuess) {
      basicTutorialShow(
        "The Inspector is choosing a guess. Wait for it to appear before making your decision.",
        {
          role: "setter",
          current: 3,
          total: 5,
          placement: "top",
          compact: true,
          mode: "hide",
          key: "basic-spy-wait-for-pending"
        }
      );
      return;
    }

    if (tutorialSubStep === 0) {
      basicTutorialShow(
        "You see the Inspector's guess before it is scored. You may keep your current secret or enter a different legal one. A new secret must still match every earlier clue.",
        {
          role: "setter",
          current: 3,
          total: 5,
          placement: "bottom",
          visualHtml: `
            ${basicSpyChoices()}
            <div class="tutorial-note-strip">
              KEEP and NEW compare how many secrets remain possible. Higher is usually safer. The Advanced UI tutorial explains this in detail.
            </div>
          `
        }
      );
      highlightPendingGuessRow();
      highlightSetterMustContainBox();
      tutorialContinueMode = "advance";
      return;
    }

    basicTutorialShow(
      `Practice changing your secret: enter ${word}. It is legal and still fits the earlier clues.`,
      {
        role: "setter",
        current: 4,
        total: 5,
        placement: "top",
        mode: "hide"
      }
    );
    highlightKeyboardSetter();
    startKeyDemo(
      `basic-spy-${word}`,
      () => tutorialWordKeyEls("setter", word, window.state?.setterDraft)
    );
    waitForSecretSubmission(round, `TYPE ${word}`);
    return;
  }

  if (round === 2) {
    basicTutorialShow(
      "You do not have to change every turn. Leave the draft empty and tap Keep Current Secret.",
      {
        role: "setter",
        current: 5,
        total: 5,
        placement: "top",
        mode: "hide"
      }
    );
    const submitButton = tutorialSubmitBtnEl("setter");
    highlightEl(submitButton || byId("keyboardSetter"));
    startKeyDemo(
      "basic-spy-keep",
      () => [submitButton].filter(Boolean)
    );
    waitForSecretSubmission(round, "KEEP CURRENT SECRET");
    return;
  }

  if (round >= 3) {
    basicTutorialShow(
      "That is the core game: the Inspector narrows the word down, while the Spy decides when to keep the secret and when to change it.",
      {
        role: "setter",
        current: 5,
        total: 5,
        placement: "top",
        mode: "end",
        visualHtml: `
          <div class="tutorial-finish-checks">
            <span>✓ Read the clues</span>
            <span>✓ Keep or change</span>
            <span>✓ Stay consistent</span>
          </div>
        `
      }
    );
    tutorialEndNextMode = "tutorial2";
    return;
  }

  hideTutorial();
}

function runBasicSummaryTutorial(state) {
  clearHighlights();

  if (tutorialSubStep === 0) {
    const guesses = state.history?.length || state.guessCount || 0;
    basicTutorialShow(
      `Round complete. You found the secret in ${guesses} guess${guesses === 1 ? "" : "es"}. Lower is better for the Inspector.`,
      {
        role: "guesser",
        section: "Round result",
        current: 1,
        total: 2,
        placement: "bottom"
      }
    );
    highlightRoundSummaryGuessCount();
    tutorialContinueMode = "advance";
    return;
  }

  basicTutorialShow(
    "Tap Next Round. The roles will swap, and you'll learn the Spy side.",
    {
      role: "guesser",
      section: "Role swap",
      current: 2,
      total: 2,
      placement: "bottom",
      mode: "hide"
    }
  );
  highlightNextRoundBtn();
  startKeyDemo(
    "basic-next-round",
    () => [byId("nextRoundBtn")].filter(Boolean)
  );
  tutorialContinueMode = "hide";
}

function runBasicMatchTutorial(state) {
  clearHighlights();

  if (tutorialSubStep === 0) {
    basicTutorialShow(
      "Both roles are finished. The player whose secret took more guesses to find wins the match.",
      {
        section: "Match complete",
        current: 1,
        total: 2,
        placement: "bottom"
      }
    );
    highlightMatchScore();
    tutorialContinueMode = "advance";
    return;
  }

  basicTutorialShow(
    "You now know the core game. Powers, Quests, and advanced tools each have their own short tutorial.",
    {
      section: "Basics complete",
      current: 2,
      total: 2,
      placement: "bottom",
      mode: "end"
    }
  );
  tutorialEndNextMode = "tutorial2";
}
