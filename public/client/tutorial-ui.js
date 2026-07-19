// ------------------------
// Tutorial Controller
// ------------------------
let lastTutorialRound = null;     // state.history.length last processed
let tutorialSubStep = 0;          // sub-step within a round
let tutorialWaitingFor = null;    // { type: "guess", round } or { type: "setSecret", round }
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

  badge.textContent = label;

  const shouldShow = Boolean(waitingType);

  badge.classList.toggle("hidden", !shouldShow);
  continueBtn.textContent = shouldShow ? "Hide" : "Continue";
}


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
function highlightSetterPreview() {
  highlightEl(byId("setterPreview"));
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
  // round transition => reset substeps unless we are mid-wait for a guess/secret
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

  // ------------------------
  // ROUND 0 (history.length == 0): brief overall rules, then guesser-
  // specific rules, then the first scripted guess ("CHAMP").
  // ------------------------
  if (round === 0) {
    const word = state.tutorialGuesses?.[0] || "CHAMP";
    if (tutorialSubStep === 0) {
      showTutorial(
        `👋 Welcome to VS Wordle! Let's walk through how a match works.`,
        { enabled: true }
      );
      tutorialContinueMode = "advance";
      return;
    }
    if (tutorialSubStep === 1) {
      showTutorial(
        `🕵️ One player is the Spy — they pick a secret 5-letter word and try to protect it. 🔎 The other is the Inspector — they try to guess it, Wordle-style: 🟩 right letter & spot, 🟨 right letter, wrong spot, ⬛ not in the word.`,
        { enabled: true }
      );
      tutorialContinueMode = "advance";
      return;
    }
    if (tutorialSubStep === 2) {
      showTutorial(
        `🏆 The Spy scores a point for every guess it takes the Inspector to find the word. Roles swap each round, and whoever has the lower total score wins the match.`,
        { enabled: true }
      );
      tutorialContinueMode = "advance";
      return;
    }
    if (tutorialSubStep === 3) {
      showTutorial(
        `Press Continue whenever you're ready for the next step. Whenever the tutorial needs YOU to act, you'll see a red ACTION label in the header.`,
        { enabled: true }
      );
      tutorialContinueMode = "advance";
      return;
    }
    if (tutorialSubStep === 4) {
      showTutorial(
        `🔎 In this first round, you'll play as the Inspector against a tutorial AI 🤖 playing the Spy.`,
        { enabled: true }
      );
      tutorialContinueMode = "advance";
      return;
    }
    if (tutorialSubStep === 5) {
      showTutorial(
        `💡 See this Guide button? Toggle it any time you want extra on-screen explanations — like why a box is showing certain numbers, or what phase you're in. Try clicking it now, then continue.`,
        { enabled: true }
      );
      tutorialContinueMode = "advance";
      highlightGuideToggle();
      return;
    }
    if (tutorialSubStep === 6) {
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
        `Except for the very first guess, the Spy sees your guess and can choose to keep their secret or switch to a new one — as long as the new word still fits every clue given so far.`,
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
  // ROUND 2+ : the AI kept its secret, then it's free play.
  // ------------------------
  if (round === 2) {
    if (tutorialSubStep === 0) {
      showTutorial(
        `Notice the Spy kept the same secret — smart, since your last guess's feedback didn't force a change.`,
        { enabled: true }
      );
      highlightHistoryGuesser();
      tutorialContinueMode = "advance";
      return;
    }

    if (tutorialSubStep === 1) {
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

  if (round === 0) {
    const word = state.tutorialSecrets?.[0];
    if (tutorialSubStep === 0) {
      showTutorial(
        `🕵️ You are now the Spy. As the Spy, you pick a secret word and try to hide it as long as you can from the Inspector.`,
        { enabled: false }
      );
      tutorialContinueMode = "advance";
      return;
    }
        if (tutorialSubStep === 1) {
      showTutorial(
        `This role is more complicated, and we'll go through it carefully so you know exactly how to play it well.`,
        { enabled: false }
      );
      tutorialContinueMode = "advance";
      return;
    }
        if (tutorialSubStep === 2) {
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
        `Now two guesses are shown here — the first at the top, already scored, and the second below, not yet scored. Every turn after the first, you'll see the Inspector's guess before deciding whether to keep your secret or change it.`,
        { enabled: true }
      );
      highlightHistoryGuesser();
      tutorialContinueMode = "advance";
      return;
    }
    if (tutorialSubStep === 1) {
      showTutorial(
        `Generally, you'll want to change your secret if your last guess gave away a lot of new information — extra greens or yellows.`,
        { enabled: true }
      );
      tutorialContinueMode = "advance";
      return;
    }
    if (tutorialSubStep === 2) {
      showTutorial(
        `Let's switch it up this time. This is the preview — it shows what feedback the Inspector would see for a candidate word, before you commit to it.`,
        { enabled: true }
      );
      highlightSetterPreview();
      tutorialContinueMode = "advance";
      return;
    }
    if (tutorialSubStep === 3) {
      showTutorial(
        `Try typing a word into the draft now — you'll see live feedback as you type. Don't submit it yet.`,
        { enabled: true }
      );
      highlightSetterDraft();
      tutorialContinueMode = "advance";
      return;
    }
    if (tutorialSubStep === 4) {
      showTutorial(
        `Your secret must be a valid word from the allowed list and must satisfy every clue given by earlier guesses.`,
        { enabled: true }
      );
      highlightSetterHistory();
      tutorialContinueMode = "advance";
      return;
    }
    if (tutorialSubStep === 5) {
      showTutorial(
        `If you submit a word that breaks a clue, the letters that don't fit will flash red — those are the ones to change.`,
        { enabled: true }
      );
      highlightSetterDraft();
      tutorialContinueMode = "advance";
      return;
    }
    if (tutorialSubStep === 6) {
      showTutorial(
        `This box tells you how a candidate is doing. The number on the left is how many secrets were possible last round.`,
        { enabled: true }
      );
      highlightSetterWords();
      tutorialContinueMode = "advance";
      return;
    }
    if (tutorialSubStep === 7) {
      showTutorial(
        `The middle number shows how many remain if you keep your current secret.
The right number shows how many would remain if you switch to the drafted word.`,
        { enabled: true }
      );
      highlightSetterWords();
      tutorialContinueMode = "advance";
      return;
    }
    if (tutorialSubStep === 8) {
      showTutorial(
        `The bigger that remaining count, the harder you are to pin down. With time, you can try a few drafts to find the word that leaves you the most options!`,
        { enabled: true }
      );
      highlightSetterWords();
      tutorialContinueMode = "advance";
      return;
    }
    if (tutorialSubStep === 9) {
      showTutorial(
        `Now let's lock it in — enter "${word}"! After this, finish the round on your own.`,
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

    if (tutorialSubStep === 0) {
      showTutorial(
        `The first round ended. In this tutorial, you tried to guess the secret word, but in a real match, whichever role you play first is randomly determined.`,
        { enabled: true }
      );
      tutorialContinueMode = "advance";
       return;
    }
      if (tutorialSubStep === 1) {
      showTutorial(
        `The next round has you play the other role — you'll be the Spy 🕵️, and the tutorial AI will be the Inspector 🔎.`,
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
        `Try out other games - most matches also give both sides special powers that bend the rules and can really change the game!`,
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
