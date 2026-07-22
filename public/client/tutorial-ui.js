// ------------------------
// Tutorial Controller
// ------------------------
let lastTutorialRound = null;     // state.history.length last processed
let tutorialSubStep = 0;          // sub-step within a round
let tutorialWaitingFor = null;    // { type: "guess", round } or { type: "setSecret", round } or { type: "power", powerId }
let tutorialCollapsed = false;
let tutorialContinueMode = "advance";

function qs(sel) { return document.querySelector(sel); }
function byId(id) { return document.getElementById(id); }

function setContinue({ show = true, enabled = true, mode = "advance" } = {}) {
  const btn = byId("tutorialContinueBtn");
  if (!btn) return;

  btn.style.display = show ? "" : "none";
}

function updateActionBadge() {
  const badge = byId("tutorialActionBadge");
  const continueBtn = byId("tutorialContinueBtn");
  if (!badge || !continueBtn) return;

  const waitingType = tutorialWaitingFor?.type;
  const round = state.history?.length ?? 0;

  // --- Determine correct tutorial word ---
  let word = null;

  if (waitingType === "guess") {
    word = state.tutorialGuesses?.[round];
  }
  else if (waitingType === "setSecret") {
    word = state.tutorialSecrets?.[round];
    if (state.secret === state.tutorialSecrets[round]) {word = "";}
  }

  // --- Determine badge label ---
  let label = "ACTION";

  if (waitingType === "guess" && word) {
    label = `ENTER ${word}`;
  }
  else if (waitingType === "setSecret" && word) {
    label = `ENTER ${word}`;
  }
  else if (waitingType === "power") {
    const meta = window.POWER_METADATA?.[tutorialWaitingFor.powerId];
    label = `USE ${(meta?.label || tutorialWaitingFor.powerId || "").toUpperCase()}`;
  }

  badge.textContent = label;

  const shouldShow = Boolean(waitingType);

  badge.classList.toggle("hidden", !shouldShow);
  continueBtn.textContent = shouldShow ? "Hide" : "Continue";
}


// The bubble is fixed bottom-right, but so is the on-screen keyboard it
// sits above — on short/narrow viewports (common on phones) the two
// overlapped outright, silently eating every tap on the keyboard's bottom
// row (including ENTER) since the bubble painted on top of it. Push the
// bubble up to clear whichever keyboard is actually visible right now,
// recomputed on every show (role/screen can change which keyboard that is)
// and on resize/orientation change.
function repositionTutorialBubble() {
  const bubble = byId("tutorialBubble");
  if (!bubble || bubble.classList.contains("hidden")) return;
  // Collapsed pill needs the same keyboard clearance as the expanded
  // card -- the two only differ in a default fallback below (a shorter
  // clearance is fine for the small pill), never in whether they get one.
  const minClearance = bubble.classList.contains("collapsed") ? 16 : 24;

  const guesserKb = byId("keyboardGuesser");
  const setterKb = byId("keyboardSetter");
  const kb =
    (guesserKb && guesserKb.offsetParent !== null && guesserKb) ||
    (setterKb && setterKb.offsetParent !== null && setterKb) ||
    null;

  if (!kb) {
    bubble.style.bottom = "";
    return;
  }

  const kbTop = kb.getBoundingClientRect().top;
  const clearance = Math.max(minClearance, window.innerHeight - kbTop + 16);
  bubble.style.bottom = `${clearance}px`;
}
window.addEventListener("resize", repositionTutorialBubble);

function showTutorial(text, opts = {}) {
  const bubble = byId("tutorialBubble");
  const textEl = byId("tutorialText");
  if (!bubble || !textEl) return;

  tutorialCollapsed = false;
  bubble.classList.remove("collapsed");
  bubble.classList.remove("hidden");

  textEl.textContent = text;

  // default: show+enabled continue unless caller overrides
  setContinue({ show: true, enabled: true, ...opts });
  repositionTutorialBubble();
}

function hideTutorial() {
  const bubble = byId("tutorialBubble");
  if (!bubble) return;

  tutorialCollapsed = false;
  bubble.classList.add("hidden");
  bubble.classList.remove("collapsed");

  tutorialWaitingFor = null;
  updateActionBadge();
  clearHighlights();
}

function toggleTutorial() {
  const bubble = byId("tutorialBubble");
  if (!bubble) return;
  tutorialCollapsed = !tutorialCollapsed;
  bubble.classList.toggle("collapsed", tutorialCollapsed);
  // Both collapsed and expanded need the live keyboard clearance -- a
  // fixed CSS spot for the collapsed pill used to drift onto the keyboard
  // on short viewports, silently eating taps on its bottom row.
  repositionTutorialBubble();
}

// wiring for collapse/expand
byId("tutorialToggleBtn")?.addEventListener("click", e => {
  e.stopPropagation();
  toggleTutorial();
});
byId("tutorialBubble")?.addEventListener("click", () => {
  if (tutorialCollapsed && tutorialContinueMode != "hide") toggleTutorial();
});

// Highlight helpers
function highlightEl(el) {
  if (!el) return;
  el.classList.add("tutorial-highlight");
}
function highlightKeyboardGuesser() {
  highlightEl(byId("keyboardGuesser")); // <div id="keyboardGuesser" class="keyboard">
}
function highlightHistoryGuesser() {
  highlightEl(byId("historyGuesser"));  // <div id="historyGuesser" ...>
}
function highlightSetterWords() {
  highlightEl(byId("SetterRemainingBox"));
}
function highlightKeyboardSetter() {
  highlightEl(byId("keyboardSetter"));
}
function highlightSetterDraft() {
  highlightEl(byId("draftSetter"));
}
function highlightSetterHistory() {
  highlightEl(byId("setterGuesserSubmitted"));
}
function highlightGuideToggle() {
  highlightEl(byId("guideToggleBtn"));
}
function highlightPowersCol() {
  // Only one of these exists in the DOM for a given role's screen — the
  // other query just no-ops via highlightEl's null guard.
  highlightEl(byId("guesserPowerContainer"));
  highlightEl(byId("setterPowerContainer"));
}
function highlightPowerButtonByText(label) {
  document.querySelectorAll(".power-btn").forEach(btn => {
    if (btn.textContent.trim() === label) highlightEl(btn);
  });
}

function clearHighlights() {
  document.querySelectorAll(".tutorial-highlight")
    .forEach(el => el.classList.remove("tutorial-highlight"));
}
// ------------------------
// Waiting Helpers (Global)
// ------------------------

function waitForGuessSubmission(round) {
  tutorialWaitingFor = { type: "guess", round };
  setContinue({ show: true, enabled: false });
  updateActionBadge();
}

function waitForSecretSubmission(round) {
  tutorialWaitingFor = { type: "setSecret", round };
  setContinue({ show: true, enabled: false });
  updateActionBadge();
}

function waitForPowerUse(powerId) {
  tutorialWaitingFor = { type: "power", powerId };
  setContinue({ show: true, enabled: false });
  updateActionBadge();
}


// Continue click
byId("tutorialContinueBtn")?.addEventListener("click", (e) => {
  if (tutorialContinueMode === "hide") {
    toggleTutorial();
    return;
  }
  if (tutorialWaitingFor) return;
  tutorialSubStep++;
  if (window.state && window.myRole) {
    tutorialSteps(window.state, window.myRole);
  }
});

// Called (via socketClient.js's sendGameAction) the instant the player
// actually fires a USE_<POWER> action the tutorial is waiting on — advances
// immediately rather than waiting for a guess/secret submission that,
// unlike a power activation, wouldn't otherwise change state.history.length
// and so wouldn't naturally re-trigger tutorialSteps() on its own.
function notifyTutorialPowerUsed(powerId) {
  if (!tutorialWaitingFor) return;
  if (tutorialWaitingFor.type === "power" && tutorialWaitingFor.powerId === powerId) {
    tutorialWaitingFor = null;
    updateActionBadge();
    tutorialSubStep++;
    if (window.state && window.myRole) tutorialSteps(window.state, window.myRole);
  }
}
window.notifyTutorialPowerUsed = notifyTutorialPowerUsed;

// ------------------------
// Feedback-tile explanation helper (round 1 of the guesser tutorial walks
// through the just-scored guess one tile at a time).
// ------------------------
function tileColorMeaning(symbol) {
  if (symbol === "🟩") return "Green — right letter, right position.";
  if (symbol === "🟨") return "Yellow — right letter, wrong position.";
  return "Grey — this letter isn't in the secret at all.";
}

function describeTutorialTile(entry, index) {
  const guess = (entry?.guess || "").toUpperCase();
  const fb = entry?.fbGuesser || entry?.fb || [];
  const letter = guess[index] || "?";
  const symbol = fb[index] || "⬛";
  return `Tile ${index + 1} — "${letter}": ${symbol} ${tileColorMeaning(symbol)}`;
}

// ------------------------
// Main tutorial logic
// ------------------------
function tutorialSteps(state, role) {
const isGuesser = role === "guesser";
const isSetter  = role === "setter";
  if (state.phase === "Normal" && window.myRole != state.turn){hideTutorial(); return;}
  updateActionBadge();
  if (!state?.isTutorial) {
    lastTutorialRound = null;
    tutorialSubStep = 0;
    tutorialWaitingFor = null;
    hideTutorial();
    return;
  }

  // Only tutorial for guesser side (your described flow)
  const round = state.history?.length ?? 0;
  // round transition => reset substeps unless we are mid-wait for a guess/secret/power
  if (round !== lastTutorialRound) {
    lastTutorialRound = round;
    tutorialSubStep = 0;
    tutorialWaitingFor = null;
    clearHighlights();
  }
  if (state.gameOverView==="round" && state.phase === "gameOver"){
    runSummaryTutorial(state);
    return;
 }
    if (state.gameOverView==="match" && state.phase === "gameOver"){
    runMatchTutorial(state);
    return;
 }
  const aiPlayer = Object.values(state.players || {}).find(p => p.isAI);
  if (aiPlayer?.role === "setter") {
      runGuesserTutorial(state, role);
      return;
    }
  if (aiPlayer?.role === "guesser") {
    runSetterTutorial(state, role);
    return;
  }
}

function runGuesserTutorial(state,role){
 const round = state.history?.length ?? 0;
  clearHighlights();
  const stage2 = state.tutorialStage === 2;

  // ==========================================================
  // STAGE 2 (powers follow-up): same opening CHAMP guess as stage 1, but
  // this time the Inspector has Leak Info (revealGreen) available and is
  // walked through actually using it — the second guess (CUMIN) is the
  // AI's real secret, so it wins the round on the spot.
  // ==========================================================
  if (stage2) {
    if (round === 0) {
      const word = state.tutorialGuesses?.[0] || "CHAMP";
      if (tutorialSubStep === 0) {
        showTutorial(
          `👋 Welcome back! This short follow-up teaches you two powers — one for the Inspector, one for the Spy.`,
          { enabled: true }
        );
        tutorialContinueMode = "advance";
        return;
      }
      if (tutorialSubStep === 1) {
        showTutorial(
          `🔎 You're the Inspector again, and this time you have a power available: 👁️ Leak Info — it reveals one correct letter and its position.`,
          { enabled: true }
        );
        highlightPowersCol();
        tutorialContinueMode = "advance";
        return;
      }
      if (tutorialSubStep === 2) {
        showTutorial(
          `First, enter your opening guess. Enter "${word}" and click ENTER.`,
          { enabled: true, mode: "hide" }
        );
        tutorialContinueMode = "hide";
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
          `Now let's use your power. Click "Leak Info" to reveal one correct letter and where it goes.`,
          { enabled: false }
        );
        highlightPowerButtonByText("Leak Info");
        tutorialContinueMode = "hide";
        waitForPowerUse("revealGreen");
        return;
      }
      if (tutorialSubStep === 1) {
        const word = state.tutorialGuesses?.[1] || "CUMIN";
        showTutorial(
          `Nice — that's a free hint toward the secret. Now enter your second guess: "${word}".`,
          { enabled: true, mode: "hide" }
        );
        highlightKeyboardGuesser();
        tutorialContinueMode = "hide";
        waitForGuessSubmission(round);
        return;
      }
      hideTutorial();
      return;
    }

    if (round === 2) {
      if (tutorialSubStep === 0) {
        showTutorial(
          `From here on, finish this round on your own. Once you find the secret, you'll switch roles and try the Spy's power. Good luck! 🍀`,
          { enabled: true, mode: "hide" }
        );
        tutorialContinueMode = "hide";
        return;
      }
      hideTutorial();
      return;
    }
    return;
  }

  // ==========================================================
  // STAGE 1 (base rules, no powers)
  // ==========================================================

  // ------------------------
  // ROUND 0 (history.length == 0): brief overall rules, then guesser-
  // specific rules, then the first scripted guess ("CHAMP").
  // ------------------------
  if (round === 0) {
    const word = state.tutorialGuesses?.[0] || "CHAMP";
    if (tutorialSubStep === 0) {
      showTutorial(
        `👋 Welcome to Vowel Play! 🕵️ One player is the Spy — they pick a secret 5-letter word. 🔎 The other is the Inspector — they guess it, Wordle-style: 🟩 right letter & spot, 🟨 right letter wrong spot, ⬛ not in the word.`,
        { enabled: true }
      );
      tutorialContinueMode = "advance";
      return;
    }
    if (tutorialSubStep === 1) {
      showTutorial(
        `🏆 The Spy scores a point for every guess it takes the Inspector to find the word. Roles swap each round; lower total score wins. Whenever the tutorial needs YOU to act, you'll see a red ACTION label up top.`,
        { enabled: true }
      );
      tutorialContinueMode = "advance";
      return;
    }
    if (tutorialSubStep === 2) {
      showTutorial(
        `🔎 In this first round, you're the Inspector against a tutorial AI 🤖 Spy. 💡 See this Guide button? Toggle it any time for extra on-screen explanations. Try clicking it now, then continue.`,
        { enabled: true }
      );
      tutorialContinueMode = "advance";
      highlightGuideToggle();
      return;
    }
    if (tutorialSubStep === 3) {
      showTutorial(
        `First, enter your opening guess. Your opponent picks a secret at the same time, without seeing yours. Enter "${word}" and click ENTER.`,
        { enabled: true, mode: "hide"  }
      );
      tutorialContinueMode = "hide";
      highlightKeyboardGuesser();
      waitForGuessSubmission(round);
      return;
    }
  }


  // ------------------------
  // ROUND 1 (history.length == 1): walk through the scored guess tile by
  // tile, then the second scripted guess ("CAIRN").
  // ------------------------
  if (round === 1) {
    const entry = state.history[0];

    if (tutorialSubStep === 0) {
      showTutorial(
        `Let's look at the feedback for your guess, tile by tile.`,
        { enabled: true }
      );
      highlightHistoryGuesser();
      tutorialContinueMode = "advance";
      return;
    }

    if (tutorialSubStep >= 1 && tutorialSubStep <= 5) {
      showTutorial(
        describeTutorialTile(entry, tutorialSubStep - 1),
        { enabled: true }
      );
      highlightHistoryGuesser();
      tutorialContinueMode = "advance";
      return;
    }

    if (tutorialSubStep === 6) {
      showTutorial(
        `After the opener, the Spy sees each guess and can keep their secret or switch — as long as the new word still fits every clue so far.`,
        { enabled: true }
      );
      highlightHistoryGuesser();
      tutorialContinueMode = "advance";
      return;
    }

    if (tutorialSubStep === 7) {
      const word = state.tutorialGuesses?.[1] || "CAIRN";
      showTutorial(
        `Now it's time to enter another guess. Enter "${word}".`,
        { enabled: true, mode: "hide" }
      );
      highlightKeyboardGuesser();
      waitForGuessSubmission(round);
      tutorialContinueMode = "hide";
      return;
    }

    // If somehow beyond, just hide
    hideTutorial();
    return;
  }

  // ------------------------
  // ROUND 2+ : free play from here.
  // ------------------------
  if (round === 2) {
    if (tutorialSubStep === 0) {
      showTutorial(
        `From here on, finish this round on your own. Once you find the secret, you'll switch roles and play as the Spy. Good luck! 🍀`,
        { enabled: true, mode: "hide" }
      );
      tutorialContinueMode = "hide";
      return;
    }

    hideTutorial();
    return;
  }
}

function runSetterTutorial(state, role) {
  const round = state.history?.length ?? 0;
  clearHighlights();
  const stage2 = state.tutorialStage === 2;

  // ==========================================================
  // STAGE 2 (powers follow-up): same BLIMP/LEMUR secrets, but this
  // time the Spy has Redact Report (countOnly) available and is
  // walked through actually using it.
  // ==========================================================
  if (stage2) {
    if (round === 0) {
      const word = state.tutorialSecrets?.[0];
      if (tutorialSubStep === 0) {
        showTutorial(
          `🕵️ Now you're the Spy, with a power of your own available this time: 📄 Redact Report.`,
          { enabled: false }
        );
        highlightPowersCol();
        tutorialContinueMode = "advance";
        return;
      }
      if (tutorialSubStep === 1) {
        showTutorial(
          `In the first round, you enter a secret word — your opponent won't see it. Enter "${word}".`,
          { enabled: false }
        );
        highlightKeyboardSetter();
        tutorialContinueMode = "hide";
        waitForSecretSubmission(round);
        return;
      }
      hideTutorial();
      return;
    }

    if (round === 1) {
      const word = state.tutorialSecrets?.[1];
      if (tutorialSubStep === 0) {
        showTutorial(
          `Let's use your power this turn. Click "Redact Report" — it hides exact tile positions from the Inspector and shows them only how many letters are green or yellow in total.`,
          { enabled: true }
        );
        highlightPowerButtonByText("Redact Report");
        tutorialContinueMode = "hide";
        waitForPowerUse("countOnly");
        return;
      }
      if (tutorialSubStep === 1) {
        showTutorial(
          `Nice — now let's lock in a new secret. Enter "${word}"! After this, finish the round on your own.`,
          { enabled: true, mode: "hide" }
        );
        highlightKeyboardSetter();
        tutorialContinueMode = "hide";
        waitForSecretSubmission(round);
        return;
      }
      hideTutorial();
      return;
    }

    if (round === 2) {
      showTutorial(
        `From here on, play strategically and try to outsmart your opponent.`,
        { enabled: true, mode: "hide" }
      );
      hideTutorial();
      return;
    }
    return;
  }

  // ==========================================================
  // STAGE 1 (base rules, no powers)
  // ==========================================================

  if (round === 0) {
    const word = state.tutorialSecrets?.[0];
    if (tutorialSubStep === 0) {
      showTutorial(
        `🕵️ You're now the Spy — pick a secret word and hide it as long as you can. This role takes more thought, so we'll go through it carefully.`,
        { enabled: false }
      );
      tutorialContinueMode = "advance";
      return;
    }
        if (tutorialSubStep === 1) {
      showTutorial(
        `In the first round, you enter a secret word — your opponent will not see it. Enter "${word}".`,
        { enabled: false }
      );
      highlightKeyboardSetter();
      tutorialContinueMode = "hide";
      waitForSecretSubmission(round);
      return;
    }

    hideTutorial();
    return;
  }

  if (round === 1) {
    const word = state.tutorialSecrets?.[1];

    if (tutorialSubStep === 0) {
      showTutorial(
        `Now two guesses show here — the top one already scored, the one below not yet. Every turn after the first, you'll see the Inspector's guess before deciding whether to keep your secret or change it — generally, change it if that last guess gave away a lot (extra greens/yellows).`,
        { enabled: true }
      );
      highlightHistoryGuesser();
      tutorialContinueMode = "advance";
      return;
    }
    if (tutorialSubStep === 1) {
      showTutorial(
        `Let's switch it up this time. As you type a candidate word here, it colors live tile by tile — a preview of what it would look like as your secret.`,
        { enabled: true }
      );
      highlightSetterDraft();
      tutorialContinueMode = "advance";
      return;
    }
    if (tutorialSubStep === 2) {
      showTutorial(
        `This box shows how a candidate is doing: "Keep: X → Y" is how many secrets would still be possible if you keep your current one; "New: X → Y" is how many if you switch to your draft.`,
        { enabled: true }
      );
      highlightSetterWords();
      tutorialContinueMode = "advance";
      return;
    }
    if (tutorialSubStep === 3) {
      showTutorial(
        `Your secret must be a valid word that still fits every clue so far — if it doesn't, "New" shows a ✕, and the offending letters flash red when you try to submit.`,
        { enabled: true }
      );
      highlightSetterHistory();
      tutorialContinueMode = "advance";
      return;
    }
    if (tutorialSubStep === 4) {
      showTutorial(
        `Let's see that happen. Type "${state.tutorialWrongSecretExamples?.[round] || "MUSHY"}" and press ENTER — it looks fine, but let's see what the game thinks.`,
        { enabled: true }
      );
      highlightKeyboardSetter();
      tutorialContinueMode = "advance";
      return;
    }
    if (tutorialSubStep === 5) {
      showTutorial(
        `See that? It doesn't reproduce the feedback your last guess already got, so it can't be the real secret — the game caught it and explained why. The bigger the remaining count, the harder you are to pin down.`,
        { enabled: true }
      );
      highlightSetterWords();
      tutorialContinueMode = "advance";
      return;
    }
    if (tutorialSubStep === 6) {
      showTutorial(
        `Now let's lock it in for real — enter "${word}"! After this, finish the round on your own.`,
         { enabled: true, mode: "hide" }
      );
      highlightKeyboardSetter();
      tutorialContinueMode = "hide";
      waitForSecretSubmission(round);
      return;
    }

    hideTutorial();
    return;
  }

  if (round === 2) {
    showTutorial(
      `From here on, play strategically and try to outsmart your opponent.`,
      { enabled: true, mode: "hide" }
    );
    hideTutorial();
    return;
  }
}

function runSummaryTutorial(state){
 clearHighlights();
 const stage2 = state.tutorialStage === 2;

    if (tutorialSubStep === 0) {
      showTutorial(
        stage2
          ? `Round 1 done — you just used Leak Info as the Inspector.`
          : `The first round ended. In this tutorial, you tried to guess the secret word, but in a real match, whichever role you play first is randomly determined.`,
        { enabled: true }
      );
      tutorialContinueMode = "advance";
       return;
    }
      if (tutorialSubStep === 1) {
      showTutorial(
        stage2
          ? `Now you'll play the Spy and get to try Redact Report.`
          : `The next round has you play the other role — you'll be the Spy 🕵️, and the tutorial AI will be the Inspector 🔎.`,
        { enabled: true }
      );
      tutorialContinueMode = "advance";
       return;
    }
  if (tutorialSubStep === 2) {
      showTutorial(
        `On this screen, you can see which secret words and guesses each player made, as well as the feedback that was shown and how many secret words remained.`,
        { enabled: true }
      );
      highlightHistoryGuesser();
      tutorialContinueMode = "advance";
      return;
    }
    if (tutorialSubStep === 3) {
      showTutorial(
        `The winner will be the one who used fewer guesses when they had to guess the secret word. Now it is time for the second round - Good luck!`,
        { enabled: true }
      );
      highlightHistoryGuesser();
      tutorialContinueMode = "hide";
      return;
    }
}
function runMatchTutorial(state){
 clearHighlights();
 const stage2 = state.tutorialStage === 2;

 if (stage2) {
   if (tutorialSubStep === 0) {
     showTutorial(
       `That's both powers tried — one from each side! 👁️ Leak Info and 📄 Redact Report are just two of many.`,
       { enabled: true }
     );
     tutorialContinueMode = "advance";
     return;
   }
   if (tutorialSubStep === 1) {
     showTutorial(
       `Check the Powers screen any time from How to Play to see the full list on both sides.`,
       { enabled: true }
     );
     tutorialContinueMode = "advance";
     return;
   }
   if (tutorialSubStep === 2) {
     showTutorial(
       `That's the tutorial! Have fun and good luck out there.`,
       { enabled: true }
     );
     tutorialContinueMode = "hide";
     return;
   }
   hideTutorial();
   return;
 }

    if (tutorialSubStep === 0) {
      showTutorial(
        `The match ended! On this screen, you will see a summary of both rounds and see who won - the player with the fewer guesses!`,
        { enabled: true }
      );
      tutorialContinueMode = "advance";
       return;
    }
    if (tutorialSubStep === 1) {
      showTutorial(
        `If there is a tie, then the player who took less time wins - so be quick!`,
        { enabled: true }
      );
      highlightHistoryGuesser();
      tutorialContinueMode = "advance";
      return;
    }
  if (tutorialSubStep === 2) {
      showTutorial(
        `Try out other games - most matches also give both sides special powers that bend the rules and can really change the game! There's even a follow-up tutorial that walks you through your first two.`,
        { enabled: true }
      );
      tutorialContinueMode = "advance";
      highlightHistoryGuesser();
      return;
    }
    if (tutorialSubStep === 3) {
      showTutorial(
        `For now, thank you for choosing the game and the tutorial is over. Have fun and good luck!`,
        { enabled: true }
      );
      tutorialContinueMode = "hide";
      highlightHistoryGuesser();
      return;
    }
}
window.tutorialSteps = tutorialSteps;
