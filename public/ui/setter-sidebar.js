(() => {
  "use strict";

  const byId = id => document.getElementById(id);

  function setTabState(button, selected) {
    if (!button) return;

    button.classList.toggle("is-active", selected);
    button.setAttribute("aria-selected", String(selected));
  }

  // Tracks which of Log/Notes is currently open (null = neither), at
  // module scope so the idle-expand logic below can read/restore it
  // alongside the tab click handlers.
  let activeSetterPanel = "log";

  /*
    panelName is "log" or "notes" -- Log starts open by default (see
    initialiseSetterSidebar), and clicking the currently-open tab closes
    it, dropping panelName to null (neither panel open) rather than
    forcing something to always be shown.
  */
  function showSetterSidebarPanel(panelName) {
    const activitySection = document.querySelector(
      "#setterScreen .setter-sidebar-activity"
    );
    const logPanel = byId("actionLogSetter");
    const notesPanel = byId("notesPanelSetter");

    const logButton = byId("actionLogBtnSetter");
    const notesButton = byId("notesBtnSetter");

    const showLog = panelName === "log";
    const showNotes = panelName === "notes";

    logPanel?.classList.toggle("hidden", !showLog);
    notesPanel?.classList.toggle("hidden", !showNotes);

    setTabState(logButton, showLog);
    setTabState(notesButton, showNotes);

    activitySection?.classList.toggle("panel-open", showLog || showNotes);

    // Notes tracks its own active/inactive state separately (keyboard
    // capture, in-progress draft, entry list -- see client/notes.js), on
    // top of this tab's own hidden/visible class above. Only one of these
    // two calls actually does anything: toggleNotes no-ops via its own
    // guard when already active, closeNotes no-ops when already inactive.
    // Without this, switching to Log wouldn't release Notes' keyboard
    // capture, so real typing would keep getting swallowed by the (now
    // hidden) notes scratchpad instead of reaching the real guess/secret.
    if (showNotes) {
      if (!window.isNotesActive?.()) window.toggleNotes?.("setter");
    } else {
      window.closeNotes?.();
    }
  }

  // ------------------------------------------------------------------
  // IDLE AUTO-EXPAND
  //
  // While it isn't the setter's turn, float the Log/Notes section over
  // the draft row, forced onto the Notes tab, so the setter can use the
  // dead time to jot candidate words -- keystrokes only reach Notes
  // while that tab is the active one (see notes.js's window.notesInput,
  // gated on _isMyTurnToType). It snaps back to its normal in-flow spot
  // the instant the turn returns, restoring whichever tab was open
  // before -- unless the setter actually typed a still-viable word while
  // idle, in which case it stays on Notes so they can see it.
  // ------------------------------------------------------------------

  let idleExpanded = false;
  let idlePriorPanel = "log";
  let flipToken = 0;

  function shouldIdleExpand(state) {
    const setterScreen = byId("setterScreen");
    if (!setterScreen?.classList.contains("active")) return false;
    if (!setterScreen.classList.contains("is-not-your-turn")) return false;
    if (state?.isTutorial) return false;
    if (state?.phase === "gameOver") return false;
    return true;
  }

  // Anchored on the draft row specifically (not the whole center column)
  // so the history/constraint-row feedback above it stays visible, and
  // capped well above the keyboard's top edge so the keyboard stays fully
  // usable -- the earlier version spanned the entire center column plus
  // the whole sidebar top-to-bottom, which was both way oversized and, on
  // short viewports, actually ran off the bottom of the screen.
  const MAX_IDLE_NOTES_HEIGHT = 220;
  const KEYBOARD_GAP = 10;

  function computeExpandedRect() {
    // .draft-row-wrap itself is a flex:1 spacer (see layout.css's
    // ".theme-setter .draft-row-wrap") that stretches to soak up whatever
    // vertical room history isn't using, so its own rect can be huge --
    // .draft-stack (its child, holding the actual tile row + overlays) is
    // the piece that's actually intrinsically sized around the visible
    // row, vertically centered inside that stretch.
    const draftStack = document.querySelector("#setterScreen .draft-stack");
    const centerCol = document.querySelector("#setterScreen .center-col");
    const sidebar = document.querySelector("#setterScreen .setter-sidebar");
    const keyboard = document.getElementById("keyboardSetter");
    if (!draftStack || !centerCol || !sidebar) return null;

    const draftRect = draftStack.getBoundingClientRect();
    const centerRect = centerCol.getBoundingClientRect();
    const sidebarRect = sidebar.getBoundingClientRect();
    const keyboardRect = keyboard?.getBoundingClientRect();

    const left = Math.min(centerRect.left, sidebarRect.left);
    const right = Math.max(centerRect.right, sidebarRect.right);
    const top = draftRect.top;
    // Target MAX_IDLE_NOTES_HEIGHT, but never past the keyboard; never
    // shrink below the draft row's own natural height even if that means
    // getting closer to the keyboard than the target gap (an already-tight
    // layout has nowhere else for it to go).
    const keyboardLimit = keyboardRect ? keyboardRect.top - KEYBOARD_GAP - top : Infinity;
    const height = Math.max(draftRect.height, Math.min(MAX_IDLE_NOTES_HEIGHT, keyboardLimit));

    return { top, left, width: right - left, height };
  }

  // el.style.top/left need to be relative to el's actual CSS containing
  // block, not the viewport -- getBoundingClientRect() is always
  // viewport-relative, but #setterScreen carries `transform:
  // translateY(0)` while `.screen.active` (see layout.css), and ANY
  // non-`none` transform on an ancestor makes IT the containing block for
  // a `position: fixed` descendant instead of the viewport (per the CSS
  // spec) -- so viewport coordinates written directly into top/left
  // landed dozens of pixels off. el.offsetParent reflects this correctly
  // for fixed-position elements (browsers resolve it to that transformed
  // ancestor instead of null), so it's used here rather than hardcoding
  // #setterScreen.
  function applyFixedRect(el, rect) {
    const parent = el.offsetParent;
    const parentRect = parent?.getBoundingClientRect();
    const offX = parentRect?.left || 0;
    const offY = parentRect?.top || 0;
    el.style.top = `${rect.top - offY}px`;
    el.style.left = `${rect.left - offX}px`;
    el.style.width = `${rect.width}px`;
    el.style.height = `${rect.height}px`;
  }

  // FLIP: el is assumed already pinned at startRect (position: fixed,
  // inline top/left/width/height) when this runs. Animates it to
  // endRect, then hands off to onSettle for any final cleanup.
  function flip(el, startRect, endRect, onSettle) {
    const reduceMotion =
      window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    const myToken = ++flipToken;

    if (reduceMotion || (startRect.width === 0 && startRect.height === 0)) {
      applyFixedRect(el, endRect);
      onSettle?.();
      return;
    }

    applyFixedRect(el, startRect);
    void el.offsetWidth; // force layout so the start rect is registered
    el.classList.add("idle-flip-animating");
    requestAnimationFrame(() => {
      if (myToken !== flipToken) return;
      applyFixedRect(el, endRect);
    });

    const finish = () => {
      if (myToken !== flipToken) return;
      el.classList.remove("idle-flip-animating");
      onSettle?.();
    };
    el.addEventListener("transitionend", finish, { once: true });
    setTimeout(finish, 400);
  }

  function enterIdleExpand() {
    const activitySection = document.querySelector(
      "#setterScreen .setter-sidebar-activity"
    );
    const hint = byId("setterNotesIdleHint");
    if (!activitySection || idleExpanded) return;

    const startRect = activitySection.getBoundingClientRect();

    idleExpanded = true;
    idlePriorPanel = activeSetterPanel || "log";

    // Pin at the old in-flow spot the instant this leaves flow, before
    // measuring anything else -- .setter-sidebar shrinking by this
    // section's height can nudge the whole .play-row (and the keyboard
    // below it) up (see the ".theme-setter .play-row" stretch comment in
    // layout.css), so computeExpandedRect has to run AFTER that reflow
    // has already happened, or its keyboard-avoidance math would be
    // clamping against a keyboard position that's about to move.
    activitySection.classList.add("idle-floating");
    applyFixedRect(activitySection, startRect);

    activeSetterPanel = "notes";
    showSetterSidebarPanel("notes");
    hint?.classList.remove("hidden");

    const targetRect = computeExpandedRect();
    if (!targetRect) return;

    flip(activitySection, startRect, targetRect);
  }

  function exitIdleExpand() {
    const activitySection = document.querySelector(
      "#setterScreen .setter-sidebar-activity"
    );
    const hint = byId("setterNotesIdleHint");
    if (!activitySection || !idleExpanded) return;

    const startRect = activitySection.getBoundingClientRect();
    const restoreTab = window.setterNotesHasFeasible?.()
      ? "notes"
      : idlePriorPanel || "log";

    idleExpanded = false;
    hint?.classList.add("hidden");
    activeSetterPanel = restoreTab;
    showSetterSidebarPanel(restoreTab);

    // Measure the true natural in-flow rect by briefly reverting to
    // normal layout, then immediately re-pinning at the old fixed spot
    // before the next paint -- avoids a visible flicker while still
    // telling us exactly where the collapse should animate to.
    activitySection.classList.remove("idle-floating");
    activitySection.style.position = "";
    activitySection.style.top = "";
    activitySection.style.left = "";
    activitySection.style.width = "";
    activitySection.style.height = "";
    const endRect = activitySection.getBoundingClientRect();
    activitySection.classList.add("idle-floating");

    flip(activitySection, startRect, endRect, () => {
      activitySection.classList.remove("idle-floating");
      activitySection.style.position = "";
      activitySection.style.top = "";
      activitySection.style.left = "";
      activitySection.style.width = "";
      activitySection.style.height = "";
    });
  }

  // Called from client.js's updateUI() after every state update -- turn
  // classes on #setterScreen are already current by then (updateScreens
  // runs first), so this just reacts to whatever they say.
  window.updateSetterIdleExpand = function (state) {
    if (shouldIdleExpand(state)) {
      enterIdleExpand();
    } else if (idleExpanded) {
      exitIdleExpand();
    }
  };

  function initialiseSetterSidebar() {
    const logButton = byId("actionLogBtnSetter");
    const notesButton = byId("notesBtnSetter");

    logButton?.addEventListener("click", () => {
      activeSetterPanel = activeSetterPanel === "log" ? null : "log";
      showSetterSidebarPanel(activeSetterPanel);
    });

    notesButton?.addEventListener("click", () => {
      activeSetterPanel = activeSetterPanel === "notes" ? null : "notes";
      showSetterSidebarPanel(activeSetterPanel);
    });

    // Required initial state: Log open.
    showSetterSidebarPanel("log");

    // Whenever the player returns to the setter screen, reopen Log by
    // default again.
    const setterScreen = byId("setterScreen");

    if (setterScreen) {
      let wasActive = setterScreen.classList.contains("active");

      const screenObserver = new MutationObserver(() => {
        const isActive = setterScreen.classList.contains("active");

        if (isActive && !wasActive) {
          activeSetterPanel = "log";
          showSetterSidebarPanel("log");
        }

        if (!isActive && idleExpanded) {
          // Left the setter screen mid-idle-expand -- snap back instantly
          // (no animation) so nothing stays floating over a hidden screen.
          idleExpanded = false;
          flipToken++;
          const activitySection = document.querySelector(
            "#setterScreen .setter-sidebar-activity"
          );
          activitySection?.classList.remove("idle-floating", "idle-flip-animating");
          if (activitySection) {
            activitySection.style.position = "";
            activitySection.style.top = "";
            activitySection.style.left = "";
            activitySection.style.width = "";
            activitySection.style.height = "";
          }
          byId("setterNotesIdleHint")?.classList.add("hidden");
        }

        wasActive = isActive;
      });

      screenObserver.observe(setterScreen, {
        attributes: true,
        attributeFilter: ["class"]
      });
    }

    // Keep the floating rect glued to the draft row / sidebar area across
    // viewport size changes (device rotation, resizing a desktop window).
    window.addEventListener("resize", () => {
      if (!idleExpanded) return;
      const activitySection = document.querySelector(
        "#setterScreen .setter-sidebar-activity"
      );
      const targetRect = computeExpandedRect();
      if (!activitySection || !targetRect) return;
      activitySection.classList.remove("idle-flip-animating");
      applyFixedRect(activitySection, targetRect);
    });
  }

  /*
    Exposed in case the tutorial or another UI module needs to select
    one of these views.
  */
  window.showSetterSidebarPanel = showSetterSidebarPanel;

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      initialiseSetterSidebar,
      { once: true }
    );
  } else {
    initialiseSetterSidebar();
  }
})();
