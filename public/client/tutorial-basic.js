// Basic tutorial: the smallest set of rules needed to play both roles.
// Written to be readable by a 5th grader -- short sentences, one new idea
// per step, and everything explained in plain words instead of game jargon.

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
    <div class="tutorial-feedback-legend" aria-label="What the colors mean">
      <div class="tutorial-feedback-item">
        <span class="tutorial-mini-tile tile-green">A</span>
        <span><strong>Green</strong><small>Right letter, right spot.</small></span>
      </div>
      <div class="tutorial-feedback-item">
        <span class="tutorial-mini-tile tile-yellow">A</span>
        <span><strong>Yellow</strong><small>In the word, wrong spot.</small></span>
      </div>
      <div class="tutorial-feedback-item">
        <span class="tutorial-mini-tile tile-gray">A</span>
        <span><strong>Grey</strong><small>Not in the word at all.</small></span>
      </div>
    </div>
  `;
}

// Turn-order graphic: a round always opens with both players acting at
// once (nobody has any information yet), then settles into a guess/react
// back-and-forth. Shown once, early, so the alternating structure is
// something the player can point at instead of just being told about.
function basicTurnOrderGraphic() {
  return `
    <div class="tutorial-turn-order">
      <span class="tutorial-turn-step tutorial-turn-both">1. Both act at the same time</span>
      <span class="tutorial-turn-arrow">→</span>
      <span class="tutorial-turn-step tutorial-turn-guesser">2. Inspector guesses</span>
      <span class="tutorial-turn-arrow">→</span>
      <span class="tutorial-turn-step tutorial-turn-setter">3. Spy reacts</span>
      <span class="tutorial-turn-arrow">→</span>
      <span class="tutorial-turn-step tutorial-turn-guesser">2. Inspector guesses</span>
      <span class="tutorial-turn-arrow">→</span>
      <span class="tutorial-turn-step tutorial-turn-setter">3. Spy reacts</span>
      <span class="tutorial-turn-arrow">…</span>
    </div>
    <div class="tutorial-note-strip">
      Step 1 happens only once, at the very start. After that, steps 2 and 3 just repeat until the Inspector finds the word.
    </div>
  `;
}

function basicSpyChoices() {
  return `
    <div class="tutorial-choice-grid">
      <div class="tutorial-choice-card">
        <strong>KEEP</strong>
        <span>Leave your secret as-is.</span>
      </div>
      <div class="tutorial-choice-card">
        <strong>CHANGE</strong>
        <span>Type a new secret instead.</span>
      </div>
    </div>
    <div class="tutorial-note-strip">
      Either way, the word has to still match every color you've already shown -- you can't take back a green or yellow.
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
        "Welcome! This game is a word-guessing duel between two players. One player is the Spy -- they pick a secret 5-letter word and hide it. The other player is the Inspector -- their job is to guess that word. Right now, you are the Inspector.",
        {
          role: "guesser",
          current: 1,
          total: 6,
          placement: "top",
          visualHtml: `
            <div class="tutorial-role-goal">
              <span class="tutorial-role-icon">🔍</span>
              <span><strong>Find the hidden word</strong><small>Try to find it in as few guesses as you can.</small></span>
            </div>
          `
        }
      );
      tutorialContinueMode = "advance";
      return;
    }

    if (tutorialSubStep === 1) {
      basicTutorialShow(
        "Before you start guessing, here's how a round is played. Take a look:",
        {
          role: "guesser",
          current: 2,
          total: 6,
          placement: "top",
          visualHtml: basicTurnOrderGraphic()
        }
      );
      tutorialContinueMode = "advance";
      return;
    }

    if (state.simultaneousGuessSubmitted) {
      basicTutorialShow(
        "Nice, your first guess is locked in! Right now the Spy is picking their secret word at the very same time -- that's step 1 from the graphic you just saw. You won't get any colors back until the Spy has chosen. Just sit tight for a moment.",
        {
          role: "guesser",
          current: 3,
          total: 6,
          placement: "top",
          compact: true,
          mode: "hide",
          key: "basic-inspector-opening-wait"
        }
      );
      stopKeyDemo();
    } else {
      basicTutorialShow(
        `Let's try it. Every guess has to be a real 5-letter word. Type ${word} on the keyboard below, one letter at a time. When all 5 boxes are full, tap the Submit Guess button.`,
        {
          role: "guesser",
          current: 3,
          total: 6,
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
        "Look at your first guess up above -- each letter now has a color behind it. Colors are how the game tells you what's right, without just telling you the answer. Here's exactly what each one means:",
        {
          role: "guesser",
          current: 4,
          total: 6,
          placement: "bottom",
          visualHtml: basicFeedbackLegend() + `
            <div class="tutorial-note-strip">
              Tip: grey letters aren't banned -- you can still type one if it helps you test a different letter. And you don't have to reuse a known green or yellow every time either; sometimes a totally different word teaches you more.
            </div>
          `
        }
      );
      highlightHistoryGuesser();
      tutorialContinueMode = "advance";
      return;
    }

    if (state.pendingGuess) {
      basicTutorialShow(
        "Your guess is on its way to the Spy. They can see it too, and they get to decide what to do about it before it gets colored. Hang tight while they think.",
        {
          role: "guesser",
          current: 5,
          total: 6,
          placement: "top",
          compact: true,
          mode: "hide",
          key: "basic-inspector-second-wait"
        }
      );
      stopKeyDemo();
    } else {
      basicTutorialShow(
        `Now use what those colors taught you: keep a green letter right where it landed, and move a yellow letter somewhere else in the word. With that in mind, type ${word}.`,
        {
          role: "guesser",
          current: 5,
          total: 6,
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
        "Guess sent! Waiting on the Spy again -- this back-and-forth is exactly the pattern from the graphic earlier: you guess, then the Spy reacts, over and over.",
        {
          role: "guesser",
          current: 6,
          total: 6,
          placement: "top",
          compact: true,
          mode: "hide",
          key: "basic-inspector-final-wait"
        }
      );
      stopKeyDemo();
    } else {
      basicTutorialShow(
        `You're getting the hang of this. Keep reading the colors the same way as before, then type ${word} for one more guess.`,
        {
          role: "guesser",
          current: 6,
          total: 6,
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

function basicSubmitButtonStates() {
  return `
    <div class="tutorial-choice-grid">
      <div class="tutorial-choice-card">
        <strong>NOTHING TYPED</strong>
        <span>Button says KEEP CURRENT SECRET.</span>
      </div>
      <div class="tutorial-choice-card">
        <strong>5 LETTERS TYPED</strong>
        <span>Button says SUBMIT NEW SECRET.</span>
      </div>
    </div>
    <div class="tutorial-note-strip">
      Typed 1-4 letters? The button is disabled until you finish the word or clear it back to empty.
    </div>
  `;
}

function runBasicSpyTutorial(state) {
  const round = state.history?.length ?? 0;
  clearHighlights();

  if (round === 0) {
    const word = state.tutorialSecrets?.[0] || "BLIMP";

    if (tutorialSubStep === 0) {
      basicTutorialShow(
        "New round, new job! You just played Inspector -- now you're the Spy. As the Spy, you pick a secret 5-letter word and try to keep it hidden as long as possible. The Inspector is going to try to guess it.",
        {
          role: "setter",
          current: 1,
          total: 9,
          placement: "top",
          visualHtml: `
            <div class="tutorial-role-goal">
              <span class="tutorial-role-icon">🕵️</span>
              <span><strong>Protect your word</strong><small>The longer it takes the Inspector to find it, the better you're doing.</small></span>
            </div>
          `
        }
      );
      tutorialContinueMode = "advance";
      return;
    }

    if (state.simultaneousSecretSubmitted) {
      basicTutorialShow(
        "Your secret is locked in and hidden from the Inspector. They picked their very first guess at the exact same moment you picked your secret -- nobody knew anything about the other side yet. Now they're about to see how close that first guess was.",
        {
          role: "setter",
          current: 2,
          total: 9,
          placement: "top",
          compact: true,
          mode: "hide",
          key: "basic-spy-opening-wait"
        }
      );
      stopKeyDemo();
    } else {
      basicTutorialShow(
        `Pick your secret word now. It has to be a real 5-letter word, just like the Inspector's guesses. Type ${word} one letter at a time, then tap the Submit New Secret button to lock it in.`,
        {
          role: "setter",
          current: 2,
          total: 9,
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
        "The Inspector is still deciding on their next guess. As soon as they submit it, it'll show up right here on your screen -- keep an eye out.",
        {
          role: "setter",
          current: 3,
          total: 9,
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
        "See that row above with the Inspector's guess in it? That's the pending guess row. It's already showing colors right now -- for your OLD secret, since that's what you're keeping by default at the start of the round. The moment you start typing a new secret, this row updates live to match, letter by letter.",
        {
          role: "setter",
          current: 3,
          total: 9,
          placement: "bottom"
        }
      );
      highlightPendingGuessRow();
      tutorialContinueMode = "advance";
      return;
    }

    if (tutorialSubStep === 1) {
      basicTutorialShow(
        "Those colors are only a preview -- they show what WOULD happen if you submitted exactly what you've typed so far. Nothing is decided until you actually tap Submit, so feel free to keep changing your mind.",
        {
          role: "setter",
          current: 4,
          total: 9,
          placement: "bottom"
        }
      );
      highlightPendingGuessRow();
      tutorialContinueMode = "advance";
      return;
    }

    if (tutorialSubStep === 2) {
      basicTutorialShow(
        "So here's your move: you can either keep your current secret exactly as it is, or type a new word instead. Do this while you can still see their guess without colors -- it's your chance to react before the round moves on.",
        {
          role: "setter",
          current: 5,
          total: 9,
          placement: "bottom",
          visualHtml: basicSpyChoices()
        }
      );
      highlightPendingGuessRow();
      tutorialContinueMode = "advance";
      return;
    }

    if (tutorialSubStep === 3) {
      basicTutorialShow(
        "One more thing before you try it: the Submit button's label changes depending on what you've typed.",
        {
          role: "setter",
          current: 6,
          total: 9,
          placement: "bottom",
          visualHtml: basicSubmitButtonStates()
        }
      );
      tutorialContinueMode = "advance";
      return;
    }

    basicTutorialShow(
      `Let's practice changing it. There's nothing to erase -- just start typing ${word}, and your old secret disappears the moment you do.`,
      {
        role: "setter",
        current: 7,
        total: 9,
        placement: "top",
        mode: "hide",
        visualHtml: `
          <div class="tutorial-note-strip">
            The KEEP and NEW numbers nearby count legal secret words left for each choice -- bigger is usually safer. More on this in the Advanced tutorial.
          </div>
        `
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
      "Now let's try the other choice. This time, keep the exact same secret instead of changing it. Don't type anything -- leave all 5 boxes empty, and tap the Keep Current Secret button.",
      {
        role: "setter",
        current: 8,
        total: 9,
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
      "That's the whole basic game! Let's recap: the Inspector guesses over and over, reading the colors each time to guess smarter. The Spy watches every guess before it's scored and decides, each time, to keep the secret or change it -- as long as any change still matches every color already shown. Simple rules, but lots of room for strategy.",
      {
        role: "setter",
        current: 9,
        total: 9,
        placement: "top",
        mode: "end",
        visualHtml: `
          <div class="tutorial-finish-checks">
            <span>✓ Inspector: fewer guesses is better</span>
            <span>✓ Spy: keep the word hidden longer</span>
            <span>✓ Changes must still fit old clues</span>
            <span>✓ Open together, then guess → react</span>
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

  if (tutorialSubStep === 0) {
    const guesses = state.history?.length || state.guessCount || 0;
    basicTutorialShow(
      `Round over! You found the word in ${guesses} guess${guesses === 1 ? "" : "es"}. For the Inspector, fewer guesses is always better -- it means you read the clues well.`,
      {
        role: "guesser",
        section: "Round finished",
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
    "Time to swap jobs -- that's how every round works in this game. Tap Next Round, and this time YOU will be the Spy while your opponent plays Inspector.",
    {
      role: "guesser",
      section: "Swap jobs",
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
      "Match over! Both of you have now played the Spy once each, so it's a fair fight. Whoever's secret word took MORE guesses to find is the winner -- hiding your word well counts just as much as finding your opponent's.",
      {
        section: "Match finished",
        current: 1,
        total: 3,
        placement: "bottom"
      }
    );
    highlightMatchScore();
    tutorialContinueMode = "advance";
    return;
  }

  if (tutorialSubStep === 1) {
    basicTutorialShow(
      "Down here are your options for what's next: New Match starts a fresh one, Replay rematches the same opponent, and Leave heads back to the menu.",
      {
        section: "What's next",
        current: 2,
        total: 3,
        placement: "bottom"
      }
    );
    highlightSummaryActions();
    tutorialContinueMode = "advance";
    return;
  }

  basicTutorialShow(
    "And that's the whole basic game, start to finish! There's more to learn when you're ready -- Quests and other tools each get their own short, separate tutorial.",
    {
      section: "Basics done",
      current: 3,
      total: 3,
      placement: "bottom",
      mode: "end"
    }
  );
  tutorialEndNextMode = "quest";
}
