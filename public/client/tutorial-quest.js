// Quest Tutorial: a live, hands-on walk through Power Choice's real
// Guesser quest system. Guesser-only, single round. Power Choice is
// actually ENABLED here (see isPowerChoice() in powerChoiceServer.js,
// which special-cases tutorialStage === "quest") -- the player submits a
// real guess against a real forced example quest, earns a real reward
// choice on success, and picks a real card off the real reward-choice
// modal. tutorialMode.js forces the very first quest to "First Half"
// (HALF_AM: only letters A-P) and seeds it live for the player's first
// guess, instead of the normal every-other-guess cadence.
//
// Kept deliberately ELI5: one short idea per bubble instead of one big
// paragraph covering the whole system (quest count, cadence, reward
// tiers, and the optional disclaimer all at once) -- see tutorial-star.js
// for the same treatment applied there.

function questTutorialShow(text, {
  title = "Quest Tutorial",
  current = null,
  total = null,
  placement = "bottom",
  compact = false,
  mode = "advance",
  visualHtml = "",
  key = null
} = {}) {
  showTutorial(text, {
    title,
    progressCurrent: current,
    progressTotal: total,
    tone: "guesser",
    placement,
    compact,
    mode,
    visualHtml,
    key: key || undefined
  });
}

// This file has no other module-scoped state, so plain top-level `let`s
// (same pattern tutorial-ui.js itself uses for tutorialSubStep etc., and
// tutorial-star.js reuses) are enough -- no IIFE needed to keep them off
// the global object.
let questSessionKey = null;
let questLastSeenAttempts = null;
let questAwaitingAck = false;
let questAckStepThreshold = null;
let questLastResultText = "";
let questOutcome = null; // null | "success" | "fail"
let questLastPendingChoiceId = null;
let questTutorialFinished = false;
let questFinishedText = "";

// A fresh room (new roomId) means a fresh quest -- reset every tracker
// exactly once per session instead of carrying stale state from a
// previous run of this same tutorial into the new one.
function resetQuestSession(state) {
  const key = window.roomId || "quest";
  if (key === questSessionKey) return;

  questSessionKey = key;
  questLastSeenAttempts = Number(state.powerChoice?.inspector?.attempts) || 0;
  questAwaitingAck = false;
  questAckStepThreshold = null;
  questLastResultText = "";
  questOutcome = null;
  questLastPendingChoiceId = state.powerChoice?.pendingChoice?.id || null;
  questTutorialFinished = false;
  questFinishedText = "";
  window.TutorialCore?.setStep(0);
}

function questCardHighlightTarget() {
  return document.querySelector(".pc-current-quest-card") || byId("pcCurrentQuestHost");
}

function questPromptForGuess() {
  questTutorialShow(
    "Enter APPLE, then tap Submit.",
    { title: "Fulfill the quest", mode: "hide" }
  );
  window.TutorialCore.highlight(questCardHighlightTarget());
  window.TutorialCore.setWaiting({ label: "SUBMIT GUESS" });
}

function runQuestTutorial(state, role) {
  const api = window.TutorialCore;
  if (!api) return;

  api.clearHighlights();

  if (role !== "guesser") {
    api.setNextTutorial("star");
    questTutorialShow(
      "Open this tutorial on the Guesser screen.",
      { title: "Wrong role", mode: "end" }
    );
    return;
  }

  resetQuestSession(state);

  // Cleared unconditionally up front -- see tutorial-star.js's identical
  // comment for why: a "waiting" value left over from a previous render
  // (e.g. "fulfill the quest"'s SUBMIT GUESS wait) would otherwise
  // permanently block every later mode:"advance" step's Continue button.
  api.clearWaiting();

  // A real AI opponent is playing along (this isn't scripted), so the
  // round could in principle end before the player reaches a reward
  // milestone -- wrap up gracefully instead of getting stuck.
  if (state.phase === "gameOver") {
    api.setNextTutorial("star");
    questTutorialShow(
      "The round ended, but you saw how quests and rewards work.",
      { title: "Quest Tutorial done", mode: "end" }
    );
    return;
  }

  // Once the quest is resolved (completed or missed), keep showing the
  // same done message on every later render instead of just once -- see
  // tutorial-star.js's identical starTutorialFinished for why: nothing
  // else about this step is "waiting" on anything, so an unrelated state
  // push would otherwise silently fall through to an earlier branch.
  if (questTutorialFinished) {
    api.setNextTutorial("star");
    questTutorialShow(questFinishedText, {
      title: "Quest Tutorial done",
      current: 7,
      total: 7,
      mode: "end"
    });
    api.highlight(questCardHighlightTarget());
    return;
  }

  const step = api.getStep();
  const quest = state.powerChoice?.inspector?.currentQuest;
  const attempts = Number(state.powerChoice?.inspector?.attempts) || 0;
  const pendingChoice = state.powerChoice?.pendingChoice;
  const pendingIsMine = pendingChoice && pendingChoice.role === "guesser";

  // Steps 0-4 are pure narration, one short idea each -- see the file
  // comment for why this replaced a single paragraph covering the whole
  // system at once.
  if (step === 0) {
    questTutorialShow(
      "This is your Quest. It gives your next guess a small rule.",
      { current: 1, total: 7 }
    );
    api.highlight(questCardHighlightTarget());
    api.setMode("advance");
    return;
  }

  if (step === 1) {
    questTutorialShow(
      "Meet the rule to earn a reward.",
      { current: 2, total: 7 }
    );
    api.highlight(questCardHighlightTarget());
    api.setMode("advance");
    return;
  }

  if (step === 2) {
    questTutorialShow(
      "Quests are optional. A normal guess is always allowed.",
      { current: 3, total: 7 }
    );
    api.highlight(questCardHighlightTarget());
    api.setMode("advance");
    return;
  }

  if (step === 3) {
    questTutorialShow(
      `This rule says: ${quest?.description || "Use only letters A through P."}`,
      { current: 4, total: 7 }
    );
    api.highlight(questCardHighlightTarget());
    api.setMode("advance");
    return;
  }

  if (step === 4) {
    questTutorialShow(
      `Tap Highlight A–P to light up useful keys.`,
      { current: 5, total: 7 }
    );
    api.highlight(questCardHighlightTarget());
    api.setMode("advance");
    return;
  }

  // Whatever the last "your guess landed" message said, hold it on screen
  // until the player actively acknowledges it, so a stray state push
  // can't yank it away before they've read it.
  if (questAwaitingAck) {
    if (step >= questAckStepThreshold) {
      questAwaitingAck = false;
      questAckStepThreshold = null;
    } else {
      questTutorialShow(questLastResultText, { mode: "advance" });
      api.highlight(questCardHighlightTarget());
      return;
    }
  }

  // A guess just landed -- this is the one and only guess this tutorial
  // asks for, and it was seeded to be live (see tutorialMode.js), so
  // lastResult reflects a genuine quest evaluation, not a "not live yet"
  // placeholder. Tracked via inspector.attempts, not state.history.length
  // -- a submitted guess is scored against the quest (and attempts/
  // lastResult update) immediately at submission time, well before it's
  // actually appended to history, which only happens once the setter's
  // own following keep/change decision commits the round.
  if (attempts > questLastSeenAttempts) {
    questLastSeenAttempts = attempts;
    const result = state.powerChoice?.inspector?.lastResult;
    const success = !!result?.success;
    questOutcome = success ? "success" : "fail";

    const text = success
      ? "Quest complete! Your reward opens next turn."
      : "Quest missed. The game still continues.";

    questLastResultText = text;
    questAwaitingAck = true;
    questAckStepThreshold = step + 1;

    if (!success) {
      questTutorialFinished = true;
      questFinishedText = "Done! You tried a quest. Meet the rule next time to earn a reward.";
    }

    questTutorialShow(text, { mode: "advance" });
    api.highlight(questCardHighlightTarget());
    return;
  }

  // A reward choice that was pending has now cleared -- the player picked
  // a card. Wrap up here: they've seen the whole loop (quest, fulfill it,
  // pick a reward) live, and in a real match it just keeps repeating with
  // better options on the 2nd and 3rd completions.
  if (questLastPendingChoiceId && !pendingChoice) {
    questLastPendingChoiceId = null;
    questTutorialFinished = true;
    questFinishedText = "Done! You met a quest and picked a reward.";
    api.setNextTutorial("star");
    questTutorialShow(questFinishedText, {
      title: "Quest Tutorial done",
      current: 7,
      total: 7,
      mode: "end"
    });
    api.highlight(questCardHighlightTarget());
    return;
  }

  // A reward choice just opened -- the real modal handles showing and
  // resolving it, so just point at the quest card and explain what's
  // about to happen.
  if (pendingIsMine) {
    questLastPendingChoiceId = pendingChoice.id;
    questTutorialShow(
      "Pick one reward card. It is used right away.",
      { title: "Pick a reward", current: 6, total: 7, mode: "hide" }
    );
    api.highlight(questCardHighlightTarget());
    api.setContinue({ show: false, mode: "hide" });
    return;
  }

  // Quest succeeded but the reward hasn't opened yet -- it only opens once
  // the setter's next decision hands the turn back to the Guesser (see
  // maybeOpenChoice's turn-owner check in powerChoiceServer.js).
  if (questOutcome === "success") {
    questTutorialShow(
      "Waiting for the Secretkeeper...",
      { compact: true, mode: "hide", key: `quest-wait-${attempts}` }
    );
    api.setContinue({ show: false, mode: "hide" });
    return;
  }

  questPromptForGuess();
}

window.runQuestTutorial = runQuestTutorial;
