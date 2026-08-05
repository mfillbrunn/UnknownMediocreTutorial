(() => {
  "use strict";

  const byId = id => document.getElementById(id);

  function setTabState(button, selected) {
    if (!button) return;
    button.classList.toggle("is-active", selected);
    button.setAttribute("aria-selected", String(selected));
  }

  // Which of Log/Notes is showing in the single in-flow panel slot while
  // it's the setter's own turn (module scope so the idle-expand logic
  // below can read/restore it). Log by default -- matches the tab always
  // being available even before the setter has any reason to reach for
  // Notes yet.
  let activeSetterPanel = "log";

  // Only meaningful while NOT idle-expanded -- during idle, Log and Notes
  // are both visible at once (Log docked here, Notes floating, see
  // enterIdleExpand), so there's nothing to switch between and this
  // isn't called.
  function showSetterSidebarPanel(panelName) {
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
  // While it isn't the setter's turn, there's nothing left to toggle
  // between: Log stays docked in its normal spot (still visible, on the
  // left with the rest of the sidebar) and Notes alone pops out, floating
  // over the board/draft-row column (.center-col -- same width/left
  // position as that column, just taller) so the setter can use the dead
  // time to jot candidate words. Keystrokes only reach Notes while it's
  // active (see notes.js's window.notesInput, gated on _isMyTurnToType,
  // and ensureNotesOpen below which keeps it active throughout). Notes
  // snaps back to its normal in-flow spot (replacing Log as the active
  // tab) the instant the turn returns.
  // ------------------------------------------------------------------

  function ensureNotesOpen() {
    if (!window.isNotesActive?.()) window.toggleNotes?.("setter");
  }

  let idleExpanded = false;
  let flipToken = 0;

  function shouldIdleExpand(state) {
    const setterScreen = byId("setterScreen");
    if (!setterScreen?.classList.contains("active")) return false;
    if (!setterScreen.classList.contains("is-not-your-turn")) return false;
    // The Advanced Tutorial's setter round exists specifically to teach
    // this behavior ("Notes has opened automatically as a scratchpad
    // while you wait" -- see runAdvancedTutorialSetter in tutorial-ui.js),
    // so it's the one tutorial stage that needs idle-expand actually
    // running instead of suppressed like every other scripted tutorial.
    if (state?.isTutorial && state.tutorialStage !== "advanced") return false;
    if (state?.phase === "gameOver") return false;
    return true;
  }

  // Anchored to the keyboard's top edge (not the draft row) so the panel
  // keeps the same usable size no matter how much feedback has piled up
  // above it, and capped so a slice of that feedback always stays on
  // screen -- the earlier version pinned its TOP to the draft row, which
  // drifts steadily downward as history fills the column, so by ~8 guesses
  // the keyboard clamp below had squeezed the panel down to a ~28px sliver
  // wedged against the keyboard. The feedback rows scroll instead now (see
  // setIdleHistoryCap), which is how the in-flow draft row already behaves.
  const MAX_IDLE_NOTES_HEIGHT = 220;
  const KEYBOARD_GAP = 10;
  // Smallest slice of the feedback list worth keeping visible above the
  // panel; it scrolls internally within whatever's left (.history-scroll
  // is already overflow-y:auto, see history.css).
  const MIN_HISTORY_HEIGHT = 72;
  const HISTORY_GAP = 6;

  function computeExpandedRect() {
    // .draft-row-wrap itself is a flex:1 spacer (see layout.css's
    // ".theme-setter .draft-row-wrap") that stretches to soak up whatever
    // vertical room history isn't using, so its own rect can be huge --
    // .draft-stack (its child, holding the actual tile row + overlays) is
    // the piece that's actually intrinsically sized around the visible
    // row, vertically centered inside that stretch.
    const draftStack = document.querySelector("#setterScreen .draft-stack");
    const centerCol = document.querySelector("#setterScreen .center-col");
    const keyboard = document.getElementById("keyboardSetter");
    const historyScroll = document.getElementById("setterGuesserSubmitted");
    if (!draftStack || !centerCol) return null;

    const draftRect = draftStack.getBoundingClientRect();
    const centerRect = centerCol.getBoundingClientRect();
    const keyboardRect = keyboard?.getBoundingClientRect();

    // Only as wide as .center-col (the board/history/draft-row column,
    // which renders on the right -- .theme-setter .powers-col carries
    // order:1 and .center-col order:2, see layout.css) -- it used to also
    // span the sidebar column, which just made it wider than it needed to
    // be. Keeping it center-col-width and -aligned leaves the sidebar
    // (powers + Log, on the left) fully visible throughout.
    const left = centerRect.left;
    const width = centerRect.width;

    // The bottom edge is the fixed anchor: parked just above the keyboard,
    // which never moves as history grows (.play-row is the one flexible
    // link in the column chain, see layout.css). The panel then grows
    // UPWARD from there.
    const bottom = keyboardRect
      ? keyboardRect.top - KEYBOARD_GAP
      : centerRect.bottom;

    // The history list's own top is fixed by the constraint row above it
    // and doesn't move when its height is capped, so this can't feed back
    // into itself the way anchoring to the draft row did.
    const historyTop = (historyScroll || draftStack).getBoundingClientRect().top;
    const roomAbove = bottom - historyTop - MIN_HISTORY_HEIGHT - HISTORY_GAP;
    const height = Math.max(
      draftRect.height,
      Math.min(MAX_IDLE_NOTES_HEIGHT, roomAbove)
    );

    return { top: bottom - height, left, width, height };
  }

  // The floating panel is position:fixed, so it can't push the feedback
  // list out of its way on its own -- cap that list to the room left above
  // the panel and let it scroll there instead, same as the in-flow layout
  // already does for the draft row.
  function setIdleHistoryCap(rect) {
    const historyScroll = document.getElementById("setterGuesserSubmitted");
    if (!historyScroll || !rect) return;
    const historyTop = historyScroll.getBoundingClientRect().top;
    const cap = Math.max(MIN_HISTORY_HEIGHT, rect.top - HISTORY_GAP - historyTop);
    historyScroll.style.maxHeight = `${cap}px`;
    // Newest guess is the one that matters -- keep it in view now that the
    // box it lives in is shorter than the rows it holds.
    historyScroll.scrollTop = historyScroll.scrollHeight;
  }

  function clearIdleHistoryCap() {
    const historyScroll = document.getElementById("setterGuesserSubmitted");
    if (historyScroll) historyScroll.style.maxHeight = "";
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

  function clearFixedStyles(el) {
    el.style.position = "";
    el.style.top = "";
    el.style.left = "";
    el.style.width = "";
    el.style.height = "";
  }

  function enterIdleExpand() {
    const activitySection = document.querySelector(
      "#setterScreen .setter-sidebar-activity"
    );
    const notesPanel = byId("notesPanelSetter");
    const logPanel = byId("actionLogSetter");
    const hint = byId("setterNotesIdleHint");
    if (!activitySection || !notesPanel || idleExpanded) return;

    idleExpanded = true;

    // Tabs have nothing to do during idle (see the CSS comment on
    // .idle-mode) -- hide them, and force Log visible in its normal spot
    // regardless of whatever tab was selected before idle started.
    activitySection.classList.add("idle-mode");
    logPanel?.classList.remove("hidden");

    // Measure Notes' natural in-flow rect (unhidden, still in its normal
    // single-panel slot, Log not yet forced open) BEFORE anything else
    // moves -- .setter-sidebar shrinking/growing as Log's visibility
    // changes can nudge the whole .play-row (and the keyboard below it)
    // up or down (see the ".theme-setter .play-row" stretch comment in
    // layout.css), so computeExpandedRect has to run AFTER that reflow
    // has already happened, or its keyboard-avoidance math would be
    // clamping against a keyboard position that's about to move.
    notesPanel.classList.remove("hidden");
    const startRect = notesPanel.getBoundingClientRect();

    // Pin Notes at that spot the instant it leaves flow -- taking it out
    // of flow (position:fixed) is what lets Log immediately reclaim the
    // panel slot right after.
    notesPanel.classList.add("idle-floating");
    applyFixedRect(notesPanel, startRect);

    ensureNotesOpen();
    hint?.classList.remove("hidden");

    const targetRect = computeExpandedRect();
    if (!targetRect) return;

    setIdleHistoryCap(targetRect);

    // If the tutorial has Notes highlighted (see highlightNotesPanel() in
    // tutorial-ui.js), its focus ring measured the panel's rect BEFORE
    // this flip started -- once the panel settles at its new floating
    // spot, nudge the ring to catch up. Same element, so the ring's own
    // "target unchanged" fast path never re-measures it on its own.
    flip(notesPanel, startRect, targetRect, () => {
      if (typeof scheduleTutorialLayout === "function") {
        scheduleTutorialLayout();
      }
    });
  }

  function exitIdleExpand() {
    const activitySection = document.querySelector(
      "#setterScreen .setter-sidebar-activity"
    );
    const notesPanel = byId("notesPanelSetter");
    const logPanel = byId("actionLogSetter");
    const hint = byId("setterNotesIdleHint");
    if (!activitySection || !notesPanel || !idleExpanded) return;

    const startRect = notesPanel.getBoundingClientRect();

    idleExpanded = false;
    hint?.classList.add("hidden");
    activitySection.classList.remove("idle-mode");
    clearIdleHistoryCap();

    // The turn's return always resurfaces Notes (not whatever tab was
    // selected before idle started) -- it's what the setter was just
    // actively using, and it avoids an otherwise-awkward case: animating
    // Notes back into a spot it would then immediately vanish from if
    // Log were the one to win instead.
    activeSetterPanel = "notes";
    logPanel?.classList.add("hidden");

    // Measure the true natural in-flow rect by briefly reverting to
    // normal layout, then immediately re-pinning at the old fixed spot
    // before the next paint -- avoids a visible flicker while still
    // telling us exactly where the collapse should animate to.
    notesPanel.classList.remove("idle-floating");
    clearFixedStyles(notesPanel);
    const endRect = notesPanel.getBoundingClientRect();
    notesPanel.classList.add("idle-floating");

    flip(notesPanel, startRect, endRect, () => {
      notesPanel.classList.remove("idle-floating");
      clearFixedStyles(notesPanel);
      showSetterSidebarPanel("notes");

      if (typeof scheduleTutorialLayout === "function") {
        scheduleTutorialLayout();
      }
    });
  }

  // Called from client.js's updateUI() after every state update -- turn
  // classes on #setterScreen are already current by then (updateScreens
  // runs first), so this just reacts to whatever they say.
  window.updateSetterIdleExpand = function (state) {
    if (shouldIdleExpand(state)) {
      if (idleExpanded) {
        // Already floating -- re-anchor against the current layout. Powers
        // and badges appearing in the sidebar mid-turn can shift the
        // column around underneath it, and the panel has to stay parked
        // above the keyboard through all of it.
        reanchorIdleExpand();
      } else {
        enterIdleExpand();
      }
    } else if (idleExpanded) {
      exitIdleExpand();
    }
  };

  // Snap the floating panel (and the feedback list's cap) to the current
  // layout with no animation. Skipped mid-FLIP so it can't fight the
  // enter/exit transition that's still running.
  function reanchorIdleExpand() {
    const notesPanel = byId("notesPanelSetter");
    if (!notesPanel || notesPanel.classList.contains("idle-flip-animating")) return;
    const targetRect = computeExpandedRect();
    if (!targetRect) return;
    applyFixedRect(notesPanel, targetRect);
    setIdleHistoryCap(targetRect);

    if (typeof scheduleTutorialLayout === "function") {
      scheduleTutorialLayout();
    }
  }

  function initialiseSetterSidebar() {
    const logButton = byId("actionLogBtnSetter");
    const notesButton = byId("notesBtnSetter");

    logButton?.addEventListener("click", () => {
      if (idleExpanded) return; // no-op, tabs are hidden during idle anyway
      activeSetterPanel = "log";
      showSetterSidebarPanel("log");
    });

    notesButton?.addEventListener("click", () => {
      if (idleExpanded) return;
      activeSetterPanel = "notes";
      showSetterSidebarPanel("notes");
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
          const notesPanel = byId("notesPanelSetter");
          activitySection?.classList.remove("idle-mode");
          notesPanel?.classList.remove("idle-floating", "idle-flip-animating");
          if (notesPanel) clearFixedStyles(notesPanel);
          clearIdleHistoryCap();
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
      const notesPanel = byId("notesPanelSetter");
      const targetRect = computeExpandedRect();
      if (!notesPanel || !targetRect) return;
      notesPanel.classList.remove("idle-flip-animating");
      applyFixedRect(notesPanel, targetRect);
      setIdleHistoryCap(targetRect);
    });
  }

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
