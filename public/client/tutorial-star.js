// Star Tutorial: a live, hands-on walk through the Secretkeeper's star/charge
// system. Setter-only, single round. Unlike every other tutorial,
// Power Choice is actually ENABLED here (see isPowerChoice() in
// powerChoiceServer.js, which special-cases tutorialStage === "star")
// -- the player types and submits real secrets, earns real stars off
// the real Spyometer, and picks a real reward off the real
// reward-choice modal when they cross a milestone. tutorialMode.js
// seeds the meter at 3 stars (of 15) so one good switch is enough to
// reach the first milestone (5) instead of a long grind.
//
// Kept deliberately ELI5: one short idea per bubble instead of one big
// paragraph covering the whole system. Milestones beyond the first
// (9, 15) are only explained once the player actually reaches them,
// not front-loaded in the intro -- see MILESTONE_TEXT below.

const STAR_TUTORIAL_MAX = 15;

const MILESTONE_TEXT = {
  5: "5 stars! Pick a reward.",
  9: "9 stars! Pick one of 3 powers.",
  15: "15 stars! Pick two rewards."
};

function starTutorialShow(text, {
  role = "setter",
  title = "Star Tutorial",
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
    tone: role === "setter" ? "setter" : "guesser",
    placement,
    compact,
    mode,
    visualHtml,
    key: key || undefined
  });
}

// This file has no other module-scoped state, so plain top-level `let`s
// (same pattern tutorial-ui.js itself uses for tutorialSubStep etc.) are
// enough -- no IIFE needed to keep them off the global object.
let starSessionKey = null;
let starLastSeenHistoryLen = null;
let starMilestone5Announced = false;
let starMilestone9Announced = false;
let starMilestone15Announced = false;
let starAwaitingAck = false;
let starAckStepThreshold = null;
let starLastResultText = "";
let starLastPendingChoiceId = null;
let starTutorialFinished = false;
let starSidebarSeenOpen = false;
let starSidebarClosedOnce = false;

// A fresh room (new roomId) means a fresh meter -- reset every tracker
// exactly once per session instead of carrying stale state from a
// previous run of this same tutorial into the new one.
function resetStarSession(state) {
  const key = window.roomId || "star";
  if (key === starSessionKey) return;

  starSessionKey = key;
  starLastSeenHistoryLen = state.history?.length ?? 0;
  const total = Number(state.powers?.spyCharge?.total) || 0;
  starMilestone5Announced = total >= 5;
  starMilestone9Announced = total >= 9;
  starMilestone15Announced = total >= 15;
  starAwaitingAck = false;
  starAckStepThreshold = null;
  starLastResultText = "";
  starLastPendingChoiceId = state.powerChoice?.pendingChoice?.id || null;
  starTutorialFinished = false;
  starSidebarSeenOpen = false;
  starSidebarClosedOnce = false;
  window.TutorialCore?.setStep(0);
}

// The Spyometer card lives in the setter sidebar, which can be collapsed
// (see power-choice-mode.js's setterSidebarCollapsed/spyAwardTarget) --
// mirror that same fallback here so the ring lands on whichever of the
// full card or the collapsed mini-badge is actually visible right now.
function spyMeterHighlightTarget() {
  const screen = byId("setterScreen");
  const toggle = byId("setterSidebarToggle");
  const collapsed = !!(
    screen?.classList.contains("setter-sidebar-collapsed") ||
    toggle?.getAttribute("aria-expanded") === "false"
  );
  const id = collapsed ? "setterSidebarChargeMini" : "pcSpyChargeCard";
  return byId(id) || byId("pcSpyChargeCard") || byId("setterSidebarChargeMini");
}

// Shared by both "keep submitting" spots below (before the first reward
// milestone, and again if the round somehow keeps going after it) --
// same prompt either way, just reached from two different places in the
// flow. The hint tip is a single short sentence, not a mechanic
// explainer -- and drag/lock isn't mentioned at all here, since the
// Advanced Tutorial already covers it in depth and this tutorial stays
// focused on one thing: stars.
function starPromptForSwitch(state, api, charge) {
  const hint = charge.hint;
  const hasHintPos = hint?.letter && Number.isInteger(hint.position);
  const word = hint?.word ? String(hint.word).toUpperCase() : null;

  const text = word
    ? `Enter ${word}, then tap Submit.`
    : hasHintPos
      ? `Enter a new secret, then tap Submit. Put ${String(hint.letter).toUpperCase()} in spot ${hint.position + 1}.`
      : `Enter a new secret, then tap Submit.`;

  starTutorialShow(text, { title: "Make a switch", mode: "hide" });
  api.highlight(spyMeterHighlightTarget());
  api.setWaiting({ label: word ? `SUBMIT ${word}` : "SUBMIT NEW SECRET" });
}

function runStarTutorial(state, role) {
  const api = window.TutorialCore;
  if (!api) return;

  api.clearHighlights();

  if (role !== "setter") {
    api.setNextTutorial("advanced");
    starTutorialShow(
      "Open this tutorial on the Secretkeeper screen.",
      { title: "Wrong role", mode: "end" }
    );
    return;
  }

  resetStarSession(state);

  // Cleared unconditionally up front, not just in the branches that no
  // longer need it -- the Continue button's own click handler silently
  // no-ops whenever tutorialWaitingFor is still set (it's built to assume
  // a "waiting" step always ends via a notifyTutorial* hook, never via a
  // plain click), so a value left over from the *previous* render (e.g.
  // "make a switch"'s SUBMIT NEW SECRET wait) would otherwise permanently
  // block every later mode:"advance" step's Continue button, including
  // the very next one below. Re-armed below in the one branch that still
  // needs it.
  api.clearWaiting();

  // A real AI opponent is playing along (this isn't scripted), so the
  // round could in principle end before the player reaches a reward
  // milestone -- wrap up gracefully instead of getting stuck.
  if (state.phase === "gameOver") {
    api.setNextTutorial("advanced");
    starTutorialShow(
      "The round ended, but you saw how stars and rewards work.",
      { title: "Star Tutorial done", mode: "end" }
    );
    return;
  }

  // Once a reward has been picked, keep showing the done message on every
  // later render (an AI guess landing, a stray re-render, etc.) instead of
  // just once -- otherwise the very next unrelated state push falls
  // straight through to the switch-prompt branch below and silently
  // un-shows it, since nothing else about this step is "waiting" on
  // anything (mode:"end" doesn't hold the message the way the
  // starAwaitingAck mechanism holds an advance-mode one).
  if (starTutorialFinished) {
    api.setNextTutorial("advanced");
    starTutorialShow(
      "Done! You changed a secret, earned stars, and picked a reward.",
      { title: "Star Tutorial done", current: 6, total: 6, mode: "end" }
    );
    api.highlight(spyMeterHighlightTarget());
    return;
  }

  // COMPETITIVE OVERHAUL V3: SIDEBAR HANDS-ON START
  const sidebarToggle = byId("setterSidebarToggle");
  const sidebarCollapsed = !!(
    byId("setterScreen")?.classList.contains("setter-sidebar-collapsed") ||
    sidebarToggle?.getAttribute("aria-expanded") === "false"
  );

  if (!starSidebarSeenOpen) {
    if (sidebarCollapsed) {
      starTutorialShow(
        "Stars are the Secretkeeper bonus. First open the side panel so you can see the Spyometer and game log.",
        { title: "Open the Secretkeeper panel", mode: "hide" }
      );
      api.highlight(sidebarToggle);
      api.setWaiting({ label: "OPEN THE SIDE PANEL" });
      return;
    }
    starSidebarSeenOpen = true;
    starTutorialShow(
      "This side column holds the Spyometer and your game log. Now close it so you also know how to recover board space; the collapsed badge still shows your total.",
      { title: "Close the side panel", mode: "hide" }
    );
    api.highlight(sidebarToggle);
    api.setWaiting({ label: "CLOSE THE SIDE PANEL" });
    return;
  }

  if (!starSidebarClosedOnce) {
    if (!sidebarCollapsed) {
      starTutorialShow(
        "Close the side panel with the arrow. You can reopen it whenever you need the full Spyometer or log.",
        { title: "Close the side panel", mode: "hide" }
      );
      api.highlight(sidebarToggle);
      api.setWaiting({ label: "CLOSE THE SIDE PANEL" });
      return;
    }
    starSidebarClosedOnce = true;
    api.clearWaiting();
  }
  // COMPETITIVE OVERHAUL V3: SIDEBAR HANDS-ON END
  const step = api.getStep();
  const charge = state.powers?.spyCharge || {};
  const total = Math.max(0, Math.min(STAR_TUTORIAL_MAX, Number(charge.total) || 0));
  const historyLen = state.history?.length ?? 0;
  const pendingChoice = state.powerChoice?.pendingChoice;
  const pendingIsMine = pendingChoice && pendingChoice.role === "setter";

  // Steps 0-2 are pure narration, one short idea each -- see the file
  // comment for why this replaced a single paragraph covering the whole
  // system at once.
  if (step === 0) {
    starTutorialShow(
      `Stars are the Secretkeeper bonus. The collapsed badge and full Spyometer both show your total: ${total} of ${STAR_TUTORIAL_MAX}.`,
      { current: 1, total: 6 }
    );
    api.highlight(spyMeterHighlightTarget());
    api.setMode("advance");
    return;
  }

  if (step === 1) {
    starTutorialShow(
      "Keeping the current secret or making any legal change earns at least 1 star. Changing is optional, but it can improve your word and reach rewards faster.",
      { current: 2, total: 6 }
    );
    api.highlight(spyMeterHighlightTarget());
    api.setMode("advance");
    return;
  }

  if (step === 2) {
    starTutorialShow(
      "A better legal alternative earns 2 stars, the best a switch can earn on its own. A bonus star is available on top of that when you match the shown letter and position; that target comes from a best current secret, one that leaves the Guesser the most possible words -- matching it is the only way to reach 3.",
      { current: 3, total: 6 }
    );
    api.highlight(spyMeterHighlightTarget());
    api.setMode("advance");
    return;
  }

  // Whatever the last "a submission just landed" message said, hold it on
  // screen until the player actively acknowledges it, so a stray state
  // push (the AI's next guess arriving, for instance) can't yank it away
  // before they've read it.
  if (starAwaitingAck) {
    if (step >= starAckStepThreshold) {
      starAwaitingAck = false;
      starAckStepThreshold = null;
    } else {
      starTutorialShow(starLastResultText, { mode: "advance" });
      api.highlight(spyMeterHighlightTarget());
      return;
    }
  }

  // A submission just landed -- report on it. If more than one milestone
  // got crossed in one jump (a good switch plus the bonus-star tip can
  // do that), only announce the HIGHEST one reached -- one clear idea per
  // message, not a paragraph listing every tier's own text.
  if (historyLen > starLastSeenHistoryLen) {
    starLastSeenHistoryLen = historyLen;

    let text;
    if (total >= 15 && !starMilestone15Announced) {
      text = MILESTONE_TEXT[15];
    } else if (total >= 9 && !starMilestone9Announced) {
      text = MILESTONE_TEXT[9];
    } else if (total >= 5 && !starMilestone5Announced) {
      text = MILESTONE_TEXT[5];
    } else if (total < 5) {
      text = `${total} of ${STAR_TUTORIAL_MAX} stars. Keep going.`;
    } else {
      text = `${total} of ${STAR_TUTORIAL_MAX} stars.`;
    }
    starMilestone5Announced = starMilestone5Announced || total >= 5;
    starMilestone9Announced = starMilestone9Announced || total >= 9;
    starMilestone15Announced = starMilestone15Announced || total >= 15;

    starLastResultText = text;
    starAwaitingAck = true;
    starAckStepThreshold = step + 1;

    starTutorialShow(text, { mode: "advance" });
    api.highlight(spyMeterHighlightTarget());
    return;
  }

  // A reward choice that was pending has now cleared -- the player picked
  // a card. Wrap up here: they've seen the whole loop (switch, earn
  // stars, pick a reward) live, and in a real match it just keeps
  // repeating with better options at 9 and 15.
  if (starLastPendingChoiceId && !pendingChoice) {
    starLastPendingChoiceId = null;
    starTutorialFinished = true;
    api.setNextTutorial("advanced");
    starTutorialShow(
      "Done! You changed a secret, earned stars, and picked a reward.",
      { title: "Star Tutorial done", current: 6, total: 6, mode: "end" }
    );
    api.highlight(spyMeterHighlightTarget());
    return;
  }

  // A reward choice just opened -- the real modal handles showing and
  // resolving it, so just point at the Spyometer and explain what's
  // about to happen. Nothing to wait on except the player actually
  // picking a card, which clears pendingChoice and lands in the branch
  // above on the next render.
  if (pendingIsMine) {
    starLastPendingChoiceId = pendingChoice.id;
    starTutorialShow(
      "Select one of the three reward cards now. It takes effect immediately, and later milestones improve reward rarity odds.",
      { title: "Pick a reward", current: 5, total: 6, mode: "hide" }
    );
    api.highlight(spyMeterHighlightTarget());
    api.setContinue({ show: false, mode: "hide" });
    return;
  }

  if (!state.pendingGuess) {
    starTutorialShow(
      "Waiting for the Guesser...",
      { compact: true, mode: "hide", key: `star-wait-${historyLen}` }
    );
    api.setContinue({ show: false, mode: "hide" });
    return;
  }

  starPromptForSwitch(state, api, charge);
}

window.runStarTutorial = runStarTutorial;
