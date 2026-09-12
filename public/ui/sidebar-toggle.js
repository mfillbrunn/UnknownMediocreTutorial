// ui/sidebar-toggle.js — the single owner of both drawer toggles.
//
// Replaces three overlapping implementations that all tried to handle the
// same button: a per-node click listener in ui/setter-board.js, another in
// ui/guesser-board-v9.js, and a document-level capture-phase fallback in
// ui/collapsed-actions-v9.js that called stopImmediatePropagation() on the
// way past. Each existed to paper over a way the previous one could go
// inert, and between them they had three separate copies of the collapsed
// state plus two swipe-gesture implementations that could suppress the
// toggle's own click.
//
// The rules this file keeps, because every past "the toggle is stuck
// until I reload" bug came from breaking one of them:
//
//  1. ONE listener, delegated on document, matched with closest(). It is
//     bound once and never rebound, so no amount of re-rendering,
//     replacing or cloning a toggle node can leave a live-looking button
//     with nothing behind it. Nothing here calls stopImmediatePropagation
//     or preventDefault on a click.
//  2. The screen's collapsed class is the single source of truth. There
//     is no cached copy to drift, and no timer reasserting a past value
//     over a newer one.
//  3. A swipe can never strand itself. A gesture that has not yet become
//     a real swipe is discarded by the next pointer release OR the next
//     pointerdown, whichever comes first; one that HAS become a swipe
//     captures its pointer, so the browser guarantees delivery of the
//     pointerup that ends it even if the node underneath is destroyed
//     mid-gesture (which the action log does routinely -- it rebuilds its
//     innerHTML whenever a line lands).
//  4. preventDefault() is only ever called once a swipe is genuinely
//     active. A tap is never swallowed on the way to becoming a click.

(() => {
  "use strict";

  if (window.__umtSidebarToggleOwner) return;
  window.__umtSidebarToggleOwner = true;

  const SWIPE_THRESHOLD = 46;
  // How far, and how much more horizontal than vertical, a drag has to be
  // before it counts as a drawer swipe rather than a tap or a scroll.
  const SWIPE_ARM_DISTANCE = 12;
  const SWIPE_ARM_RATIO = 1.15;
  // A press on a control is a press. The action log lives inside the
  // panel and its power/reward terms are role="button" tabindex="0" (see
  // client/action-log.js), so without this a tap meant to expand one of
  // them would arm a drawer swipe.
  const CONTROLS =
    "button, a, input, select, textarea, label, summary, [role=\"button\"], [tabindex]";

  const ROLES = {
    setter: {
      screenId: "setterScreen",
      sidebarId: "setterSidebar",
      toggleId: "setterSidebarToggle",
      edgeId: "setterSidebarSwipeEdge",
      iconClass: "setter-sidebar-toggle-icon",
      collapsedClass: "setter-sidebar-collapsed",
      swipeClass: "setter-sidebar-swipe-active",
      storageKey: "setterSidebarCollapsed",
      panelName: "Secretkeeper side panel"
    },
    guesser: {
      screenId: "guesserScreen",
      sidebarId: "guesserSidebar",
      toggleId: "guesserSidebarToggle",
      edgeId: "guesserSidebarSwipeEdge",
      iconClass: "guesser-sidebar-toggle-icon",
      collapsedClass: "guesser-sidebar-collapsed",
      swipeClass: "guesser-sidebar-swipe-active",
      storageKey: "guesserSidebarCollapsedV9",
      panelName: "game log"
    }
  };

  const byId = id => document.getElementById(id);
  const screenFor = role => byId(ROLES[role].screenId);

  function roleForToggle(toggle) {
    return toggle?.id === ROLES.setter.toggleId ? "setter"
      : toggle?.id === ROLES.guesser.toggleId ? "guesser"
        : null;
  }

  // ---- state ------------------------------------------------------------
  // Read from the DOM every time. The class on the screen IS the state.

  function isCollapsed(role) {
    return !!screenFor(role)?.classList.contains(ROLES[role].collapsedClass);
  }

  function readStored(role) {
    try {
      return localStorage.getItem(ROLES[role].storageKey) === "1";
    } catch {
      return false;
    }
  }

  function writeStored(role, collapsed) {
    try {
      localStorage.setItem(ROLES[role].storageKey, collapsed ? "1" : "0");
    } catch {
      // Storage is optional -- a private-mode failure must not stop the
      // panel from opening and closing for the rest of the session.
    }
  }

  // Brings the button's own labelling in line with the screen's class.
  // Safe to call at any time and as often as needed: it only writes what
  // actually differs, so it can't feed a MutationObserver loop.
  function syncToggle(role) {
    const config = ROLES[role];
    const roleScreen = screenFor(role);
    const toggle = byId(config.toggleId);
    if (!roleScreen || !toggle) return;

    const collapsed = isCollapsed(role);
    const wantExpanded = String(!collapsed);
    const wantLabel = `${collapsed ? "Show" : "Hide"} ${config.panelName}`;
    const wantTitle = collapsed ? "Show side panel" : "Hide side panel";
    const wantIcon = collapsed ? "›" : "‹";

    if (roleScreen.dataset.sidebarCollapsed !== String(collapsed)) {
      roleScreen.dataset.sidebarCollapsed = String(collapsed);
    }
    // Never leave the control disabled: nothing in this file disables it,
    // but an older build could have left the attribute behind in a saved
    // DOM, and an inert toggle has no way back without a reload.
    if (toggle.disabled) toggle.disabled = false;
    if (toggle.hasAttribute("disabled")) toggle.removeAttribute("disabled");
    if (toggle.hasAttribute("aria-disabled")) toggle.removeAttribute("aria-disabled");
    if (toggle.getAttribute("aria-expanded") !== wantExpanded) {
      toggle.setAttribute("aria-expanded", wantExpanded);
    }
    if (toggle.getAttribute("aria-label") !== wantLabel) {
      toggle.setAttribute("aria-label", wantLabel);
    }
    if (toggle.title !== wantTitle) toggle.title = wantTitle;

    const icon = toggle.querySelector(`.${config.iconClass}`);
    if (icon && icon.textContent !== wantIcon) icon.textContent = wantIcon;
  }

  // `announce: false` writes the state without telling the rest of the app
  // the player just moved the panel -- used when seeding the remembered
  // value at startup, where firing the tutorial's "they toggled it" hook
  // would be a lie.
  function setCollapsed(role, collapsed, persist = true, announce = true) {
    const config = ROLES[role];
    const roleScreen = screenFor(role);
    if (!roleScreen) return false;

    const next = Boolean(collapsed);
    roleScreen.classList.toggle(config.collapsedClass, next);
    syncToggle(role);
    if (persist) writeStored(role, next);

    // Whoever owns a given side effect handles it, rather than this file
    // reaching into notes, the quest HUD, the tutorial and the docks.
    document.dispatchEvent(new CustomEvent("umt:sidebartoggle", {
      detail: { role, collapsed: next, announce }
    }));

    window.updateCollapsedActionDocks?.();
    if (announce) window.notifyTutorialSidebarToggled?.();
    requestAnimationFrame(() => window.scheduleTutorialLayout?.());
    return true;
  }

  // ---- the one click path -----------------------------------------------

  function onDocumentClick(event) {
    const target = event.target instanceof Element
      ? event.target
      : event.target?.parentElement;
    const toggle = target?.closest?.(`#${ROLES.setter.toggleId}, #${ROLES.guesser.toggleId}`);
    if (!toggle) return;

    const role = roleForToggle(toggle);
    if (!role) return;
    // A swipe that just closed the panel also produces a click; that one
    // is not a press of this button.
    if (swallowClickUntil > Date.now()) return;
    setCollapsed(role, !isCollapsed(role));
  }

  // ---- swipe ------------------------------------------------------------

  let gesture = null;
  let swallowClickUntil = 0;

  function clearSwipeVisuals() {
    screenFor("setter")?.classList.remove(ROLES.setter.swipeClass);
    screenFor("guesser")?.classList.remove(ROLES.guesser.swipeClass);
  }

  function endGesture() {
    if (gesture?.captured) {
      try {
        gesture.captureTarget?.releasePointerCapture?.(gesture.pointerId);
      } catch {
        // Already released, or the node is gone -- nothing to undo.
      }
    }
    gesture = null;
    clearSwipeVisuals();
  }

  function onPointerDown(event) {
    // Any new touch supersedes a gesture that never became a swipe, so an
    // earlier one can never sit armed waiting for a release that is not
    // coming.
    if (gesture && !gesture.active) endGesture();
    if (gesture) return;

    if (event.pointerType === "mouse" || event.button > 0) return;
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    // Pressing the toggle is not the start of a swipe.
    if (target.closest(`#${ROLES.setter.toggleId}, #${ROLES.guesser.toggleId}`)) return;
    if (target.closest(".activity-drag-handle")) return;
    if (target.closest(CONTROLS)) return;

    let role = null;
    let direction = null;
    if (target.closest(`#${ROLES.setter.edgeId}`)) { role = "setter"; direction = "open"; }
    else if (target.closest(`#${ROLES.guesser.edgeId}`)) { role = "guesser"; direction = "open"; }
    else if (target.closest(`#${ROLES.setter.sidebarId}`)) { role = "setter"; direction = "close"; }
    else if (target.closest(`#${ROLES.guesser.sidebarId}`)) { role = "guesser"; direction = "close"; }
    if (!role) return;

    gesture = {
      role,
      direction,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      active: false,
      captured: false,
      captureTarget: screenFor(role)
    };
  }

  function onPointerMove(event) {
    if (!gesture || event.pointerId !== gesture.pointerId) return;

    const dx = event.clientX - gesture.startX;
    const dy = event.clientY - gesture.startY;

    if (!gesture.active) {
      // Still ambiguous between a tap, a vertical scroll and a swipe --
      // claim nothing and let the browser do its normal thing.
      if (Math.abs(dx) < SWIPE_ARM_DISTANCE) return;
      if (Math.abs(dx) <= Math.abs(dy) * SWIPE_ARM_RATIO) return;

      gesture.active = true;
      screenFor(gesture.role)?.classList.add(ROLES[gesture.role].swipeClass);
      // Capturing here is what makes a swipe impossible to strand: every
      // further event for this pointer, pointerup included, is delivered
      // to the capture target even if the node the finger started on is
      // removed from the document mid-gesture.
      try {
        gesture.captureTarget?.setPointerCapture?.(event.pointerId);
        gesture.captured = true;
      } catch {
        // Capture is an optimisation, not a requirement -- the pointerup
        // and pointercancel handlers below still end the gesture.
      }
    }

    if (event.cancelable) event.preventDefault();
  }

  function onPointerUp(event) {
    if (!gesture) return;
    // A gesture that never became a swipe is just a press being released,
    // so ANY release ends it. Matching only its own pointerId is what let
    // a gesture whose release went missing sit armed indefinitely.
    if (gesture.active && event.pointerId !== gesture.pointerId) return;

    const current = gesture;
    const endX = Number.isFinite(event.clientX) ? event.clientX : current.startX;
    const dx = endX - current.startX;
    endGesture();

    if (!current.active) return;
    // The click synthesised at the end of a swipe belongs to the swipe.
    swallowClickUntil = Date.now() + 350;

    if (current.direction === "close" && dx <= -SWIPE_THRESHOLD) {
      setCollapsed(current.role, true);
    } else if (current.direction === "open" && dx >= SWIPE_THRESHOLD) {
      setCollapsed(current.role, false);
    }
  }

  function onPointerCancel(event) {
    if (!gesture) return;
    if (gesture.active && event.pointerId !== gesture.pointerId) return;
    endGesture();
  }

  // ---- structure ---------------------------------------------------------

  // The Secretkeeper's toggle is authored in index.html; the Guesser's is
  // created here next to its board. Either way this only ever fills in a
  // missing node -- it never replaces a live one, so a toggle the player
  // is looking at keeps its identity.
  function ensureGuesserToggle() {
    const guesserScreen = screenFor("guesser");
    const workspace = guesserScreen?.querySelector(".guesser-play > .play-row");
    if (!workspace) return;

    if (!byId(ROLES.guesser.toggleId)) {
      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.id = ROLES.guesser.toggleId;
      toggle.className = "guesser-sidebar-toggle";
      toggle.setAttribute("aria-controls", ROLES.guesser.sidebarId);
      toggle.innerHTML =
        `<span class="${ROLES.guesser.iconClass}" aria-hidden="true">‹</span>` +
        `<span class="guesser-sidebar-toggle-text" aria-hidden="true">Log</span>` +
        `<span id="guesserSidebarChargeMini" class="guesser-sidebar-charge-mini hidden" aria-hidden="true">0</span>`;
      workspace.appendChild(toggle);
    }

    if (!byId(ROLES.guesser.edgeId)) {
      const edge = document.createElement("div");
      edge.id = ROLES.guesser.edgeId;
      edge.className = "guesser-sidebar-swipe-edge";
      edge.setAttribute("aria-hidden", "true");
      workspace.appendChild(edge);
    }
  }

  function refresh() {
    ensureGuesserToggle();
    syncToggle("setter");
    syncToggle("guesser");
  }

  function init() {
    // Seed each panel from what the player last chose, without writing it
    // straight back.
    for (const role of ["setter", "guesser"]) {
      if (screenFor(role)) setCollapsed(role, readStored(role), false, false);
    }
    refresh();
  }

  document.addEventListener("click", onDocumentClick);
  document.addEventListener("pointerdown", onPointerDown, true);
  window.addEventListener("pointermove", onPointerMove, { passive: false });
  window.addEventListener("pointerup", onPointerUp, { passive: true });
  window.addEventListener("pointercancel", onPointerCancel, { passive: true });
  window.addEventListener("lostpointercapture", onPointerCancel, { passive: true });
  // A gesture can't survive the page losing the pointer altogether.
  window.addEventListener("blur", endGesture);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) endGesture();
  });

  window.setSetterSidebarCollapsed = (collapsed, persist = true) =>
    setCollapsed("setter", collapsed, persist);
  window.setGuesserSidebarCollapsed = (collapsed, persist = true) =>
    setCollapsed("guesser", collapsed, persist);
  window.isSetterSidebarCollapsed = () => isCollapsed("setter");
  window.isGuesserSidebarCollapsed = () => isCollapsed("guesser");
  window.__umtSetSidebarCollapsed = function (role, collapsed) {
    if (role !== "setter" && role !== "guesser") return false;
    return setCollapsed(role, Boolean(collapsed));
  };
  window.refreshSidebarToggles = refresh;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
