(() => {
  "use strict";

  const byId = id => document.getElementById(id);
  let notesOpen = false;
  let notesParent = null;
  let notesNext = null;
  let latestState = null;
  let originalSpyChargeUpdate = null;

  function notesAvailable(state) {
    const screen = byId("setterScreen");
    if (!screen?.classList.contains("active") || window.myRole !== "setter") return false;
    if (state?.gameOver) return false;

    return !!(
      (state?.phase === "normal" && state.turn === state.guesser && !state.pendingGuess) ||
      (state?.phase === "simultaneous" && state.simultaneousSecretSubmitted && !state.simultaneousGuessSubmitted)
    );
  }

  function ensureNotesButton() {
    // Notes were removed for both roles -- the panel this button opens no
    // longer exists, so the button must not exist either. Without this it
    // kept appearing on the Inspector's turn (that's when notes used to be
    // "available") and opened nothing.
    if (!byId("notesPanelSetter")) {
      byId("setterNotesQuickBtnV9")?.remove();
      return null;
    }
    const stage = document.querySelector("#setterScreen .setter-decision-stage") ||
      document.querySelector("#setterScreen .draft-stack");
    if (!stage) return null;

    let button = byId("setterNotesQuickBtnV9");
    if (!button) {
      button = document.createElement("button");
      button.type = "button";
      button.id = "setterNotesQuickBtnV9";
      button.className = "setter-notes-quick-btn-v9 hidden";
      button.title = "Open Notes while the Inspector thinks";
      button.setAttribute("aria-label", button.title);
      button.setAttribute("aria-expanded", "false");
      button.innerHTML = `
        <span class="setter-notes-quick-icon" aria-hidden="true">✎</span>
        <span class="setter-notes-quick-count" id="setterNotesQuickCountV9">0</span>
      `;
      stage.appendChild(button);
      button.addEventListener("click", event => {
        event.stopPropagation();
        if (notesOpen) closeNotesPopout();
        else openNotesPopout();
      });
    }
    return button;
  }

  function countSavedNotes() {
    return document.querySelectorAll("#notesListSetter .notes-entry").length;
  }

  function updateNotesButton(state) {
    latestState = state;
    const button = ensureNotesButton();
    if (!button) return;

    const available = notesAvailable(state);
    button.classList.toggle("hidden", !available);
    button.classList.toggle("is-open", notesOpen);
    button.setAttribute("aria-expanded", String(notesOpen));

    const count = byId("setterNotesQuickCountV9");
    if (count) count.textContent = String(countSavedNotes());

    if (!available && notesOpen) closeNotesPopout();
  }

  function openNotesPopout() {
    const screen = byId("setterScreen");
    const panel = byId("notesPanelSetter");
    if (!screen || !panel || !notesAvailable(latestState || window.state)) return;

    if (!window.isNotesActive?.()) window.toggleNotes?.("setter");

    notesParent = panel.parentElement;
    notesNext = panel.nextSibling;
    screen.appendChild(panel);
    panel.classList.remove("hidden");
    panel.classList.add("setter-notes-quick-popout-v9");
    screen.classList.add("setter-notes-quick-open-v9");
    notesOpen = true;
    updateNotesButton(latestState || window.state);
  }

  function closeNotesPopout() {
    const screen = byId("setterScreen");
    const panel = byId("notesPanelSetter");

    notesOpen = false;
    screen?.classList.remove("setter-notes-quick-open-v9");

    if (panel) {
      panel.classList.remove("setter-notes-quick-popout-v9");
      if (notesParent) {
        if (notesNext && notesNext.parentNode === notesParent) notesParent.insertBefore(panel, notesNext);
        else notesParent.appendChild(panel);
      }
    }

    if (window.isNotesActive?.()) window.closeNotes?.();
    notesParent = null;
    notesNext = null;
    updateNotesButton(latestState || window.state);
  }

  function ensureBonusTarget() {
    const stage = document.querySelector("#setterScreen .setter-decision-stage");
    const draftWrap = stage?.querySelector(".draft-row-wrap");
    if (!stage || !draftWrap) return null;

    let target = byId("setterBonusTargetV9");
    if (!target) {
      target = document.createElement("div");
      target.id = "setterBonusTargetV9";
      target.className = "setter-bonus-target-v9 hidden";
      stage.insertBefore(target, draftWrap);
    }
    return target;
  }

  function renderBonusTarget(state) {
    const target = ensureBonusTarget();
    if (!target) return;

    // Power Choice mode has its own single canonical renderer for this
    // element (power-choice-mode.js's normalizeBonusTarget) -- bail out
    // instead of fighting it for the same DOM node every render tick.
    if (document.body.classList.contains("power-choice-mode")) return;

    const charge = state?.powers?.spyCharge;
    const hint = charge?.hint;
    const show = window.myRole === "setter" && charge?.enabled && hint?.letter && Number.isInteger(hint.position);
    target.classList.toggle("hidden", !show);

    if (!show) return;

    const letter = String(hint.letter).toUpperCase().slice(0, 1);
    const position = hint.position + 1;
    const positionLabel =
      ["1st", "2nd", "3rd", "4th", "5th"][hint.position] || `${position}th`;
    target.innerHTML = `
      <span class="setter-bonus-plus-v10" aria-hidden="true">+★</span>
      <span class="setter-bonus-position-v10"><strong>${letter}</strong> in ${positionLabel}</span>
    `;
    target.setAttribute("aria-label", `Bonus star: ${letter} in ${positionLabel}`);
    // compact-bonus-hint-v1

    const action = byId("spyChargeActionBtn");
    const actionLetter = byId("spyChargeHintLetter");
    if (action && actionLetter) {
      actionLetter.textContent = "↺";
      action.classList.toggle("hint-moved-v9", !action.classList.contains("is-ready"));
    }
  }

  function wrapSpyChargeUpdate() {
    if (!window.updateSpyChargeUI || window.updateSpyChargeUI.__targetV9) return;
    originalSpyChargeUpdate = window.updateSpyChargeUI;

    const wrapped = function (state, role) {
      originalSpyChargeUpdate(state, role);
      renderBonusTarget(state);
      updateNotesButton(state);
      window.updateCollapsedActionDocks?.();
    };
    wrapped.__targetV9 = true;
    window.updateSpyChargeUI = wrapped;
  }

  function init() {
    byId("setterNotesIdleOpenBtn")?.classList.add("hidden");
    ensureNotesButton();
    ensureBonusTarget();
    wrapSpyChargeUpdate();

    window.updateSetterIdleExpand = function (state) {
      updateNotesButton(state);
    };
    window.reanchorSetterIdleNotes = function () {
      updateNotesButton(latestState || window.state);
    };

    updateNotesButton(window.state);
    renderBonusTarget(window.state);
  }

  window.updateSetterNotesQuickV9 = updateNotesButton;
  window.closeSetterNotesQuickV9 = closeNotesPopout;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
