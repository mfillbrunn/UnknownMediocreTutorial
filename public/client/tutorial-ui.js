// ------------------------
// Tutorial Controller
// ------------------------
let lastTutorialRound = null;
let tutorialSubStep = 0;
let tutorialWaitingFor = null;
let tutorialCollapsed = false;
let tutorialContinueMode = "advance";

// Which tutorial "Next Tutorial" launches from the done-modal (see
// showTutorialDoneModal()) -- each tutorial's own ending branch sets this
// right before switching tutorialContinueMode to "end", so the modal can
// point at whatever naturally comes next instead of always relaunching
// the same tutorial that just finished.
let tutorialEndNextMode = "advanced";

let powerTutorialDraftPrefilled = false;
let powerTutorialSkipSent = false;

let tutorialRevealGateRound = null;
let tutorialRevealGateTimer = null;
let tutorialRevealGateCleanup = null;

let tutorialLastStepKey = "";
let tutorialLayoutFrame = 0;
let tutorialHighlightDraft = [];
let tutorialHighlightTargets = [];
let tutorialHighlightCommitQueued = false;
let tutorialBodyAnimationTimer = null;
let tutorialHighlightSettleTimer = null;
let tutorialRingSettling = false;
let tutorialRingSnapNext = false;

// Set once the player drags the tutorial bubble by hand (see
// setupTutorialBubbleDrag below) -- while true, repositionTutorialBubble's
// automatic avoid-the-highlighted-target placement backs off entirely
// instead of fighting the player's own placement on the next layout pass.
// Cleared on the next real tutorial transition (hideTutorial/endTutorial)
// so a fresh tutorial still opens in its normal spot.
let tutorialUserPositioned = false;

function qs(sel) {
  return document.querySelector(sel);
}

function byId(id) {
  return document.getElementById(id);
}

function setContinue({
  show = true,
  enabled = true,
  mode = null
} = {}) {
  const btn = byId("tutorialContinueBtn");
  if (!btn) return;

  if (mode) {
    tutorialContinueMode = mode;
  }

  btn.style.display = show ? "" : "none";
  btn.disabled = false;
  btn.dataset.requestedEnabled = String(enabled);
}

function updateActionBadge() {
  const badge = byId("tutorialActionBadge");
  const continueBtn = byId("tutorialContinueBtn");
  const bubble = byId("tutorialBubble");

  if (!badge || !continueBtn) return;

  const currentState = window.state || {};
  const waitingType = tutorialWaitingFor?.type;
  const round = currentState.history?.length ?? 0;
  let word = null;

  if (waitingType === "guess") {
    word = currentState.tutorialGuesses?.[round];
  } else if (waitingType === "setSecret") {
    word = currentState.tutorialSecrets?.[round];
    if (currentState.secret === word) word = "";
  }

  const alreadyWaiting =
    (
      waitingType === "guess" &&
      (
        (currentState.phase === "normal" && !!currentState.pendingGuess) ||
        (currentState.phase === "simultaneous" && !!currentState.simultaneousGuessSubmitted)
      )
    ) ||
    (
      waitingType === "setSecret" &&
      currentState.phase === "simultaneous" &&
      !!currentState.simultaneousSecretSubmitted
    );

  let label = "ACTION";

  if (alreadyWaiting) {
    label = "WAITING";
  } else if (tutorialWaitingFor?.label) {
    label = tutorialWaitingFor.label;
  } else if ((waitingType === "guess" || waitingType === "setSecret") && word) {
    label = `TYPE ${word}`;
  } else if (waitingType === "guess" || waitingType === "setSecret") {
    label = "SUBMIT";
  } else if (waitingType === "power") {
    const meta = window.POWER_METADATA?.[tutorialWaitingFor.powerId];
    label = `USE ${(meta?.label || tutorialWaitingFor.powerId || "").toUpperCase()}`;
  } else if (waitingType === "notes") {
    label = "OPEN NOTES";
  } else if (waitingType === "noteAdded") {
    label = tutorialWaitingFor.word ? `SAVE ${tutorialWaitingFor.word}` : "SAVE A WORD";
  } else if (waitingType === "noteSelected") {
    label = tutorialWaitingFor.word ? `TAP ${tutorialWaitingFor.word}` : "PICK A WORD";
  } else if (waitingType === "rejectedSecret") {
    label = "TRY PICKY";
  } else if (waitingType === "draftCleared") {
    label = "CLEAR THE DRAFT";
  }

  badge.textContent = label;
  badge.classList.toggle("hidden", !waitingType);
  bubble?.classList.toggle("tutorial-is-waiting", !!waitingType);

  continueBtn.textContent =
    tutorialContinueMode === "end"
      ? "Finish Tutorial"
      : waitingType
        ? "Minimize"
        : "Next";
}

function getVisibleTutorialKeyboard() {
  return [
    byId("keyboardGuesser"),
    byId("keyboardSetter")
  ].find(el => {
    if (!el) return false;

    const style = getComputedStyle(el);
    const rect = el.getBoundingClientRect();

    return (
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      rect.height > 0
    );
  }) || null;
}

// #roundSummary is reused for both the round summary and the match
// summary (summary.js's updateSummary()); empty/hidden outside gameOver,
// so this naturally returns null the rest of the time.
function getVisibleTutorialSummaryPanel() {
  const el = byId("roundSummary");
  if (!el) return null;

  const style = getComputedStyle(el);
  const rect = el.getBoundingClientRect();

  if (
    style.display === "none" ||
    style.visibility === "hidden" ||
    rect.height <= 0
  ) {
    return null;
  }

  return el;
}

function getActiveTutorialGameScreen() {
  return [
    byId("setterScreen"),
    byId("guesserScreen")
  ].find(screen =>
    screen?.classList.contains("active")
  ) || null;
}

function shouldDockAdvancedTutorial() {
  const currentState = window.state;

  return (
    currentState?.isTutorial &&
    currentState.tutorialStage === "advanced" &&
    !!getActiveTutorialGameScreen()
  );
}

function clearAdvancedTutorialDock() {
  const bubble = byId("tutorialBubble");

  const wasDocked =
    bubble?.classList.contains("tutorial-docked") ||
    document.body.classList.contains(
      "advanced-tutorial-docked"
    );

  bubble?.classList.remove("tutorial-docked");

  document.body.classList.remove(
    "advanced-tutorial-docked"
  );

  if (!bubble || !wasDocked) {
    return;
  }

  bubble.style.left = "";
  bubble.style.right = "";
  bubble.style.top = "";
  bubble.style.bottom = "";
  bubble.style.width = "";
}

function positionAdvancedTutorialDock(bubble) {
  const screen =
    getActiveTutorialGameScreen();

  if (!screen) {
    clearAdvancedTutorialDock();
    return false;
  }

  const viewport =
    window.visualViewport;

  const viewportLeft =
    viewport?.offsetLeft || 0;

  const viewportTop =
    viewport?.offsetTop || 0;

  const viewportWidth =
    viewport?.width ||
    window.innerWidth;

  const viewportRight =
    viewportLeft + viewportWidth;

  const screenRect =
    screen.getBoundingClientRect();

  const headerRect =
    screen
      .querySelector(".role-header")
      ?.getBoundingClientRect();

  const edge = 8;

  const usableLeft =
    Math.max(
      viewportLeft + edge,
      screenRect.left + edge
    );

  const usableRight =
    Math.min(
      viewportRight - edge,
      screenRect.right - edge
    );

  const usableWidth =
    Math.max(
      40,
      usableRight - usableLeft
    );

  const collapsed =
    bubble.classList.contains("collapsed");

  const width =
    collapsed
      ? 40
      : Math.min(520, usableWidth);

  const left =
    collapsed
      ? usableRight - width
      : usableLeft +
        (usableWidth - width) / 2;

  const top =
    Math.max(
      viewportTop + edge,
      (
        headerRect?.bottom ??
        screenRect.top
      ) + 6
    );

  bubble.classList.add(
    "tutorial-docked"
  );

  document.body.classList.add(
    "advanced-tutorial-docked"
  );

  bubble.style.left =
    `${Math.round(left)}px`;

  bubble.style.right = "auto";

  bubble.style.top =
    `${Math.round(top)}px`;

  bubble.style.bottom = "auto";

  bubble.style.width =
    `${Math.round(width)}px`;

  return true;
}

// Set by showTutorial() when a freshly re-shown bubble needs one layout
// pass to find its correct spot before it's allowed to become visible.
// A plain variable rather than a per-call callback argument to
// scheduleTutorialLayout -- that function coalesces rapid repeat calls by
// cancelling and re-scheduling a single rAF, which would silently drop a
// callback tied to an earlier call if any other (argument-less) call
// pre-empted it before that frame fired, permanently leaving the bubble
// invisible. This instead just needs *some* layout pass to run before
// firing, however many scheduleTutorialLayout calls got coalesced along
// the way.
let tutorialPendingReveal = null;

function scheduleTutorialLayout() {
  if (tutorialLayoutFrame) {
    cancelAnimationFrame(tutorialLayoutFrame);
  }

  tutorialLayoutFrame =
    requestAnimationFrame(() => {
      tutorialLayoutFrame = 0;

      repositionTutorialBubble();
      positionTutorialFocusRing();

      // Don't reveal a freshly-hidden bubble mid-settle -- its avoid-rect
      // math (tutorialAvoidElements(), same targets the ring waits on)
      // would be based on a highlight target still mid-animation, and it
      // would visibly slide to the corrected spot moments later once
      // repositionTutorialBubble() re-runs after settling. Left pending;
      // the settle timer's own scheduleTutorialLayout() call fires this
      // same rAF path again once tutorialRingSettling clears.
      if (
        tutorialPendingReveal &&
        !tutorialRingSettling
      ) {
        const reveal = tutorialPendingReveal;
        tutorialPendingReveal = null;
        reveal();
      }
    });
}

function isTutorialElementVisible(el) {
  if (!el || !el.isConnected) {
    return false;
  }

  const style =
    getComputedStyle(el);

  const rect =
    el.getBoundingClientRect();

  return (
    style.display !== "none" &&
    style.visibility !== "hidden" &&
    rect.width > 0 &&
    rect.height > 0
  );
}

function tutorialRectsOverlap(
  first,
  second,
  gap = 8
) {
  return (
    first.left < second.right + gap &&
    first.right > second.left - gap &&
    first.top < second.bottom + gap &&
    first.bottom > second.top - gap
  );
}

function tutorialAvoidElements() {
  const highlighted =
    Array.isArray(tutorialHighlightTargets)
      ? tutorialHighlightTargets
      : [];

  const draftRows =
    document.querySelectorAll(
      "#setterScreen.active " +
      "#draftSetter .history-row, " +
      "#guesserScreen.active " +
      "#draftGuesser .history-row"
    );

  // The remaining-words box sits in the sidebar for the entire round, not
  // just while a step is actively pointing at it -- without listing it
  // here too, only the one step that highlights it (as its own target)
  // avoided covering it, and every other step in the same sequence (score,
  // constraint row, power info, ...) freely parked the bubble right on top
  // of it since it wasn't the *current* highlight.
  const remainingBoxes =
    document.querySelectorAll(
      "#setterScreen.active #SetterRemainingBox, " +
      "#guesserScreen.active #GuesserRemainingBox"
    );

  // Same reasoning as remainingBoxes above: Notes and the Log both stay
  // open/visible across several consecutive teaching steps in the setter
  // sidebar, not just the one step that names them as its own highlight
  // target -- isTutorialElementVisible() below still filters these out on
  // every step where the panel is actually closed (display:none via its
  // own "hidden" class).
  const sidebarPanels =
    document.querySelectorAll(
      "#setterScreen.active #notesPanelSetter, " +
      "#setterScreen.active #actionLogSetter"
    );

  return [
    ...new Set([
      ...highlighted,
      ...draftRows,
      ...sidebarPanels,
      ...remainingBoxes
    ])
  ].filter(isTutorialElementVisible);
}

function repositionTutorialBubble() {
  const bubble =
    byId("tutorialBubble");

  if (
    !bubble ||
    bubble.classList.contains("hidden")
  ) {
    return;
  }

  if (tutorialUserPositioned) {
    repositionUserPositionedBubble(bubble);
    return;
  }

  if (shouldDockAdvancedTutorial()) {
    positionAdvancedTutorialDock(
      bubble
    );

    return;
  }

  clearAdvancedTutorialDock();

  // Same reasoning as positionTutorialFocusRing()'s settling guard --
  // tutorialAvoidElements() reads the same tutorialHighlightTargets/draft
  // rows, which can still be mid-flight through their own entrance
  // animation right now. Repositioning around a transient rect here would
  // visibly slide the bubble to its corrected spot once the settle timer
  // re-runs this a moment later, instead of it just staying put in the
  // meantime and moving once, directly to the right place.
  if (tutorialRingSettling) {
    return;
  }

  const viewport =
    window.visualViewport;

  const viewportTop =
    viewport?.offsetTop || 0;

  const viewportHeight =
    viewport?.height ||
    window.innerHeight;

  const viewportBottom =
    viewportTop + viewportHeight;

  const edge =
    tutorialCollapsed ? 8 : 12;

  const gap = 10;

  const keyboard =
    getVisibleTutorialKeyboard();

  const keyboardTop =
    keyboard
      ? keyboard.getBoundingClientRect().top
      : viewportBottom;

  const availableBottom =
    Math.min(
      viewportBottom - edge,
      keyboardTop - edge
    );

  // Measure once, before touching `top`/`bottom` at all -- height and
  // left/right don't depend on the bubble's own vertical position, so
  // there's no need to clear/re-measure between candidate positions. That
  // used to write `top` twice (an initial guess, then the adjusted final
  // value) with a getBoundingClientRect() read in between, and that read
  // forces the browser to commit the intermediate guess as an observed
  // style -- which the `top` transition then visibly animated through
  // before continuing on to the real final value, on every reposition.
  // Computing the final value algebraically first and writing `top`
  // exactly once avoids that entirely.
  const measuredRect =
    bubble.getBoundingClientRect();

  const bubbleHeight =
    measuredRect.height;

  const bubbleLeft =
    measuredRect.left;

  const bubbleRight =
    measuredRect.right;

  const minTop =
    viewportTop + edge;

  const maxTop =
    Math.max(
      minTop,
      availableBottom - bubbleHeight
    );

  /*
    Start as low as possible while remaining
    above the keyboard.
  */
  let top = maxTop;

  // A short round/match summary (e.g. the round-1 recap, just a few lines
  // of text and a small table) ends well above the viewport bottom, but
  // `top` above still bottom-anchors the bubble against the *viewport*
  // regardless -- leaving a large dead gap between the actual content and
  // the bubble discussing it. Prefer sitting just below the summary panel
  // instead, as long as there's room; a tall summary (the match summary,
  // once its round breakdowns/secret history are showing) already reaches
  // near the bottom on its own, so this is a no-op then.
  const summaryPanel =
    getVisibleTutorialSummaryPanel();

  if (summaryPanel) {
    const belowSummary =
      summaryPanel.getBoundingClientRect().bottom +
      gap;

    if (belowSummary >= minTop) {
      top = Math.min(
        belowSummary,
        maxTop
      );
    }
  }

  const avoidRects =
    tutorialAvoidElements().map(el =>
      el.getBoundingClientRect()
    );

  const rectAtTop = t => ({
    top: t,
    bottom: t + bubbleHeight,
    left: bubbleLeft,
    right: bubbleRight
  });

  /*
    A single pass over avoidRects can leave a residual overlap: nudging
    `top` to clear one rect (e.g. the pending-guess row) can land it back
    on top of another (e.g. the setter's own secret row right below it),
    and a plain single-pass loop never re-checks the earlier rects against
    that new position. Repeat the whole pass until nothing moves `top`
    anymore (or the small iteration cap is hit) so it actually converges
    on a spot clear of every avoid rect at once, not just the last one
    checked.
  */
  for (let pass = 0; pass < 4; pass++) {
    const topBeforePass = top;

    for (const avoidRect of avoidRects) {
      if (
        !tutorialRectsOverlap(
          rectAtTop(top),
          avoidRect,
          gap
        )
      ) {
        continue;
      }

      const aboveTop =
        avoidRect.top -
        gap -
        bubbleHeight;

      const belowTop =
        avoidRect.bottom + gap;

      if (aboveTop >= minTop) {
        top = Math.min(
          aboveTop,
          maxTop
        );
      } else if (belowTop <= maxTop) {
        top = belowTop;
      } else {
        /*
          There is not enough room directly above
          or below, so use the top of the viewport.
        */
        top = minTop;
      }
    }

    if (top === topBeforePass) {
      break;
    }
  }

  bubble.style.top =
    `${Math.round(top)}px`;

  bubble.style.bottom = "auto";

  bubble.style.removeProperty(
    "--tutorial-bottom"
  );
}

// Once the player has dragged the bubble (tutorialUserPositioned), it no
// longer gets auto-placed from scratch -- but it should still duck out of
// the way of whatever's currently highlighted if the player's own spot
// happens to land on top of it. Nudges `top` only far enough to clear an
// actual overlap and leaves the bubble exactly where it was dragged
// otherwise; never touches `left`, so the player's horizontal choice is
// never overridden.
function repositionUserPositionedBubble(bubble) {
  if (tutorialRingSettling) return;
  if (bubble.classList.contains("tutorial-dragging")) return;

  const viewport = window.visualViewport;
  const viewportTop = viewport?.offsetTop || 0;
  const viewportHeight = viewport?.height || window.innerHeight;
  const viewportBottom = viewportTop + viewportHeight;
  const edge = 8;
  const gap = 10;

  const keyboard = getVisibleTutorialKeyboard();
  const keyboardTop = keyboard ? keyboard.getBoundingClientRect().top : viewportBottom;
  const availableBottom = Math.min(viewportBottom - edge, keyboardTop - edge);

  const measuredRect = bubble.getBoundingClientRect();
  const bubbleHeight = measuredRect.height;
  const bubbleLeft = measuredRect.left;
  const bubbleRight = measuredRect.right;

  const minTop = viewportTop + edge;
  const maxTop = Math.max(minTop, availableBottom - bubbleHeight);

  let top = Math.max(minTop, Math.min(maxTop, measuredRect.top));

  const avoidRects = tutorialAvoidElements().map(el => el.getBoundingClientRect());
  const rectAtTop = t => ({ top: t, bottom: t + bubbleHeight, left: bubbleLeft, right: bubbleRight });

  let moved = false;
  for (let pass = 0; pass < 4; pass++) {
    const topBeforePass = top;

    for (const avoidRect of avoidRects) {
      if (!tutorialRectsOverlap(rectAtTop(top), avoidRect, gap)) continue;

      moved = true;
      const aboveTop = avoidRect.top - gap - bubbleHeight;
      const belowTop = avoidRect.bottom + gap;

      if (aboveTop >= minTop) top = Math.min(aboveTop, maxTop);
      else if (belowTop <= maxTop) top = belowTop;
      else top = minTop;
    }

    if (top === topBeforePass) break;
  }

  // Nothing overlapped -- leave the player's exact placement alone rather
  // than snapping it to a "corrected" value it never actually needed.
  if (!moved) return;

  bubble.style.top = `${Math.round(top)}px`;
  bubble.style.bottom = "auto";
  bubble.style.setProperty("--tutorial-drag-top", `${Math.round(top)}px`);
}

function tutorialStepKey(opts = {}) {
  if (opts.key) {
    return opts.key;
  }

  const currentState =
    window.state || {};

  return [
    currentState.tutorialStage ?? "",
    currentState.gameOverView ?? "",
    window.myRole ?? "",
    lastTutorialRound ?? "",
    tutorialSubStep
  ].join("|");
}

function animateTutorialBody() {
  const body = byId("tutorialBody");

  if (!body) return;

  clearTimeout(tutorialBodyAnimationTimer);

  body.classList.remove("tutorial-step-in");

  void body.offsetWidth;

  body.classList.add("tutorial-step-in");

  tutorialBodyAnimationTimer =
    setTimeout(() => {
      body.classList.remove(
        "tutorial-step-in"
      );
    }, 380);
}


function defaultTutorialTitle() {
  const stage = window.state?.tutorialStage;

  if (stage === "advanced") return "Advanced UI";
  if (stage === "power" || stage === 2) return "Powers";
  if (stage === "quest") return "Quest";
  return window.myRole === "setter" ? "Secretkeeper basics" : "Guesser basics";
}

function tutorialToneColor(tone) {
  if (tone === "setter") return "#fb7185";
  if (tone === "guesser") return "#60a5fa";
  return "#ffd54f";
}

function updateTutorialChrome(opts = {}) {
  const bubble = byId("tutorialBubble");
  if (!bubble) return;

  const titleEl = byId("tutorialStepLabel");
  const progressEl = byId("tutorialProgress");
  const visualEl = byId("tutorialVisual");

  const title = opts.title || defaultTutorialTitle();
  if (titleEl) titleEl.textContent = title;

  const current = Number(opts.progressCurrent);
  const total = Number(opts.progressTotal);
  const hasProgress = Number.isFinite(current) && Number.isFinite(total) && total > 0;

  if (progressEl) {
    progressEl.classList.toggle("hidden", !hasProgress);
    progressEl.innerHTML = hasProgress
      ? `<span class="tutorial-progress-count">${current}/${total}</span>` +
        Array.from({ length: total }, (_, index) =>
          `<span class="tutorial-progress-dot${index < current ? " is-done" : ""}${index === current - 1 ? " is-current" : ""}"></span>`
        ).join("")
      : "";
    progressEl.setAttribute("aria-label", hasProgress ? `Step ${current} of ${total}` : "");
  }

  if (visualEl) {
    visualEl.classList.toggle("hidden", !opts.visualHtml);
    visualEl.innerHTML = opts.visualHtml || "";
  }

  const tone = opts.tone || (window.myRole === "setter" ? "setter" : "guesser");
  const accent = tutorialToneColor(tone);
  bubble.dataset.tone = tone;
  bubble.dataset.placement = opts.placement || "auto";
  bubble.classList.toggle("tutorial-compact", !!opts.compact);
  bubble.style.setProperty("--tutorial-accent", accent);

  const ring = byId("tutorialFocusRing");
  ring?.style.setProperty("--tutorial-accent", accent);
}

function showTutorial(text, opts = {}) {
  const bubble = byId("tutorialBubble");
  const textEl = byId("tutorialText");

  if (!bubble || !textEl) return;

  const nextKey = tutorialStepKey(opts);
  const isNewStep = nextKey !== tutorialLastStepKey;
  const wasHidden = bubble.classList.contains("hidden");

  tutorialLastStepKey = nextKey;

  if (isNewStep || wasHidden) {
    tutorialCollapsed = false;
    bubble.classList.remove("collapsed");
  }

  bubble.classList.remove("hidden");
  updateTutorialChrome(opts);

  if (wasHidden) {
    bubble.classList.add("positioning");
    tutorialPendingReveal = () => bubble.classList.remove("positioning");
  }

  const textChanged = textEl.textContent !== text;

  if (textChanged) {
    textEl.textContent = text;
    if (isNewStep || wasHidden) animateTutorialBody();
  }

  setContinue({
    show: true,
    enabled: true,
    ...opts
  });

  updateActionBadge();
  updateTutorialToggleState();

  if (isNewStep || wasHidden || textChanged) {
    scheduleTutorialLayout();
  }
}

function pauseTutorial() {
  const bubble = byId("tutorialBubble");

  if (!bubble) return;

  tutorialCollapsed = false;
  tutorialLastStepKey = "";

  bubble.classList.add("hidden");
  bubble.classList.remove("collapsed", "positioning");
  tutorialPendingReveal = null;

  clearHighlights();
  stopDragDemo();
}

function hideTutorial() {
  pauseTutorial();
  clearAdvancedTutorialDock();
  clearTutorialUserPosition();

  tutorialWaitingFor = null;
  // The panel-open watch would otherwise tear itself down only on its
  // next tick; drop it here so nothing observes the document once the
  // bubble is gone.
  stopTutorialConditionWatch();

  updateActionBadge();
}

// Drops any manual drag placement (see setupTutorialBubbleDrag) so the
// bubble reopens in its normal auto-placed spot on the next tutorial,
// instead of carrying a stale left/top from whatever the player last
// dragged it to.
function clearTutorialUserPosition() {
  tutorialUserPositioned = false;

  const bubble = byId("tutorialBubble");
  if (!bubble) return;

  bubble.classList.remove("tutorial-user-positioned");
  bubble.style.left = "";
  bubble.style.top = "";
  bubble.style.removeProperty("--tutorial-drag-top");
}

function updateTutorialToggleState() {
  const bubble = byId("tutorialBubble");
  const btn = byId("tutorialToggleBtn");

  if (!bubble || !btn) return;

  const label =
    tutorialCollapsed
      ? "Show tutorial"
      : "Hide tutorial";

  btn.setAttribute("aria-label", label);
  btn.title = label;

  bubble.setAttribute(
    "aria-expanded",
    String(!tutorialCollapsed)
  );
}

function toggleTutorial(
  forceCollapsed = null
) {
  const bubble = byId("tutorialBubble");

  if (!bubble) return;

  tutorialCollapsed =
    forceCollapsed === null
      ? !tutorialCollapsed
      : !!forceCollapsed;

  bubble.classList.toggle(
    "collapsed",
    tutorialCollapsed
  );

  updateTutorialToggleState();
  scheduleTutorialLayout();
}

byId("tutorialToggleBtn")?.addEventListener("click", event => {
  event.stopPropagation();
  toggleTutorial();
});

byId("tutorialBubble")?.addEventListener("click", event => {
  if (event.target.closest("button")) return;

  if (tutorialCollapsed) {
    toggleTutorial(false);
  }
});

byId("tutorialText")
  ?.setAttribute(
    "aria-live",
    "polite"
  );

// Lets the player drag the tutorial bubble by its header to wherever it's
// blocking less. The header (not the whole bubble) is the drag handle, so
// a plain tap still reaches the minimize button and still re-expands a
// collapsed bubble via the click listener above -- only a real pointer
// move past DRAG_MOVE_ARM_PX arms the drag, so a stationary tap/click
// never gets swallowed as a zero-distance drag.
(function setupTutorialBubbleDrag() {
  const bubble = byId("tutorialBubble");
  const header = bubble?.querySelector(".tutorial-header");
  if (!bubble || !header) return;

  const DRAG_MOVE_ARM_PX = 4;
  let drag = null;

  header.addEventListener("pointerdown", event => {
    if (event.button != null && event.button !== 0) return;
    if (event.target.closest("button")) return;
    if (tutorialCollapsed) return;

    const rect = bubble.getBoundingClientRect();
    drag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startLeft: rect.left,
      startTop: rect.top,
      armed: false
    };
  });

  window.addEventListener("pointermove", event => {
    if (!drag || drag.pointerId !== event.pointerId) return;

    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;

    if (!drag.armed) {
      if (
        Math.abs(dx) < DRAG_MOVE_ARM_PX &&
        Math.abs(dy) < DRAG_MOVE_ARM_PX
      ) {
        return;
      }
      drag.armed = true;
      tutorialUserPositioned = true;
      bubble.classList.add("tutorial-dragging", "tutorial-user-positioned");
      header.setPointerCapture(drag.pointerId);
    }

    const rect = bubble.getBoundingClientRect();
    const maxLeft = window.innerWidth - rect.width - 4;
    const maxTop = window.innerHeight - rect.height - 4;

    const left =
      Math.round(Math.max(4, Math.min(maxLeft, drag.startLeft + dx)));
    const top =
      Math.round(Math.max(4, Math.min(maxTop, drag.startTop + dy)));

    bubble.style.left = `${left}px`;
    bubble.style.right = "auto";
    bubble.style.top = `${top}px`;
    bubble.style.bottom = "auto";

    // Below 600px width, a step whose data-placement is "top" pins the
    // bubble via an !important rule that plain inline `top` can't beat --
    // tutorial.css's .tutorial-user-positioned override reads this custom
    // property instead, at the same !important tier, to win that fight.
    bubble.style.setProperty("--tutorial-drag-top", `${top}px`);
  });

  function endDrag(event) {
    if (!drag || drag.pointerId !== event.pointerId) return;

    if (drag.armed) {
      bubble.classList.remove("tutorial-dragging");
      try {
        header.releasePointerCapture(drag.pointerId);
      } catch {}
    }

    drag = null;
  }

  window.addEventListener("pointerup", endDrag);
  window.addEventListener("pointercancel", endDrag);
})();

function getTutorialFocusRing() {
  let ring =
    byId("tutorialFocusRing");

  if (ring) return ring;

  ring = document.createElement("div");

  ring.id = "tutorialFocusRing";
  ring.className =
    "tutorial-focus-ring";

  ring.setAttribute(
    "aria-hidden",
    "true"
  );

  document.body.appendChild(ring);

  return ring;
}

function queueHighlightCommit() {
  if (tutorialHighlightCommitQueued) {
    return;
  }

  tutorialHighlightCommitQueued = true;

  queueMicrotask(() => {
    tutorialHighlightCommitQueued = false;

    const nextTargets = [
      ...new Set(tutorialHighlightDraft)
    ].filter(Boolean);

    // tutorialSteps() re-runs on every server stateUpdate, and every run
    // re-highlights whatever the current step already has highlighted --
    // clearHighlights() at the top empties the draft, then the step's own
    // highlight*() calls immediately refill it with the same elements.
    // Without this check, that redundant refill still restarted the
    // 360ms settle timer and a fresh reposition pass below every single
    // time, which read as the ring/bubble nudging by a stray pixel every
    // few seconds even though the highlighted target hadn't changed.
    const unchanged =
      nextTargets.length ===
        tutorialHighlightTargets.length &&
      nextTargets.every(
        (el, i) =>
          el === tutorialHighlightTargets[i]
      );

    tutorialHighlightTargets = nextTargets;

    if (unchanged) {
      return;
    }

    document
      .querySelectorAll(
        ".tutorial-highlight"
      )
      .forEach(el => {
        el.classList.remove(
          "tutorial-highlight"
        );
      });

    /*
     * A freshly highlighted target (e.g. the pending-guess row, which
     * enters via .row-slide-in) can still be mid-flight through its own
     * 340ms CSS transform animation right now -- getBoundingClientRect()
     * reflects wherever that animation currently is, not its settled
     * resting spot. Positioning the ring there immediately used to plant
     * it at a transient, wrong-looking box (e.g. still shifted off-screen
     * by translateX), then visibly slide it over to the correct spot once
     * a later re-measure corrected it -- exactly the "appears on the left,
     * then jumps right" glitch this flag exists to avoid. Suppress ring
     * repositioning (from *any* caller of scheduleTutorialLayout, not just
     * this one -- the bubble's own reveal pass runs the same function)
     * until the longest entrance/exit animation in play (draft-row-slide-
     * in/-down/-out, all 340ms) has had time to finish, so the ring only
     * ever appears already in its settled, correct spot.
     */
    tutorialRingSettling =
      !!tutorialHighlightTargets.length;

    scheduleTutorialLayout();

    clearTimeout(
      tutorialHighlightSettleTimer
    );

    tutorialHighlightSettleTimer =
      setTimeout(() => {
        tutorialRingSettling = false;
        // The ring may still be visibly showing wherever the *previous*
        // highlight left it (e.g. the whole keyboard) right up until this
        // fires -- transitioning smoothly from there to this step's target
        // would visibly slide the ring across the screen instead of just
        // appearing on the new subject. Snap this one reposition instead;
        // positionTutorialFocusRing() clears the flag itself once applied,
        // so any *later* reflow of the same settled target (e.g. a resize)
        // still transitions normally.
        tutorialRingSnapNext = true;
        scheduleTutorialLayout();
      }, 360);
  });
}

function clearHighlights() {
  tutorialHighlightDraft = [];
  queueHighlightCommit();
  stopKeyDemo();
}

function highlightEl(el) {
  if (!el) return;

  tutorialHighlightDraft.push(el);
  queueHighlightCommit();
}

function positionTutorialFocusRing() {
  if (tutorialRingSettling) {
    return;
  }

  const ring =
    getTutorialFocusRing();

  const rects =
    tutorialHighlightTargets
      .filter(el => el?.isConnected)
      .map(el => {
        const style =
          getComputedStyle(el);

        const rect =
          el.getBoundingClientRect();

        if (
          style.display === "none" ||
          style.visibility === "hidden" ||
          rect.width <= 0 ||
          rect.height <= 0 ||
          rect.bottom <= 0 ||
          rect.right <= 0 ||
          rect.top >= window.innerHeight ||
          rect.left >= window.innerWidth
        ) {
          return null;
        }

        return {
          el,
          rect
        };
      })
      .filter(Boolean);

  if (!rects.length) {
    tutorialRingSnapNext = false;
    ring.classList.remove("show");
    return;
  }

  const pad = 4;

  const left = Math.max(
    4,
    Math.min(
      ...rects.map(
        item => item.rect.left
      )
    ) - pad
  );

  const top = Math.max(
    4,
    Math.min(
      ...rects.map(
        item => item.rect.top
      )
    ) - pad
  );

  const right = Math.min(
    window.innerWidth - 4,
    Math.max(
      ...rects.map(
        item => item.rect.right
      )
    ) + pad
  );

  const bottom = Math.min(
    window.innerHeight - 4,
    Math.max(
      ...rects.map(
        item => item.rect.bottom
      )
    ) + pad
  );

  const snapping = tutorialRingSnapNext;
  tutorialRingSnapNext = false;

  if (snapping) {
    ring.classList.add("no-transition");
    void ring.offsetWidth;
  }

  ring.style.width =
    `${Math.max(0, right - left)}px`;

  ring.style.height =
    `${Math.max(0, bottom - top)}px`;

  ring.style.transform =
    `translate3d(` +
    `${Math.round(left)}px, ` +
    `${Math.round(top)}px, 0)`;

 const firstTarget =
  rects[0].el;

const firstTile =
  firstTarget.matches(".history-row")
    ? firstTarget.querySelector(
        ".history-tile"
      )
    : null;

const targetRadius =
  getComputedStyle(
    firstTile || firstTarget
  ).borderRadius;

ring.style.borderRadius =
  targetRadius &&
  targetRadius !== "0px"
    ? `calc(${targetRadius} + 4px)`
    : "10px";
  ring.classList.add("show");

  if (snapping) {
    requestAnimationFrame(() => {
      ring.classList.remove("no-transition");
    });
  }
}

// No-op on purpose: every call site that highlights the keyboard also
// highlights the specific key(s) to press via startKeyDemo, and a ring
// around the whole keyboard on top of that just adds visual noise --
// the per-key glow is enough on its own. Kept as a function (rather than
// deleted) since every tutorial file still calls it as part of the
// "type here" step shape.
function highlightKeyboardGuesser() {}

function lastHistoryRow(containerId) {
  return byId(containerId)
    ?.lastElementChild
    ?.querySelector(".history-row");
}

function visibleDraftRows(role) {
  const container = byId(
    role === "setter"
      ? "draftSetter"
      : "draftGuesser"
  );

  if (!container) return [];

  return [
    ...container.querySelectorAll(".history-row")
  ].filter(isTutorialElementVisible);
}

function highlightHistoryGuesser() {
  highlightEl(
    lastHistoryRow("historyGuesser")
  );
}

// See highlightKeyboardGuesser above -- same reasoning, setter side.
function highlightKeyboardSetter() {}

function highlightSetterHistory() {
  highlightEl(
    lastHistoryRow("setterGuesserSubmitted")
  );
}

function highlightDraftRow(role) {
  const rows = visibleDraftRows(role);

  const editableRow =
    role === "setter"
      ? rows.find(row =>
          row.classList.contains("setter-draft") ||
          row.classList.contains("ghost-secret")
        )
      : rows.find(row =>
          row.classList.contains("guesser-draft")
        );

  highlightEl(
    editableRow ||
    rows[rows.length - 1]
  );
}

function highlightPendingGuessRow() {
  const pendingRow =
    visibleDraftRows("setter").find(row =>
      row.classList.contains("pending-guess")
    );

  highlightEl(pendingRow);
}

// ------------------------
// Key demos: a persistent glow (see .tutorial-key-highlight in
// tutorial.css) applied to every key or button the player still needs to
// press for the current step. `getEls` is re-evaluated live -- once a
// letter's been typed (or the button pressed), it drops out of the
// returned list and its highlight is removed immediately. Typing on the
// on-screen keyboard is local-only (it never round-trips through the
// server, so tutorialSteps() never re-runs on its own mid-keystroke) --
// refreshTutorialKeyDemo() below is called directly from the guesser and
// setter input handlers in client.js on every keystroke to keep this live.
// ------------------------
let tutorialKeyDemoKey = null;
let tutorialKeyDemoGetEls = null;
let tutorialHighlightedKeyEls = [];

function stopKeyDemo() {
  tutorialHighlightedKeyEls.forEach(el =>
    el?.classList.remove("tutorial-key-highlight")
  );
  tutorialHighlightedKeyEls = [];
  tutorialKeyDemoKey = null;
  tutorialKeyDemoGetEls = null;
}

function applyKeyDemoHighlight() {
  if (!tutorialKeyDemoGetEls) return;

  const nextEls = (tutorialKeyDemoGetEls() || []).filter(Boolean);

  tutorialHighlightedKeyEls
    .filter(el => !nextEls.includes(el))
    .forEach(el => el.classList.remove("tutorial-key-highlight"));

  nextEls.forEach(el => el.classList.add("tutorial-key-highlight"));

  tutorialHighlightedKeyEls = nextEls;
}

// `key` identifies this specific demo (e.g. a step key) -- repeated calls
// with the same `key` from every re-render of the same tutorial substep
// just refresh the highlight set instead of restarting the demo.
function startKeyDemo(key, getEls) {
  if (key === tutorialKeyDemoKey) {
    tutorialKeyDemoGetEls = getEls;
    applyKeyDemoHighlight();
    return;
  }

  stopKeyDemo();
  tutorialKeyDemoKey = key;
  tutorialKeyDemoGetEls = getEls;
  applyKeyDemoHighlight();
}

function tutorialKeyEl(role, symbol) {
  const container = byId(
    role === "setter" ? "keyboardSetter" : "keyboardGuesser"
  );

  const dataKey =
    symbol === "BACKSPACE" ? "⌫" : symbol;

  return (
    container?.querySelector(
      `.key[data-key="${dataKey}"]`
    ) || null
  );
}

// The actual submit action lives here now, not the keyboard's own Enter
// key (see gameplay-polish-v8.js's guesserSubmitGuessBtn / setter-board.js's
// setterSubmitSecretBtn) -- both only enable once all 5 letters are in,
// the same moment tutorialWordKeyEls below switches to pointing at them.
function tutorialSubmitBtnEl(role) {
  return byId(
    role === "setter"
      ? "setterSubmitSecretBtn"
      : "guesserSubmitGuessBtn"
  );
}

// Highlights whichever letters of `word` haven't been typed into `draft`
// yet, or the Submit button once every letter's in place. Shared by every
// "type this word" tutorial step (guesser guesses, setter secrets).
function tutorialWordKeyEls(role, word, draft) {
  const typed = (draft || "").toUpperCase();
  const remaining = [
    ...new Set(
      word
        .split("")
        .filter(letter => !typed.includes(letter))
    )
  ];

  if (remaining.length) {
    return remaining.map(letter => tutorialKeyEl(role, letter));
  }

  return [tutorialSubmitBtnEl(role)];
}

// Drag & Lock wait resolution: localGuesserDraft / guesserDraftLocks
// (both plain `let`s at the top of client.js) are pure local UI state --
// dragging a letter, tapping a tile to lock/unlock it, none of that
// round-trips through the server, so tutorialSteps() never re-runs on its
// own for any of it. window.refreshTutorialKeyDemo already fires on
// every one of those local renders (see renderGuesserDraftOnly /
// toggleGuesserDraftLock in client.js), so it's the natural hook to also
// resolve these waits from, the same way notifyTutorialPowerUsed etc.
// resolve server-driven ones.
function checkTutorialDragLockWait() {
  if (!tutorialWaitingFor) {
    return;
  }

  const type = tutorialWaitingFor.type;

  if (type !== "draftFilled" && type !== "tileLocked" && type !== "tileUnlocked") {
    return;
  }

  const filled =
    (localGuesserDraft || "").trim().length >= 5;
  const locked =
    (typeof guesserDraftLocks !== "undefined" && guesserDraftLocks.size > 0);

  const satisfied =
    (type === "draftFilled" && filled) ||
    (type === "tileLocked" && locked) ||
    (type === "tileUnlocked" && !locked);

  if (!satisfied) {
    return;
  }

  tutorialWaitingFor = null;
  updateActionBadge();
  tutorialSubStep++;

  if (window.state && window.myRole) {
    tutorialSteps(window.state, window.myRole);
  }
}

window.refreshTutorialKeyDemo = function () {
  applyKeyDemoHighlight();
  checkTutorialDragLockWait();
  checkTutorialInvalidDraftWait();
};

// `word`, when given, pins the wait to one specific spelling -- the
// "break the rule on purpose" step names the word to type, so a different
// inconsistent word shouldn't skip the lesson out from under it.
function waitForInvalidDraft(word) {
  tutorialWaitingFor = {
    type: "invalidDraft",
    word: word ? String(word).toUpperCase() : null
  };

  setContinue({
    show: true,
    mode: "hide"
  });

  updateActionBadge();
}

// This wait used to be resolved by an `isConsistent` flag on the setter's
// remaining-words socket payload. That field went away with the Keep->New
// comparison (see server/utils/remainingWords.js and the
// setterRemainingBoxRemoved regression test), which left the wait armed
// forever -- and because the Continue button is inert while a wait is
// armed, the step became a dead end.
//
// Judge the draft locally instead. isConsistentWithHistory is the very
// same check the board itself runs to decide whether to grey the primary
// button out into "SECRET NOT ALLOWED" (see client.js's
// validateSetterSecretWord), so the tutorial advances exactly when the
// player can see the game refusing the word.
function checkTutorialInvalidDraftWait() {
  if (
    !tutorialWaitingFor ||
    tutorialWaitingFor.type !== "invalidDraft"
  ) {
    return;
  }

  const draft = String(window.state?.setterDraft || "").toUpperCase();
  if (draft.length !== 5 || draft.includes(" ")) return;

  if (tutorialWaitingFor.word && draft !== tutorialWaitingFor.word) return;

  if (typeof window.isConsistentWithHistory !== "function") return;
  if (
    window.isConsistentWithHistory(
      window.state?.history || [],
      draft,
      window.state
    )
  ) {
    return;
  }

  tutorialWaitingFor = null;
  updateActionBadge();
  tutorialSubStep++;

  if (window.state && window.myRole) {
    tutorialSteps(window.state, window.myRole);
  }
}

// ------------------------
// Drag demo: an auto-playing ghost letter that flies from a keyboard key
// to its draft tile, illustrating the drag gesture itself (the wait
// condition above is satisfied by typing too -- this is purely a visual
// nudge toward trying the drag). Self-terminates once the draft actually
// fills. tutorialDragDemoToken guards against a stale, already-superseded
// loop iteration writing to the DOM after stopDragDemo() -- the same
// generation-counter shape as setter-sidebar.js's flipToken.
// ------------------------
let tutorialDragDemoToken = 0;
let tutorialDragDemoRunning = false;
let tutorialDragDemoTimer = null;
let tutorialDragDemoEl = null;

function stopDragDemo() {
  tutorialDragDemoToken++;
  tutorialDragDemoRunning = false;
  clearTimeout(tutorialDragDemoTimer);
  tutorialDragDemoTimer = null;
  tutorialDragDemoEl?.remove();
  tutorialDragDemoEl = null;
}

function guesserDraftTileEl(index) {
  const row = visibleDraftRows("guesser").find(r =>
    r.classList.contains("guesser-draft")
  );

  return row?.querySelectorAll(".history-tile")[index] || null;
}

function stepDragDemo(token, word, i) {
  if (token !== tutorialDragDemoToken) {
    return;
  }

  if ((localGuesserDraft || "").trim().length >= 5) {
    stopDragDemo();
    return;
  }

  const letter = word[i % word.length].toUpperCase();
  const keyEl = tutorialKeyEl("guesser", letter);
  const tileEl = guesserDraftTileEl(i % word.length);

  if (!keyEl || !tileEl) {
    tutorialDragDemoTimer = setTimeout(
      () => stepDragDemo(token, word, i + 1),
      900
    );
    return;
  }

  const keyRect = keyEl.getBoundingClientRect();
  const tileRect = tileEl.getBoundingClientRect();

  const ghost = document.createElement("div");
  ghost.className = "drag-letter-ghost tutorial-drag-demo";
  ghost.textContent = letter;
  ghost.style.left = `${keyRect.left + keyRect.width / 2}px`;
  ghost.style.top = `${keyRect.top + keyRect.height / 2}px`;
  document.body.appendChild(ghost);
  tutorialDragDemoEl = ghost;

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (token !== tutorialDragDemoToken) return;
      ghost.style.left = `${tileRect.left + tileRect.width / 2}px`;
      ghost.style.top = `${tileRect.top + tileRect.height / 2}px`;
    });
  });

  tutorialDragDemoTimer = setTimeout(() => {
    if (token !== tutorialDragDemoToken) return;
    ghost.remove();
    if (tutorialDragDemoEl === ghost) tutorialDragDemoEl = null;
    tutorialDragDemoTimer = setTimeout(
      () => stepDragDemo(token, word, i + 1),
      350
    );
  }, 750);
}

// Idempotent across redundant re-renders of the same step (every
// unrelated stateUpdate re-runs the tutorial script) -- only actually
// (re)starts the loop the first time this step is shown.
function startDragDemo(word) {
  if (tutorialDragDemoRunning) {
    return;
  }

  stopDragDemo();
  tutorialDragDemoRunning = true;
  stepDragDemo(tutorialDragDemoToken, word, 0);
}

function highlightNotesPanel() {
  highlightEl(
    byId("notesPanelSetter")
  );
}

function highlightNotesDraft() {
  highlightEl(
    byId("notesDraftSetter")
  );
}

// Notes' own typed-so-far draft (notes.js's private `_draft`) isn't
// exposed on window -- read it straight from the cell text it already
// renders into, the same shape tutorialWordKeyEls expects from
// localGuesserDraft/state.setterDraft elsewhere.
function notesDraftText() {
  return [
    ...document.querySelectorAll(
      "#notesDraftSetter .notes-draft-cell"
    )
  ]
    .map(cell => cell.textContent || "")
    .join("");
}

function highlightNotesList() {
  highlightEl(
    byId("notesListSetter")
  );
}

// Precise tap target for "tap this specific word in Notes" steps -- the
// whole list can be far from whatever else a step also highlights (e.g.
// a remaining-box row), and unioning both into one bounding ring would
// stretch it across everything in between (see
// highlightConstraintRowAndToggle's comment for the same lesson).
function highlightSavedNote(word) {
  const target = [
    ...document.querySelectorAll(
      "#notesListSetter " +
      ".notes-fillable"
    )
  ].find(
    element =>
      element.dataset.fill === word
  );

  target?.scrollIntoView({
    block: "nearest",
    behavior: "smooth"
  });

  highlightEl(
    target ||
    byId("notesListSetter")
  );
}
function highlightPowersCol() {
  highlightEl(
    byId("guesserPowerContainer")
  );

  // Same collapse issue as highlightPowerButtonByText -- force the
  // sidebar open so the ring lands on a real, visible rect.
  if (window.isSetterSidebarCollapsed?.()) {
    window.setSetterSidebarCollapsed?.(false);
  }

  highlightEl(
    byId("setterPowerContainer")
  );
}

function highlightPowerButtonByText(
  label
) {
  document
    .querySelectorAll(".power-btn")
    .forEach(btn => {
      const text =
        btn.querySelector(
          ".power-btn-label"
        )?.textContent ||
        btn.textContent;

      if (text.trim() === label) {
        // The Secretkeeper's power cards live inside the collapsible setter
        // sidebar (see setter-board.js) -- collapsed, the button is
        // zero-size, which sends the focus ring to a broken position.
        // Force it open before highlighting so the ring always lands on
        // a real, visible target.
        if (
          btn.closest("#setterPowerContainer") &&
          window.isSetterSidebarCollapsed?.()
        ) {
          window.setSetterSidebarCollapsed?.(false);
        }

        highlightEl(btn);
      }
    });
}

// Log entries carry no power-id attribute (see action-log.js), only a
// `.log-power` class and free text built from formatPowerEvent -- same
// text-matching approach as highlightPowerButtonByText above.
function highlightLogEntryByText(text, role) {
  const containerId =
    role === "setter" ? "actionLogSetter" : "actionLogGuesser";

  byId(containerId)
    ?.querySelectorAll(".log-power")
    .forEach(entry => {
      if (entry.textContent.includes(text)) {
        highlightEl(entry);
      }
    });
}

function highlightRoundSummary() {
  highlightEl(
    byId("roundSummary")
  );
}

function highlightRoundSummaryNames() {
  highlightEl(
    qs("#roundSummary .summary-players")
  );
}

function highlightRoundSummaryGuessCount() {
  highlightEl(
    qs("#roundSummary .summary-guess-count")
  );
}

// Matches both the live single-round summary (table.summary-table--round)
// and the final match summary's per-round tables (table.summary-table,
// one per .stored-round block, no --round suffix) -- dropping the
// modifier from the selector covers both instead of only the former.
function highlightRoundSummaryColumn(cellClass) {
  document
    .querySelectorAll(
      `#roundSummary td.${cellClass}`
    )
    .forEach(highlightEl);
}

function highlightNextRoundBtn() {
  highlightEl(byId("nextRoundBtn"));
}

function highlightMatchScore() {
  highlightEl(
    qs("#roundSummary .match-score-line")
  );
}

// Advanced Tutorial's UI-tour steps (round1 of the setter side) -- each
// targets the live in-game header/sidebar chrome, not the summary screen.
function highlightHeaderScore(role) {
  const screenId =
    role === "setter" ? "setterScreen" : "guesserScreen";

  highlightEl(
    qs(`#${screenId} .header-role-badge`)
  );
}

// Only highlights the row itself -- the focus ring is a single rect that
// bounds every highlighted element at once, so also highlighting the
// toggle button (which sits up in the header, well above the row) used to
// stretch the ring into one big box spanning the gap between them instead
// of tracing the row being explained. The button is called out by name in
// the accompanying text instead.
function highlightConstraintRowAndToggle(role) {
  highlightEl(
    byId(
      role === "setter"
        ? "constraintRowSetter"
        : "constraintRowGuesser"
    )
  );
}

// The ⧉ button in the role screen's header that shows/hides the constraint
// row. Both screens carry one (they're class-only, no ids -- see
// index.html), so it's picked out by which screen owns it.
function highlightConstraintToggleBtn(role) {
  const screenId =
    role === "setter" ? "setterScreen" : "guesserScreen";

  highlightEl(
    qs(`#${screenId} .constraint-toggle-btn`) ||
      qs(".constraint-toggle-btn")
  );
}

function highlightSetterRemainingBox() {
  highlightEl(byId("SetterRemainingBox"));
}

// spy-charge.js disables the whole charge system for any tutorial state
// (createSpyChargeState's enabled flag is !state.isTutorial), so this stays
// hidden throughout every tutorial round -- highlightEl is a no-op on a
// hidden/disconnected element, which is fine here: the accompanying text is
// written to stand on its own without a live visual anchor, and this still
// starts working automatically if that ever changes.
function highlightSpyChargeMeter() {
  highlightEl(byId("spyChargeHud"));
}

// Same reasoning as highlightSpyChargeMeter -- the star preview lives right
// on the setter's own draft row (see draftrow.js), but only ever renders
// real content when spy charge is enabled, which the tutorial turns off.
function highlightSetterCoverStars() {
  highlightEl(byId("setterCoverStars"));
}

// index: 0 = Keep, 1 = New -- the box has no per-row id, only the
// repeated .remaining-stat class (see remaining-words.js), so the row is
// picked out by its fixed rendering position instead.
function highlightSetterRemainingBoxRow(index) {
  const box = byId("SetterRemainingBox");

  const row =
    box?.querySelectorAll(".remaining-stat")[index];

  highlightEl(row || box);
}

function highlightSetterMustContainBox() {
  highlightEl(byId("SetterMustContainBox"));
}

function highlightSetterLog() {
  highlightEl(byId("actionLogBtnSetter"));
  highlightEl(byId("actionLogSetter"));
}

// Just the Log tab button on its own -- used by the "tap the Log tab" step,
// which wants a tight ring around the one thing it's asking the player to
// tap rather than the whole panel below it too (same "don't union unrelated
// targets" reasoning as highlightConstraintRowAndToggle above).
function highlightLogTabButton() {
  highlightEl(byId("actionLogBtnSetter"));
}

function highlightSidebarToggleBtn() {
  highlightEl(byId("setterSidebarToggle"));
}

// One column inside one round's stored table on the MATCH summary, which
// stacks a table per round. Falls back to the whole round block if that
// round's table hasn't rendered its cells (or the modifier class differs),
// so the step still has something to point at.
function highlightStoredRoundColumn(index, cellClass) {
  const round = qs(
    `#roundSummary .stored-round[data-round-index="${index}"]`
  );

  const cells = round?.querySelectorAll(`td.${cellClass}`);

  if (cells?.length) {
    cells.forEach(highlightEl);
    return;
  }

  highlightEl(round || byId("roundSummary"));
}

function highlightStoredRound(index) {
  highlightEl(
    qs(
      `#roundSummary .stored-round[data-round-index="${index}"]`
    )
  );
}

function highlightSummaryActions() {
  // Not "#roundSummary .summary-actions" -- that class is reused by other
  // action rows (e.g. the round summary's own "Next Round" button), and a
  // plain class selector would risk matching one of those instead of the
  // real New Match/Replay/Leave row this step is actually describing.
  const el = byId("matchSummaryActions");

  // By this step the player has scrolled through round summaries and
  // secret-change narration above it -- the buttons row sits at the very
  // bottom of a tall scrollable panel and is routinely below the fold
  // (positionTutorialFocusRing() clips the ring to the viewport, so an
  // off-screen target draws as a squashed sliver instead of a full ring
  // around nothing the player can even see). "nearest" is a no-op when
  // it's already visible.
  // Instant, not smooth -- the ring's settle timer only waits for CSS
  // entrance animations already in flight (see tutorialRingSettling), not
  // for a scroll that's still gliding, so a smooth scroll here would just
  // reintroduce the same "measured mid-flight" race for a different reason.
  el?.scrollIntoView({
    behavior: "auto",
    block: "nearest"
  });

  highlightEl(el);
}

function highlightStoredRoundSecretSegment(
  roundIndex,
  segment
) {
  [
    ...document.querySelectorAll(
      `#roundSummary .stored-round[data-round-index="${roundIndex}"] tbody tr`
    )
  ]
    .slice(
      segment.startTurn - 1,
      segment.endTurn
    )
    .map(row =>
      row.querySelector(
        "td.secret-cell"
      )
    )
    .forEach(highlightEl);
}

// Collapses a round's per-guess finalSecret list into runs of consecutive
// guesses that faced the same secret -- e.g. secret X for guesses 1-2,
// then Y for guess 3 -- so the match summary can narrate exactly when (and
// to what) the Secretkeeper changed their secret, instead of just listing words.
function computeSecretSegments(round) {
  const segments = [];

  (round?.history || []).forEach(
    (h, i) => {
      const secret = (
        h.finalSecret || ""
      ).toUpperCase();

      const last =
        segments[segments.length - 1];

      if (last && last.secret === secret) {
        last.endTurn = i + 1;
      } else {
        segments.push({
          secret,
          startTurn: i + 1,
          endTurn: i + 1
        });
      }
    }
  );

  return segments;
}

function describeSecretSegment(
  segment,
  isFirst
) {
  const span =
    segment.startTurn === segment.endTurn
      ? `guess ${segment.startTurn}`
      : `guesses ${segment.startTurn}–${segment.endTurn}`;

  return isFirst
    ? `The Secretkeeper's secret was "${segment.secret}" for ${span}.`
    : `Then they switched to "${segment.secret}" for ${span}.`;
}

function buildMatchSecretNarrationSteps(
  state
) {
  const rounds =
    state.matchRounds || [];

  const steps = [];

  rounds.forEach(
    (round, roundIndex) => {
      const segments =
        computeSecretSegments(round);

      segments.forEach(
        (segment, i) => {
          steps.push({
            text: `Round ${
              roundIndex + 1
            }: ${describeSecretSegment(
              segment,
              i === 0
            )}`,
            highlight: () =>
              highlightStoredRoundSecretSegment(
                roundIndex,
                segment
              )
          });
        }
      );
    }
  );

  return steps;
}

window.addEventListener(
  "resize",
  scheduleTutorialLayout,
  {
    passive: true
  }
);

window.addEventListener(
  "orientationchange",
  scheduleTutorialLayout,
  {
    passive: true
  }
);

document.addEventListener(
  "scroll",
  scheduleTutorialLayout,
  {
    capture: true,
    passive: true
  }
);

window.visualViewport
  ?.addEventListener(
    "resize",
    scheduleTutorialLayout,
    {
      passive: true
    }
  );

window.visualViewport
  ?.addEventListener(
    "scroll",
    scheduleTutorialLayout,
    {
      passive: true
    }
  );

function cancelTutorialRevealGate() {
  clearTimeout(
    tutorialRevealGateTimer
  );

  tutorialRevealGateTimer = null;

  tutorialRevealGateCleanup?.();
  tutorialRevealGateCleanup = null;

  tutorialRevealGateRound = null;
}

function startTutorialRevealGate(
  round,
  role
) {
  cancelTutorialRevealGate();

  tutorialRevealGateRound = round;

  pauseTutorial();

  const container =
    byId(
      role === "setter"
        ? "setterGuesserSubmitted"
        : "historyGuesser"
    );

  const lastTile =
    container
      ?.lastElementChild
      ?.querySelector(
        ".history-tile:last-child"
      );

  const finish = () => {
    if (
      tutorialRevealGateRound !== round
    ) {
      return;
    }

    cancelTutorialRevealGate();

    if (
      window.state &&
      window.myRole
    ) {
      tutorialSteps(
        window.state,
        window.myRole
      );
    }
  };

  // Once the flip/reveal animation finishes (or there's nothing to gate
  // on), don't jump straight to the next instruction -- give the player a
  // beat to actually look at the colors that just appeared before the
  // tutorial text changes out from under them. Shorter for
  // prefers-reduced-motion, but still a deliberate pause rather than an
  // instant swap.
  const reducedMotion =
    window.matchMedia?.(
      "(prefers-reduced-motion: reduce)"
    ).matches;

  const readPause = reducedMotion ? 500 : 900;

  if (!lastTile) {
    tutorialRevealGateTimer =
      setTimeout(finish, readPause);

    return;
  }

  const animationNames =
    getComputedStyle(lastTile)
      .animationName
      .split(",")
      .map(name => name.trim());

  if (
    reducedMotion ||
    !animationNames.some(
      name =>
        name !== "none" &&
        /flip|reveal/i.test(name)
    )
  ) {
    tutorialRevealGateTimer =
      setTimeout(finish, readPause);

    return;
  }

  const onAnimationEnd =
    event => {
      if (event.target !== lastTile) {
        return;
      }

      if (
        !/flip|reveal/i.test(
          event.animationName
        )
      ) {
        return;
      }

      lastTile.removeEventListener(
        "animationend",
        onAnimationEnd
      );

      tutorialRevealGateTimer =
        setTimeout(finish, readPause);
    };

  lastTile.addEventListener(
    "animationend",
    onAnimationEnd
  );

  tutorialRevealGateCleanup =
    () => {
      lastTile.removeEventListener(
        "animationend",
        onAnimationEnd
      );
    };

  tutorialRevealGateTimer =
    setTimeout(finish, 2800);
}

function waitForGuessSubmission(round, label = null) {
  tutorialWaitingFor = {
    type: "guess",
    round,
    ...(label ? { label } : {})
  };

  setContinue({
    show: true,
    mode: "hide"
  });

  updateActionBadge();
}

function waitForSecretSubmission(round, label = null) {
  tutorialWaitingFor = {
    type: "setSecret",
    round,
    ...(label ? { label } : {})
  };

  setContinue({
    show: true,
    mode: "hide"
  });

  updateActionBadge();
}

// Drag & Lock demo (guesser round1 of the Advanced Tutorial): all three
// of these are pure local UI state (localGuesserDraft / guesserDraftLocks
// in client.js, never round-tripped through the server), so they're
// resolved from window.refreshTutorialKeyDemo's hook -- see
// checkTutorialDragLockWait() below -- the same way notifyTutorial*
// resolves server-driven waits.
function waitForDraftFilled() {
  tutorialWaitingFor = {
    type: "draftFilled",
    label: "DRAG 5 LETTERS"
  };

  setContinue({
    show: true,
    mode: "hide"
  });

  updateActionBadge();
}

function waitForTileLocked() {
  tutorialWaitingFor = {
    type: "tileLocked",
    label: "LOCK A LETTER"
  };

  setContinue({
    show: true,
    mode: "hide"
  });

  updateActionBadge();
}

function waitForTileUnlocked() {
  tutorialWaitingFor = {
    type: "tileUnlocked",
    label: "UNLOCK IT"
  };

  setContinue({
    show: true,
    mode: "hide"
  });

  updateActionBadge();
}

function waitForPowerUse(powerId) {
  tutorialWaitingFor = {
    type: "power",
    powerId
  };

  setContinue({
    show: true,
    mode: "hide"
  });

  updateActionBadge();
}

// Clicking a power button doesn't fire the power directly -- it opens the
// power-action confirmation modal (showPowerActionPopup in tooltips.js),
// which sits above the tutorial focus ring (z-index 100000 vs 9998) and
// completely covers whichever power button was highlighted. Without this,
// the player has no highlighted target at all for the actual "Use" tap
// that fires the power. Called from showPowerActionPopup/
// hidePowerActionPopup so the ring follows the modal open/close, only
// while a tutorial step is actually waiting on this specific power.
function tutorialOnPowerActionModalOpen() {
  if (!tutorialWaitingFor) {
    return;
  }

  if (
    tutorialWaitingFor.modalTargetId
  ) {
    clearHighlights();

    highlightEl(
      byId(
        tutorialWaitingFor
          .modalTargetId
      )
    );

    return;
  }

  if (
    tutorialWaitingFor.type !==
    "power"
  ) {
    return;
  }

  clearHighlights();

  highlightEl(
    byId("powerActionUseBtn")
  );
}
window.tutorialOnPowerActionModalOpen =
  tutorialOnPowerActionModalOpen;

function tutorialOnPowerActionModalClose() {
  if (
    !tutorialWaitingFor ||
    (
      tutorialWaitingFor.type !==
        "power" &&
      tutorialWaitingFor.type !==
        "modalDismissed" &&
      !tutorialWaitingFor
        .modalTargetId
    )
  ) {
    return;
  }

  // waitForModalDismissed() waits, on its own, for the popup to be opened
  // and closed at all -- unlike "power"/other modalTargetId waits, which
  // stay on the same step until some SERVER-side change confirms the
  // action actually happened (e.g. the quest's `used` flag), and simply
  // re-render if the player cancelled instead.
  if (
    tutorialWaitingFor.type ===
    "modalDismissed"
  ) {
    tutorialWaitingFor = null;
    tutorialSubStep++;
    updateActionBadge();
  }

  if (
    window.state &&
    window.myRole
  ) {
    tutorialSteps(
      window.state,
      window.myRole
    );
  }
}
window.tutorialOnPowerActionModalClose =
  tutorialOnPowerActionModalClose;

// Waits for the power/quest action popup to be opened and then dismissed
// (closed via the X or backdrop) at all, regardless of whether anything
// was actually claimed -- for steps that just want the player to look at
// the popup's info, not use it. See tutorialOnPowerActionModalOpen()'s
// modalTargetId branch for the highlight this puts on the close button
// while the popup is open.
function waitForModalDismissed(modalTargetId) {
  tutorialWaitingFor = {
    type: "modalDismissed",
    modalTargetId
  };

  setContinue({
    show: true,
    mode: "hide"
  });

  updateActionBadge();
}

function waitForNoteAdded(word) {
  tutorialWaitingFor = {
    type: "noteAdded",
    word: word?.toUpperCase() || ""
  };

  setContinue({
    show: true,
    mode: "hide"
  });

  updateActionBadge();
}

function waitForNoteSelected(word) {
  tutorialWaitingFor = {
    type: "noteSelected",
    word: word?.toUpperCase() || ""
  };

  setContinue({
    show: true,
    mode: "hide"
  });

  updateActionBadge();
}
function waitForSidebarToggled() {
  tutorialWaitingFor = {
    type: "sidebarToggled",
    label: "TAP THE PANEL BUTTON"
  };

  setContinue({
    show: true,
    mode: "hide"
  });

  updateActionBadge();
}

// "Open that panel" waits, driven by the resulting DOM state rather than
// by the click that caused it.
//
// Listening for the click is what made the old sidebar step fail to
// advance: several controllers race for those buttons and at least two of
// them (collapsed-actions-v9.js's drawer controller and client.js's
// constraint toggle) call stopImmediatePropagation() from a capture-phase
// listener, so whether any given notify hook runs comes down to script
// registration order. Watching the class the panel actually ends up with
// sidesteps all of that, and it also credits the player for opening the
// panel any other way -- the swipe edge, the keyboard, a docked control.
let tutorialConditionObserver = null;
let tutorialConditionTimer = null;
let tutorialConditionFrame = 0;

function stopTutorialConditionWatch() {
  tutorialConditionObserver?.disconnect();
  tutorialConditionObserver = null;

  if (tutorialConditionTimer) {
    clearInterval(tutorialConditionTimer);
  }
  tutorialConditionTimer = null;

  if (tutorialConditionFrame) {
    cancelAnimationFrame(tutorialConditionFrame);
  }
  tutorialConditionFrame = 0;
}

// The observer below watches attributes across the whole document, so it
// fires on every render pass during live play. Coalesce those bursts into
// one check per frame.
function scheduleTutorialConditionCheck() {
  if (tutorialConditionFrame) return;

  tutorialConditionFrame = requestAnimationFrame(() => {
    tutorialConditionFrame = 0;
    checkTutorialConditionWait();
  });
}

// Returns true if the wait was satisfied (and the tutorial has already
// moved on), false if it is still pending.
function checkTutorialConditionWait() {
  const waiting = tutorialWaitingFor;

  if (typeof waiting?.test !== "function") {
    // The step was superseded (a new wait, or the tutorial ended) -- this
    // watch has nothing left to guard.
    stopTutorialConditionWatch();
    return false;
  }

  let satisfied = false;
  try {
    satisfied = !!waiting.test();
  } catch {
    satisfied = false;
  }

  if (!satisfied) return false;

  stopTutorialConditionWatch();
  tutorialWaitingFor = null;
  updateActionBadge();
  tutorialSubStep++;

  if (window.state && window.myRole) {
    tutorialSteps(window.state, window.myRole);
  }

  return true;
}

// `prepare` puts the UI into the state the instruction assumes (closing
// the panel the step asks the player to open). It runs ONLY on a fresh
// arm: tutorialSteps() re-runs on every state broadcast, and re-preparing
// each time would slam the panel shut again a frame after the player
// opened it.
function waitForCondition(type, test, label, prepare) {
  if (tutorialWaitingFor?.type === type) return;

  stopTutorialConditionWatch();

  if (typeof prepare === "function") prepare();

  tutorialWaitingFor = {
    type,
    test,
    label: label || null
  };

  setContinue({
    show: true,
    mode: "hide"
  });

  updateActionBadge();

  // `prepare` above puts the panel into the "closed" state, so an
  // immediately-true condition should be rare -- but if it happens,
  // advancing beats stranding the player on a step whose instruction is
  // already carried out.
  if (checkTutorialConditionWait()) return;

  tutorialConditionObserver = new MutationObserver(
    scheduleTutorialConditionCheck
  );
  tutorialConditionObserver.observe(document.documentElement, {
    attributes: true,
    subtree: true,
    attributeFilter: ["class", "aria-expanded", "aria-pressed", "hidden"]
  });

  // Backstop for any route that changes the panel without touching one of
  // the observed attributes.
  tutorialConditionTimer = setInterval(checkTutorialConditionWait, 400);
}

function setterSidebarIsOpen() {
  const screen = byId("setterScreen");
  const toggle = byId("setterSidebarToggle");

  if (screen?.classList.contains("setter-sidebar-collapsed")) return false;
  if (toggle?.getAttribute("aria-expanded") === "false") return false;

  return !!screen;
}

function constraintRowIsShown() {
  return !document.body.classList.contains("hide-constraints");
}

// Closes the panel first so "open it" is a real instruction rather than a
// no-op the player has already satisfied.
function waitForSidebarOpened() {
  waitForCondition(
    "sidebarOpened",
    setterSidebarIsOpen,
    "OPEN THE COLUMN",
    () => window.__umtSetSidebarCollapsed?.("setter", true)
  );
}

function waitForConstraintRowShown() {
  waitForCondition(
    "constraintRowShown",
    constraintRowIsShown,
    "SHOW THE ROW",
    () => window.setConstraintsHidden?.(true)
  );
}

function waitForLogTabOpened() {
  tutorialWaitingFor = {
    type: "logTabOpened",
    label: "TAP LOG"
  };

  setContinue({
    show: true,
    mode: "hide"
  });

  updateActionBadge();
}

function waitForRejectedSecret() {
  tutorialWaitingFor = {
    type: "rejectedSecret"
  };

  setContinue({
    show: true,
    mode: "hide"
  });

  updateActionBadge();
}

function waitForDraftCleared() {
  tutorialWaitingFor = {
    type: "draftCleared"
  };

  setContinue({
    show: true,
    mode: "hide"
  });

  updateActionBadge();
}

// Leaves the room and returns to the menu, exactly like the match
// summary screen's own Leave button (summary.js's leaveSummaryBtn) --
// the last step of a tutorial reaches this same "done, head back" point
// without requiring the player to actually finish playing out the match.
// Everything this controller keeps between renders. None of it was being
// cleared on the way out, so a finished tutorial left its step counter,
// its armed wait, its reveal gate and its highlight ring behind -- and
// the next thing the player opened (a real game, or the next tutorial)
// started on top of that stale state.
function resetTutorialControllerState() {
  cancelTutorialRevealGate();
  stopTutorialConditionWatch();
  stopKeyDemo();
  stopDragDemo();
  clearHighlights();
  clearTutorialUserPosition();

  lastTutorialRound = null;
  tutorialSubStep = 0;
  tutorialWaitingFor = null;
  tutorialCollapsed = false;
  tutorialContinueMode = "advance";
  tutorialEndNextMode = "advanced";
  tutorialLastStepKey = "";

  powerTutorialDraftPrefilled = false;
  powerTutorialSkipSent = false;

  // The Advanced UI tutorial hides the constraint row itself so its "show
  // it" step is a real action (see waitForConstraintRowShown). That hide
  // is deliberately never persisted, so re-reading the stored preference
  // restores exactly what the player had before the tutorial rather than
  // forcing a value on them. The sidebar needs no equivalent: opening it
  // is the step, and its state is the player's own either way.
  window.restoreConstraintsPreference?.();
}
window.resetTutorialControllerState = resetTutorialControllerState;

function endTutorial() {
  byId("tutorialDoneModal")?.classList.remove("active");
  setTutorialDoneStacking(false);
  byId("tutorialBubble")?.classList.add("hidden");
  resetTutorialControllerState();
socket.emit("leaveRoom", {}, () => {
    roomId = null;
    clearRoom();
    state = null;
    window.state = null;
    resetKeyboards();
    showStartup();
  });
}
window.endTutorial = endTutorial;

// Shown once a tutorial's last tooltip is dismissed -- gives the player
// an explicit choice instead of silently dropping them back at the menu.
// "Next Tutorial" (see tutorialEndNextMode) points at whatever tutorial
// makes sense to try next, following the How to Play list's own order:
// Basics -> Quests -> Stars -> Extra Tools -> back to Basics.
// Keyed by the startFreshTutorial() mode that's next, not the one that
// just finished.
// "none" is the end of the line: the done modal drops its Next Tutorial
// button entirely and offers only Leave.
const TUTORIAL_DONE_COPY = {
  quest: `Basics complete! Continue with Quests, or head back to the menu.`,
  star: `Quest tutorial complete! Continue with Stars, or head back to the menu.`,
  advanced: `Star tutorial complete! Continue with Extra Tools, or head back to the menu.`,
  tutorial: `Extra Tools complete! Return to Basics, or head back to the menu.`,
  none: `Extra Tools complete! That's the last of them - head back to the menu.`
};

// Maps state.tutorialStage (or its absence) to the same key each
// tutorial's own How to Play button/start function uses -- read at the
// moment a tutorial reaches its real "done" screen so that single choke
// point (below) can mark it completed, without every individual tutorial
// file needing its own call to markTutorialCompleted. "power" (the
// Power Library's per-power "Try it" tutorials) is intentionally absent:
// those aren't part of How to Play's numbered list, so they're not
// tracked here.
const TUTORIAL_STAGE_TO_KEY = {
  1: "tutorial",
  quest: "quest",
  advanced: "advanced",
  star: "star"
};

function currentTutorialCompletionKey() {
  if (!window.state) return null;
  return TUTORIAL_STAGE_TO_KEY[window.state.tutorialStage] || null;
}

// UMT_TUTORIAL_REWORK_20260901: DONE MODAL STACKING
function setTutorialDoneStacking(active) {
  document.body.classList.toggle("tutorial-done-open", !!active);
  if (active) {
    document.body.classList.remove(
      "tutorial-reward-choice-guide",
      "tutorial-reward-choice-locked"
    );
    document
      .querySelector("#powerChoiceModal .pc-modal-card")
      ?.removeAttribute("inert");
  }
}

function showTutorialDoneModal() {
  byId("tutorialBubble")?.classList.add("hidden");
  clearHighlights();
  setTutorialDoneStacking(true);

  window.markTutorialCompleted?.(currentTutorialCompletionKey());

  const textEl = byId("tutorialDoneText");
  if (textEl) {
    textEl.textContent =
      TUTORIAL_DONE_COPY[tutorialEndNextMode] ||
      TUTORIAL_DONE_COPY.advanced;
  }

  // Toggled both ways: the modal is a single shared element, so a tutorial
  // that ends with Leave alone must not leave the button hidden for the
  // next tutorial that does chain onward.
  byId("tutorialDoneNextBtn")?.classList.toggle(
    "hidden",
    tutorialEndNextMode === "none"
  );

  byId("tutorialDoneModal")?.classList.add("active");
}

byId("tutorialDoneLeaveBtn")?.addEventListener("click", () => {
  endTutorial();
});

byId("tutorialDoneNextBtn")?.addEventListener("click", () => {
  byId("tutorialDoneModal")?.classList.remove("active");
  setTutorialDoneStacking(false);
  byId("tutorialBubble")?.classList.add("hidden");
const nextMode = tutorialEndNextMode;

  // startFreshTutorial() just creates a new room -- it never leaves the
  // one this tutorial is still sitting in, so without an explicit leave
  // first the old room's socket membership (and its stateUpdate
  // broadcasts) would keep leaking into the new one.
  socket.emit("leaveRoom", {}, () => {
    roomId = null;
    clearRoom();
    state = null;
    window.state = null;
    resetKeyboards();
    // Every other mode wants the human starting as guesser (startFreshTutorial's
    // own unconditional SWITCH_ROLES step), but the Star Tutorial specifically
    // needs the host left as setter -- see window.startStarTutorial's own
    // comment for why it skips that step entirely instead of switching twice.
    if (nextMode === "star" && typeof window.startStarTutorial === "function") {
      window.startStarTutorial();
    } else {
      startFreshTutorial(nextMode);
    }
  });
});

byId("tutorialContinueBtn")?.addEventListener("click", event => {
  event.stopPropagation();

  // A step's own content (a lower keyboard row, a far-down highlight) can
  // leave the page scrolled well past the top by the time the player taps
  // Next -- without this, the very next step's tooltip can land off-screen
  // above the current scroll position instead of where the player is
  // actually looking. Any step that genuinely needs to scroll back down to
  // its own highlight (e.g. highlightSavedNote/highlightSummaryActions)
  // does so itself afterward, so this only ever fights steps that don't.
  window.scrollTo({ top: 0, behavior: "smooth" });

  if (tutorialContinueMode === "end") {
    showTutorialDoneModal();
    return;
  }

  if (tutorialContinueMode === "hide") {
    toggleTutorial(true);
    return;
  }

  if (tutorialWaitingFor) return;

  tutorialSubStep++;

  if (window.state && window.myRole) {
    tutorialSteps(
      window.state,
      window.myRole
    );
  }
});

function notifyTutorialPowerUsed(
  powerId
) {
  if (!tutorialWaitingFor) {
    return;
  }

  if (
    tutorialWaitingFor.type ===
      "power" &&
    tutorialWaitingFor.powerId ===
      powerId
  ) {
    tutorialWaitingFor = null;

    updateActionBadge();

    tutorialSubStep++;

    if (
      window.state &&
      window.myRole
    ) {
      tutorialSteps(
        window.state,
        window.myRole
      );
    }
  }
}

window.notifyTutorialPowerUsed =
  notifyTutorialPowerUsed;
function notifyTutorialNotesOpened() {
  if (
    !tutorialWaitingFor ||
    tutorialWaitingFor.type !== "notes"
  ) {
    return;
  }

  tutorialWaitingFor = null;
  updateActionBadge();
  tutorialSubStep++;

  if (window.state && window.myRole) {
    tutorialSteps(
      window.state,
      window.myRole
    );
  }
}

window.notifyTutorialNotesOpened =
  notifyTutorialNotesOpened;

function notifyTutorialNoteAdded(word) {
  if (
    !tutorialWaitingFor ||
    tutorialWaitingFor.type !== "noteAdded"
  ) {
    return;
  }

  const actual =
    word?.toUpperCase() || "";

  const expected =
    tutorialWaitingFor.word;

  if (
    expected &&
    actual !== expected
  ) {
    return;
  }

  tutorialWaitingFor = null;
  updateActionBadge();
  tutorialSubStep++;

  if (window.state && window.myRole) {
    tutorialSteps(
      window.state,
      window.myRole
    );
  }
}

window.notifyTutorialNoteAdded =
  notifyTutorialNoteAdded;

function notifyTutorialNoteSelected(word) {
  if (
    !tutorialWaitingFor ||
    tutorialWaitingFor.type !== "noteSelected"
  ) {
    return;
  }

  const actual =
    word?.toUpperCase() || "";

  const expected =
    tutorialWaitingFor.word;

  if (
    expected &&
    actual !== expected
  ) {
    return;
  }

  tutorialWaitingFor = null;
  updateActionBadge();
  tutorialSubStep++;

  if (window.state && window.myRole) {
    tutorialSteps(
      window.state,
      window.myRole
    );
  }
}

window.notifyTutorialNoteSelected =
  notifyTutorialNoteSelected;

// Fires on either direction of the tap (open or close) -- the step just
// wants to confirm the player found and pressed the button, not that they
// left the panel in one particular state. Forced back open immediately
// after, since later steps in this same walkthrough (Log, the constraint
// row, power info) all live inside this panel and would have nothing to
// highlight if the player's tap happened to be the closing one.
function notifyTutorialSidebarToggled() {
  if (
    !tutorialWaitingFor ||
    tutorialWaitingFor.type !== "sidebarToggled"
  ) {
    return;
  }

  tutorialWaitingFor = null;
  updateActionBadge();
  tutorialSubStep++;

  window.setSetterSidebarCollapsed?.(false);

  if (window.state && window.myRole) {
    tutorialSteps(window.state, window.myRole);
  }
}

window.notifyTutorialSidebarToggled =
  notifyTutorialSidebarToggled;

function notifyTutorialLogTabOpened() {
  if (
    !tutorialWaitingFor ||
    tutorialWaitingFor.type !== "logTabOpened"
  ) {
    return;
  }

  tutorialWaitingFor = null;
  updateActionBadge();
  tutorialSubStep++;

  if (window.state && window.myRole) {
    tutorialSteps(window.state, window.myRole);
  }
}

window.notifyTutorialLogTabOpened =
  notifyTutorialLogTabOpened;

function notifyTutorialRejectedSecret() {
  if (!tutorialWaitingFor) {
    return;
  }

  if (
    tutorialWaitingFor.type ===
    "rejectedSecret"
  ) {
    tutorialWaitingFor = null;

    updateActionBadge();

    tutorialSubStep++;

    if (
      window.state &&
      window.myRole
    ) {
      tutorialSteps(
        window.state,
        window.myRole
      );
    }
  }
}

window.notifyTutorialRejectedSecret =
  notifyTutorialRejectedSecret;

// Backspacing is purely local (nothing round-trips to the server until the
// next Enter), so nothing else re-invokes tutorialSteps() while the player
// is erasing a rejected draft -- called directly from client.js's setter
// BACKSPACE handler instead, same shape as the other notifyTutorial*
// hooks above.
function notifyTutorialDraftCleared() {
  if (!tutorialWaitingFor) {
    return;
  }

  if (
    tutorialWaitingFor.type ===
    "draftCleared"
  ) {
    tutorialWaitingFor = null;

    updateActionBadge();

    tutorialSubStep++;

    if (
      window.state &&
      window.myRole
    ) {
      tutorialSteps(
        window.state,
        window.myRole
      );
    }
  }
}

window.notifyTutorialDraftCleared =
  notifyTutorialDraftCleared;

// ------------------------
// Main tutorial logic
// ------------------------
function tutorialSteps(state, role) {
  if (byId("tutorialDoneModal")?.classList.contains("active")) {
    return;
  }

  updateActionBadge();

  if (!state?.isTutorial) {
    lastTutorialRound = null;
    tutorialSubStep = 0;
    tutorialWaitingFor = null;
    cancelTutorialRevealGate();
    hideTutorial();
    return;
  }

  if (window._gameOverRevealInFlight) {
    return;
  }

  if (state.tutorialStage === "quest") {
    window.runQuestTutorial?.(state, role);
    return;
  }

  if (state.tutorialStage === "star") {
    window.runStarTutorial?.(state, role);
    return;
  }

  const round = state.history?.length ?? 0;

  if (round !== lastTutorialRound) {
    const prevRound = lastTutorialRound;
    lastTutorialRound = round;
    tutorialSubStep = 0;
    tutorialWaitingFor = null;
    powerTutorialDraftPrefilled = false;
    powerTutorialSkipSent = false;
    clearHighlights();

    if (
      prevRound !== null &&
      round > prevRound &&
      state.phase !== "gameOver"
    ) {
      startTutorialRevealGate(round, role);
    }
  }

  if (tutorialRevealGateRound === round) {
    return;
  }

  if (
    state.gameOverView === "round" &&
    state.phase === "gameOver"
  ) {
    if (state.tutorialStage === "advanced") {
      runAdvancedSummaryTutorial(state);
    } else if (state.tutorialStage === "power") {
      runPowerSummaryTutorial(state);
    } else {
      runBasicSummaryTutorial(state);
    }
    return;
  }

  if (
    state.gameOverView === "match" &&
    state.phase === "gameOver"
  ) {
    if (state.tutorialStage === "advanced") {
      runAdvancedMatchTutorial(state);
    } else if (state.tutorialStage === "power") {
      runPowerMatchTutorial(state);
    } else {
      runBasicMatchTutorial(state);
    }
    return;
  }

  if (state.tutorialStage === "power") {
    runPowerTutorial(state, role);
    return;
  }

  if (state.tutorialStage === "advanced") {
    runAdvancedTutorial(state, role);
    return;
  }

  runBasicTutorial(state, role);
}


window.TutorialCore = {
  show: showTutorial,
  hide: hideTutorial,

  clearHighlights,
  highlight: highlightEl,

  highlightKeyboardGuesser,

  setContinue,

  getStep() {
    return tutorialSubStep;
  },

  setStep(value) {
    tutorialSubStep =
      Number(value) || 0;
  },

  setMode(mode) {
    tutorialContinueMode = mode;
    updateActionBadge();
  },

  // Called right alongside setMode("end") -- picks which tutorial the
  // done-modal's "Next Tutorial" button launches (see tutorialEndNextMode
  // above showTutorialDoneModal()). Tutorials outside tutorial-ui.js
  // (e.g. tutorial-quest.js) have no other way to reach that variable.
  setNextTutorial(mode) {
    tutorialEndNextMode = mode || "advanced";
  },

  setWaiting(value) {
    tutorialWaitingFor = value;
    updateActionBadge();
  },

  clearWaiting() {
    tutorialWaitingFor = null;
    updateActionBadge();
  },

  waitForGuess:
    waitForGuessSubmission,

  waitForModalDismissed,

  startKeyDemo,
  stopKeyDemo,

  wordKeyEls:
    tutorialWordKeyEls,

  end: endTutorial
};

window.tutorialSteps =
  tutorialSteps;
