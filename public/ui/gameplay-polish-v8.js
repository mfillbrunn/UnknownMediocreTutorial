(() => {
  "use strict";

  const byId = id => document.getElementById(id);

  let notesPopped = false;
  let notesAutoOpened = false;
  let notesPreviousState = null;
  let latestState = null;
  let resizeFrame = 0;
  let notesRetryTimer = null;
  let notesOriginalParent = null;
  let notesOriginalNextSibling = null;

  function setImportant(element, property, value) {
    element?.style.setProperty(property, value, "important");
  }

  function removeInlineLayout(element) {
    if (!element) return;

    for (const property of [
      "position",
      "left",
      "right",
      "top",
      "bottom",
      "width",
      "height",
      "max-width",
      "max-height",
      "min-width",
      "min-height",
      "z-index",
      "transform",
      "transition",
      "will-change"
    ]) {
      element.style.removeProperty(property);
    }
  }

  function ensureInspectorTurnBanner(panel) {
    let banner = byId("setterInspectorTurnNotesBanner");

    if (banner) return banner;

    banner = document.createElement("div");
    banner.id = "setterInspectorTurnNotesBanner";
    banner.className = "setter-inspector-turn-notes-banner";
    banner.innerHTML = `
      <span aria-hidden="true">✎</span>
      <span>Guesser turn — use the time to jot down notes</span>
    `;

    panel.prepend(banner);
    return banner;
  }

  function notesShouldPop(state) {
    const screen = byId("setterScreen");

    const normalInspectorTurn =
      state?.phase === "normal" &&
      state.turn === state.guesser &&
      !state.pendingGuess;

    const openingInspectorTurn =
      state?.phase === "simultaneous" &&
      !!state.simultaneousSecretSubmitted &&
      !state.simultaneousGuessSubmitted;

    const handoffInFlight = !!document.querySelector(
      ".setter-pending-hold-clone, .history-flight-clone"
    );

    return !!(
      state &&
      window.myRole === "setter" &&
      screen?.classList.contains("active") &&
      !state.gameOver &&
      (normalInspectorTurn || openingInspectorTurn) &&
      !window.isSpyChargeAwardAnimating?.() &&
      !handoffInFlight
    );
  }

  // Popping the notes panel out over the board is now a deliberate tap
  // (see openNotesFromButton) instead of automatic -- this just keeps the
  // small "Open Notes" button's visibility in sync with eligibility, and
  // still auto-repositions/auto-closes an already-open popout as the
  // board/turn changes underneath it (there's nothing left for it to
  // float over once the setter has to act again).
  function updateNotesOpenButton(available) {
    const btn = byId("setterNotesIdleOpenBtn");
    if (!btn) return;
    btn.classList.toggle("hidden", !available || notesPopped);
  }

  function syncInspectorTurnNotes(state) {
    latestState = state;

    clearTimeout(notesRetryTimer);
    notesRetryTimer = null;

    const available = notesShouldPop(state);
    updateNotesOpenButton(available);

    if (available) {
      if (notesPopped) positionNotesPopout();
      return;
    }

    const shouldRetry = !!(
      state &&
      window.myRole === "setter" &&
      byId("setterScreen")?.classList.contains("active") &&
      (
        window.isSpyChargeAwardAnimating?.() ||
        document.querySelector(
          ".setter-pending-hold-clone, .history-flight-clone"
        )
      )
    );

    if (shouldRetry) {
      notesRetryTimer = setTimeout(() => {
        syncInspectorTurnNotes(latestState || window.state);
      }, 360);
      return;
    }

    restoreInspectorTurnNotes();
  }

  function positionNotesPopout() {
    if (!notesPopped) return;

    const panel = byId("notesPanelSetter");
    const board = document.querySelector("#setterScreen .setter-board");
    const keyboard = byId("keyboardSetter");
    const header = document.querySelector("#setterScreen .role-header");

    if (!panel || !board) return;

    const boardRect = board.getBoundingClientRect();
    const keyboardRect = keyboard?.getBoundingClientRect();
    const headerRect = header?.getBoundingClientRect();

    const edge = 8;
    const topLimit = Math.max(
      boardRect.top + edge,
      (headerRect?.bottom || boardRect.top) + edge
    );

    const bottomLimit = Math.min(
      keyboardRect?.top ? keyboardRect.top - 9 : boardRect.bottom - edge,
      window.innerHeight - edge
    );

    const available = Math.max(118, bottomLimit - topLimit);
    const height = Math.min(238, available);
    const top = Math.max(topLimit, bottomLimit - height);

    // Width still roughly matches the board's own width (so it reads as
    // "covering the board" rather than some arbitrary size), but is
    // computed against the viewport rather than boardRect.left below --
    // the board itself sits in the right-hand portion of the screen
    // whenever the sidebar is open (it shares the row with it), so
    // deriving width from a left-edge anchored to the board carried that
    // same rightward shift into the panel.
    const width = Math.max(180, Math.min(boardRect.width - edge * 2, window.innerWidth - edge * 2));

    // Center horizontally in the full screen, not just within the board's
    // own column -- anchoring to boardRect.left (the previous approach)
    // put the panel flush against whichever side of the screen the board
    // happened to occupy (typically the right, next to the sidebar),
    // which read as "stuck to the right" instead of centered.
    let left = Math.max(edge, (window.innerWidth - width) / 2);
    left = Math.min(left, window.innerWidth - edge - width);

    // `left`/`top` above are computed in viewport coordinates (everything
    // feeding them comes from getBoundingClientRect()), but `.screen.active`
    // (layout.css) sets `transform: translateY(0)` on the active screen,
    // which makes that screen -- not the viewport -- the containing block
    // for this panel's `position: fixed` (any transformed ancestor takes
    // over as the containing block). Without re-basing onto that ancestor's
    // own viewport offset, the panel renders shifted down-and-right by the
    // screen's offset, which is what pushed it off the right edge and let
    // it drop low enough to cover the keyboard. offsetParent reliably
    // resolves to that ancestor for a fixed element in this situation.
    const origin = panel.offsetParent;
    const originRect = origin
      ? origin.getBoundingClientRect()
      : { left: 0, top: 0 };
    const originStyle = origin ? getComputedStyle(origin) : null;
    const originBorderLeft = originStyle ? parseFloat(originStyle.borderLeftWidth) || 0 : 0;
    const originBorderTop = originStyle ? parseFloat(originStyle.borderTopWidth) || 0 : 0;

    setImportant(panel, "position", "fixed");
    setImportant(panel, "left", `${Math.round(left - originRect.left - originBorderLeft)}px`);
    setImportant(panel, "right", "auto");
    setImportant(panel, "top", `${Math.round(top - originRect.top - originBorderTop)}px`);
    setImportant(panel, "bottom", "auto");
    setImportant(panel, "width", `${Math.round(width)}px`);
    setImportant(panel, "height", `${Math.round(height)}px`);
    setImportant(panel, "min-width", "0");
    setImportant(panel, "min-height", "0");
    setImportant(panel, "max-width", "none");
    setImportant(panel, "max-height", "none");
    setImportant(panel, "z-index", "10080");
    setImportant(panel, "transform", "none");
  }

  function rememberSidebarState() {
    if (notesPreviousState) return;

    const logPanel = byId("actionLogSetter");
    const notesPanel = byId("notesPanelSetter");
    const logButton = byId("actionLogBtnSetter");
    const notesButton = byId("notesBtnSetter");

    notesPreviousState = {
      logHidden: logPanel?.classList.contains("hidden") ?? true,
      notesHidden: notesPanel?.classList.contains("hidden") ?? true,
      logSelected: logButton?.classList.contains("is-active") ?? false,
      notesSelected: notesButton?.classList.contains("is-active") ?? false,
      notesActive: !!window.isNotesActive?.()
    };
  }

  function setTabState(button, selected) {
    if (!button) return;
    button.classList.toggle("is-active", selected);
    button.setAttribute("aria-selected", String(selected));
  }

  function openInspectorTurnNotes(state) {
    const screen = byId("setterScreen");
    const panel = byId("notesPanelSetter");
    const logPanel = byId("actionLogSetter");
    const logButton = byId("actionLogBtnSetter");
    const notesButton = byId("notesBtnSetter");

    if (!screen || !panel) return;

    if (!notesPopped) {
      rememberSidebarState();
      notesAutoOpened = !window.isNotesActive?.();

      if (notesAutoOpened) {
        window.toggleNotes?.("setter");
      }

      notesPopped = true;
      screen.classList.add("setter-inspector-turn-notes-open");
      panel.classList.remove("hidden");
      panel.classList.add("inspector-turn-notes-popout");
      ensureInspectorTurnBanner(panel);

      // Move out of the sidebar and onto the screen directly. The sidebar
      // can collapse to width:0 with overflow:hidden while this is
      // showing (setter-board.js's collapse toggle no longer closes
      // Notes for this case -- see its own comment), and an ancestor's
      // overflow clipping still applies to a position:fixed descendant's
      // paint even though fixed positioning exempts it from that
      // ancestor's own layout/sizing. Restored to its original spot on
      // the way back out below.
      notesOriginalParent = panel.parentElement;
      notesOriginalNextSibling = panel.nextSibling;
      screen.appendChild(panel);

      // Keep the Log in the ordinary left slot while Notes floats over the board.
      logPanel?.classList.remove("hidden");
      setTabState(logButton, true);
      setTabState(notesButton, false);
    }

    latestState = state;
    positionNotesPopout();
  }

  function restoreInspectorTurnNotes() {
    if (!notesPopped) return;

    const screen = byId("setterScreen");
    const panel = byId("notesPanelSetter");
    const logPanel = byId("actionLogSetter");
    const logButton = byId("actionLogBtnSetter");
    const notesButton = byId("notesBtnSetter");
    const banner = byId("setterInspectorTurnNotesBanner");
    const previous = notesPreviousState;

    notesPopped = false;
    screen?.classList.remove("setter-inspector-turn-notes-open");
    panel?.classList.remove("inspector-turn-notes-popout");
    removeInlineLayout(panel);
    banner?.remove();

    if (panel && notesOriginalParent) {
      notesOriginalParent.insertBefore(panel, notesOriginalNextSibling);
    }
    notesOriginalParent = null;
    notesOriginalNextSibling = null;

    if (notesAutoOpened) {
      window.closeNotes?.();
      panel?.classList.add("hidden");
      logPanel?.classList.remove("hidden");
      setTabState(logButton, true);
      setTabState(notesButton, false);
    } else if (previous) {
      panel?.classList.toggle("hidden", previous.notesHidden);
      logPanel?.classList.toggle("hidden", previous.logHidden);
      setTabState(logButton, previous.logSelected);
      setTabState(notesButton, previous.notesSelected);
    }

    notesAutoOpened = false;
    notesPreviousState = null;
  }

  function openNotesFromButton() {
    const state = latestState || window.state;
    if (!notesShouldPop(state)) return;
    openInspectorTurnNotes(state);
    updateNotesOpenButton(false);
  }

  function installNotesTurnController() {
    const screen = byId("setterScreen");

    // v5 deliberately disabled the old maximize system. Disconnect its
    // observer so it cannot strip the new, intentional Guesser-turn panel.
    screen?.__polishObserver?.disconnect?.();
    if (screen) screen.__polishObserver = null;

    byId("setterActivityDragHandle")?.remove();

    const openBtn = byId("setterNotesIdleOpenBtn");
    if (openBtn && !openBtn.__v8WiredUp) {
      openBtn.__v8WiredUp = true;
      openBtn.addEventListener("click", openNotesFromButton);
    }

    window.updateSetterIdleExpand = function (state) {
      syncInspectorTurnNotes(state);
    };

    window.reanchorSetterIdleNotes = function () {
      if (notesPopped) {
        positionNotesPopout();
      } else {
        syncInspectorTurnNotes(latestState || window.state);
      }
    };

    if (screen && !screen.__v8NotesScreenObserver) {
      const observer = new MutationObserver(() => {
        syncInspectorTurnNotes(latestState || window.state);
      });

      observer.observe(screen, {
        attributes: true,
        attributeFilter: ["class"]
      });

      screen.__v8NotesScreenObserver = observer;
    }
  }

  function makeTrashIcon() {
    return `
      <svg class="guesser-clear-trash-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 7h16" />
        <path d="M9 7V4h6v3" />
        <path d="M7 7l1 13h8l1-13" />
        <path d="M10 11v5M14 11v5" />
      </svg>
    `;
  }

  function ensureGuesserActions() {
    let actions = byId("guesserDecisionActions");

    if (actions) return actions;

    const draftWrap = document.querySelector(
      "#guesserScreen .center-col .draft-row-wrap"
    );

    if (!draftWrap) return null;

    actions = document.createElement("div");
    actions.id = "guesserDecisionActions";
    actions.className = "guesser-decision-actions hidden";
    actions.innerHTML = `
      <button type="button" id="guesserClearDraftBtn" class="guesser-decision-btn guesser-clear-btn" disabled>
        ${makeTrashIcon()}
        <span>Clear</span>
      </button>
      <button type="button" id="guesserSubmitGuessBtn" class="guesser-decision-btn guesser-submit-btn" disabled>
        Submit Guess
      </button>
    `;

    draftWrap.insertAdjacentElement("afterend", actions);

    byId("guesserClearDraftBtn")?.addEventListener("click", () => {
      for (let index = 0; index < 5; index++) {
        if (window.isGuesserDraftIndexLocked?.(index)) {
          window.toggleGuesserDraftLock?.(index);
        }
      }

      window.setGuesserDraft?.("");
      updateGuesserActions(latestState || window.state);
    });

    byId("guesserSubmitGuessBtn")?.addEventListener("click", () => {
      document
        .querySelector('#keyboardGuesser .key[data-key="ENTER"]')
        ?.click();
    });

    const draftContainer = byId("draftGuesser");

    if (draftContainer && !draftContainer.__v8ActionObserver) {
      const observer = new MutationObserver(() => {
        updateGuesserActions(latestState || window.state);
      });

      observer.observe(draftContainer, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ["class", "style"]
      });

      draftContainer.__v8ActionObserver = observer;
    }

    return actions;
  }

  function currentGuesserDraft() {
    const row =
      byId("draftGuesser")?.__draftRows?.draft ||
      document.querySelector("#draftGuesser .history-row.guesser-draft");

    if (!row || row.style.display === "none") return "";

    return [...row.querySelectorAll(":scope > .history-tile")]
      .map(tile => tile.textContent?.trim() || "")
      .join("")
      .toUpperCase();
  }

  function updateGuesserActions(state) {
    const actions = ensureGuesserActions();
    if (!actions) return;

    const draft = currentGuesserDraft();
    const phase = state?.phase;
    const canEdit = !!(
      window.myRole === "guesser" &&
      !state?.pendingGuess &&
      phase !== "gameOver" &&
      phase !== "roundSummary" &&
      (
        (phase === "simultaneous" && !state?.simultaneousGuessSubmitted) ||
        (phase === "normal" && state?.turn === state?.guesser)
      )
    );

    actions.classList.toggle("hidden", !canEdit);

    const clearButton = byId("guesserClearDraftBtn");
    const submitButton = byId("guesserSubmitGuessBtn");

    if (clearButton) clearButton.disabled = !canEdit || draft.length === 0;

    if (submitButton) {
      submitButton.disabled = !canEdit || draft.length !== 5;
      // "Finish New Guess" while still typing (mirrors the Secretkeeper's own
      // "FINISH NEW SECRET" for an incomplete draft -- see client.js's
      // computeSetterSecretStatus), then spelled out as the actual word
      // once there's a real 5-letter guess to submit -- same "actual word
      // once it's actionable" treatment as the Secretkeeper's Keep/Submit buttons.
      submitButton.textContent =
        draft.length === 5 ? `Submit ${draft}` : "Finish New Guess";
    }
  }

  function copyExactTileVisual(sourceRow, cloneRow) {
    const sourceTiles = sourceRow.querySelectorAll(":scope > .history-tile");
    const cloneTiles = cloneRow.querySelectorAll(":scope > .history-tile");

    sourceTiles.forEach((source, index) => {
      const clone = cloneTiles[index];
      if (!clone) return;

      const rect = source.getBoundingClientRect();
      const style = getComputedStyle(source);

      Object.assign(clone.style, {
        width: `${rect.width}px`,
        height: `${rect.height}px`,
        flex: `0 0 ${rect.width}px`,
        boxSizing: style.boxSizing,
        padding: style.padding,
        borderRadius: style.borderRadius,
        fontSize: style.fontSize,
        fontFamily: style.fontFamily,
        fontWeight: style.fontWeight,
        lineHeight: style.lineHeight,
        letterSpacing: style.letterSpacing,
        animation: "none",
        transform: "none"
      });

      /*
       * history.css gives every .history-flight-clone a generic hollow
       * treatment with !important. Preserve the exact pending-row visual
       * by putting the computed source styles inline with !important too.
       */
      clone.style.setProperty("background", style.background, "important");
      clone.style.setProperty("background-color", style.backgroundColor, "important");
      clone.style.setProperty("color", style.color, "important");
      clone.style.setProperty("border", style.border, "important");
      clone.style.setProperty("box-shadow", style.boxShadow, "important");
      clone.style.setProperty("opacity", style.opacity, "important");
      clone.style.setProperty("filter", style.filter, "important");
    });
  }

  function installSetterPendingCloneOverride() {
    window.captureSetterPendingGuessVisual = function (row) {
      if (!row?.isConnected) return null;

      document
        .querySelectorAll(".setter-pending-hold-clone")
        .forEach(element => element.remove());

      const rect = row.getBoundingClientRect();
      if (!rect.width || !rect.height) return null;

      const clone = row.cloneNode(true);
      clone.className =
        "history-row setter-pending-hold-clone setter-source-flight";
      clone.setAttribute("aria-hidden", "true");

      clone
        .querySelectorAll(
          ".setter-row-caption, #setterCoverStars, .setter-cover-stars, [id]"
        )
        .forEach(element => {
          if (
            element.matches(
              ".setter-row-caption, #setterCoverStars, .setter-cover-stars"
            )
          ) {
            element.remove();
          } else {
            element.removeAttribute("id");
          }
        });

      copyExactTileVisual(row, clone);

      const rowStyle = getComputedStyle(row);

      Object.assign(clone.style, {
        position: "fixed",
        left: `${rect.left}px`,
        top: `${rect.top}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
        display: "flex",
        alignItems: rowStyle.alignItems,
        justifyContent: rowStyle.justifyContent,
        gap: rowStyle.gap,
        padding: rowStyle.padding,
        margin: "0",
        border: "0",
        background: "transparent",
        boxShadow: "none",
        zIndex: "99990",
        pointerEvents: "none",
        transform: "none",
        opacity: "1"
      });

      document.body.appendChild(clone);

      const stars = byId("setterCoverStars");
      const starRect =
        stars && !stars.classList.contains("hidden")
          ? stars.getBoundingClientRect()
          : null;

      if (starRect?.width && starRect?.height) {
        window._pendingSpyChargeSourceRect = {
          left: starRect.left,
          top: starRect.top,
          width: starRect.width,
          height: starRect.height
        };
      }

      return {
        holdClone: clone,
        starRect:
          starRect?.width && starRect?.height
            ? {
                left: starRect.left,
                top: starRect.top,
                width: starRect.width,
                height: starRect.height
              }
            : null
      };
    };
  }


  function reducedMotion() {
    return !!window.matchMedia?.(
      "(prefers-reduced-motion: reduce)"
    ).matches;
  }

  window.flySetterPendingCloneToHistory = function (
    clone,
    targetWrap,
    onComplete
  ) {
    const targetRow =
      targetWrap?.querySelector?.(".history-row");

    if (!clone?.isConnected || !targetRow) {
      return false;
    }

    const scrollBox =
      targetWrap.closest?.(".history-scroll");

    if (scrollBox) {
      // Follow to the bottom only if the reader is actually eligible to
      // follow right now -- otherwise the pending row landed off-screen for
      // someone who deliberately scrolled away, and forcing the viewport
      // (or flying a clone) to it isn't worth fighting their own gesture
      // for. Bail out the same way this function already does for any
      // other "can't fly" case (a bad clone, a zero-size rect) so the
      // caller's own non-flight fallback finishes the row in place.
      const scrollIntent =
        window.captureHistoryScrollIntent?.(scrollBox) ?? { eligible: true, scrollTop: scrollBox.scrollTop };

      if (window.restoreHistoryScrollIntent) {
        window.restoreHistoryScrollIntent(scrollBox, scrollIntent);
      } else if (scrollIntent.eligible) {
        scrollBox.scrollTop = scrollBox.scrollHeight;
      }

      if (!scrollIntent.eligible) {
        return false;
      }
    }

    const startRect = clone.getBoundingClientRect();
    const endRect = targetRow.getBoundingClientRect();

    if (
      !startRect.width ||
      !startRect.height ||
      !endRect.width ||
      !endRect.height
    ) {
      return false;
    }

    targetWrap.style.visibility = "hidden";

    const finish = () => {
      clone.remove();
      onComplete?.();
    };

    if (reducedMotion()) {
      finish();
      return true;
    }

    const dx =
      endRect.left + endRect.width / 2 -
      (startRect.left + startRect.width / 2);

    const dy =
      endRect.top + endRect.height / 2 -
      (startRect.top + startRect.height / 2);

    const scaleX = endRect.width / startRect.width;
    const scaleY = endRect.height / startRect.height;

    clone.style.transformOrigin = "center center";
    clone.style.willChange = "transform";
    clone.style.transition =
      "transform 460ms cubic-bezier(0.22, 1, 0.36, 1)";

    let completed = false;
    let timer = null;

    const land = event => {
      if (
        completed ||
        (event && event.propertyName !== "transform")
      ) {
        return;
      }

      completed = true;
      clearTimeout(timer);
      clone.removeEventListener("transitionend", land);
      finish();
    };

    clone.addEventListener("transitionend", land);

    requestAnimationFrame(() => {
      clone.style.transform =
        `translate3d(${dx}px, ${dy}px, 0) ` +
        `scale(${scaleX}, ${scaleY})`;

      timer = setTimeout(land, 650);
    });

    return true;
  };

  function scheduleReposition() {
    if (resizeFrame) cancelAnimationFrame(resizeFrame);

    resizeFrame = requestAnimationFrame(() => {
      resizeFrame = 0;
      positionNotesPopout();
      updateGuesserActions(latestState || window.state);
    });
  }

  function init() {
    installNotesTurnController();
    installSetterPendingCloneOverride();
    ensureGuesserActions();

    const stateHandler = state => {
      latestState = state;
      updateGuesserActions(state);
      syncInspectorTurnNotes(state);
    };

    if (typeof window.onStateUpdate === "function") {
      window.onStateUpdate(stateHandler);
    } else if (typeof onStateUpdate === "function") {
      onStateUpdate(stateHandler);
    }

    window.addEventListener("resize", scheduleReposition, { passive: true });
    window.addEventListener("orientationchange", scheduleReposition, { passive: true });
    window.visualViewport?.addEventListener("resize", scheduleReposition, { passive: true });
    window.visualViewport?.addEventListener("scroll", scheduleReposition, { passive: true });

    updateGuesserActions(window.state);
    syncInspectorTurnNotes(window.state);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
