// Power tutorials: the guided two-power follow-up and individual power practice.

function runPowerFollowupTutorial(state, role) {
  if (role === "setter") {
    runPowerFollowupSpy(state);
  } else {
    runPowerFollowupInspector(state);
  }
}

function runPowerFollowupInspector(state) {
  const round = state.history?.length ?? 0;
  clearHighlights();

    if (round === 0) {
      const word =
        state.tutorialGuesses?.[0] ||
        "CHAMP";

      if (tutorialSubStep === 0) {
        showTutorial(
          `Welcome back! This short follow-up teaches you about powers — an essential part of Vowel play! We'll show you one for the Inspector, one for the Spy.`,
          {
            enabled: true
          }
        );

        tutorialContinueMode =
          "advance";

        return;
      }

      if (tutorialSubStep === 1) {
        showTutorial(
          `Quick rule: powers can only be used once per turn, and most are limited to once per match. Letter Peek and a couple others are the exceptions — you get two uses each. And they can only be used after the first round.`,
          {
            enabled: true
          }
        );

        tutorialContinueMode =
          "advance";

        return;
      }

      if (tutorialSubStep === 2) {
        showTutorial(
          `You're the Inspector again, and this time you have a power available: Letter Peek — it reveals one correct letter and its position.`,
          {
            enabled: true
          }
        );

        highlightPowersCol();

        tutorialContinueMode =
          "advance";

        return;
      }

      if (tutorialSubStep === 3) {
        if (
          state.simultaneousGuessSubmitted
        ) {
          showTutorial(
            `Waiting for the Spy to finish picking their secret…`,
            {
              enabled: false
            }
          );
        } else {
          showTutorial(
            `First, enter your opening guess. Type "${word}", then tap Submit Guess.`,
            {
              enabled: true,
              mode: "hide"
            }
          );

          startKeyDemo(
            `guesser-stage2-round0-${word}`,
            () =>
              tutorialWordKeyEls(
                "guesser",
                word,
                localGuesserDraft
              )
          );
        }

        tutorialContinueMode =
          "hide";

        highlightKeyboardGuesser();
        waitForGuessSubmission(round);

        return;
      }

      hideTutorial();
      return;
    }

    if (round === 1) {
      if (tutorialSubStep === 0) {
        showTutorial(
          `Now let's use your power. Click "Letter Peek" to reveal one correct letter and where it goes.`,
          {
            enabled: false
          }
        );

        highlightPowerButtonByText(
          "Letter Peek"
        );

        tutorialContinueMode =
          "hide";

        waitForPowerUse(
          "revealGreen"
        );

        return;
      }

      if (tutorialSubStep === 1) {
        const info =
          state.revealGreenInfo;

        if (!info) {
          showTutorial(
            `Revealing your letter…`,
            {
              enabled: false
            }
          );

          return;
        }

        showTutorial(
          `Letter Peek revealed "${info.letter}" in position ${info.pos + 1} — see it appear in your action log below. Try a guess that uses it.`,
          {
            enabled: true
          }
        );

        highlightLogEntryByText(
          "Letter Peek",
          "guesser"
        );

        tutorialContinueMode =
          "advance";

        return;
      }

      if (tutorialSubStep === 2) {
        showTutorial(
          `That's how powers work — your opponent's log shows that you activated Letter Peek, even though the letter itself stays hidden from them. Once you find the secret, we'll switch to the Spy side.`,
          {
            enabled: true
          }
        );

        tutorialContinueMode =
          "advance";

        return;
      }

      if (tutorialSubStep === 3) {
        const word =
          state.tutorialGuesses?.[1] ||
          "CUMIN";

        if (state.pendingGuess) {
          showTutorial(
            `Waiting for the Spy to react to "${word}"…`,
            {
              enabled: false
            }
          );
        } else {
          showTutorial(
            `Now enter your second guess: "${word}".`,
            {
              enabled: true,
              mode: "hide"
            }
          );

          startKeyDemo(
            `guesser-stage2-round1-${word}`,
            () =>
              tutorialWordKeyEls(
                "guesser",
                word,
                localGuesserDraft
              )
          );
        }

        highlightKeyboardGuesser();

        tutorialContinueMode =
          "hide";

        waitForGuessSubmission(round);

        return;
      }

      hideTutorial();
      return;
    }

    if (round === 2) {
      if (tutorialSubStep === 0) {
        showTutorial(
          `From here on, finish this round on your own. Once you find the secret, you'll switch roles. Good luck!`,
          {
            enabled: true,
            mode: "hide"
          }
        );

        tutorialContinueMode =
          "hide";

        return;
      }

      hideTutorial();
      return;
    }

    return;
  
}

function runPowerFollowupSpy(state) {
  const round = state.history?.length ?? 0;
  clearHighlights();

    if (round === 0) {
      const word =
        state.tutorialSecrets?.[0];

      if (tutorialSubStep === 0) {
        showTutorial(
          `Now you're the Spy, with a power of your own available this time: Counts Only.`,
          {
            enabled: false
          }
        );

        highlightPowersCol();

        tutorialContinueMode =
          "advance";

        return;
      }

      if (tutorialSubStep === 1) {
        if (
          state.simultaneousSecretSubmitted
        ) {
          showTutorial(
            `Waiting for the Inspector to finish their opening guess…`,
            {
              enabled: false
            }
          );
        } else {
          showTutorial(
            `In the first round, you enter a secret word — your opponent won't see it. Enter "${word}".`,
            {
              enabled: false
            }
          );

          startKeyDemo(
            `setter-stage2-round0-${word}`,
            () =>
              tutorialWordKeyEls(
                "setter",
                word,
                window.state?.setterDraft
              )
          );
        }

        highlightKeyboardSetter();

        tutorialContinueMode =
          "hide";

        waitForSecretSubmission(round);

        return;
      }

      hideTutorial();
      return;
    }

    if (round === 1) {
      const word =
        state.tutorialSecrets?.[1];

      if (tutorialSubStep === 0) {
        showTutorial(
          `Let's use your power this turn. Click "Counts Only" — it hides exact tile positions from the Inspector and shows them only how many letters are green or yellow in total.`,
          {
            enabled: true
          }
        );

        highlightPowerButtonByText(
          "Counts Only"
        );

        tutorialContinueMode =
          "hide";

        waitForPowerUse(
          "countOnly"
        );

        return;
      }

      if (tutorialSubStep === 1) {
        showTutorial(
          `Nice — now let's lock in a new secret. Enter "${word}"!`,
          {
            enabled: true,
            mode: "hide"
          }
        );

        startKeyDemo(
          `setter-stage2-round1-${word}`,
          () =>
            tutorialWordKeyEls(
              "setter",
              word,
              window.state?.setterDraft
            )
        );

        highlightKeyboardSetter();

        tutorialContinueMode =
          "hide";

        waitForSecretSubmission(round);

        return;
      }

      hideTutorial();
      return;
    }

    if (round === 2) {
      const countEntry =
        [...state.history]
          .reverse()
          .find(e =>
            e.countOnlyApplied &&
            e.extraInfo
          );

      if (
        tutorialSubStep === 0 &&
        countEntry
      ) {
        const {
          greens,
          yellows
        } = countEntry.extraInfo;

        showTutorial(
          `Counts Only hid the exact tile colors on "${countEntry.guess}" — the Inspector only learned ${greens} letter${greens === 1 ? " was" : "s were"} green and ${yellows} ${yellows === 1 ? "was" : "were"} yellow, not which.`,
          {
            enabled: true
          }
        );

        highlightSetterHistory();

        tutorialContinueMode =
          "advance";

        return;
      }

      if (
        tutorialSubStep === 1 &&
        countEntry
      ) {
        showTutorial(
          `The small "?" marks in the corner of those tiles show which ones the Inspector saw that way instead of a real color. Other powers can leave a similar mark to show what color they actually saw.`,
          {
            enabled: true
          }
        );

        highlightSetterHistory();

        tutorialContinueMode =
          "advance";

        return;
      }

      showTutorial(
        `That's the powers tutorial! Tap "Finish Tutorial" whenever you're ready — no need to finish playing this match.`,
        {
          mode: "end"
        }
      );

      tutorialEndNextMode = "quest";

      return;
    }

    return;
  
}

const POWER_TUTORIAL_SEED_ROUND = 2;
const POWER_TUTORIAL_GUESSER_DRAFT =
  "SNORE";

function prefillPowerTutorialGuesserDraft() {
  if (powerTutorialDraftPrefilled) {
    return;
  }

  powerTutorialDraftPrefilled = true;

  window.setGuesserDraft?.(
    POWER_TUTORIAL_GUESSER_DRAFT
  );
}

function runPowerTutorial(
  state,
  role
) {
  const round =
    state.history?.length ?? 0;

  clearHighlights();

  const powerId =
    state.tutorialPowerId;

  const meta =
    window.POWER_METADATA?.[powerId];

  if (!powerId || !meta) {
    hideTutorial();
    return;
  }

  const powerRole =
    meta.role === "setter"
      ? "setter"
      : "guesser";

  if (role === powerRole) {
    runPowerTutorialTeaching(
      state,
      role,
      meta,
      powerId,
      round
    );
  } else {
    runPowerTutorialReceiving(
      state,
      role,
      meta,
      powerId,
      round
    );
  }
}

function runPowerTutorialTeaching(
  state,
  role,
  meta,
  powerId,
  round
) {
  const isGuesser =
    role === "guesser";

  if (
    round ===
    POWER_TUTORIAL_SEED_ROUND
  ) {
    if (tutorialSubStep === 0) {
      showTutorial(
        `Let's try out ${meta.label}. ${meta.desc}`,
        {
          enabled: true
        }
      );

      tutorialContinueMode =
        "advance";

      return;
    }

    if (
      isGuesser &&
      tutorialSubStep === 1
    ) {
      showTutorial(
        `One more thing: as the Inspector, you also always have a Quest active — a visible challenge shown next to your powers that rewards a free green letter when completed. Check the Powers screen any time for the full list and example words.`,
        {
          enabled: true
        }
      );

      tutorialContinueMode =
        "advance";

      return;
    }

    if (
      tutorialSubStep ===
      (isGuesser ? 2 : 1)
    ) {
      if (isGuesser) {
        prefillPowerTutorialGuesserDraft();
      }

      showTutorial(
        `Tap "${meta.label}" to activate it.`,
        {
          enabled: false
        }
      );

      highlightPowerButtonByText(
        meta.label
      );

      tutorialContinueMode =
        "hide";

      waitForPowerUse(powerId);

      return;
    }

    if (
      tutorialSubStep ===
      (isGuesser ? 3 : 2)
    ) {
      if (
        isGuesser &&
        state.pendingGuess
      ) {
        showTutorial(
          `Waiting for the Spy to react…`,
          {
            enabled: false
          }
        );
      } else {
        showTutorial(
          isGuesser
            ? "Now submit your guess."
            : "Now submit to lock it in.",
          {
            enabled: false
          }
        );
      }

      tutorialContinueMode =
        "hide";

      if (isGuesser) {
        highlightKeyboardGuesser();
        waitForGuessSubmission(round);
      } else {
        highlightKeyboardSetter();
        waitForSecretSubmission(round);
      }

      return;
    }

    hideTutorial();
    return;
  }

  if (
    round ===
    POWER_TUTORIAL_SEED_ROUND + 1
  ) {
    if (!powerTutorialSkipSent) {
      powerTutorialSkipSent = true;

      showTutorial(
        `That's ${meta.label} from your side! Switching to the RECEIVING end now, so you can see what it looks like from there.`,
        {
          enabled: false
        }
      );

      tutorialContinueMode =
        "hide";

      sendGameAction({
        type:
          "TUTORIAL_SKIP_TO_RECEIVING"
      });

      return;
    }

    return;
  }

  hideTutorial();
}

function runPowerTutorialReceiving(
  state,
  role,
  meta,
  powerId,
  round
) {
  const isGuesser =
    role === "guesser";

  if (
    round ===
    POWER_TUTORIAL_SEED_ROUND
  ) {
    if (isGuesser) {
      if (tutorialSubStep === 0) {
        showTutorial(
          `Roles just swapped! Now watch what it's like when your opponent uses ${meta.label} against YOU.`,
          {
            enabled: true
          }
        );

        tutorialContinueMode =
          "advance";

        return;
      }

      if (tutorialSubStep === 1) {
        showTutorial(
          `One more thing: as the Inspector, you also always have a Quest active — a visible challenge shown next to your powers that rewards a free green letter when completed. Check the Powers screen any time for the full list and example words.`,
          {
            enabled: true
          }
        );

        tutorialContinueMode =
          "advance";

        return;
      }

      if (tutorialSubStep === 2) {
        prefillPowerTutorialGuesserDraft();

        showTutorial(
          state.pendingGuess
            ? `Waiting for the Spy to react…`
            : `Submit your guess.`,
          {
            enabled: false
          }
        );

        highlightKeyboardGuesser();

        tutorialContinueMode =
          "hide";

        waitForGuessSubmission(round);

        return;
      }

      hideTutorial();
      return;
    }

    if (!state.pendingGuess) {
      showTutorial(
        `Roles just swapped! Watch what happens when your opponent uses ${meta.label} against you...`,
        {
          enabled: false
        }
      );

      tutorialContinueMode =
        "hide";

      return;
    }

    showTutorial(
      `Your opponent just used ${meta.label}! React normally to finish the round.`,
      {
        enabled: false
      }
    );

    tutorialContinueMode =
      "hide";

    highlightDraftRow("setter");

    return;
  }

  if (
    round ===
    POWER_TUTORIAL_SEED_ROUND + 1
  ) {
    if (tutorialSubStep === 0) {
      showTutorial(
        `That's ${meta.label} in action! You've now seen it from both sides.`,
        {
          enabled: true
        }
      );

      tutorialContinueMode =
        "advance";

      return;
    }

    hideTutorial();
    return;
  }

  hideTutorial();
}

function runPowerSummaryTutorial(state) {
  clearHighlights();

  if (tutorialSubStep === 0) {
    showTutorial(
      "Round complete. The recap shows the power, guesses, and feedback from this round.",
      { title: "Powers tutorial", progressCurrent: 1, progressTotal: 2, tone: "guesser", placement: "bottom" }
    );
    highlightRoundSummary();
    tutorialContinueMode = "advance";
    return;
  }

  showTutorial(
    "Tap Next Round to switch roles and try a Spy power.",
    { title: "Powers tutorial", progressCurrent: 2, progressTotal: 2, tone: "setter", placement: "bottom", mode: "hide" }
  );
  highlightNextRoundBtn();
  tutorialContinueMode = "hide";
}

function runPowerMatchTutorial(state) {
  clearHighlights();

  if (state.tutorialStage === "power") {
    const meta = window.POWER_METADATA?.[state.tutorialPowerId];
    const label = meta?.label || "this power";
    showTutorial(
      `You've now seen ${label} from both sides.`,
      { title: "Power practice complete", tone: "guesser", placement: "bottom", mode: "end" }
    );
    tutorialEndNextMode = "tutorial";
    return;
  }

  showTutorial(
    "You've tried one Inspector power and one Spy power. The Powers screen lets you practice the rest.",
    { title: "Powers complete", tone: "guesser", placement: "bottom", mode: "end" }
  );
  tutorialEndNextMode = "quest";
}
