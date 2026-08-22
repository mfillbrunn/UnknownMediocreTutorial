// Power tutorials: simple, short explanations for special moves.

const POWER_TUTORIAL_SEED_ROUND = 2;
const POWER_TUTORIAL_GUESSER_DRAFT = "SNORE";

const POWER_TUTORIAL_ROLE = Object.freeze({
  confuseColors: "setter",
  countOnly: "setter",
  forceGuess: "setter",
  fakeFeedback: "setter",
  forceTimer: "setter",
  hideTile: "setter",
  suggestSecret: "setter",
  vowelRefresh: "setter",
  assassinWord: "setter",
  blindGuess: "setter",
  blindSpot: "setter",
  delayedIntel: "setter",
  letterLockout: "setter",
  revealPenalty: "setter",

  freezeSecret: "guesser",
  rouletteSecret: "guesser",
  magicMode: "guesser",
  revealGreen: "guesser",
  revealHistory: "guesser",
  revealLetter: "guesser",
  stealthGuess: "guesser",
  suggestGuess: "guesser",
  fieldReport: "guesser",
  wiretap: "guesser",
  letterProbe: "guesser",
  revealLocation: "guesser",
  doubleGuess: "guesser",
  letterProfile: "guesser",
  betMiss: "guesser",
  nonsense: "guesser"
});

const PASSIVE_TUTORIAL_POWERS = new Set([
  "wiretap",
  "revealLocation",
  "letterProfile"
]);

const POWER_TUTORIAL_SIMPLE_COPY = Object.freeze({
  confuseColors: {
    owner: "Green and yellow tiles look blue for one round, so the Guesser cannot tell them apart.",
    receiver: "The Secretkeeper made green and yellow look blue. You know the tile matters, but not which color it really is."
  },
  countOnly: {
    owner: "The Guesser sees only how many green and yellow tiles they got. They do not see where they are.",
    receiver: "You will see the number of green and yellow tiles, but not which ones. Letters and tiles marked with a small ? are the ones whose real color is hidden from you. Different powers show their effects in different ways like this, so keep an eye on the tiles and keyboard."
  },
  forceGuess: {
    owner: "This gives the Guesser one small rule their next guess must follow.",
    receiver: "Your next guess must follow the rule shown on screen."
  },
  fakeFeedback: {
    owner: "The Guesser sees two sets of colors. One is real and one is fake.",
    receiver: "You will see two answers. One is real. One is fake."
  },
  forceTimer: {
    owner: "This gives the Guesser only a short time for the next guess.",
    receiver: "A short timer will start. Make your guess before it runs out."
  },
  freezeSecret: {
    owner: "This stops the Secretkeeper from changing the secret on the next turn.",
    receiver: "Your secret is locked for the next turn. You must keep it."
  },
  hideTile: {
    owner: "Pick one letter. Old clues for that letter are erased.",
    receiver: "The Secretkeeper erased the old clues for one letter."
  },
  rouletteSecret: {
    owner: "The game picks the Secretkeeper's next secret for them.",
    receiver: "The Guesser made the game choose your next secret."
  },
  magicMode: {
    owner: "Yellow tiles become green for the next result.",
    receiver: "The Guesser upgraded yellow clues into exact green clues."
  },
  revealGreen: {
    owner: "This shows one secret letter and the exact box where it goes.",
    receiver: "The Guesser learned one letter and its exact box."
  },
  revealHistory: {
    owner: "This shows a secret word from earlier in the round.",
    receiver: "The Guesser looked at one of your older secrets."
  },
  revealLetter: {
    owner: "Finish the small letter challenge to earn a free green clue.",
    receiver: "The Guesser is working toward a free green clue."
  },
  stealthGuess: {
    owner: "The Secretkeeper cannot see your next guess before choosing a secret.",
    receiver: "The Guesser's next guess is hidden from you."
  },
  suggestGuess: {
    owner: "The game gives you a guess that still fits the clues.",
    receiver: "The Guesser received help choosing a legal guess."
  },
  suggestSecret: {
    owner: "The game gives you a secret that still fits all old clues.",
    receiver: "The Secretkeeper received help choosing a legal secret."
  },
  vowelRefresh: {
    owner: "Some vowel clues from the newest guess are erased, so those vowels look unused again.",
    receiver: "Some vowel clues were erased and must be tested again."
  },
  assassinWord: {
    owner: "Pick a trap word. If the Guesser guesses it, the Secretkeeper wins at once.",
    receiver: "The Secretkeeper planted a hidden trap word. Do not guess it."
  },
  blindGuess: {
    owner: "The Guesser's next feedback and keyboard colors are hidden.",
    receiver: "Your next feedback and keyboard colors are hidden."
  },
  blindSpot: {
    owner: "One tile's clue is hidden for the rest of the round.",
    receiver: "One tile will stay hidden for the rest of the round."
  },
  fieldReport: {
    owner: "You get three small rules. Follow enough of them to earn a yellow or green clue.",
    receiver: "The Guesser is following bonus rules to earn a clue."
  },
  wiretap: {
    owner: "This shows how many secret words are still possible.",
    receiver: "The Guesser can see how many secrets are still possible."
  },
  letterProbe: {
    owner: "Pick five letters. The game tells you how many are in the secret, but not which ones.",
    receiver: "The Guesser tested five letters and learned how many are in your secret."
  },
  revealLocation: {
    owner: "This watches one secret position and shows the letter in that box.",
    receiver: "The Guesser is watching one position in your secret."
  },
  doubleGuess: {
    owner: "Send two guesses at once. The Secretkeeper sees one, but you get clues for both.",
    receiver: "The Guesser sent two guesses. You only see one of them."
  },
  letterProfile: {
    owner: "This shows how many of the secret's letters are vowels.",
    receiver: "The Guesser can see how many of your secret's letters are vowels."
  },
  delayedIntel: {
    owner: "The Guesser does not see this clue until after the next guess.",
    receiver: "This clue is hidden until after your next guess."
  },
  letterLockout: {
    owner: "Pick one letter. The Guesser cannot use it in the next guess.",
    receiver: "One letter is banned from your next guess."
  },
  revealPenalty: {
    owner: "Claim that a letter is in the secret. The Guesser can believe you or call a bluff.",
    receiver: "The Secretkeeper claimed a letter is in the secret. Choose whether to believe it."
  },
  betMiss: {
    owner: "Guess how many grey tiles your next guess will have. If you are right, you earn a green clue.",
    receiver: "The Guesser made a bet about their next grey tiles."
  },
  nonsense: {
    owner: "Your next guess can be any five letters. It does not need to be a real word.",
    receiver: "The Guesser may use any five letters for the next guess."
  }
});

function powerTutorialRole(powerId, meta) {
  return meta?.role || POWER_TUTORIAL_ROLE[powerId] || "guesser";
}

function powerTutorialCopy(powerId, meta, side = "owner") {
  return (
    POWER_TUTORIAL_SIMPLE_COPY[powerId]?.[side] ||
    meta?.short ||
    meta?.desc ||
    "This power changes one part of the turn."
  );
}

function powerTutorialShow(text, {
  role = window.myRole,
  title = "Powers: special moves",
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

function prefillPowerTutorialGuesserDraft() {
  if (powerTutorialDraftPrefilled) return;

  powerTutorialDraftPrefilled = true;
  window.setGuesserDraft?.(POWER_TUTORIAL_GUESSER_DRAFT);
}

function runPowerTutorial(state, role) {
  const round = state.history?.length ?? 0;
  clearHighlights();

  const powerId = state.tutorialPowerId;
  const meta = window.POWER_METADATA?.[powerId];

  if (!powerId || !meta) {
    hideTutorial();
    return;
  }

  const ownerRole = powerTutorialRole(powerId, meta);

  if (role === ownerRole) {
    runPowerTutorialTeaching(state, role, meta, powerId, round);
  } else {
    runPowerTutorialReceiving(state, role, meta, powerId, round);
  }
}

function runPowerTutorialTeaching(state, role, meta, powerId, round) {
  const isGuesser = role === "guesser";
  const passive = PASSIVE_TUTORIAL_POWERS.has(powerId);

  if (round === POWER_TUTORIAL_SEED_ROUND) {
    if (tutorialSubStep === 0) {
      powerTutorialShow(
        powerTutorialCopy(powerId, meta, "owner"),
        {
          role,
          title: `Power: ${meta.label}`,
          current: 1,
          total: passive ? 3 : 3,
          placement: "bottom"
        }
      );
      highlightPowerButtonByText(meta.label);
      tutorialContinueMode = "advance";
      return;
    }

    if (tutorialSubStep === 1) {
      if (passive) {
        powerTutorialShow(
          "This power works by itself. You do not need to press it.",
          {
            role,
            title: `Power: ${meta.label}`,
            current: 2,
            total: 3,
            placement: "bottom"
          }
        );
        highlightPowerButtonByText(meta.label);
        tutorialContinueMode = "advance";
        return;
      }

      if (isGuesser) prefillPowerTutorialGuesserDraft();

      powerTutorialShow(
        `Tap ${meta.label}. If a small box opens, follow the one simple choice inside it.`,
        {
          role,
          title: `Use ${meta.label}`,
          current: 2,
          total: 3,
          // The setter's powers live in the collapsible side panel, low
          // enough on screen that the normal avoid-overlap placement can
          // otherwise land the bubble awkwardly mid-screen -- pin it low
          // instead so it never competes with the panel for space.
          placement: isGuesser ? "bottom" : "bottom-forced",
          mode: "hide"
        }
      );
      highlightPowerButtonByText(meta.label);
      waitForPowerUse(powerId);
      return;
    }

    if (isGuesser) prefillPowerTutorialGuesserDraft();

    if (isGuesser && state.pendingGuess) {
      powerTutorialShow(
        "Your guess is sent. Wait for the Secretkeeper.",
        {
          role,
          title: `${meta.label} used`,
          current: 3,
          total: 3,
          compact: true,
          mode: "hide"
        }
      );
    } else {
      powerTutorialShow(
        isGuesser
          ? "Now submit your guess."
          : "Now finish your normal Secretkeeper choice and submit it.",
        {
          role,
          title: `${meta.label} used`,
          current: 3,
          total: 3,
          mode: "hide"
        }
      );
    }

    tutorialContinueMode = "hide";

    if (isGuesser) {
      highlightKeyboardGuesser();
      waitForGuessSubmission(round);
    } else {
      highlightKeyboardSetter();
      waitForSecretSubmission(round);
    }
    return;
  }

  if (round === POWER_TUTORIAL_SEED_ROUND + 1) {
    if (!powerTutorialSkipSent) {
      powerTutorialSkipSent = true;
      powerTutorialShow(
        `Good. Now the jobs will swap so you can see what ${meta.label} feels like from the other side.`,
        {
          role,
          title: `${meta.label}: other side`,
          compact: true,
          mode: "hide"
        }
      );
      sendGameAction({ type: "TUTORIAL_SKIP_TO_RECEIVING" });
    }
    return;
  }

  hideTutorial();
}

function runPowerTutorialReceiving(state, role, meta, powerId, round) {
  const isGuesser = role === "guesser";

  if (round === POWER_TUTORIAL_SEED_ROUND) {
    if (tutorialSubStep === 0) {
      powerTutorialShow(
        `Now you are on the other side. ${powerTutorialCopy(powerId, meta, "receiver")}`,
        {
          role,
          title: `Against ${meta.label}`,
          current: 1,
          total: 2,
          placement: "bottom"
        }
      );
      tutorialContinueMode = "advance";
      return;
    }

    if (isGuesser) {
      prefillPowerTutorialGuesserDraft();

      powerTutorialShow(
        state.pendingGuess
          ? "Your guess is sent. Watch what the power changes."
          : "Submit your guess. Then watch what the power changes.",
        {
          role,
          title: `Against ${meta.label}`,
          current: 2,
          total: 2,
          mode: "hide"
        }
      );
      highlightKeyboardGuesser();
      waitForGuessSubmission(round);
      return;
    }

    if (!state.pendingGuess) {
      powerTutorialShow(
        "Wait for the Guesser's guess. The power will happen during this turn.",
        {
          role,
          title: `Against ${meta.label}`,
          current: 2,
          total: 2,
          compact: true,
          mode: "hide"
        }
      );
      return;
    }

    powerTutorialShow(
      "The power has been used. Make your normal keep-or-change choice now.",
      {
        role,
        title: `Against ${meta.label}`,
        current: 2,
        total: 2,
        mode: "hide"
      }
    );
    highlightDraftRow("setter");
    return;
  }

  if (round === POWER_TUTORIAL_SEED_ROUND + 1) {
    powerTutorialShow(
      `That is ${meta.label}. You saw what it does for the owner and for the other player.`,
      {
        role,
        title: "Power practice done",
        mode: "end"
      }
    );
    tutorialEndNextMode = "tutorial";
    return;
  }

  hideTutorial();
}

function runPowerSummaryTutorial(state) {
  clearHighlights();

  if (tutorialSubStep === 0) {
    powerTutorialShow(
      "This screen shows the guesses, colors, and powers used in the round.",
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

  powerTutorialShow(
    "Tap Next Round. You will swap jobs and try a Secretkeeper power.",
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

function runPowerMatchTutorial(state) {
  clearHighlights();

  if (state.tutorialStage === "power") {
    const meta = window.POWER_METADATA?.[state.tutorialPowerId];
    const label = meta?.label || "the power";
    powerTutorialShow(
      `You now know ${label}: what it does, how to use it, and what the other player sees.`,
      {
        title: "Power practice done",
        mode: "end"
      }
    );
    tutorialEndNextMode = "tutorial";
    return;
  }

  powerTutorialShow(
    "You tried one Guesser power and one Secretkeeper power. You can practice every other power from the Powers screen.",
    {
      title: "Powers done",
      mode: "end"
    }
  );
  tutorialEndNextMode = "quest";
}
