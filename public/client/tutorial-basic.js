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
        <span><strong>Green</strong><small>Right letter, right spot.</small></span>
      </div>
      <div class="tutorial-feedback-item">
        <span class="tutorial-mini-tile tile-yellow">A</span>
        <span><strong>Yellow</strong><small>In the word, but somewhere else.</small></span>
      </div>
      <div class="tutorial-feedback-item">
        <span class="tutorial-mini-tile tile-gray">A</span>
        <span><strong>Grey</strong><small>Not in the word at all.</small></span>
      </div>
    </div>
  `;
}

function basicTurnRhythm() {
  return `
    <div class="tutorial-tiny-steps" aria-label="How a turn works">
      <span><b>1.</b> The hunter sends a word.</span>
      <span><b>2.</b> The hider keeps or swaps the secret.</span>
      <span><b>3.</b> The word comes back in colors.</span>
      <span><b>4.</b> Repeat until the word is found.</span>
    </div>
  `;
}

function basicTurnOrderVisual() {
  return `
    <div class="tutorial-tiny-steps" aria-label="Who moves when">
      <span><b>Turn 1:</b> both players type at once - hunter a guess, hider a secret.</span>
      <span><b>After that:</b> the hunter sends a new word first.</span>
      <span><b>Then:</b> the hider answers by keeping or swapping.</span>
      <span>Hunter, hider, hunter, hider - back and forth to the end.</span>
    </div>
  `;
}

function basicSecretkeeperChoices() {
  return `
    <div class="tutorial-choice-grid">
      <div class="tutorial-choice-card">
        <strong>KEEP</strong>
        <span>Stay with the word you have.</span>
      </div>
      <div class="tutorial-choice-card">
        <strong>CHANGE</strong>
        <span>Swap in a different word.</span>
      </div>
    </div>
    <div class="tutorial-note-strip">
      Whichever you pick, every green and yellow you have already shown must stay true.
    </div>
    <div class="tutorial-tiny-steps">
      <span><b>Boxes empty:</b> the button keeps your word.</span>
      <span><b>Boxes full:</b> the button swaps in the new one.</span>
      <span>The preview row shows the colors before you commit.</span>
    </div>
  `;
}

function basicRoundScoreVisual(guesses) {
  return `
    <div class="tutorial-summary-explainer">
      <span class="tutorial-summary-number">${guesses}</span>
      <span><strong>guesses used</strong><small>Just for this round.</small></span>
    </div>
  `;
}

function basicScoreGoalsVisual() {
  return `
    <div class="tutorial-summary-rule">
      <span><b>Hunting</b><strong>SMALL number</strong><small>Find it fast.</small></span>
      <span><b>Hiding</b><strong>LARGE number</strong><small>Stay hidden longer.</small></span>
    </div>
  `;
}

function basicMatchScoreVisual() {
  return `
    <div class="tutorial-summary-example">
      <span>Alex's word survived <b>6 guesses</b></span>
      <span>Sam's word survived <b>4 guesses</b></span>
      <strong>Alex wins - their word held out longer.</strong>
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
        "Here's the whole game in one breath: a secret five-letter word, one player hunting for it, one hiding it. You play both sides. Let's start with the hunting.",
        {
          role: "guesser",
          section: "How the game works",
          current: 1,
          total: 4,
          placement: "top"
        }
      );
      tutorialContinueMode = "advance";
      return;
    }

    if (tutorialSubStep === 1) {
      basicTutorialShow(
        "Next round, you switch to hiding - same word, opposite job. Each side also gets its own bonus helper, which the later tutorials cover.",
        {
          role: "guesser",
          section: "Two roles",
          current: 2,
          total: 4,
          placement: "top"
        }
      );
      tutorialContinueMode = "advance";
      return;
    }

    if (tutorialSubStep === 2) {
      basicTutorialShow(
        "One thing to know before you move: only the very first turn is simultaneous. Both of you type blind, at the same time. From then on you take proper turns.",
        {
          role: "guesser",
          section: "Who moves when",
          current: 3,
          total: 4,
          placement: "top",
          visualHtml: basicTurnOrderVisual()
        }
      );
      tutorialContinueMode = "advance";
      return;
    }

    if (state.simultaneousGuessSubmitted) {
      basicTutorialShow(
        "Sent. That was the simultaneous turn, so the colors show up once you have both moved.",
        {
          role: "guesser",
          section: "First guess",
          current: 4,
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
        `Your turn is always the same three beats: type a word, send it, read the colors. Let's do one now. Type ${word}, then tap Submit Guess.`,
        {
          role: "guesser",
          section: "First guess",
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

  if (round === 1) {
    const word = state.tutorialGuesses?.[1] || "CAIRN";
    const feedbackSteps = [
      "CHAMP came back wearing colors. Let's read them one tile at a time.",
      "C is green. Green means: right letter, right spot. The secret really does start with C.",
      "H is gray. Gray means: this letter is not in the secret at all. Cross it off.",
      "A is gray too, so there is no A in the secret either.",
      "M is yellow. Yellow means: this letter IS in the secret, just not here. It lives somewhere else.",
      "P is gray, so no P. And that is the whole system: green is right spot, yellow is wrong spot, gray is not in the word."
    ];

    const totalSteps = 8;

    if (tutorialSubStep < feedbackSteps.length) {
      basicTutorialShow(feedbackSteps[tutorialSubStep], {
        role: "guesser",
        section: "Reading the colors",
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
        "Here's something people miss: you don't have to obey the clues. Any real word is allowed. Sometimes a throwaway guess that tests fresh letters teaches you more than a careful one.",
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
        "Nice. Now the Secretkeeper decides whether to keep their word or swap it. Your colors arrive right after that.",
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
        `Type ${word} - it reuses the gray A and drops the yellow M on purpose, and that is completely fine.`,
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
        "Got it. Here comes the scoreboard.",
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
        `Last one. Type ${word} and send it. That is the secret word, so this wins the round.`,
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
        "Now you are on the other side. You hide a word, the Guesser hunts for it, and your job is to make that hunt take as long as you possibly can.",
        {
          role: "setter",
          section: "Now you hide",
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
        "Locked in. The Guesser typed their opening word at the same moment you did, exactly like last round.",
        {
          role: "setter",
          section: "Pick a word to hide",
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
        `Pick your hiding word. Type ${word}, then tap Submit New Secret. The Guesser never sees it - all they ever get back is colors.`,
        {
          role: "setter",
          section: "Pick a word to hide",
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
        "The Guesser is thinking. Sit tight for their next word.",
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
        "Here is their guess - and here is your superpower. You see it before they see any colors. So now you get to choose: keep your word, or quietly switch to a different one.",
        {
          role: "setter",
          section: "You see it first",
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
        "That preview row shows the colors they would get if you keep your current word. That is a lot of help to hand over. Switching to a different word can give them much less.",
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
        "You cannot switch to just anything, though. Every color you have already shown has to stay true. Put simply: you are never allowed to turn a past clue into a lie.",
        {
          role: "setter",
          section: "One rule about switching",
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
        `Let's break that rule on purpose. Type ${invalidWord}, but do not send it. Keep an eye on the big button underneath.`,
        {
          role: "setter",
          section: "Break it on purpose",
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
      waitForInvalidDraft(invalidWord);
      tutorialWaitingFor.label = `TYPE ${invalidWord}`;
      updateActionBadge();
      return;
    }

    if (tutorialSubStep === 4) {
      basicTutorialShow(
        `The button went dead and reads SECRET NOT ALLOWED. You already showed a yellow L, so your word has to contain an L. ${invalidWord} does not - picking it would turn that clue into a lie. Clear the boxes.`,
        {
          role: "setter",
          section: "Why that failed",
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
      `Now try ${validWord}. Every clue you have shown so far still holds true for it, so this one is allowed. Send it as your new secret.`,
      {
        role: "setter",
        section: "A switch that works",
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
        "They are picking another word. Sit tight again.",
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
        "New guess, so you could switch again. Bold switches actually earn you something - the Stars tutorial covers that. For now, let's take the easy road and keep what we have.",
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
      "You do not need to retype anything - your word is already loaded. The preview row shows exactly what the Guesser is about to get. Tap Keep Current Secret.",
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
      `That round took ${guesses} guesses. You were hunting, so lower is better.`,
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
      "Underneath, there's a table: one row for every guess this round. Let's go column by column.",
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
      "Secret: the word being hidden at that exact moment. It can change from guess to guess.",
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
      "Guess: the word actually sent that turn.",
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
      "Result: the colors that guess earned - green, yellow, or gray.",
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
      "Left: how many words could still be the secret after that guess. Lower means the hunter closed in more.",
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
      "Next round you are hiding instead of hunting, so the goal flips completely. Then you want this number to be as big as you can make it.",
      {
        role: "guesser",
        section: "The goal flips",
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
    "That is everything on this screen. Tap Next Round and we will pick it up on the other side.",
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
  // The five columns were already walked one at a time on the round
  // summary after the Guesser round -- doing the whole tour again here is
  // the same lesson twice. This screen only stops on what is genuinely
  // new: the Secretkeeper round's table, where the Secret column visibly
  // changes partway down because the player switched.
  clearHighlights();
  const totalSteps = 4;

  if (tutorialSubStep === 0) {
    basicTutorialShow(
      "They found your word too, so that is the match. Both words survived three guesses - a 3-3 tie.",
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
      "Between two people, a tie goes to whoever was faster overall. Against the AI it just stays a tie - the AI answers instantly, so racing it would not be fair.",
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
      "Each round replays as its own table - same five columns you just went through. Look at the round you were hiding in: the Secret column does not read the same word all the way down. That is your switch, on the record.",
      {
        section: "Your switch, recorded",
        current: 3,
        total: totalSteps,
        placement: "bottom"
      }
    );
    highlightStoredRoundColumn(1, "secret-cell");
    tutorialContinueMode = "advance";
    return;
  }

  tutorialEndNextMode = "quest";
  basicTutorialShow(
    "And that is the whole game. Each side also gets a little help of its own - Quests when you hunt, Stars when you hide. Those are the next two tutorials, and both are short.",
    {
      section: "Basics complete",
      current: 4,
      total: totalSteps,
      placement: "bottom",
      mode: "end"
    }
  );
  highlightSummaryActions();
}

