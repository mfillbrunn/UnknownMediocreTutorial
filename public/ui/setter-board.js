(() => {
  "use strict";

  const STORAGE_KEY = "setterSidebarCollapsed";
  const SWIPE_THRESHOLD = 46;
  const byId = id => document.getElementById(id);

  let gesture = null;
  let suppressSidebarClickUntil = 0;
  let meterObserver = null;

  function screen() {
    return byId("setterScreen");
  }

  function isCollapsed() {
    return screen()?.classList.contains("setter-sidebar-collapsed") || false;
  }

  function saveCollapsed(value) {
    try {
      localStorage.setItem(STORAGE_KEY, value ? "1" : "0");
    } catch {
      // Storage is optional.
    }
  }

  function readCollapsed() {
    try {
      return localStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  }

  function syncMiniCharge() {
    const mini = byId("setterSidebarChargeMini");
    if (!mini) return;

    const total = typeof window.getDisplayedSpyChargeTotal === "function"
      ? Number(window.getDisplayedSpyChargeTotal()) || 0
      : document.querySelectorAll("#spyChargeMeter .spy-charge-segment.is-filled").length;

    mini.textContent = String(total);
    mini.classList.toggle("hidden", !isCollapsed());
  }

  function observeChargeMeter() {
    const meter = byId("spyChargeMeter");
    if (!meter || meterObserver) return;

    meterObserver = new MutationObserver(syncMiniCharge);
    meterObserver.observe(meter, {
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "aria-valuenow"]
    });

    syncMiniCharge();
  }

  function scheduleChargeObserver() {
    observeChargeMeter();
    if (!meterObserver) {
      requestAnimationFrame(scheduleChargeObserver);
    }
  }

  function setCollapsed(collapsed, persist = true) {
    const setterScreen = screen();
    const toggle = byId("setterSidebarToggle");
    const icon = toggle?.querySelector(".setter-sidebar-toggle-icon");

    if (!setterScreen || !toggle) return;

    setterScreen.classList.toggle("setter-sidebar-collapsed", collapsed);
    toggle.setAttribute("aria-expanded", String(!collapsed));
    toggle.setAttribute(
      "aria-label",
      collapsed ? "Show Spy side panel" : "Hide Spy side panel"
    );
    toggle.title = collapsed ? "Show side panel" : "Hide side panel";

    if (icon) icon.textContent = collapsed ? "›" : "‹";
    if (persist) saveCollapsed(collapsed);

    // Collapsing while the Inspector-turn Notes popout is showing
    // (gameplay-polish-v8.js's openInspectorTurnNotes, flagged here via
    // this class it adds/removes in lockstep with its own notesPopped
    // state) used to call closeNotes() regardless, which tore down that
    // popout entirely -- it wasn't opened through the ordinary sidebar
    // Notes tab this is meant to close, and reanchorSetterIdleNotes below
    // already repositions it correctly for the new (collapsed) layout, so
    // there's nothing here that needs closing in that case.
    if (
      collapsed &&
      !setterScreen.classList.contains("setter-inspector-turn-notes-open")
    ) {
      window.closeNotes?.();
    }

    window.updateSetterIdleExpand?.(window.state);
    syncMiniCharge();

    requestAnimationFrame(() => {
      window.reanchorSetterIdleNotes?.();
      window.scheduleTutorialLayout?.();
      window.dispatchEvent(new Event("resize"));
    });
  }

  function beginGesture(event, direction) {
    if (event.pointerType === "mouse" || event.button > 0) return;
    if (event.target.closest?.(".activity-drag-handle")) return;

    gesture = {
      pointerId: event.pointerId,
      direction,
      startX: event.clientX,
      startY: event.clientY,
      active: false
    };
  }

  function onPointerMove(event) {
    if (!gesture || event.pointerId !== gesture.pointerId) return;

    const dx = event.clientX - gesture.startX;
    const dy = event.clientY - gesture.startY;

    if (!gesture.active) {
      if (Math.abs(dx) < 12 || Math.abs(dx) <= Math.abs(dy) * 1.15) return;
      gesture.active = true;
      screen()?.classList.add("setter-sidebar-swipe-active");
    }

    event.preventDefault();
  }

  function finishGesture(event) {
    if (!gesture || event.pointerId !== gesture.pointerId) return;

    const current = gesture;
    gesture = null;
    screen()?.classList.remove("setter-sidebar-swipe-active");

    if (!current.active) return;

    const endX = Number.isFinite(event.clientX) ? event.clientX : current.startX;
    const dx = endX - current.startX;

    if (current.direction === "close" && dx <= -SWIPE_THRESHOLD) {
      suppressSidebarClickUntil = Date.now() + 350;
      setCollapsed(true);
    }

    if (current.direction === "open" && dx >= SWIPE_THRESHOLD) {
      setCollapsed(false);
    }
  }

  function initDrawer() {
    const setterScreen = screen();
    const sidebar = byId("setterSidebar");
    const toggle = byId("setterSidebarToggle");
    const edge = byId("setterSidebarSwipeEdge");

    if (!setterScreen || !sidebar || !toggle || !edge) return;

    setCollapsed(readCollapsed(), false);

    toggle.addEventListener("click", event => {
      event.stopPropagation();
      setCollapsed(!isCollapsed());
    });

    sidebar.addEventListener("pointerdown", event => {
      beginGesture(event, "close");
    });

    edge.addEventListener("pointerdown", event => {
      beginGesture(event, "open");
    });

    sidebar.addEventListener(
      "click",
      event => {
        if (Date.now() < suppressSidebarClickUntil) {
          event.preventDefault();
          event.stopPropagation();
        }
      },
      true
    );

    window.addEventListener("pointermove", onPointerMove, { passive: false });
    window.addEventListener("pointerup", finishGesture, { passive: true });
    window.addEventListener("pointercancel", finishGesture, { passive: true });
  }

  function renderCoverStars(strength) {
    const el = byId("setterCoverStars");
    if (!el) return;

    const show = !!strength?.visible && window.myRole === "setter";
    el.classList.toggle("hidden", !show);
    if (!show) return;

    const count = Math.max(0, Math.min(3, Number(strength.stars) || 0));

    el.querySelectorAll("[data-cover-star]").forEach((star, index) => {
      star.classList.toggle("is-filled", index < count);
    });

    const charge = window.state?.powers?.spyCharge;
    const hint = charge?.hint;
    const hasHint = !!hint?.letter && Number.isInteger(hint.position);
    const target = byId("setterCoverTarget");
    const targetChip = byId("setterCoverTargetChip");
    const bonus = el.querySelector("[data-cover-bonus-star]");

    target?.classList.toggle("hidden", !hasHint);

    if (targetChip) {
      targetChip.innerHTML = hasHint
        ? `${String(hint.letter).toUpperCase()}<sup>${hint.position + 1}</sup>`
        : "";
    }

    const draft = String(window.state?.setterDraft || "")
      .replace(/\s/g, "")
      .toUpperCase();

    const bonusEarned = !!(
      hasHint &&
      strength.draftValid &&
      !strength.draftIsCurrent &&
      !strength.draftIsPending &&
      draft.length === 5 &&
      draft[hint.position] === String(hint.letter).toUpperCase()
    );

    if (bonus) {
      bonus.classList.toggle("is-visible", hasHint);
      bonus.classList.toggle("is-filled", bonusEarned);
    }

    el.setAttribute(
      "aria-label",
      `${count} of 3 cover-strength stars${bonusEarned ? " plus one bonus star" : ""}`
    );
  }

  function installStarRenderer() {
    window.renderSetterCoverStars = renderCoverStars;
  }

  window.updateSetterDecisionControls = function ({
    state,
    inputEnabled,
    keepEnabled,
    newEnabled
  } = {}) {
    const clearButton = byId("setterClearDraftBtn");
    const submitButton = byId("setterSubmitSecretBtn");
    if (!clearButton || !submitButton) return;

    const rawDraft = String(state?.setterDraft || "");
    const draftLetters = rawDraft.replace(/\s/g, "");
    const draftComplete = draftLetters.length === 5 && !rawDraft.includes(" ");
    const canKeep = !!keepEnabled && draftLetters.length === 0;
    const canSubmitNew = !!newEnabled && draftComplete;

    clearButton.disabled = !inputEnabled || !draftLetters.length;
    submitButton.disabled = !(canKeep || canSubmitNew);
  };

  function initDecisionButtons() {
    byId("setterClearDraftBtn")?.addEventListener("click", () => {
      window.clearSetterDraftFromButton?.();
    });

    byId("setterSubmitSecretBtn")?.addEventListener("click", () => {
      window.submitSetterSecretFromButton?.();
    });
  }

  function init() {
    installStarRenderer();
    initDrawer();
    initDecisionButtons();
    scheduleChargeObserver();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
