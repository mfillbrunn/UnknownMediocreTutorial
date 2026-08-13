// Star Tutorial: a live, hands-on walk through the Spy's star/charge
// system. Setter-only, single round. Unlike every other tutorial,
// spy-charge is actually ENABLED here (see spyChargeServer.js's
// createSpyChargeState and coverStrength.js's buildCoverStrengthState,
// both of which special-case tutorialStage === "star") -- the player
// types and submits real secrets, earns real stars, uses a real letter
// reset at 5, and watches their real second power unlock at 8.
// tutorialMode.js seeds the meter at 4 stars so one or two genuine
// switches are enough to reach both milestones instead of a long grind.

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
let starResetMilestoneAnnounced = false;
let starPowerMilestoneAnnounced = false;
let starResetsUsedAtEntry = 0;
let starAwaitingAck = false;
let starAckStepThreshold = null;
let starLastResultText = "";

// A fresh room (new roomId) means a fresh meter -- reset every tracker
// exactly once per session instead of carrying stale state from a
// previous run of this same tutorial into the new one.
function resetStarSession(state) {
  const key = window.roomId || "star";
  if (key === starSessionKey) return;

  starSessionKey = key;
  starLastSeenHistoryLen = state.history?.length ?? 0;
  starResetMilestoneAnnounced = (Number(state.powers?.spyCharge?.total) || 0) >= 5;
  starPowerMilestoneAnnounced = (Number(state.powers?.spyCharge?.total) || 0) >= 8;
  starResetsUsedAtEntry = Number(state.powers?.spyCharge?.resetsUsed) || 0;
  starAwaitingAck = false;
  starAckStepThreshold = null;
  starLastResultText = "";
  window.TutorialCore?.setStep(0);
}

// Shared by both "keep submitting" spots below (before the 5-star reset
// unlocks, and again between 5 and 8 once it's been used) -- same prompt
// either way, just reached from two different places in the flow.
function starPromptForSwitch(state, api, charge) {
  const hint = charge.hint;
  const hintText = hint?.letter && Number.isInteger(hint.position)
    ? ` Try to include ${String(hint.letter).toUpperCase()} at position ${hint.position + 1} too, for a bonus star.`
    : "";

  starTutorialShow(
    `Type a brand new secret -- as different as you can from the letters you now know are wrong -- and submit it.${hintText}`,
    { title: "Make a switch", mode: "hide" }
  );
  api.highlight(byId("spyChargeHud"));
  api.setWaiting({ label: "SUBMIT NEW SECRET" });
}

function runStarTutorial(state, role) {
  const api = window.TutorialCore;
  if (!api) return;

  api.clearHighlights();

  if (role !== "setter") {
    api.setNextTutorial("modes");
    starTutorialShow(
      "This tutorial needs the Spy screen. End it and start the Star Tutorial again.",
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
  // round could in principle end before the player reaches every
  // milestone -- wrap up gracefully instead of getting stuck.
  if (state.phase === "gameOver") {
    api.setNextTutorial("modes");
    starTutorialShow(
      "The round wrapped up there, but you already saw the star system do its thing live -- nice work.",
      { title: "Star Tutorial done", mode: "end" }
    );
    return;
  }

  const step = api.getStep();
  const charge = state.powers?.spyCharge || {};
  const total = Math.max(0, Math.min(12, Number(charge.total) || 0));
  const resetsUsed = Number(charge.resetsUsed) || 0;
  const historyLen = state.history?.length ?? 0;

  if (step === 0) {
    starTutorialShow(
      `The meter is already partway full -- ${total} of 12 stars from earlier this round. From here, every real secret change you make adds to it live.`,
      { current: 1, total: 4 }
    );
    api.highlight(byId("spyChargeHud"));
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
      api.highlight(byId("spyChargeHud"));
      return;
    }
  }

  // A submission just landed -- report on it regardless of where the
  // total ended up, INCLUDING when it jumped straight past 8 in one go
  // (a good switch plus the bonus-star hint can easily do that from a
  // seeded 4) -- otherwise a big jump would skip straight to the reset
  // instructions with no acknowledgment of what just happened at all.
  if (historyLen > starLastSeenHistoryLen) {
    starLastSeenHistoryLen = historyLen;

    let text = `That switch landed. The meter is now at ${total} of 12 stars.`;

    if (total >= 5 && !starResetMilestoneAnnounced) {
      starResetMilestoneAnnounced = true;
      text += " A letter reset just unlocked -- more on that next.";
    }

    if (total >= 8 && !starPowerMilestoneAnnounced) {
      starPowerMilestoneAnnounced = true;
      text += " Your second power, Hide Tile, also just unlocked for the rest of the round -- look for it in your powers row.";
    }

    if (total < 5) text += " Keep going.";

    starLastResultText = text;
    starAwaitingAck = true;
    starAckStepThreshold = step + 1;

    starTutorialShow(text, { mode: "advance" });
    api.highlight(byId("spyChargeHud"));
    if (total >= 8) window.highlightPowerButtonByText?.("Hide Tile");
    return;
  }

  if (total < 5) {
    if (!state.pendingGuess) {
      starTutorialShow(
        "Waiting for the Inspector's next guess...",
        { compact: true, mode: "hide", key: `star-wait-${historyLen}` }
      );
      api.setContinue({ show: false, mode: "hide" });
      return;
    }

    starPromptForSwitch(state, api, charge);
    return;
  }

  // total >= 5 from here on -- the reset is unlocked, so walk through
  // using it before moving on to the (later, automatic) power unlock.
  if (resetsUsed === starResetsUsedAtEntry) {
    starTutorialShow(
      "You're at 5 stars or more -- a letter reset just unlocked. Tap the button, choose any keyboard letter you've already gotten feedback for, and confirm to erase it.",
      { title: "Use a letter reset", current: 3, total: 4, mode: "hide" }
    );
    api.highlight(byId("spyChargeActionBtn"));
    api.setWaiting({ label: "USE THE RESET" });
    return;
  }

  if (total < 8) {
    if (!state.pendingGuess) {
      starTutorialShow(
        "Waiting for the Inspector's next guess...",
        { compact: true, mode: "hide", key: `star-wait-${historyLen}` }
      );
      api.setContinue({ show: false, mode: "hide" });
      return;
    }

    starPromptForSwitch(state, api, charge);
    return;
  }

  // total >= 8 and the reset's already been used -- done.
  api.setNextTutorial("modes");
  starTutorialShow(
    "That's a real letter reset used and your second power unlocked. You've now seen the whole Star system live.",
    { title: "Star Tutorial done", current: 4, total: 4, mode: "end" }
  );
}

window.runStarTutorial = runStarTutorial;
