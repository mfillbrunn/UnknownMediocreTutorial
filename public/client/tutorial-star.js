// Streamlined Star Tutorial: learn the complete loop in four steps.
// The player sees the meter, makes one useful decision, and picks a reward.
const STAR_TUTORIAL_MAX = 15;

function starTutorialShow(text, {
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
    tone: "setter",
    placement,
    compact,
    mode,
    visualHtml,
    key: key || undefined
  });
}

let starSessionKey = null;
let starLastSeenHistoryLen = null;
let starAwaitingAck = false;
let starAckStepThreshold = null;
let starLastResultText = "";
let starLastPendingChoiceId = null;
let starTutorialFinished = false;

function resetStarSession(state) {
  const key = window.roomId || "star";
  if (key === starSessionKey) return;
  starSessionKey = key;
  starLastSeenHistoryLen = state.history?.length ?? 0;
  starAwaitingAck = false;
  starAckStepThreshold = null;
  starLastResultText = "";
  starLastPendingChoiceId = state.powerChoice?.pendingChoice?.id || null;
  starTutorialFinished = false;
  window.TutorialCore?.setStep(0);
}

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

function starMeterVisual(total) {
  const safeTotal = Math.max(0, Math.min(STAR_TUTORIAL_MAX, total));
  return `
    <div class="tutorial-summary-explainer tutorial-star-explainer">
      <span class="tutorial-summary-number">${safeTotal}</span>
      <span><strong>stars now</strong><small>Your first reward opens at 5.</small></span>
    </div>
  `;
}

function starHintText(charge) {
  const hint = charge?.hint;
  if (hint?.word) {
    return `For this practice turn, enter ${String(hint.word).toUpperCase()}.`;
  }
  if (hint?.letter && Number.isInteger(hint.position)) {
    return `Try a legal new secret with ${String(hint.letter).toUpperCase()} in spot ${hint.position + 1}.`;
  }
  return "Enter any legal new secret.";
}

function starPromptForSwitch(state, api, charge) {
  const hint = charge?.hint;
  const word = hint?.word ? String(hint.word).toUpperCase() : null;
  const text = `${starHintText(charge)} Then tap Submit New Secret.`;

  starTutorialShow(text, {
    title: "Earn stars",
    current: 3,
    total: 4,
    mode: "hide",
    visualHtml: `
      <div class="tutorial-key-point">
        A legal Keep always earns something. A helpful change can earn more.
      </div>
    `
  });
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
      "This short tutorial runs on the Secretkeeper screen.",
      { title: "Secretkeeper only", mode: "end" }
    );
    return;
  }

  resetStarSession(state);
  api.clearWaiting();

  if (state.phase === "gameOver") {
    api.setNextTutorial("advanced");
    starTutorialShow(
      "The round ended, but you saw the star meter and reward loop.",
      { title: "Star Tutorial done", current: 4, total: 4, mode: "end" }
    );
    return;
  }

  if (starTutorialFinished) {
    api.setNextTutorial("advanced");
    starTutorialShow(
      "Done. Make a legal decision, earn stars, and pick a reward when the meter reaches a milestone.",
      { title: "Star Tutorial done", current: 4, total: 4, mode: "end" }
    );
    api.highlight(spyMeterHighlightTarget());
    return;
  }

  const step = api.getStep();
  const charge = state.powers?.spyCharge || {};
  const total = Math.max(
    0,
    Math.min(STAR_TUTORIAL_MAX, Number(charge.total) || 0)
  );
  const historyLen = state.history?.length ?? 0;
  const pendingChoice = state.powerChoice?.pendingChoice;
  const pendingIsMine = pendingChoice && pendingChoice.role === "setter";

  if (step === 0) {
    starTutorialShow(
      "Stars are the Secretkeeper's bonus meter. A legal Keep or change fills it. Reach 5 stars to choose a reward.",
      {
        current: 1,
        total: 4,
        visualHtml: starMeterVisual(total)
      }
    );
    api.highlight(spyMeterHighlightTarget());
    api.setMode("advance");
    return;
  }

  if (step === 1) {
    starTutorialShow(
      "A stronger legal change can earn more stars. Follow the word or letter hint when it helps, but the only required rule is that your secret must remain legal.",
      {
        current: 2,
        total: 4,
        visualHtml: `
          <div class="tutorial-tiny-steps">
            <span><b>Keep:</b> safe and still earns stars.</span>
            <span><b>Change:</b> may improve the secret and earn more.</span>
            <span><b>Hint:</b> an optional way to aim for a better reward.</span>
          </div>
        `
      }
    );
    api.highlight(spyMeterHighlightTarget());
    api.setMode("advance");
    return;
  }

  if (starAwaitingAck) {
    if (step >= starAckStepThreshold) {
      starAwaitingAck = false;
      starAckStepThreshold = null;
    } else {
      starTutorialShow(starLastResultText, {
        title: "Stars earned",
        current: 3,
        total: 4,
        visualHtml: starMeterVisual(total),
        mode: "advance"
      });
      api.highlight(spyMeterHighlightTarget());
      return;
    }
  }

  if (historyLen > starLastSeenHistoryLen) {
    starLastSeenHistoryLen = historyLen;
    starLastResultText = total >= 5
      ? `You now have ${total} stars. Your reward is ready.`
      : `You now have ${total} stars. Make another legal decision to reach 5.`;
    starAwaitingAck = true;
    starAckStepThreshold = step + 1;

    starTutorialShow(starLastResultText, {
      title: "Stars earned",
      current: 3,
      total: 4,
      visualHtml: starMeterVisual(total),
      mode: "advance"
    });
    api.highlight(spyMeterHighlightTarget());
    return;
  }

  if (starLastPendingChoiceId && !pendingChoice) {
    starLastPendingChoiceId = null;
    starTutorialFinished = true;
    api.setNextTutorial("advanced");
    starTutorialShow(
      "Reward selected. That is the full star loop: decide, earn stars, then choose a reward.",
      {
        title: "Star Tutorial done",
        current: 4,
        total: 4,
        mode: "end"
      }
    );
    api.highlight(spyMeterHighlightTarget());
    return;
  }

  if (pendingIsMine) {
    starLastPendingChoiceId = pendingChoice.id;
    starTutorialShow(
      "Pick one reward card. It activates immediately unless the card says otherwise.",
      {
        title: "Pick a reward",
        current: 4,
        total: 4,
        mode: "hide"
      }
    );
    api.highlight(spyMeterHighlightTarget());
    api.setContinue({ show: false, mode: "hide" });
    return;
  }

  if (!state.pendingGuess) {
    starTutorialShow(
      "Waiting for the Guesser's next word...",
      {
        title: "Earn stars",
        current: 3,
        total: 4,
        compact: true,
        mode: "hide",
        key: `star-wait-${historyLen}`
      }
    );
    api.setContinue({ show: false, mode: "hide" });
    return;
  }

  starPromptForSwitch(state, api, charge);
}

window.runStarTutorial = runStarTutorial;
