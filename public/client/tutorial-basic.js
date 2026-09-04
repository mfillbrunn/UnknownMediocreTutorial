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
  // UMT_SIMPLIFIED_TUTORIAL_COPY_20260902
  const round = state.history?.length ?? 0;
  clearHighlights();

  if (round === 0) {
    const word = state.tutorialGuesses?.[0] || "CHAMP";
    if (tutorialSubStep === 0) {
      basicTutorialShow(
        "A match has two rounds, and you play both roles. First you play the Guesser, trying to find a five-letter secret quickly.",
        {
          role: "guesser",
          section: "How the game works",
          current: 1,
          total: 3,
          placement: "top"
        }
      );
      tutorialContinueMode = "advance";
      return;
    }

    if (tutorialSubStep === 1) {
      basicTutorialShow(
        "Then you play the Secretkeeper, trying to keep your secret hidden. Each role also has a special helper, which the next tutorials explain.",
        {
          role: "guesser",
          section: "Two roles",
          current: 2,
          total: 3,
          placement: "top"
        }
      );
      tutorialContinueMode = "advance";
      return;
    }

    if (state.simultaneousGuessSubmitted) {
      basicTutorialShow(
        "Your first guess is ready. On the opening turn, both players enter a word at the same time, so the feedback appears after both are done.",
        {
          role: "guesser",
          section: "First guess",
          current: 3,
          total: 3,
          placement: "top",
          compact: true,
          mode: "hide",
          key: "basic-guesser-opening-wait"
        }
      );
      stopKeyDemo();
    } else {
      basicTutorialShow(
        `Every Guesser turn is simple: enter a word, submit it, and read the feedback. For the first guess, type ${word} now, then tap Submit Guess.`,
        {
          role: "guesser",
          section: "First guess",
          current: 3,
          total: 3,
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
    const feedbackSteps = [
      "The feedback for CHAMP is here. Let us read all five tiles, one at a time.",
      "C is green. Green means the letter is in the secret and already in the correct position.",
      "H is gray. Gray means that letter is not in the secret.",
      "A is gray too, so A is not in the secret either.",
      "M is yellow. Yellow means the letter is in the secret, but it belongs in a different position.",
      "P is gray, so P is not in the secret. That is the full color system: green is correct place, yellow is wrong place, and gray is absent."
    ];

    const totalSteps = 8;

    if (tutorialSubStep < feedbackSteps.length) {
      basicTutorialShow(feedbackSteps[tutorialSubStep], {
        role: "guesser",
        section: "Read the feedback",
        current: tutorialSubStep + 1,
        total: totalSteps,
        placement: "bottom"
      });
      highlightHistoryGuesser();
      tutorialContinueMode = "advance";
      return;
    }

    if (tutorialSubStep === feedbackSteps.length) {
      basicTutorialShow(
        "For your second guess, you don't have to stick to confirmed clues. Any legal word works, and sometimes an unconfirmed word teaches you more.",
        {
          role: "guesser",
          section: "An information guess",
          current: 7,
          total: totalSteps,
          placement: "top"
        }
      );
      highlightHistoryGuesser();
      tutorialContinueMode = "advance";
      return;
    }

    if (state.pendingGuess) {
      basicTutorialShow(
        "Good. The Secretkeeper is deciding whether to keep or change the secret. Your new feedback appears after that decision.",
        {
          role: "guesser",
          section: "Second guess",
          current: 8,
          total: totalSteps,
          placement: "top",
          compact: true,
          mode: "hide",
          key: "basic-guesser-second-wait"
        }
      );
      stopKeyDemo();
    } else {
      basicTutorialShow(
        `Type ${word}: it deliberately reuses gray A and leaves out yellow M, and that is allowed.`,
        {
          role: "guesser",
          section: "Second guess",
          current: 8,
          total: totalSteps,
          placement: "top",
          mode: "hide"
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
    const word = state.tutorialGuesses?.[2] || "CUMIN";
    if (state.pendingGuess) {
      basicTutorialShow(
        "Perfect. You found the secret. The round summary is next.",
        {
          role: "guesser",
          section: "Final guess",
          current: 1,
          total: 1,
          placement: "top",
          compact: true,
          mode: "hide",
          key: "basic-guesser-final-wait"
        }
      );
      stopKeyDemo();
    } else {
      basicTutorialShow(
        `Now type ${word} and submit it. This is the secret, so you have got it.`,
        {
          role: "guesser",
          section: "Final guess",
          current: 1,
          total: 1,
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
  // UMT_SIMPLIFIED_TUTORIAL_COPY_20260902
  const round = state.history?.length ?? 0;
  clearHighlights();

  if (round === 0) {
    const word = state.tutorialSecrets?.[0] || "BLIMP";
    if (tutorialSubStep === 0) {
      basicTutorialShow(
        "In this round you are the Secretkeeper. The Guesser must find your word, and your goal is to make that take as many guesses as possible.",
        {
          role: "setter",
          section: "Your other role",
          current: 1,
          total: 2,
          placement: "top"
        }
      );
      tutorialContinueMode = "advance";
      return;
    }

    if (state.simultaneousSecretSubmitted) {
      basicTutorialShow(
        "Your opening secret is ready. The Guesser entered the first guess at the same time, just as you did in the first round.",
        {
          role: "setter",
          section: "Choose a secret",
          current: 2,
          total: 2,
          placement: "top",
          compact: true,
          mode: "hide",
          key: "basic-secretkeeper-opening-wait"
        }
      );
      stopKeyDemo();
    } else {
      basicTutorialShow(
        `On the first turn, enter a secret while the Guesser enters a guess. Type ${word}, then tap Submit New Secret. The Guesser cannot see it.`,
        {
          role: "setter",
          section: "Choose a secret",
          current: 2,
          total: 2,
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
    const validWord = (state.tutorialSecrets?.[1] || "LEMUR").toUpperCase();
    const invalidWord = "CUMIN";

    if (!state.pendingGuess) {
      basicTutorialShow(
        "Now it is the Guesser's turn, just as it was yours before. We wait for the next guess.",
        {
          role: "setter",
          section: "Wait for a guess",
          current: 1,
          total: 6,
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
        "Here it is. As the Secretkeeper, you see the opponent's guess before its final feedback. You may keep your current secret or change it.",
        {
          role: "setter",
          section: "See the guess first",
          current: 1,
          total: 6,
          placement: "bottom"
        }
      );
      highlightPendingGuessRow();
      tutorialContinueMode = "advance";
      return;
    }

    if (tutorialSubStep === 1) {
      basicTutorialShow(
        "The pending row previews what the Guesser would see if you kept your current secret. That is a lot of information, so changing the secret can make the feedback less useful.",
        {
          role: "setter",
          section: "Why change?",
          current: 2,
          total: 6,
          placement: "bottom"
        }
      );
      highlightPendingGuessRow();
      tutorialContinueMode = "advance";
      return;
    }

    if (tutorialSubStep === 2) {
      basicTutorialShow(
        "You cannot change the secret freely. A new secret must fit every clue you already gave. In other words, it must still be a word your first secret could theoretically have been.",
        {
          role: "setter",
          section: "Changes must stay possible",
          current: 3,
          total: 6,
          placement: "bottom"
        }
      );
      highlightSetterHistory();
      tutorialContinueMode = "advance";
      return;
    }

    if (tutorialSubStep === 3) {
      basicTutorialShow(
        `Try an impossible change. Type ${invalidWord}, but do not submit it. The remaining-words box will tell you that it does not fit the earlier feedback.`,
        {
          role: "setter",
          section: "Try an invalid secret",
          current: 4,
          total: 6,
          placement: "top",
          mode: "hide"
        }
      );
      highlightDraftRow("setter");
      startKeyDemo(
        `basic-secretkeeper-invalid-${invalidWord}`,
        () => tutorialWordKeyEls("setter", invalidWord, window.state?.setterDraft)
      );
      waitForInvalidDraft();
      tutorialWaitingFor.label = `TYPE ${invalidWord}`;
      updateActionBadge();
      return;
    }

    if (tutorialSubStep === 4) {
      basicTutorialShow(
        `${invalidWord} cannot work because the earlier feedback proved that L is in the secret, and ${invalidWord} has no L. You cannot submit it. Delete the draft now.`,
        {
          role: "setter",
          section: "That word is impossible",
          current: 5,
          total: 6,
          placement: "top",
          mode: "hide"
        }
      );
      highlightDraftRow("setter");
      waitForDraftCleared();
      return;
    }

    basicTutorialShow(
      `Now type ${validWord}. This word is legal because it respects all earlier feedback. Submit it as the new secret.`,
      {
        role: "setter",
        section: "Make a legal change",
        current: 6,
        total: 6,
        placement: "top",
        mode: "hide"
      }
    );
    highlightDraftRow("setter");
    startKeyDemo(
      `basic-secretkeeper-${validWord}`,
      () => tutorialWordKeyEls("setter", validWord, window.state?.setterDraft)
    );
    waitForSecretSubmission(round, `TYPE ${validWord}`);
    return;
  }

  if (round === 2) {
    if (!state.pendingGuess) {
      basicTutorialShow(
        "The Guesser is choosing another word. We wait again.",
        {
          role: "setter",
          section: "Another guess",
          current: 1,
          total: 2,
          placement: "top",
          compact: true,
          mode: "hide",
          key: "basic-secretkeeper-second-wait"
        }
      );
      return;
    }

    if (tutorialSubStep === 0) {
      basicTutorialShow(
        "A new guess arrived, so you could change again. There is a special advantage to daring changes, which the Star tutorial explains. For now, let us be lazy and keep the current secret.",
        {
          role: "setter",
          section: "Changing is optional",
          current: 1,
          total: 2,
          placement: "bottom"
        }
      );
      highlightPendingGuessRow();
      tutorialContinueMode = "advance";
      return;
    }

    basicTutorialShow(
      "The current secret is already selected by default, so you do not need to type it again. The pending row shows the feedback the Guesser will receive if you keep it. Tap Keep Current Secret.",
      {
        role: "setter",
        section: "Keep the secret",
        current: 2,
        total: 2,
        placement: "top",
        mode: "hide"
      }
    );
    const submitButton = tutorialSubmitBtnEl("setter");
    highlightPendingGuessRow();
    highlightEl(submitButton);
    startKeyDemo(
      "basic-secretkeeper-keep",
      () => [submitButton].filter(Boolean)
    );
    waitForSecretSubmission(round, "KEEP CURRENT SECRET");
    return;
  }

  hideTutorial();
}

function runBasicSummaryTutorial(state) {
  // UMT_REQUESTED_FIXES_20260904: walk the round summary one piece at a
  // time instead of rushing past a screen with a score, a clock panel,
  // and a five-column table all showing at once.
  clearHighlights();
  const guesses = state.history?.length || state.guessCount || 0;
  const totalSteps = 8;

  if (tutorialSubStep === 0) {
    basicTutorialShow(
      `This round took ${guesses} guesses. Because you were the Guesser, you want this number to be as low as possible.`,
      {
        role: "guesser",
        section: "Your round score",
        current: 1,
        total: totalSteps,
        placement: "bottom"
      }
    );
    highlightRoundSummaryGuessCount();
    tutorialContinueMode = "advance";
    return;
  }

  if (tutorialSubStep === 1) {
    basicTutorialShow(
      "Below the score sits a table with one row for every guess this round. Let us look at each column.",
      {
        role: "guesser",
        section: "Review the round",
        current: 2,
        total: totalSteps,
        placement: "bottom"
      }
    );
    highlightRoundSummary();
    tutorialContinueMode = "advance";
    return;
  }

  if (tutorialSubStep === 2) {
    basicTutorialShow(
      "Secret: what the Secretkeeper's word was at the moment of that guess. It can change between guesses.",
      {
        role: "guesser",
        section: "Secret column",
        current: 3,
        total: totalSteps,
        placement: "bottom"
      }
    );
    highlightRoundSummaryColumn("secret-cell");
    tutorialContinueMode = "advance";
    return;
  }

  if (tutorialSubStep === 3) {
    basicTutorialShow(
      "Guess: the word that was actually submitted that turn.",
      {
        role: "guesser",
        section: "Guess column",
        current: 4,
        total: totalSteps,
        placement: "bottom"
      }
    );
    highlightRoundSummaryColumn("guess-cell");
    tutorialContinueMode = "advance";
    return;
  }

  if (tutorialSubStep === 4) {
    basicTutorialShow(
      "Result: the feedback tiles that guess received -- green, yellow, or gray.",
      {
        role: "guesser",
        section: "Result column",
        current: 5,
        total: totalSteps,
        placement: "bottom"
      }
    );
    highlightRoundSummaryColumn("feedback-cell");
    tutorialContinueMode = "advance";
    return;
  }

  if (tutorialSubStep === 5) {
    basicTutorialShow(
      "Left: how many secret words were still possible after that guess. Lower means the Guesser narrowed things down more.",
      {
        role: "guesser",
        section: "Left column",
        current: 6,
        total: totalSteps,
        placement: "bottom"
      }
    );
    highlightRoundSummaryColumn("remaining-cell");
    tutorialContinueMode = "advance";
    return;
  }

  if (tutorialSubStep === 6) {
    basicTutorialShow(
      "In the next round you will be the Secretkeeper. Then the goal is the opposite: you want a high score because you want the Guesser to need more guesses.",
      {
        role: "guesser",
        section: "The score changes meaning",
        current: 7,
        total: totalSteps,
        placement: "bottom"
      }
    );
    highlightRoundSummaryGuessCount();
    tutorialContinueMode = "advance";
    return;
  }

  basicTutorialShow(
    "That is enough for this screen. Tap Next Round, and we will explain the rest after you have played as the Secretkeeper.",
    {
      role: "guesser",
      section: "Swap roles",
      current: 8,
      total: totalSteps,
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
  // UMT_REQUESTED_FIXES_20260904: same fix as runBasicSummaryTutorial --
  // one column at a time instead of naming three columns in a single
  // sentence over a screen that stacks a full table per round.
  clearHighlights();
  const totalSteps = 7;

  if (tutorialSubStep === 0) {
    basicTutorialShow(
      "The Guesser found your secret too, so the match is over. This tutorial is a 3-3 tie: both secrets lasted three guesses.",
      {
        section: "Match result",
        current: 1,
        total: totalSteps,
        placement: "bottom"
      }
    );
    highlightMatchScore();
    tutorialContinueMode = "advance";
    return;
  }

  if (tutorialSubStep === 1) {
    basicTutorialShow(
      "In a match between people, a tie is broken by lower total time. Against the AI, a tie stays a tie, since the AI responds almost instantly.",
      {
        section: "Breaking a tie",
        current: 2,
        total: totalSteps,
        placement: "bottom"
      }
    );
    highlightMatchScore();
    tutorialContinueMode = "advance";
    return;
  }

  if (tutorialSubStep === 2) {
    basicTutorialShow(
      "Each round summary has its own table. Secret: what the Secretkeeper's word was at the moment of that guess.",
      {
        section: "Secret column",
        current: 3,
        total: totalSteps,
        placement: "bottom"
      }
    );
    highlightRoundSummaryColumn("secret-cell");
    tutorialContinueMode = "advance";
    return;
  }

  if (tutorialSubStep === 3) {
    basicTutorialShow(
      "Guess: the word that was actually submitted that turn.",
      {
        section: "Guess column",
        current: 4,
        total: totalSteps,
        placement: "bottom"
      }
    );
    highlightRoundSummaryColumn("guess-cell");
    tutorialContinueMode = "advance";
    return;
  }

  if (tutorialSubStep === 4) {
    basicTutorialShow(
      "Result: the feedback tiles that guess received.",
      {
        section: "Result column",
        current: 5,
        total: totalSteps,
        placement: "bottom"
      }
    );
    highlightRoundSummaryColumn("feedback-cell");
    tutorialContinueMode = "advance";
    return;
  }

  if (tutorialSubStep === 5) {
    basicTutorialShow(
      "Left: how many secret words were still possible after that guess. A smaller number means the Guesser was closer; a larger number means the Secretkeeper was still hiding among many possibilities.",
      {
        section: "Left column",
        current: 6,
        total: totalSteps,
        placement: "bottom"
      }
    );
    highlightRoundSummaryColumn("remaining-cell");
    tutorialContinueMode = "advance";
    return;
  }

  tutorialEndNextMode = "quest";
  basicTutorialShow(
    "That is the basic game. From here you can start another match, replay, or leave. We recommend the Quest and Star tutorials next; they explain the special help available to each role.",
    {
      section: "Basics complete",
      current: 7,
      total: totalSteps,
      placement: "bottom",
      mode: "end"
    }
  );
  highlightSummaryActions();
}

