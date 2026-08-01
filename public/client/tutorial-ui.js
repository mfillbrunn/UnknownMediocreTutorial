// ------------------------
// Tutorial Controller
// ------------------------
let lastTutorialRound = null;     // state.history.length last processed
let tutorialSubStep = 0;          // sub-step within a round
let tutorialWaitingFor = null;    // { type: "guess", round } or { type: "setSecret", round } or { type: "power", powerId }
let tutorialCollapsed = false;
let tutorialContinueMode = "advance";

// STAGE "power" only (see runPowerTutorial* below): guards against
// re-firing a one-shot side effect (pre-filling the guesser's draft,
// sending the teaching->receiving skip action) on every re-render of the
// same seeded round/substep, not just the first. Reset alongside the
// other per-round tutorial state whenever state.history.length changes.
let powerTutorialDraftPrefilled = false;
let powerTutorialSkipSent = false;

// A round moving forward means a guess/secret just got scored -- the
// tile-flip reveal (staggered per tile, ~2s, plus a ~420ms slide first for
// the setter's own view of it -- see client.js's slideRowIntoPlace/
// FLIP_TOTAL_MS) is still painting colors on screen for a couple of
// seconds after the server already considers the round done. Rendering a
// popup about "here's your feedback" the instant the state update lands
// used to read as out of sync with what's actually visible -- gate
// forward round transitions behind this same wait instead, matching how
// long the reveal actually takes.
const TUTORIAL_REVEAL_WAIT_MS = 2500;
let tutorialRevealGateRound = null;
let tutorialRevealGateTimer = null;

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

  // Already submitted -- just waiting on the opponent now (the Spy
  // hasn't reacted to a pending guess yet, or during the simultaneous
  // opening the other side hasn't submitted their half yet either).
  // state.history.length doesn't move until they act, so without this
  // the badge would keep asking for an action that's already done,
  // reading as duplicated/stuck rather than "your turn is over, wait".
  // simultaneousGuessSubmitted/simultaneousSecretSubmitted only mean
  // anything while state.phase is actually "simultaneous" -- they're
  // never reset back to false once that phase ends, so checking them
  // unscoped kept reporting "already submitted" for every later round's
  // normal-phase guess too.
  const alreadyWaiting =
    (waitingType === "guess" && (
      (state.phase === "normal" && !!state.pendingGuess) ||
      (state.phase === "simultaneous" && !!state.simultaneousGuessSubmitted)
    )) ||
    (waitingType === "setSecret" && state.phase === "simultaneous" && !!state.simultaneousSecretSubmitted);

  // --- Determine badge label ---
  let label = "ACTION";

  if (alreadyWaiting) {
    label = "WAITING…";
  }
  else if (waitingType === "guess" && word) {
    label = `ENTER ${word}`;
  }
  else if (waitingType === "setSecret" && word) {
    label = `ENTER ${word}`;
  }
  // No specific scripted word to call out (e.g. the per-power "Try it"
  // tutorial's pre-filled draft, submitted as-is) -- a plain "SUBMIT" beats
  // the generic "ACTION" fallback below without inventing a word nobody
  // actually needs to type.
  else if (waitingType === "guess" || waitingType === "setSecret") {
    label = "SUBMIT";
  }
  else if (waitingType === "power") {
    const meta = window.POWER_METADATA?.[tutorialWaitingFor.powerId];
    label = `USE ${(meta?.label || tutorialWaitingFor.powerId || "").toUpperCase()}`;
  }
  else if (waitingType === "notes") {
    label = "OPEN NOTES";
  }
  else if (waitingType === "rejectedSecret") {
    label = "TRY PICKY";
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
// Highlights just the most recent row, not the whole scrollable box --
// container.lastElementChild is always the newest .history-row-wrap since
// renderHistory only ever appends new rows in order (ui/history.js).
function highlightHistoryGuesser() {
  highlightEl(byId("historyGuesser")?.lastElementChild);
}
function highlightKeyboardSetter() {
  highlightEl(byId("keyboardSetter"));
}
function highlightSetterHistory() {
  highlightEl(byId("setterGuesserSubmitted")?.lastElementChild);
}
// Each role's live screen has its own guide button in its own header
// (guideToggleBtnSetter / guideToggleBtnGuesser) -- the top-level
// #guideToggleBtn in the outer app-header is CSS-hidden the entire time
// #setterScreen/#guesserScreen is active (layout.css), so highlighting it
// during actual gameplay highlighted nothing visible.
function highlightGuideToggle(role) {
  highlightEl(byId(role === "setter" ? "guideToggleBtnSetter" : "guideToggleBtnGuesser"));
}
function highlightDraftRow(role) {
  highlightEl(byId(role === "setter" ? "draftSetter" : "draftGuesser"));
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
// Both round- and match-summary tutorials talk about the recap screen --
// #roundSummary is the one shared container summary.js renders either
// into (see renderRoundSummary/renderMatchSummary). The live game's own
// #historyGuesser panel used to get highlighted here instead, which is
// part of a screen that's hidden the whole time the summary is showing.
function highlightRoundSummary() {
  highlightEl(byId("roundSummary"));
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

function waitForRejectedSecret() {
  tutorialWaitingFor = { type: "rejectedSecret" };
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

// Called (via notes.js's toggleNotes) the instant the player actually opens
// their Notes panel -- mirrors notifyTutorialPowerUsed's reasoning, since
// opening Notes doesn't touch state.history.length either.
function notifyTutorialNotesOpened() {
  if (!tutorialWaitingFor) return;
  if (tutorialWaitingFor.type === "notes") {
    tutorialWaitingFor = null;
    updateActionBadge();
    tutorialSubStep++;
    if (window.state && window.myRole) tutorialSteps(window.state, window.myRole);
  }
}
window.notifyTutorialNotesOpened = notifyTutorialNotesOpened;

// Called (via socket-events.js's "errorMessage" handler) the instant the
// setter's attempted secret gets rejected by the server -- same reasoning
// as the two notify functions above, since a rejection doesn't touch
// state.history.length either. Doesn't check which word was attempted or
// why it was rejected -- any rejection while this tutorial step is
// specifically waiting for one demonstrates the same lesson (a new secret
// has to still match every clue given so far).
function notifyTutorialRejectedSecret() {
  if (!tutorialWaitingFor) return;
  if (tutorialWaitingFor.type === "rejectedSecret") {
    tutorialWaitingFor = null;
    updateActionBadge();
    tutorialSubStep++;
    if (window.state && window.myRole) tutorialSteps(window.state, window.myRole);
  }
}
window.notifyTutorialRejectedSecret = notifyTutorialRejectedSecret;

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
    tutorialRevealGateRound = null;
    clearTimeout(tutorialRevealGateTimer);
    hideTutorial();
    return;
  }

  // client.js holds the just-finished game screen up for several extra
  // seconds after a win (tile flip, then a "you found it" popup) before
  // switching to the round/match summary screen -- see its own
  // _gameOverRevealInFlight/FLIP_TOTAL_MS/POPUP_DURATION_MS. That delay is
  // already accounted for over there; without checking it here too, this
  // function would already have `state.gameOverView` and the new
  // (incremented) round by the very first broadcast after the win, and
  // would render the summary tutorial's popup + highlightRoundSummary()
  // straight away -- floating over the still-showing game screen, pointed
  // at a summary box that isn't even on screen yet. client.js calls this
  // function again once it actually flips the screen over, so there's
  // nothing more to do here in the meantime.
  if (window._gameOverRevealInFlight) return;

  // Only tutorial for guesser side (your described flow)
  const round = state.history?.length ?? 0;
  // round transition => reset substeps unless we are mid-wait for a guess/secret/power
  if (round !== lastTutorialRound) {
    const prevRound = lastTutorialRound;
    lastTutorialRound = round;
    tutorialSubStep = 0;
    tutorialWaitingFor = null;
    powerTutorialDraftPrefilled = false;
    powerTutorialSkipSent = false;
    clearHighlights();

    // Moving to a LATER round (not a reset back to 0 for a fresh sub-
    // match/role swap, and not the very first render this page has done)
    // means a guess/secret just got scored -- gate on the reveal actually
    // finishing before rendering this round's first popup. Re-entrant
    // calls to tutorialSteps() that land while this timer is still
    // running (more state broadcasts can easily arrive in ~2.5s) just
    // hit the tutorialRevealGateRound check below and no-op. Skipped
    // when heading into gameOver -- that transition already waited out
    // the reveal (and then some, for the found-secret popup too) up in
    // the window._gameOverRevealInFlight check above, so gating again
    // here would just be a second, redundant wait stacked on top.
    if (prevRound !== null && round > prevRound && state.phase !== "gameOver") {
      tutorialRevealGateRound = round;
      clearTimeout(tutorialRevealGateTimer);
      showTutorial(`Let's see how that went…`, { enabled: false });
      setContinue({ show: false });
      tutorialRevealGateTimer = setTimeout(() => {
        if (tutorialRevealGateRound !== round) return;
        tutorialRevealGateRound = null;
        if (window.state && window.myRole) tutorialSteps(window.state, window.myRole);
      }, TUTORIAL_REVEAL_WAIT_MS);
    }
  }
  if (tutorialRevealGateRound === round) return;
  if (state.gameOverView==="round" && state.phase === "gameOver"){
    runSummaryTutorial(state);
    return;
 }
    if (state.gameOverView==="match" && state.phase === "gameOver"){
    runMatchTutorial(state);
    return;
 }

  if (state.tutorialStage === "power") {
    runPowerTutorial(state, role);
    return;
  }

  if (state.tutorialStage === "advanced") {
    runAdvancedTutorial(state, role);
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

  // STAGE 2 (powers follow-up): same opening CHAMP guess as stage 1, but
  // this time the Inspector has Letter Peek (revealGreen) available and is
  // walked through actually using it — the second guess (CUMIN) is the
  // AI's real secret, so it wins the round on the spot.
  if (stage2) {
    if (round === 0) {
      const word = state.tutorialGuesses?.[0] || "CHAMP";
      if (tutorialSubStep === 0) {
        showTutorial(
          `Welcome back! This short follow-up teaches you two powers — one for the Inspector, one for the Spy.`,
          { enabled: true }
        );
        tutorialContinueMode = "advance";
        return;
      }
      if (tutorialSubStep === 1) {
        showTutorial(
          `You're the Inspector again, and this time you have a power available: Letter Peek — it reveals one correct letter and its position.`,
          { enabled: true }
        );
        highlightPowersCol();
        tutorialContinueMode = "advance";
        return;
      }
      if (tutorialSubStep === 2) {
        // Waits on the Spy to also submit their opening secret
        // (simultaneous phase) -- see the matching comment on the base
        // tutorial's CHAMP step.
        if (state.simultaneousGuessSubmitted) {
          showTutorial(`Waiting for the Spy to finish picking their secret…`, { enabled: false });
        } else {
          showTutorial(
            `First, enter your opening guess. Enter "${word}" and click ENTER.`,
            { enabled: true, mode: "hide" }
          );
        }
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
          `Now let's use your power. Click "Letter Peek" to reveal one correct letter and where it goes.`,
          { enabled: false }
        );
        highlightPowerButtonByText("Letter Peek");
        tutorialContinueMode = "hide";
        waitForPowerUse("revealGreen");
        return;
      }
      if (tutorialSubStep === 1) {
        const word = state.tutorialGuesses?.[1] || "CUMIN";
        // Waits on the Spy's reaction once submitted -- see the matching
        // comment on the base tutorial's CAIRN step.
        if (state.pendingGuess) {
          showTutorial(`Waiting for the Spy to react to "${word}"…`, { enabled: false });
        } else {
          showTutorial(
            `Nice — that's a free hint toward the secret. Now enter your second guess: "${word}".`,
            { enabled: true, mode: "hide" }
          );
        }
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
          `From here on, finish this round on your own. Once you find the secret, you'll switch roles and try the Spy's power. Good luck!`,
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

  // STAGE 1 (base rules, no powers)

  // ------------------------
  // ROUND 0 (history.length == 0): brief overall rules, then guesser-
  // specific rules, then the first scripted guess ("CHAMP").
  // ------------------------
  if (round === 0) {
    const word = state.tutorialGuesses?.[0] || "CHAMP";
    if (tutorialSubStep === 0) {
      showTutorial(
        `This is Vowel Play — a competitive word game where you outplay your opponent.`,
        { enabled: true }
      );
      tutorialContinueMode = "advance";
      return;
    }
    if (tutorialSubStep === 1) {
      showTutorial(
        `You take on one of two roles: the Spy or the Inspector. Archenemies!`,
        { enabled: true }
      );
      tutorialContinueMode = "advance";
      return;
    }
    if (tutorialSubStep === 2) {
      showTutorial(
        `You play both roles once per match. The Spy picks a secret word; the Inspector has to guess it as fast as possible.`,
        { enabled: true }
      );
      tutorialContinueMode = "advance";
      return;
    }
    if (tutorialSubStep === 3) {
      showTutorial(
        `Whoever survives longer as the Spy wins the match.`,
        { enabled: true }
      );
      tutorialContinueMode = "advance";
      return;
    }
    if (tutorialSubStep === 4) {
      showTutorial(
        `Let's start with the Inspector. Each round you guess a 5-letter word — it's compared to the Spy's secret, and you get feedback on how close you were.`,
        { enabled: true }
      );
      tutorialContinueMode = "advance";
      return;
    }
    if (tutorialSubStep === 5) {
      // Once submitted, this keeps re-rendering while it waits on the Spy
      // to also submit their opening secret (simultaneous phase) --
      // without branching here it'd keep asking for a word that's
      // already typed in.
      if (state.simultaneousGuessSubmitted) {
        showTutorial(`Waiting for the Spy to finish picking their secret…`, { enabled: false });
      } else {
        showTutorial(
          `This is the keyboard. Type a 5-letter word to start: "${word}".`,
          { enabled: true, mode: "hide"  }
        );
      }
      tutorialContinueMode = "hide";
      highlightKeyboardGuesser();
      waitForGuessSubmission(round);
      return;
    }
  }


  // ------------------------
  // ROUND 1 (history.length == 1): the scored guess, then the second
  // scripted guess ("CAIRN").
  // ------------------------
  if (round === 1) {
    if (tutorialSubStep === 0) {
      showTutorial(
        `Nice — while you typed your guess, the Spy was typing their secret too. Now you can see how you did.`,
        { enabled: true }
      );
      highlightHistoryGuesser();
      tutorialContinueMode = "advance";
      return;
    }

    if (tutorialSubStep === 1) {
      showTutorial(
        `Green means that letter is correct — right letter, right spot.`,
        { enabled: true }
      );
      highlightHistoryGuesser();
      tutorialContinueMode = "advance";
      return;
    }

    if (tutorialSubStep === 2) {
      showTutorial(
        `Yellow means that letter is in the secret, just not there — try it somewhere else.`,
        { enabled: true }
      );
      highlightHistoryGuesser();
      tutorialContinueMode = "advance";
      return;
    }

    if (tutorialSubStep === 3) {
      showTutorial(
        `Grey means that letter isn't in the secret at all.`,
        { enabled: true }
      );
      highlightHistoryGuesser();
      tutorialContinueMode = "advance";
      return;
    }

    if (tutorialSubStep === 4) {
      showTutorial(
        `Time for your next guess — use the feedback to narrow it down.`,
        { enabled: true }
      );
      highlightHistoryGuesser();
      tutorialContinueMode = "advance";
      return;
    }

    if (tutorialSubStep === 5) {
      const word = state.tutorialGuesses?.[1] || "CAIRN";
      // Once submitted, this re-renders every state update while it
      // waits on the Spy's reaction (state.history.length doesn't move
      // until then) -- without branching here, "Try CAIRN" would keep
      // showing next to the CAIRN row that's already sitting there
      // pending, reading as a duplicated, already-done request.
      if (state.pendingGuess) {
        showTutorial(
          `Waiting for the Spy to react to "${word}"…`,
          { enabled: false }
        );
      } else {
        showTutorial(
          `Try "${word}". You don't have to reuse letters you know are right — sometimes it's even better not to.`,
          { enabled: true, mode: "hide" }
        );
      }
      highlightKeyboardGuesser();
      waitForGuessSubmission(round);
      tutorialContinueMode = "hide";
      return;
    }

    hideTutorial();
    return;
  }

  // ------------------------
  // ROUND 2+ : free play from here.
  // ------------------------
  if (round === 2) {
    if (tutorialSubStep === 0) {
      showTutorial(
        `There's more to the game, but for now, try to finish this round on your own.`,
        { enabled: true }
      );
      tutorialContinueMode = "advance";
      return;
    }
    if (tutorialSubStep === 1) {
      showTutorial(
        `One tip: the Spy likes well-spiced food.`,
        { enabled: true }
      );
      tutorialContinueMode = "advance";
      return;
    }
    if (tutorialSubStep === 2) {
      showTutorial(
        `Now this is the base game for the Inspector. Try to finish the rest of the round in a similar way.`,
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

  // STAGE 2 (powers follow-up): same BLIMP/LEMUR secrets, but this
  // time the Spy has Counts Only (countOnly) available and is
  // walked through actually using it.
  if (stage2) {
    if (round === 0) {
      const word = state.tutorialSecrets?.[0];
      if (tutorialSubStep === 0) {
        showTutorial(
          `Now you're the Spy, with a power of your own available this time: Counts Only.`,
          { enabled: false }
        );
        highlightPowersCol();
        tutorialContinueMode = "advance";
        return;
      }
      if (tutorialSubStep === 1) {
        // Waits on the Inspector to also submit their opening guess
        // (simultaneous phase) once this is submitted.
        if (state.simultaneousSecretSubmitted) {
          showTutorial(`Waiting for the Inspector to finish their opening guess…`, { enabled: false });
        } else {
          showTutorial(
            `In the first round, you enter a secret word — your opponent won't see it. Enter "${word}".`,
            { enabled: false }
          );
        }
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
          `Let's use your power this turn. Click "Counts Only" — it hides exact tile positions from the Inspector and shows them only how many letters are green or yellow in total.`,
          { enabled: true }
        );
        highlightPowerButtonByText("Counts Only");
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

  // STAGE 1 (base rules, no powers)

  if (round === 0) {
    const word = state.tutorialSecrets?.[0];
    if (tutorialSubStep === 0) {
      showTutorial(
        `Now you'll play the Spy — evade the Inspector as long as you can.`,
        { enabled: true }
      );
      tutorialContinueMode = "advance";
      return;
    }
    if (tutorialSubStep === 1) {
      // Waits on the Inspector to also submit their opening guess
      // (simultaneous phase) once this is submitted -- state.history
      // doesn't move until both sides are in, so without this the prompt
      // would keep asking for a secret that's already picked.
      if (state.simultaneousSecretSubmitted) {
        showTutorial(`Waiting for the Inspector to finish their opening guess…`, { enabled: false });
      } else {
        showTutorial(
          `First, pick a secret word your opponent won't see. How about "${word}"?`,
          { enabled: false }
        );
      }
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
        `The Inspector's first guess is in — here's the feedback, same as you saw before.`,
        { enabled: true }
      );
      highlightSetterHistory();
      tutorialContinueMode = "advance";
      return;
    }
    if (tutorialSubStep === 1) {
      showTutorial(
        `Their next guess is shown above before it's scored — that's your edge: you react to it first.`,
        { enabled: true }
      );
      // The pending (not-yet-scored) guess renders as the top row inside
      // the draft area, not the settled history list above it -- see
      // draftrow.js/renderDraftRows, whose pending row it appends is a
      // child of the same container as the setter's own draft tiles.
      highlightDraftRow("setter");
      tutorialContinueMode = "advance";
      return;
    }
    if (tutorialSubStep === 2) {
      showTutorial(
        `You can keep your secret, or switch — but a new word must still match every clue you've given so far. Type PICKY and hit Enter — watch it get rejected.`,
        { enabled: false }
      );
      highlightKeyboardSetter();
      tutorialContinueMode = "hide";
      waitForRejectedSecret();
      return;
    }
    if (tutorialSubStep === 3) {
      showTutorial(
        `Now lock in a real new secret that does fit: enter "${word}".`,
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
    if (tutorialSubStep === 0) {
      showTutorial(
        `See that? You gave away less than before — but the longer the round goes, the fewer words you'll have left to hide behind.`,
        { enabled: true }
      );
      tutorialContinueMode = "advance";
      return;
    }
    if (tutorialSubStep === 1) {
      showTutorial(
        `This box shows how many words remain for you.`,
        { enabled: true }
      );
      highlightEl(byId("SetterRemainingBox"));
      tutorialContinueMode = "advance";
      return;
    }
    if (tutorialSubStep === 2) {
      showTutorial(
        `First number: how many were left last turn. Second: how many remain if you keep your secret. Third: how many remain if you switch to what you typed.`,
        { enabled: true }
      );
      highlightEl(byId("SetterRemainingBox"));
      tutorialContinueMode = "advance";
      return;
    }
    if (tutorialSubStep === 3) {
      showTutorial(
        `If a word isn't possible — it doesn't fit the feedback, or isn't valid — you'll see an X.`,
        { enabled: true }
      );
      tutorialContinueMode = "advance";
      return;
    }
    if (tutorialSubStep === 4) {
      showTutorial(
        `A great Spy tries different words to make that number as large as possible.`,
        { enabled: true }
      );
      tutorialContinueMode = "advance";
      return;
    }
    if (tutorialSubStep === 5) {
      showTutorial(
        `You know everything you need now. Finish the round on your own — good luck! I'll see you at the end.`,
        { enabled: true, mode: "hide" }
      );
      tutorialContinueMode = "hide";
      return;
    }
    hideTutorial();
    return;
  }
}

// STAGE "power": the per-power "Try it" tutorial (Power Library "?"
// buttons). Drops straight into a mid-match scenario instead of scripting
// a full game from scratch -- two rounds already in the history, one live
// turn ready to go (see tutorialMode.js's seedPowerTutorialRound for the
// server half of this). Round 1 has the human use the power themselves in
// its native role ("teaching"); round 2, after a role swap the tutorial
// itself triggers (TUTORIAL_SKIP_TO_RECEIVING, once the teaching side's
// one demonstrated exchange is done), has the AI use the SAME power
// against the human instead ("receiving") -- see runAI.js's maybeUsePower
// for the server-side half of that. Which of the two is showing is just
// role === the power's own role, since roles genuinely swap between the
// rounds -- no need to track round index separately.
const POWER_TUTORIAL_SEED_ROUND = 2; // matches seedPowerTutorialRound's 2 fabricated history rows
const POWER_TUTORIAL_GUESSER_DRAFT = "SNORE";

// Pre-fills the guesser's draft with a real, submittable word so their
// only remaining action is ENTER -- once per seeded round (guarded by
// powerTutorialDraftPrefilled, reset alongside the rest of the per-round
// tutorial state in tutorialSteps), not on every re-render of the same
// substep, which would otherwise stomp anything the player had already
// started editing.
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
  if (!powerId || !meta) { hideTutorial(); return; }

  const powerRole = meta.role === "setter" ? "setter" : "guesser";
  if (role === powerRole) {
    runPowerTutorialTeaching(state, role, meta, powerId, round);
  } else {
    runPowerTutorialReceiving(state, role, meta, powerId, round);
  }
}

function runPowerTutorialTeaching(state, role, meta, powerId, round) {
  const isGuesser = role === "guesser";

  if (round === POWER_TUTORIAL_SEED_ROUND) {
    if (tutorialSubStep === 0) {
      showTutorial(
        `Let's try out ${meta.label}. ${meta.desc}`,
        { enabled: true }
      );
      tutorialContinueMode = "advance";
      return;
    }
    // Quests are always-on for the Inspector regardless of which power is
    // being taught -- worth a mention exactly once, whichever round this
    // human happens to be playing guesser in (see runPowerTutorialReceiving
    // for the other half of this same check).
    if (isGuesser && tutorialSubStep === 1) {
      showTutorial(
        `One more thing: as the Inspector, you also always have a Quest active — a visible challenge shown next to your powers that rewards a free green letter when completed. Check the Powers screen any time for the full list and example words.`,
        { enabled: true }
      );
      tutorialContinueMode = "advance";
      return;
    }
    if (tutorialSubStep === (isGuesser ? 2 : 1)) {
      if (isGuesser) prefillPowerTutorialGuesserDraft();
      showTutorial(`Tap "${meta.label}" to activate it.`, { enabled: false });
      highlightPowerButtonByText(meta.label);
      tutorialContinueMode = "hide";
      waitForPowerUse(powerId);
      return;
    }
    if (tutorialSubStep === (isGuesser ? 3 : 2)) {
      // The guesser's submission waits on the Spy's reaction -- the
      // setter's doesn't (submitting a secret IS what scores the round,
      // no separate opponent step follows), so only the guesser side
      // needs a waiting variant here.
      if (isGuesser && state.pendingGuess) {
        showTutorial(`Waiting for the Spy to react…`, { enabled: false });
      } else {
        showTutorial(
          isGuesser ? "Now submit your guess." : "Now submit to lock it in.",
          { enabled: false }
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
    hideTutorial();
    return;
  }

  if (round === POWER_TUTORIAL_SEED_ROUND + 1) {
    // The seeded round is deliberately left unscripted after this one
    // exchange -- nothing guarantees a real win to trigger the normal
    // role-swap on its own, so trigger it directly instead of scripting
    // (or waiting out) one. See normal.js's TUTORIAL_SKIP_TO_RECEIVING
    // handler.
    if (!powerTutorialSkipSent) {
      powerTutorialSkipSent = true;
      showTutorial(
        `That's ${meta.label} from your side! Switching to the RECEIVING end now, so you can see what it looks like from there.`,
        { enabled: false }
      );
      tutorialContinueMode = "hide";
      sendGameAction({ type: "TUTORIAL_SKIP_TO_RECEIVING" });
      return;
    }
    return;
  }

  hideTutorial();
}

function runPowerTutorialReceiving(state, role, meta, powerId, round) {
  const isGuesser = role === "guesser";

  if (round === POWER_TUTORIAL_SEED_ROUND) {
    // Setter power: the guess the human is about to submit is real (the
    // setter -- the AI, who now holds the power -- reacts to it for
    // real right after), so there's nothing to wait on before letting
    // them submit.
    if (isGuesser) {
      if (tutorialSubStep === 0) {
        showTutorial(
          `Roles just swapped! Now watch what it's like when your opponent uses ${meta.label} against YOU.`,
          { enabled: true }
        );
        tutorialContinueMode = "advance";
        return;
      }
      if (tutorialSubStep === 1) {
        showTutorial(
          `One more thing: as the Inspector, you also always have a Quest active — a visible challenge shown next to your powers that rewards a free green letter when completed. Check the Powers screen any time for the full list and example words.`,
          { enabled: true }
        );
        tutorialContinueMode = "advance";
        return;
      }
      if (tutorialSubStep === 2) {
        prefillPowerTutorialGuesserDraft();
        showTutorial(
          state.pendingGuess ? `Waiting for the Spy to react…` : `Submit your guess.`,
          { enabled: false }
        );
        highlightKeyboardGuesser();
        tutorialContinueMode = "hide";
        waitForGuessSubmission(round);
        return;
      }
      hideTutorial();
      return;
    }

    // Guesser power: the AI holds it now, and has to genuinely use it and
    // submit a guess before there's anything for the human (setter) to
    // react to -- no button of the human's own to tap here, just a beat
    // of watching before their own (now unscripted) reaction closes out
    // the round.
    if (!state.pendingGuess) {
      showTutorial(
        `Roles just swapped! Watch what happens when your opponent uses ${meta.label} against you...`,
        { enabled: false }
      );
      tutorialContinueMode = "hide";
      return;
    }
    showTutorial(
      `Your opponent just used ${meta.label}! React normally to finish the round.`,
      { enabled: false }
    );
    tutorialContinueMode = "hide";
    // What they're reacting to is the pending guess, which renders in the
    // draft area (see draftrow.js), not the settled history list.
    highlightDraftRow("setter");
    return;
  }

  if (round === POWER_TUTORIAL_SEED_ROUND + 1) {
    if (tutorialSubStep === 0) {
      showTutorial(
        `That's ${meta.label} in action! You've now seen it from both sides.`,
        { enabled: true }
      );
      tutorialContinueMode = "advance";
      return;
    }
    hideTutorial();
    return;
  }

  hideTutorial();
}

// STAGE "advanced": the UI-features walkthrough (Guide, Drag & Lock,
// Power UI) launched from the standalone "Advanced Tutorial" menu button.
// Reuses stage 2's exact scripted match (see tutorialMode.js) -- round 1 has
// the human as Inspector (Guide + Letter Peek + Drag & Lock on their
// guess row), round 2 (after the normal end-of-round role swap) has them as
// Spy (Drag & Lock on their secret row + Counts Only).
function runAdvancedTutorial(state, role) {
  if (role === "guesser") {
    runAdvancedTutorialGuesser(state);
  } else {
    runAdvancedTutorialSetter(state);
  }
}

function runAdvancedTutorialGuesser(state) {
  const round = state.history?.length ?? 0;

  if (round === 0) {
    if (tutorialSubStep === 0) {
      showTutorial(
        `Welcome to the Advanced Tutorial! This covers three UI features the basic tutorial skips: Guide, Drag & Lock, and the Power UI. Let's try each hands-on, starting as the Inspector.`,
        { enabled: true }
      );
      tutorialContinueMode = "advance";
      return;
    }
    if (tutorialSubStep === 1) {
      showTutorial(
        `This is the Guide toggle — switch it any time for extra on-screen explanations, like why a box shows the numbers it does. Try clicking it, then continue.`,
        { enabled: true }
      );
      highlightGuideToggle("guesser");
      tutorialContinueMode = "advance";
      return;
    }
    if (tutorialSubStep === 2) {
      const word = state.tutorialGuesses?.[0] || "CHAMP";
      // Waits on the Spy to also submit their opening secret
      // (simultaneous phase) once this is submitted.
      if (state.simultaneousGuessSubmitted) {
        showTutorial(`Waiting for the Spy to finish picking their secret…`, { enabled: false });
      } else {
        showTutorial(
          `First, enter your opening guess. Enter "${word}" and click ENTER.`,
          { enabled: true, mode: "hide" }
        );
      }
      highlightKeyboardGuesser();
      tutorialContinueMode = "hide";
      waitForGuessSubmission(round);
      return;
    }
    hideTutorial();
    return;
  }

  if (round === 1) {
    if (tutorialSubStep === 0) {
      showTutorial(
        `Now the Power UI: active powers show up as buttons below your draft row. Tap "Letter Peek" to activate it — a popup will confirm what it revealed, and a small badge nearby lets you find it again later.`,
        { enabled: false }
      );
      highlightPowerButtonByText("Letter Peek");
      tutorialContinueMode = "hide";
      waitForPowerUse("revealGreen");
      return;
    }
    if (tutorialSubStep === 1) {
      const word = state.tutorialGuesses?.[1] || "CUMIN";
      // Waits on the Spy's reaction once submitted.
      if (state.pendingGuess) {
        showTutorial(`Waiting for the Spy to react to "${word}"…`, { enabled: false });
      } else {
        showTutorial(
          `Last one: Drag & Lock. On your own draft row, drag a letter straight from the keyboard onto a tile instead of typing left to right, and tap a filled tile to lock it so Backspace can't touch it. Try it as you enter "${word}".`,
          { enabled: true, mode: "hide" }
        );
      }
      highlightDraftRow("guesser");
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
        `That's all four from the Inspector's side! In a moment your roles will swap and you'll see Drag & Lock and the Power UI again as the Spy.`,
        { enabled: true, mode: "hide" }
      );
      tutorialContinueMode = "hide";
      return;
    }
    hideTutorial();
    return;
  }

  hideTutorial();
}

function runAdvancedTutorialSetter(state) {
  const round = state.history?.length ?? 0;

  if (round === 0) {
    if (tutorialSubStep === 0) {
      showTutorial(
        `Now you're the Spy. Drag & Lock works here too, on your secret row — and Notes will auto-add your current secret for you, so you never lose track of it.`,
        { enabled: true }
      );
      tutorialContinueMode = "advance";
      return;
    }
    if (tutorialSubStep === 1) {
      const word = state.tutorialSecrets?.[0];
      // Waits on the Inspector to also submit their opening guess
      // (simultaneous phase) once this is submitted.
      if (state.simultaneousSecretSubmitted) {
        showTutorial(`Waiting for the Inspector to finish their opening guess…`, { enabled: false });
      } else {
        showTutorial(
          `Try it as you set your secret: drag a letter from the keyboard onto a tile, or tap a filled tile to lock it. Enter "${word}" when ready.`,
          { enabled: false }
        );
      }
      highlightDraftRow("setter");
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
        `The Power UI works the same way on this side. Tap "Counts Only" — it hides exact tile positions from the Inspector and shows them only how many letters are green or yellow in total.`,
        { enabled: true }
      );
      highlightPowerButtonByText("Counts Only");
      tutorialContinueMode = "hide";
      waitForPowerUse("countOnly");
      return;
    }
    if (tutorialSubStep === 1) {
      const word = state.tutorialSecrets?.[1];
      showTutorial(
        `Nice — now lock in your new secret: "${word}".`,
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
      `That's every advanced feature from both sides!`,
      { enabled: true, mode: "hide" }
    );
    hideTutorial();
    return;
  }
}

function runSummaryTutorial(state){
 clearHighlights();
 const stage2 = state.tutorialStage === 2;

    if (stage2) {
      if (tutorialSubStep === 0) {
        showTutorial(
          `Round 1 done — you just used Letter Peek as the Inspector. This recap shows each secret, guess, and the feedback given.`,
          { enabled: true }
        );
        highlightRoundSummary();
        tutorialContinueMode = "advance";
        return;
      }
      if (tutorialSubStep === 1) {
        showTutorial(
          `Next you'll play the Spy and get to try Counts Only. Whoever needs fewer guesses in their round wins the match — good luck!`,
          { enabled: true }
        );
        tutorialContinueMode = "hide";
        return;
      }
      return;
    }

    if (tutorialSubStep === 0) {
      showTutorial(
        `Nice, you found the secret! Here's a quick summary of the round.`,
        { enabled: true }
      );
      highlightRoundSummary();
      tutorialContinueMode = "advance";
      return;
    }
    if (tutorialSubStep === 1) {
      showTutorial(
        `It shows how many guesses you took — that's your opponent's score. Lower is better for them.`,
        { enabled: true }
      );
      tutorialContinueMode = "advance";
      return;
    }
    if (tutorialSubStep === 2) {
      showTutorial(
        `It also shows every guess you made, and what the secret word was.`,
        { enabled: true }
      );
      tutorialContinueMode = "advance";
      return;
    }
    if (tutorialSubStep === 3) {
      showTutorial(
        `Let's continue — click Next Round.`,
        { enabled: true, mode: "hide" }
      );
      tutorialContinueMode = "hide";
      return;
    }
}
function runMatchTutorial(state){
 clearHighlights();
 const stage2 = state.tutorialStage === 2;
 const stagePower = state.tutorialStage === "power";
 const stageAdvanced = state.tutorialStage === "advanced";

 if (stageAdvanced) {
   if (tutorialSubStep === 0) {
     showTutorial(
       `That's the Advanced Tutorial! You've now tried Guide, Drag & Lock, and the Power UI from both sides.`,
       { enabled: true }
     );
     tutorialContinueMode = "advance";
     return;
   }
   if (tutorialSubStep === 1) {
     showTutorial(
       `Head back to How to Play any time to revisit the Rules or Power Library.`,
       { enabled: true }
     );
     tutorialContinueMode = "hide";
     return;
   }
   hideTutorial();
   return;
 }

 if (stagePower) {
   const meta = window.POWER_METADATA?.[state.tutorialPowerId];
   const label = meta?.label || "that power";
   if (tutorialSubStep === 0) {
     showTutorial(
       `That's ${label} from both sides — how you'd use it, and what it looks like when your opponent uses it on you.`,
       { enabled: true }
     );
     tutorialContinueMode = "advance";
     return;
   }
   if (tutorialSubStep === 1) {
     showTutorial(
       `Head back to the Powers screen any time to try another one, or check the full list on both sides.`,
       { enabled: true }
     );
     tutorialContinueMode = "hide";
     return;
   }
   hideTutorial();
   return;
 }

 if (stage2) {
   if (tutorialSubStep === 0) {
     showTutorial(
       `That's both powers tried — one from each side! Letter Peek and Counts Only are just two of many.`,
       { enabled: true }
     );
     tutorialContinueMode = "advance";
     return;
   }
   if (tutorialSubStep === 1) {
     showTutorial(
       `Check the Powers screen any time from How to Play to see the full list on both sides. That's the tutorial — good luck out there!`,
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
        `The game's ended — you've finished your first match of Vowel Play!`,
        { enabled: true }
      );
      tutorialContinueMode = "advance";
       return;
    }
    if (tutorialSubStep === 1) {
      showTutorial(
        `This is the final score. If your opponent needed more guesses than you did, you win!`,
        { enabled: true }
      );
      highlightRoundSummary();
      tutorialContinueMode = "advance";
      return;
    }
    if (tutorialSubStep === 2) {
      showTutorial(
        `Below: every guess, each round's secret, who played which role, and how many words remained.`,
        { enabled: true }
      );
      tutorialContinueMode = "advance";
      return;
    }
    if (tutorialSubStep === 3) {
      showTutorial(
        `That's the base game — there's more to learn next. Have fun!`,
        { enabled: true }
      );
      tutorialContinueMode = "hide";
      return;
    }
}
window.tutorialSteps = tutorialSteps;
