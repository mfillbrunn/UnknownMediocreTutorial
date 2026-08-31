// Streamlined Basic Tutorial: plain-language guidance for both roles.
// The Basic tutorial is intentionally the most explicit tutorial in the game.
function basicTutorialShow(text, {
  role = window.myRole,
  section = role === "setter" ? "Secretkeeper" : "Guesser",
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
    <div class="tutorial-feedback-legend" aria-label="What the colors mean">
      <div class="tutorial-feedback-item">
        <span class="tutorial-mini-tile tile-green">A</span>
        <span><strong>Green</strong><small>Right letter. Right spot.</small></span>
      </div>
      <div class="tutorial-feedback-item">
        <span class="tutorial-mini-tile tile-yellow">A</span>
        <span><strong>Yellow</strong><small>Right letter. Wrong spot.</small></span>
      </div>
      <div class="tutorial-feedback-item">
        <span class="tutorial-mini-tile tile-gray">A</span>
        <span><strong>Grey</strong><small>This letter is not in the secret.</small></span>
      </div>
    </div>
  `;
}

function basicTurnRhythm() {
  return `
    <div class="tutorial-tiny-steps" aria-label="How a turn works">
      <span><b>1.</b> Guesser submits a word.</span>
      <span><b>2.</b> Secretkeeper keeps or changes the secret.</span>
      <span><b>3.</b> The guess receives colors.</span>
      <span><b>4.</b> Repeat until the secret is found.</span>
    </div>
  `;
}

function basicSecretkeeperChoices() {
  return `
    <div class="tutorial-choice-grid">
      <div class="tutorial-choice-card">
        <strong>KEEP</strong>
        <span>Leave the current secret alone.</span>
      </div>
      <div class="tutorial-choice-card">
        <strong>CHANGE</strong>
        <span>Type a different legal secret.</span>
      </div>
    </div>
    <div class="tutorial-note-strip">
      A changed secret must still match every green and yellow clue already shown.
    </div>
    <div class="tutorial-tiny-steps">
      <span><b>Empty boxes:</b> the button keeps your current secret.</span>
      <span><b>Five letters:</b> the button submits the new secret.</span>
      <span>The pending row previews the colors before you submit.</span>
    </div>
  `;
}

function basicRoundScoreVisual(guesses) {
  return `
    <div class="tutorial-summary-explainer">
      <span class="tutorial-summary-number">${guesses}</span>
      <span><strong>guesses used</strong><small>This number belongs to this round.</small></span>
    </div>
  `;
}

function basicScoreGoalsVisual() {
  return `
    <div class="tutorial-summary-rule">
      <span><b>Guesser</b><strong>SMALL number</strong><small>Find the word quickly.</small></span>
      <span><b>Secretkeeper</b><strong>LARGE number</strong><small>Keep the word hidden longer.</small></span>
    </div>
  `;
}

function basicMatchScoreVisual() {
  return `
    <div class="tutorial-summary-example">
      <span>Alex's secret: <b>6 guesses</b></span>
      <span>Sam's secret: <b>4 guesses</b></span>
      <strong>Alex wins because Alex's secret lasted longer.</strong>
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
        "You are the Guesser. The other player has a hidden five-letter word. Your job is to find it in as few guesses as possible.",
        {
          role: "guesser",
          current: 1,
          total: 4,
          placement: "top",
          visualHtml: `
            <div class="tutorial-role-goal">
              <span class="tutorial-role-icon">🔍</span>
              <span><strong>Find the hidden word</strong><small>Fewer guesses is better for you.</small></span>
            </div>
            ${basicTurnRhythm()}
          `
        }
      );
      tutorialContinueMode = "advance";
      return;
    }

    if (state.simultaneousGuessSubmitted) {
      basicTutorialShow(
        "Your first guess is saved. The Secretkeeper is choosing the first secret at the same time, so the colors appear after both players are ready.",
        {
          role: "guesser",
          current: 2,
          total: 4,
          placement: "top",
          compact: true,
          mode: "hide",
          key: "basic-guesser-opening-wait"
        }
      );
      stopKeyDemo();
    } else {
      basicTutorialShow(
        `Type ${word}. Fill all five boxes, then tap Submit Guess.`,
        {
          role: "guesser",
          current: 2,
          total: 4,
          placement: "top",
          mode: "hide"
        }
      );
      startKeyDemo(
        `basic-guesser-${word}`,
        () => tutorialWordKeyEls("guesser", word, localGuesserDraft)
      );
    }
    highlightKeyboardGuesser();
    waitForGuessSubmission(round, `TYPE ${word}`);
    return;
  }

  if (round === 1) {
    const word = state.tutorialGuesses?.[1] || "CAIRN";
    if (state.pendingGuess) {
      basicTutorialShow(
        "Guess sent. The Secretkeeper now chooses whether to keep or change the secret.",
        {
          role: "guesser",
          current: 3,
          total: 4,
          placement: "top",
          compact: true,
          mode: "hide",
          key: "basic-guesser-second-wait"
        }
      );
      stopKeyDemo();
    } else {
      basicTutorialShow(
        `Read the colors, then type ${word}. Green stays in place. Yellow moves to another spot. Grey usually means try a different letter.`,
        {
          role: "guesser",
          current: 3,
          total: 4,
          placement: "bottom",
          mode: "hide",
          visualHtml: basicFeedbackLegend()
        }
      );
      startKeyDemo(
        `basic-guesser-${word}`,
        () => tutorialWordKeyEls("guesser", word, localGuesserDraft)
      );
    }
    highlightHistoryGuesser();
    highlightKeyboardGuesser();
    waitForGuessSubmission(round, `TYPE ${word}`);
    return;
  }

  if (round === 2) {
    const word = "CUMIN";
    if (state.pendingGuess) {
      basicTutorialShow(
        "Good. Wait for the Secretkeeper's decision, then the new colors will appear.",
        {
          role: "guesser",
          current: 4,
          total: 4,
          placement: "top",
          compact: true,
          mode: "hide",
          key: "basic-guesser-final-wait"
        }
      );
      stopKeyDemo();
    } else {
      basicTutorialShow(
        `One more guess. Use the colors and type ${word}.`,
        {
          role: "guesser",
          current: 4,
          total: 4,
          placement: "top",
          mode: "hide"
        }
      );
      startKeyDemo(
        `basic-guesser-${word}`,
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
        "Now you are the Secretkeeper. Pick a five-letter secret and try to keep it hidden for as many guesses as possible.",
        {
          role: "setter",
          current: 1,
          total: 5,
          placement: "top",
          visualHtml: `
            <div class="tutorial-role-goal">
              <span class="tutorial-role-icon">🕵️</span>
              <span><strong>Protect your secret</strong><small>More guesses is better for you.</small></span>
            </div>
          `
        }
      );
      tutorialContinueMode = "advance";
      return;
    }

    if (state.simultaneousSecretSubmitted) {
      basicTutorialShow(
        "Your secret is saved. The Guesser made the opening guess at the same time.",
        {
          role: "setter",
          current: 2,
          total: 5,
          placement: "top",
          compact: true,
          mode: "hide",
          key: "basic-secretkeeper-opening-wait"
        }
      );
      stopKeyDemo();
    } else {
      basicTutorialShow(
        `Type ${word}, then tap Submit New Secret. The Guesser cannot see your word.`,
        {
          role: "setter",
          current: 2,
          total: 5,
          placement: "top",
          mode: "hide"
        }
      );
      startKeyDemo(
        `basic-secretkeeper-${word}`,
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
        "The Guesser is choosing a word. Their guess will appear here when it is ready.",
        {
          role: "setter",
          current: 3,
          total: 5,
          placement: "top",
          compact: true,
          mode: "hide",
          key: "basic-secretkeeper-wait-for-guess"
        }
      );
      return;
    }

    if (tutorialSubStep === 0) {
      basicTutorialShow(
        "Before the guess gets its final colors, choose KEEP or CHANGE. The colored pending row is only a preview, so you can safely test a new secret before submitting it.",
        {
          role: "setter",
          current: 3,
          total: 5,
          placement: "bottom",
          visualHtml: basicSecretkeeperChoices()
        }
      );
      highlightPendingGuessRow();
      tutorialContinueMode = "advance";
      return;
    }

    basicTutorialShow(
      `Practice CHANGE: type ${word}, then submit the new secret.`,
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
      `basic-secretkeeper-${word}`,
      () => tutorialWordKeyEls("setter", word, window.state?.setterDraft)
    );
    waitForSecretSubmission(round, `TYPE ${word}`);
    return;
  }

  if (round === 2) {
    basicTutorialShow(
      "Practice KEEP: leave all five boxes empty, then tap Keep Current Secret.",
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
      "basic-secretkeeper-keep",
      () => [submitButton].filter(Boolean)
    );
    waitForSecretSubmission(round, "KEEP CURRENT SECRET");
    return;
  }

  if (round >= 3) {
    basicTutorialShow(
      "You now know the whole basic turn: the Guesser submits a word, the Secretkeeper keeps or changes the secret, and the guess receives colors.",
      {
        role: "setter",
        section: "Basics done",
        current: 5,
        total: 5,
        placement: "top",
        mode: "end",
        visualHtml: `
          <div class="tutorial-finish-checks">
            <span>✓ Guesser: find the word with fewer guesses</span>
            <span>✓ Secretkeeper: keep the word hidden longer</span>
            <span>✓ A changed secret must still fit earlier clues</span>
          </div>
        `
      }
    );
    tutorialEndNextMode = "quest";
    return;
  }

  hideTutorial();
}

function runBasicSummaryTutorial(state) {
  clearHighlights();
  const guesses = state.history?.length || state.guessCount || 0;

  if (tutorialSubStep === 0) {
    basicTutorialShow(
      `This big number is the round score. The word was found in ${guesses} guess${guesses === 1 ? "" : "es"}.`,
      {
        role: "guesser",
        section: "Round score",
        current: 1,
        total: 3,
        placement: "bottom",
        visualHtml: basicRoundScoreVisual(guesses)
      }
    );
    highlightRoundSummaryGuessCount();
    tutorialContinueMode = "advance";
    return;
  }

  if (tutorialSubStep === 1) {
    basicTutorialShow(
      "The same number means different things to each role: the Guesser wants it small, while the Secretkeeper wants it large. This is only the first round's score.",
      {
        role: "guesser",
        section: "How to read it",
        current: 2,
        total: 3,
        placement: "bottom",
        visualHtml: basicScoreGoalsVisual()
      }
    );
    highlightRoundSummaryGuessCount();
    tutorialContinueMode = "advance";
    return;
  }

  basicTutorialShow(
    "Now the roles swap. Tap Next Round. You will protect a secret, and your opponent will try to guess it.",
    {
      role: "guesser",
      section: "Swap roles",
      current: 3,
      total: 3,
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

function runBasicMatchTutorial() {
  clearHighlights();

  if (tutorialSubStep === 0) {
    basicTutorialShow(
      "A full match has two rounds. Each player is the Secretkeeper once, so both players get one chance to protect a secret.",
      {
        section: "Match summary",
        current: 1,
        total: 4,
        placement: "bottom",
        visualHtml: `
          <div class="tutorial-tiny-steps">
            <span><b>Round 1:</b> Player A protects a secret.</span>
            <span><b>Round 2:</b> Player B protects a secret.</span>
          </div>
        `
      }
    );
    highlightMatchScore();
    tutorialContinueMode = "advance";
    return;
  }

  if (tutorialSubStep === 1) {
    basicTutorialShow(
      "Each player's score is how many guesses it took to find that player's secret. The larger secret score wins because that secret stayed hidden longer. Equal scores are a tie.",
      {
        section: "Who wins?",
        current: 2,
        total: 4,
        placement: "bottom",
        visualHtml: basicMatchScoreVisual()
      }
    );
    highlightMatchScore();
    tutorialContinueMode = "advance";
    return;
  }

  if (tutorialSubStep === 2) {
    basicTutorialShow(
      "Choose what happens next: New Match starts fresh, Replay plays the same opponent again, and Leave returns to the menu.",
      {
        section: "Next step",
        current: 3,
        total: 4,
        placement: "bottom"
      }
    );
    highlightSummaryActions();
    tutorialContinueMode = "advance";
    return;
  }

  basicTutorialShow(
    "Basics complete. You can now play a normal match. Quests, Stars, and Extra Tools each have their own short tutorial.",
    {
      section: "Basics done",
      current: 4,
      total: 4,
      placement: "bottom",
      mode: "end"
    }
  );
  tutorialEndNextMode = "quest";
}
