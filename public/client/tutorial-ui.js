// ------------------------
// Tutorial Controller
// ------------------------
let lastTutorialRound = null;     // state.history.length last processed
let tutorialSubStep = 0;          // sub-step within a round
let tutorialWaitingFor = null;    // { type: "guess", round } or { type: "power", powerId }
let tutorialCollapsed = false;
let tutorialContinueMode = "advance"; 

function qs(sel) { return document.querySelector(sel); }
function byId(id) { return document.getElementById(id); }

function setContinue({ show = true, enabled = true, mode = "advance" } = {}) {
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
function highlightSetterPreview() {
  highlightEl(byId("setterPreview")); 
}
function highlightSetterWords() {
  highlightEl(byId("SetterRemainingBox")); 
}
function highlightPowersCol() {
  highlightEl(byId("guesserPowerContainer")); // <div id="guesserPowerContainer" ...>
}
function highlightPowerInfoBtn() {
  highlightEl(byId("powerInfoBtnGuesser"));
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


function highlightPowerButtonByText(label) {
  const btns = document.querySelectorAll(".power-btn");
  btns.forEach(btn => {
    if (btn.textContent.trim() === label) {
      highlightEl(btn);
    }
  });
}
function highlightGuesserBadge() {
  highlightEl(byId("GuesserInfoBadge"));
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
}

function waitForSecretSubmission(round) {
  tutorialWaitingFor = { type: "setSecret", round };
  setContinue({ show: true, enabled: false });
}

function waitForPowerUse(powerId) {
  tutorialWaitingFor = { type: "power", powerId };
  setContinue({ show: true, enabled: false });
}


// Continue click
byId("tutorialContinueBtn")?.addEventListener("click", () => {
  if (tutorialContinueMode === "hide") {
    toggleTutorial();
    return;
  }

  // default behavior
  tutorialSubStep++;
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
const isGuesser = role === state.guesser;
const isSetter  = role === state.setter;
  
  if (!state?.isTutorial) {
    lastTutorialRound = null;
    tutorialSubStep = 0;
    tutorialWaitingFor = null;
    hideTutorial();
    return;
  }

  // Only tutorial for guesser side (your described flow)
  const round = state.history?.length ?? 0;
  // round transition => reset substeps unless we are mid-wait for a power/guess
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
  if (state.roles["AI"]===state.setter) {
      runGuesserTutorial(state, role);
      return;
    }
  if (state.roles["AI"]===state.guesser) {
    runSetterTutorial(state, role);
    return;
  }
}

function runGuesserTutorial(state,role){
 const round = state.history?.length ?? 0;
  clearHighlights();

  // ------------------------
  // ROUND 0 (history.length == 0): initial guess instruction, highlight keyboard
  // ------------------------
  if (round === 0) {
    const word = state.tutorialGuesses?.[0] || "CRANE"; // fallback
    showTutorial(
      `First, you need to enter your initial guess. Your opponent will put a secret word at the same time without seeing yours. Enter "${word}" and click on the ENTER button.`,
      { enabled: true, mode: "hide" } // no continue yet; they must submit the guess
    );
    tutorialContinueMode = "hide";
    highlightKeyboardGuesser();
    waitForGuessSubmission(round);
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
    tutorialContinueMode = "advance";
      return;
    }

    if (tutorialSubStep === 1) {
      showTutorial(
        `Your opponent can change the secret word — but all future secrets must respect constraints from the feedback (e.g., keep greens fixed, include yellows somewhere, and avoid greys).`,
        { enabled: true }
      );
      highlightHistoryGuesser();
      tutorialContinueMode = "advance";
      return;
    }

    if (tutorialSubStep === 2) {
      const word = state.tutorialGuesses?.[1] || "BESTI";
      showTutorial(
        `Now it's time to enter another guess. Enter "${word}". Unlike the secret setter, you can reuse letters you've already guessed, and you can still guess letters that end up not being in the secret.`,
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
  // ROUND 2 (history.length == 2): powers intro, info button, then force Leak Info use, then final guess prompt
  // ------------------------
  if (round === 2) {
    if (tutorialSubStep === 0) {
      showTutorial(
        `The next thing we will show you are powers.`,
        { enabled: true }
      );
      highlightPowersCol();
      tutorialContinueMode = "advance";
      return;
    }

    if (tutorialSubStep === 1) {
      showTutorial(
        `You get randomly selected powers at the beginning of the game. For the Inspector, powers help you guess the word. Each power can only be used once per game, so choose carefully — and you can only use one power per turn.`,
        { enabled: true }
      );
      highlightPowersCol();
      tutorialContinueMode = "advance";
      return;
    }

    if (tutorialSubStep === 2) {
      showTutorial(
        `If you need to look up what a power does, click this ? button — you can also see what powers your opponent has.`,
        { enabled: true }
      );
      highlightPowerInfoBtn();
      tutorialContinueMode = "advance";
      return;
    }

    if (tutorialSubStep === 3) {
      showTutorial(
        `Now use the Leak Info power. It will reveal a random letter.`,
        { enabled: false }
      );
      highlightPowerButtonByText("Leak Info");
      waitForPowerUse("revealGreen");
      tutorialContinueMode = "advance";
      return;
    }

    if (tutorialSubStep === 4) {
      const word = state.tutorialGuesses?.[2] || "RODNY";
      showTutorial(
        `Now it's time to enter another guess — "${word}".`,
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
      tutorialContinueMode = "advance";
      return;
    }

    if (tutorialSubStep === 1) {
      showTutorial(
        `This power hides the feedback for each tile and just shows you the number of green and yellow tiles. You see info for powers used here.`,
        { enabled: true }
      );
      highlightGuesserBadge();
      tutorialContinueMode = "advance";
      return;
    }

    if (tutorialSubStep === 2) {
      showTutorial(
        `Remember - this ? button explains powers.`,
        { enabled: true }
      );
      highlightPowerInfoBtn();
      tutorialContinueMode = "advance";
      return;
    }

   if (tutorialSubStep === 3) {
      const word = state.tutorialGuesses?.[2] || "RODNY";
      showTutorial(
        `From here on out, finish the game on your own. After you have guessed the word, you'll play the other side.`,
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
        `You are the Secret Setter. Enter "${word}" as your secret now. Your opponent will not see it.`,
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
    if (tutorialSubStep === 0) {
      showTutorial(
        `Your opponent used the nonsense power- their guess did not have to make sense.`,
        { enabled: true }
      );
      highlightHistoryGuesser();
      tutorialContinueMode = "advance"; 
      return;
    }
  if (tutorialSubStep === 1) {
      showTutorial(
        `You could change your secret word, but no need to worry for now. You can simply use the old word. Click on enter.`,
        { enabled: true, mode: "hide" }
      );
      highlightHistoryGuesser();
      tutorialContinueMode = "hide"; 
      return;
    }
    
  }
    if (round === 2){
      const word = state.tutorialSecrets?.[2];
    if (tutorialSubStep === 0) {
      showTutorial(
        `You can also use powers to make it harder for your opponent. They are different powers but they work the same as for the guesser, so we won't focus on this now.`,
        { enabled: true }
      );
      highlightPowersCol();
      tutorialContinueMode = "advance"; 
      return;
    }
    if (tutorialSubStep === 1) {
      showTutorial(
        `Now you can see here the preview - this shows you what feedback the guesser would see before you entered a word.`,
        { enabled: true }
      );
      highlightSetterPreview();
      tutorialContinueMode = "advance"; 
      return;
    }
      if (tutorialSubStep === 2) {
      showTutorial(
        `If you type in a different word, it will show you the feedback as you type. Try it now - just type any word and you'll see (don't submit it yet).`,
        { enabled: true }
      );
      highlightSetterDraft();
      tutorialContinueMode = "advance"; 
      return;
    }
       if (tutorialSubStep === 3) {
      showTutorial(
        `As mentioned before, your secret word does not only need to be a feasible secret - there is a list! - but also fit all of the feedback you have gotten so far.`,
        { enabled: true }
      );
      highlightSetterHistory();
      tutorialContinueMode = "advance"; 
      return;
    }
    if (tutorialSubStep === 4) {
      showTutorial(
        `To make it easier for you - when you submit a word that doesn't fit the criteria, the letters that are not allowed will flash in red. Those are the ones you need to change.`,
        { enabled: true }
      );
      highlightSetterDraft();
      tutorialContinueMode = "advance"; 
      return;
    }
      if (tutorialSubStep === 5) {
      showTutorial(
        `Now one more thing - this box tells you how well your guess is doing. The number on the left tells you how many secrets were possible last round.`,
        { enabled: true }
      );
      highlightSetterWords();
      tutorialContinueMode = "advance"; 
      return;
    }

    if (tutorialSubStep === 6) {
      showTutorial(
        `The number in the middle shows you how many secrets would remain if you kept your previous secret, the number on the right shows you the number of remaining secrets if do change it.`,
        { enabled: true }
      );
      highlightSetterWords();
      tutorialContinueMode = "advance"; 
      return;
    }
          if (tutorialSubStep === 7) {
      showTutorial(
        `If you have enough time and know the words, you can keep trying out different words until you find the largest number of remaining words. It will likely be the best word!`,
        { enabled: true }
      );
      highlightSetterWords();
      tutorialContinueMode = "advance"; 
      return;
    }
              if (tutorialSubStep === 8) {
      showTutorial(
        `Now enough talk - this is it, let's enter a new secret: "${word}"!`,
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

  if (round > 2) {
    showTutorial(
      `From here on, play strategically and try to outsmart your opponent.`,
      { enabled: true, mode: "hide" }
    );    
    hideTutorial();
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
        `The next round will have you play as the other role. You will have the same power as your opponent just had against you, and they will have your powers.`,
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
        `Try out other games - the powers will vary and there will be a lot of different ones, and they could really change the game!`,
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
