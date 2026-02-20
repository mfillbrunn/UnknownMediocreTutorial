// ------------------------
// Tutorial Controller
// ------------------------
let lastTutorialRound = null;     // state.history.length last processed
let tutorialSubStep = 0;          // sub-step within a round
let tutorialWaitingFor = null;    // { type: "guess", round } or { type: "power", powerId }
let tutorialCollapsed = false;

function qs(sel) { return document.querySelector(sel); }
function byId(id) { return document.getElementById(id); }

function setContinue({ show = true, enabled = true } = {}) {
  const btn = byId("tutorialContinueBtn");
  if (!btn) return;
  btn.style.display = show ? "" : "none";
  btn.disabled = !enabled;
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
  if (tutorialCollapsed) toggleTutorial();
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
function highlightPowersCol() {
  highlightEl(byId("guesserPowerContainer")); // <div id="guesserPowerContainer" ...>
}
function highlightPowerInfoBtn() {
  highlightEl(byId("powerInfoBtnGuesser"));
}
function highlightPowerButton(powerId) {
  highlightEl(qs(`[data-power-id="${powerId}"]`));
}
function highlightGuesserBadge() {
  highlightEl(byId("GuesserInfoBadge"));
}
function clearHighlights() {
  document.querySelectorAll(".tutorial-highlight")
    .forEach(el => el.classList.remove("tutorial-highlight"));
}

// Continue click
byId("tutorialContinueBtn")?.addEventListener("click", () => {
  console.log("Continue clicked");
  console.log("tutorialWaitingFor:", tutorialWaitingFor);

  if (tutorialWaitingFor) {
    console.log("Blocked because waiting");
    return;
  }

  tutorialSubStep++;
  console.log("Advancing to substep:", tutorialSubStep);

  if (window.state && window.myRole) {
    tutorialSteps(window.state, window.myRole);
  }
});


// Optional: call this when the user actually uses a power
function notifyTutorialPowerUsed(powerId) {
  if (!tutorialWaitingFor) return;
  if (tutorialWaitingFor.type === "power" && tutorialWaitingFor.powerId === powerId) {
    tutorialWaitingFor = null;
    tutorialSubStep++; // advance to next message
    if (window.state && window.myRole) tutorialSteps(window.state, window.myRole);
  }
}
window.notifyTutorialPowerUsed = notifyTutorialPowerUsed; // expose if needed

// ------------------------
// Main tutorial logic
// ------------------------
function tutorialSteps(state, role) {
  // stop tutorial if not in tutorial
  if (!state?.isTutorial) {
    lastTutorialRound = null;
    tutorialSubStep = 0;
    tutorialWaitingFor = null;
    hideTutorial();
    return;
  }

  // Only tutorial for guesser side (your described flow)
  // If you want to also guide setter later, remove this guard.
  if (role !== state.guesser) return;

  const round = state.history?.length ?? 0;

  // round transition => reset substeps unless we are mid-wait for a power/guess
  if (round !== lastTutorialRound) {
    lastTutorialRound = round;
    tutorialWaitingFor = null;
    clearHighlights();
  }

  // Helper to wait until a condition changes without letting user "continue" early
  const waitForGuessSubmission = () => {
    tutorialWaitingFor = { type: "guess", round };
    setContinue({ show: true, enabled: false }); // continue disabled: they must act
  };

  const waitForPowerUse = (powerId) => {
    tutorialWaitingFor = { type: "power", powerId };
    setContinue({ show: true, enabled: false });
  };

  clearHighlights();

  // ------------------------
  // ROUND 0 (history.length == 0): initial guess instruction, highlight keyboard
  // ------------------------
  if (round === 0) {
    const word = state.tutorialGuesses?.[0] || "CRANE"; // fallback
    showTutorial(
      `First, you need to enter your initial guess. Your opponent will put a secret word at the same time without seeing yours. Enter "${word}" and click on the ENTER button.`,
      { enabled: false } // no continue yet; they must submit the guess
    );
    highlightKeyboardGuesser();
    waitForGuessSubmission();
    return;
  }

  // ------------------------
  // ROUND 1 (history.length == 1): feedback explanation, then constraints, then next guess prompt
  // ------------------------
  if (round === 1) {
    if (tutorialSubStep === 0) {
      showTutorial(
        `This is where feedback from your guess shows up. You can see which letters were green (correct letter in the correct position), yellow (in the secret but different position), or grey (not in the secret).`,
        { enabled: true }
      );
      highlightHistoryGuesser();
      return;
    }

    if (tutorialSubStep === 1) {
      showTutorial(
        `Your opponent can change the secret word — but all future secrets must respect constraints from the feedback (e.g., keep greens fixed, include yellows somewhere, and avoid greys).`,
        { enabled: true }
      );
      highlightHistoryGuesser();
      return;
    }

    if (tutorialSubStep === 2) {
      const word = state.tutorialGuesses?.[1] || "BESTI";
      showTutorial(
        `Now it's time to enter another guess. Enter "${word}". Unlike the secret setter, you can reuse letters you've already guessed, and you can still guess letters that end up not being in the secret.`,
        { enabled: false }
      );
      highlightKeyboardGuesser();
      waitForGuessSubmission();
      return;
    }

    // If somehow beyond, just hide
    hideTutorial();
    return;
  }

  // ------------------------
  // ROUND 2 (history.length == 2): powers intro, info button, then force Leak Info use, then final guess prompt
  // ------------------------
  if (round === 2) {
    if (tutorialSubStep === 0) {
      showTutorial(
        `The next thing we will show you are powers.`,
        { enabled: true }
      );
      highlightPowersCol();
      return;
    }

    if (tutorialSubStep === 1) {
      showTutorial(
        `You get randomly selected powers at the beginning of the game. For the Inspector, powers help you guess the word. Each power can only be used once per game, so choose carefully — and you can only use one power per turn.`,
        { enabled: true }
      );
      highlightPowersCol();
      return;
    }

    if (tutorialSubStep === 2) {
      showTutorial(
        `If you need to look up what a power does, click this ? button — you can also see what powers your opponent has.`,
        { enabled: true }
      );
      highlightPowerInfoBtn();
      return;
    }

    if (tutorialSubStep === 3) {
      showTutorial(
        `Now use the Leak Info power. It will reveal a random letter.`,
        { enabled: false }
      );
      highlightPowerButton("revealGreen"); // Leak Info in your wording, revealGreen in code
      waitForPowerUse("revealGreen");
      return;
    }

    if (tutorialSubStep === 4) {
      const word = state.tutorialGuesses?.[2] || "RODNY";
      showTutorial(
        `Now it's time to enter a final guess — "${word}".`,
        { enabled: false }
      );
      highlightKeyboardGuesser();
      waitForGuessSubmission();
      return;
    }

    hideTutorial();
    return;
  }

  // ------------------------
  // ROUND 3+ : done
  // ------------------------
   if (round === 3) {
    if (tutorialSubStep === 0) {
      showTutorial(
        `You can see that your opponent also has powers.`,
        { enabled: true }
      );
      highlightHistoryGuesser();
      return;
    }

    if (tutorialSubStep === 1) {
      showTutorial(
        `This power hides the feedback for each tile and just shows you the number of green and yellow tiles. You see info for powers used here.`,
        { enabled: true }
      );
      highlightGuesserBadge();
      return;
    }

    if (tutorialSubStep === 2) {
      showTutorial(
        `Remember - this ? button explains powers.`,
        { enabled: true }
      );
      highlightPowerInfoBtn();
      return;
    }

   if (tutorialSubStep === 3) {
      const word = state.tutorialGuesses?.[2] || "RODNY";
      showTutorial(
        `From here on out, finish the game on your own. After you have guessed the word, you'll play the other side.`,
        { enabled: false }
      );
      return;
    }
    hideTutorial();
    return;
  }
}
window.tutorialSteps = tutorialSteps;
