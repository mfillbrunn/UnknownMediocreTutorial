// Advanced UI tutorial: Guide, Drag & Lock, Notes, Log, and remaining-word tools.

function runAdvancedTutorial(state, role) {
  clearHighlights();

  if (role === "guesser") {
    runAdvancedTutorialGuesser(state);
  } else {
    runAdvancedTutorialSetter(state);
  }
}

function runAdvancedTutorialGuesser(state) {
  const round =
    state.history?.length ?? 0;

  if (round === 0) {
    if (tutorialSubStep === 0) {
      showTutorial(
        `This tutorial covers four extra tools: Guide, Drag & Lock, Notes, and the remaining-words box — plus a few other UI elements along the way.`,
        {
          mode: "advance"
        }
      );

      return;
    }

    if (tutorialSubStep === 1) {
      showTutorial(
        `Guide is a little helper. Turn it on when you want the game to explain just a little more in the beginning.`,
        {
          mode: "advance"
        }
      );

      highlightGuideToggle("guesser");
      return;
    }

    if (tutorialSubStep === 2) {
      const word =
        state.tutorialGuesses?.[0] ||
        "CHAMP";

      if (
        state.simultaneousGuessSubmitted
      ) {
        showTutorial(
          `Your guess is ready. Waiting for the Spy to choose a secret...`,
          {
            mode: "hide"
          }
        );
      } else {
        showTutorial(
          `Type "${word}" and tap Submit Guess.`,
          {
            mode: "hide"
          }
        );
      }

      highlightKeyboardGuesser();

      startKeyDemo(
        `guesser-advanced-round0-${word}`,
        () =>
          tutorialWordKeyEls(
            "guesser",
            word,
            localGuesserDraft
          )
      );

      waitForGuessSubmission(round);
      return;
    }

    hideTutorial();
    return;
  }

  if (round === 1) {
    const word =
      state.tutorialGuesses?.[1] ||
      "CUMIN";

    if (tutorialSubStep === 0) {
      showTutorial(
        `Try dragging letters onto the tiles instead of tapping them. Drag each letter of "${word}" from the keyboard onto its tile — watch the demo, then try it yourself.`,
        {
          enabled: true
        }
      );

      highlightDraftRow("guesser");
      highlightKeyboardGuesser();
      startDragDemo(word);

      startKeyDemo(
        `guesser-advanced-round1-${word}`,
        () =>
          tutorialWordKeyEls(
            "guesser",
            word,
            localGuesserDraft
          )
      );

      waitForDraftFilled();
      return;
    }

    if (tutorialSubStep === 1) {
      stopDragDemo();
      stopKeyDemo();

      showTutorial(
        `Nice! Now tap — don't drag — one of the filled tiles to lock it in. A locked letter can't be erased by Backspace.`,
        {
          enabled: true
        }
      );

      highlightDraftRow("guesser");
      waitForTileLocked();
      return;
    }

    if (tutorialSubStep === 2) {
      showTutorial(
        `Locked! Now tap that same tile again to unlock it.`,
        {
          enabled: true
        }
      );

      highlightDraftRow("guesser");
      waitForTileUnlocked();
      return;
    }

    if (state.pendingGuess) {
      showTutorial(
        `Your guess is ready. Waiting for the Spy to answer...`,
        {
          mode: "hide"
        }
      );
    } else {
      showTutorial(
        `Great — now tap Submit Guess to submit "${word}". Right after this, you will switch to playing as the Spy to see a few more features.`,
        {
          mode: "hide"
        }
      );
    }

    highlightKeyboardGuesser();

    startKeyDemo(
      `guesser-advanced-round1-submit-${word}`,
      () =>
        tutorialWordKeyEls(
          "guesser",
          word,
          localGuesserDraft
        )
    );

    waitForGuessSubmission(round);
    return;
  }

  if (round === 2) {
    stopKeyDemo();

    showTutorial(
      `Good. You used Guide and Drag & Lock. Next you will be the Spy and learn Notes.`,
      {
        mode: "hide"
      }
    );

    return;
  }

  hideTutorial();
}

function runAdvancedTutorialSetter(state) {
  const round =
    state.history?.length ?? 0;

  if (round === 0) {
    if (tutorialSubStep === 0) {
      showTutorial(
        `Now you are the Spy. Drag & Lock works on your secret row too. We will use Notes after the first guess.`,
        {
          mode: "advance"
        }
      );

      highlightDraftRow("setter");
      return;
    }

    if (tutorialSubStep === 1) {
      const word =
        state.tutorialSecrets?.[0] ||
        "BLIMP";

      if (
        state.simultaneousSecretSubmitted
      ) {
        showTutorial(
          `Your secret is ready. Waiting for the Inspector's first guess...`,
          {
            mode: "hide"
          }
        );
      } else {
        showTutorial(
          `Enter "${word}". You can drag letters into tiles and tap a filled tile to lock it.`,
          {
            mode: "hide"
          }
        );
      }

      highlightDraftRow("setter");

      startKeyDemo(
        `setter-advanced-round0-${word}`,
        () =>
          tutorialWordKeyEls(
            "setter",
            word,
            window.state?.setterDraft
          )
      );

      waitForSecretSubmission(round);
      return;
    }

    hideTutorial();
    return;
  }

  if (round === 1) {
    const oldSecret = (
      state.tutorialSecrets?.[0] ||
      "BLIMP"
    ).toUpperCase();

    const candidate = (
      state.tutorialSecrets?.[1] ||
      "LEMUR"
    ).toUpperCase();

    if (tutorialSubStep === 0) {
      showTutorial(
        `It is the Inspector's turn, so your secret keyboard is free. Notes has opened automatically as a scratchpad while you wait.`,
        {
          mode: "advance"
        }
      );

      highlightNotesPanel();
      return;
    }

    if (tutorialSubStep === 1) {
      showTutorial(
        `Your current secret is saved here automatically. Now type "${candidate}" in the five small Notes boxes using the regular keyboard and press Enter to save another possible secret.`,
        {
          mode: "hide"
        }
      );

      highlightNotesDraft();

      startKeyDemo(
        `setter-advanced-notes-${candidate}`,
        () =>
          tutorialWordKeyEls(
            "setter",
            candidate,
            notesDraftText()
          )
      );

      waitForNoteAdded(candidate);
      return;
    }

    if (tutorialSubStep === 2) {
      stopKeyDemo();

      showTutorial(
        `Saved words that still match every clue stay green. After a new guess arrives, a small number can show how many secrets would remain if you used that word. Bigger is usually safer.`,
        {
          mode: "advance"
        }
      );

      highlightNotesList();
      return;
    }

    if (tutorialSubStep === 3) {
      if (!state.pendingGuess) {
        showTutorial(
          `Your backup word is saved. The Inspector is still thinking...`,
          {
            key:
              `advanced-notes-wait-${round}`,
            mode: "hide"
          }
        );

        highlightNotesList();

        setContinue({
          show: false,
          mode: "hide"
        });

        return;
      }

      showTutorial(
        `The new guess is here! This box tracks how many secrets are still possible — let's go through it one row at a time.`,
        {
          mode: "advance"
        }
      );

      highlightSetterRemainingBox();
      return;
    }

    if (tutorialSubStep === 4) {
      showTutorial(
        `Keep vs. New compares your two options for this turn.`,
        {
          mode: "advance"
        }
      );

      highlightSetterRemainingBox();
      return;
    }

    if (tutorialSubStep === 5) {
      showTutorial(
        `Keep is how many secrets would still be possible if you kept your current secret, "${oldSecret}".`,
        {
          mode: "advance"
        }
      );

      highlightSetterRemainingBoxRow(0);
      return;
    }

    if (tutorialSubStep === 6) {
      showTutorial(
        `New is how many would be possible if you switched to whatever's in your draft right now — it updates live as you type.`,
        {
          mode: "advance"
        }
      );

      highlightSetterRemainingBoxRow(1);
      return;
    }

    if (tutorialSubStep === 7) {
      showTutorial(
        `Tap "${oldSecret}" in Notes — it copies straight into your secret row, without submitting anything yet.`,
        {
          mode: "hide"
        }
      );

      highlightSavedNote(oldSecret);
      waitForNoteSelected(oldSecret);
      return;
    }

    if (tutorialSubStep === 8) {
      showTutorial(
        `Now tap "${candidate}" instead and watch New change again. Notice the small number next to each word in Notes too — that is this same New count for that word.`,
        {
          enabled: true
        }
      );

      highlightSavedNote(candidate);
      waitForNoteSelected(candidate);
      return;
    }

    if (tutorialSubStep === 9) {
      showTutorial(
        `Now try typing something that isn't a real word — like "ABCDE" — directly into your secret row. Don't submit it. Watch New turn into a ✕, since that word could never actually be planted.`,
        {
          mode: "hide"
        }
      );

      highlightDraftRow("setter");

      startKeyDemo(
        "setter-advanced-invalid-draft",
        () =>
          tutorialWordKeyEls(
            "setter",
            "ABCDE",
            window.state?.setterDraft
          )
      );

      waitForInvalidDraft();
      return;
    }

    if (tutorialSubStep === 10) {
      stopKeyDemo();

      showTutorial(
        `That ✕ means the draft isn't a legal secret — you can't submit it. Tap "${candidate}" in Notes again to bring back a real word before we move on.`,
        {
          mode: "hide"
        }
      );

      highlightSavedNote(candidate);
      waitForNoteSelected(candidate);
      return;
    }

    if (tutorialSubStep === 11) {
      showTutorial(
        `That's the remaining-words box! A few more things you'll see on this screen:`,
        {
          mode: "advance"
        }
      );

      return;
    }

    if (tutorialSubStep === 12) {
      showTutorial(
        `Every time you switch to a brand-new secret instead of keeping the old one, you earn stars — the tighter that new secret narrows down what's still possible, the more you get. They build up in a 12-star meter above your powers (turned off during this tutorial, so you won't see it fill up here).`,
        {
          mode: "advance"
        }
      );

      highlightSpyChargeMeter();
      return;
    }

    if (tutorialSubStep === 13) {
      showTutorial(
        `Each turn also has one hidden bonus letter, shown as a small target chip next to your secret row — put that exact letter in that exact position in your new secret for +1 star. At 5 stars you unlock your second power, at 8 you can reset one letter's feedback, and at 12 you get a second reset. Switching secrets is almost always worth it.`,
        {
          mode: "advance"
        }
      );

      highlightSetterCoverStars();
      return;
    }

    if (tutorialSubStep === 14) {
      showTutorial(
        `The first number, in green, is your score. It goes up every time your opponent needs another guess to find your secret — the more guesses they need, the higher it climbs. The dimmer number next to it works the same way for your opponent's score, based on how many guesses you need. Whoever ends up with the higher score wins the match.`,
        {
          mode: "advance"
        }
      );

      highlightHeaderScore("setter");
      return;
    }

    if (tutorialSubStep === 15) {
      showTutorial(
        `Above your secret, the constraint row gives a compact rundown of every clue collected so far. Tap the ⧉ button any time to fold it away or bring it back.`,
        {
          mode: "advance"
        }
      );

      highlightConstraintRowAndToggle("setter");
      return;
    }

    if (tutorialSubStep === 16) {
      showTutorial(
        `The ? button always shows your active powers, and whether each one has been used yet.`,
        {
          mode: "advance"
        }
      );

      highlightPowerInfoBtn("setter");
      return;
    }

    showTutorial(
      `Finally, the Log tab keeps a running history of every action this match — powers used, secrets switched, all of it. That's the advanced UI! Tap "Finish Tutorial" whenever you're ready — no need to finish playing this match.`,
      {
        mode: "end"
      }
    );

    tutorialEndNextMode = "tutorial";

    highlightSetterLog();
    return;
  }

  if (round === 2) {
    showTutorial(
      `That is the advanced UI: Guide explains things, Drag & Lock helps you place letters, and Notes saves possible secrets while the other player thinks. Tap "Finish Tutorial" whenever you're ready — no need to finish playing this match.`,
      {
        mode: "end"
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
    showTutorial(
      "Round complete. Next you'll be the Spy, where Notes and the secret-comparison tools matter most.",
      { title: "Advanced UI", progressCurrent: 1, progressTotal: 2, tone: "guesser", placement: "bottom" }
    );
    highlightRoundSummary();
    tutorialContinueMode = "advance";
    return;
  }

  showTutorial(
    "Tap Next Round when you're ready.",
    { title: "Advanced UI", progressCurrent: 2, progressTotal: 2, tone: "setter", placement: "bottom", mode: "hide" }
  );
  highlightNextRoundBtn();
  tutorialContinueMode = "hide";
}

function runAdvancedMatchTutorial(state) {
  clearHighlights();
  showTutorial(
    "Advanced UI complete. You practiced Guide, Drag & Lock, Notes, Log, and the Spy's comparison tools.",
    { title: "Advanced UI complete", tone: "setter", placement: "bottom", mode: "end" }
  );
  tutorialEndNextMode = "tutorial";
}
