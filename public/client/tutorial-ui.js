// ------------------------
// Tutorial Controller
// ------------------------
let lastTutorialRound = null;
let tutorialSubStep = 0;
let tutorialWaitingFor = null;
let tutorialCollapsed = false;
let tutorialContinueMode = "advance";

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

  if (!badge || !continueBtn) return;

  const currentState = window.state || {};
  const waitingType = tutorialWaitingFor?.type;
  const round = currentState.history?.length ?? 0;

  let word = null;

  if (waitingType === "guess") {
    word = currentState.tutorialGuesses?.[round];
  } else if (waitingType === "setSecret") {
    word = currentState.tutorialSecrets?.[round];

    if (currentState.secret === word) {
      word = "";
    }
  }

  const alreadyWaiting =
    (
      waitingType === "guess" &&
      (
        (
          currentState.phase === "normal" &&
          !!currentState.pendingGuess
        ) ||
        (
          currentState.phase === "simultaneous" &&
          !!currentState.simultaneousGuessSubmitted
        )
      )
    ) ||
    (
      waitingType === "setSecret" &&
      currentState.phase === "simultaneous" &&
      !!currentState.simultaneousSecretSubmitted
    );

  let label = "ACTION";

  if (alreadyWaiting) {
    label = "WAITING...";
  } else if (
    (
      waitingType === "guess" ||
      waitingType === "setSecret"
    ) &&
    word
  ) {
    label = `ENTER ${word}`;
  } else if (
    waitingType === "guess" ||
    waitingType === "setSecret"
  ) {
    label = "SUBMIT";
  } else if (waitingType === "power") {
    const meta =
      window.POWER_METADATA?.[
        tutorialWaitingFor.powerId
      ];

    label =
      `USE ${
        (
          meta?.label ||
          tutorialWaitingFor.powerId ||
          ""
        ).toUpperCase()
      }`;
  } else if (waitingType === "notes") {
    label = "OPEN NOTES";
  } else if (waitingType === "noteAdded") {
    label = tutorialWaitingFor.word
      ? `SAVE ${tutorialWaitingFor.word}`
      : "SAVE A WORD";
  } else if (waitingType === "noteSelected") {
    label = tutorialWaitingFor.word
      ? `TAP ${tutorialWaitingFor.word}`
      : "PICK A WORD";
  } else if (waitingType === "rejectedSecret") {
    label = "TRY PICKY";
  }

  badge.textContent = label;
  badge.classList.toggle("hidden", !waitingType);

  continueBtn.textContent =
    waitingType ? "Hide" : "Next";
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

  return [
    ...new Set([
      ...highlighted,
      ...draftRows
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

function showTutorial(text, opts = {}) {
  const bubble = byId("tutorialBubble");
  const textEl = byId("tutorialText");

  if (!bubble || !textEl) return;

  const nextKey =
    tutorialStepKey(opts);

  const isNewStep =
    nextKey !== tutorialLastStepKey;

  const wasHidden =
    bubble.classList.contains("hidden");

  tutorialLastStepKey = nextKey;

  if (isNewStep || wasHidden) {
    tutorialCollapsed = false;
    bubble.classList.remove("collapsed");
  }

  bubble.classList.remove("hidden");

  // A bubble coming back from fully hidden doesn't know where it belongs
  // yet -- that requires a layout pass (below) that reads the freshly
  // highlighted targets for this step, which haven't necessarily settled
  // into the DOM yet either (highlightEl() calls after this in the same
  // render function commit via a queued microtask). Keep it invisible
  // (but still measurable -- see .positioning in tutorial.css) through
  // that pass instead of revealing it at whatever position it last had
  // and visibly animating over to the right one a frame later.
  if (wasHidden) {
    bubble.classList.add("positioning");
    tutorialPendingReveal = () => bubble.classList.remove("positioning");
  }

  if (textEl.textContent !== text) {
    textEl.textContent = text;

    if (isNewStep || wasHidden) {
      animateTutorialBody();
    }
  }

  setContinue({
    show: true,
    enabled: true,
    ...opts
  });

  updateActionBadge();
  updateTutorialToggleState();
  scheduleTutorialLayout();
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
}

function hideTutorial() {
  pauseTutorial();

  tutorialWaitingFor = null;

  updateActionBadge();
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

    tutorialHighlightTargets = [
      ...new Set(tutorialHighlightDraft)
    ].filter(Boolean);

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

function highlightKeyboardGuesser() {
  highlightEl(
    byId("keyboardGuesser")
  );
}

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

function highlightKeyboardSetter() {
  highlightEl(
    byId("keyboardSetter")
  );
}

function highlightSetterHistory() {
  highlightEl(
    lastHistoryRow("setterGuesserSubmitted")
  );
}

function highlightGuideToggle(role) {
  highlightEl(
    byId(
      role === "setter"
        ? "guideToggleBtnSetter"
        : "guideToggleBtnGuesser"
    )
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

// Highlights whichever letters of `word` haven't been typed into `draft`
// yet, or the Enter key once every letter's in place. Shared by every
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

  return [tutorialKeyEl(role, "ENTER")];
}

window.refreshTutorialKeyDemo = applyKeyDemoHighlight;

function highlightNotesPanel() {
  highlightEl(byId("notesPanelSetter"));
}

function highlightNotesList() {
  highlightEl(byId("notesListSetter"));
}
function highlightPowersCol() {
  highlightEl(
    byId("guesserPowerContainer")
  );

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

function highlightRoundSummaryColumn(cellClass) {
  document
    .querySelectorAll(
      `#roundSummary .summary-table--round td.${cellClass}`
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

function highlightStoredRound(index) {
  highlightEl(
    qs(
      `#roundSummary .stored-round[data-round-index="${index}"]`
    )
  );
}

function highlightSummaryActions() {
  // Not "#roundSummary .summary-actions" -- the tutorial-2 handoff CTA
  // (see summary.js's tutorial2Cta) reuses that same class on an earlier
  // div for the "Continue to Tutorial 2" button, and a plain class
  // selector would silently match that one instead of the real New
  // Match/Replay/Leave row this step is actually describing.
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
// to what) the Spy changed their secret, instead of just listing words.
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
    ? `The Spy's secret was "${segment.secret}" for ${span}.`
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

function waitForGuessSubmission(round) {
  tutorialWaitingFor = {
    type: "guess",
    round
  };

  setContinue({
    show: true,
    mode: "hide"
  });

  updateActionBadge();
}

function waitForSecretSubmission(round) {
  tutorialWaitingFor = {
    type: "setSecret",
    round
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
  if (
    !tutorialWaitingFor ||
    tutorialWaitingFor.type !== "power"
  ) {
    return;
  }

  clearHighlights();
  highlightEl(byId("powerActionUseBtn"));
}
window.tutorialOnPowerActionModalOpen =
  tutorialOnPowerActionModalOpen;

function tutorialOnPowerActionModalClose() {
  if (
    !tutorialWaitingFor ||
    tutorialWaitingFor.type !== "power"
  ) {
    return;
  }

  if (window.state && window.myRole) {
    tutorialSteps(window.state, window.myRole);
  }
}
window.tutorialOnPowerActionModalClose =
  tutorialOnPowerActionModalClose;

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

byId("tutorialContinueBtn")?.addEventListener("click", event => {
  event.stopPropagation();

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
  updateActionBadge();

  if (!state?.isTutorial) {
    lastTutorialRound = null;
    tutorialSubStep = 0;
    tutorialWaitingFor = null;

    cancelTutorialRevealGate();
    hideTutorial();

    return;
  }

  if (
    window._gameOverRevealInFlight
  ) {
    return;
  }

  const round =
    state.history?.length ?? 0;

  if (round !== lastTutorialRound) {
    const prevRound =
      lastTutorialRound;

    lastTutorialRound = round;
    tutorialSubStep = 0;
    tutorialWaitingFor = null;

    powerTutorialDraftPrefilled =
      false;

    powerTutorialSkipSent = false;

    clearHighlights();

    if (
      prevRound !== null &&
      round > prevRound &&
      state.phase !== "gameOver"
    ) {
      startTutorialRevealGate(
        round,
        role
      );
    }
  }

  if (
    tutorialRevealGateRound === round
  ) {
    return;
  }

  if (
    state.gameOverView === "round" &&
    state.phase === "gameOver"
  ) {
    runSummaryTutorial(state);
    return;
  }

  if (
    state.gameOverView === "match" &&
    state.phase === "gameOver"
  ) {
    runMatchTutorial(state);
    return;
  }

  if (
    state.tutorialStage === "power"
  ) {
    runPowerTutorial(state, role);
    return;
  }

  if (
    state.tutorialStage ===
    "advanced"
  ) {
    runAdvancedTutorial(
      state,
      role
    );

    return;
  }

  const aiPlayer =
    Object.values(
      state.players || {}
    ).find(player => player.isAI);

  if (
    aiPlayer?.role === "setter"
  ) {
    runGuesserTutorial(
      state,
      role
    );

    return;
  }

  if (
    aiPlayer?.role === "guesser"
  ) {
    runSetterTutorial(
      state,
      role
    );
  }
}

function runGuesserTutorial(
  state,
  role
) {
  const round =
    state.history?.length ?? 0;

  clearHighlights();

  const stage2 =
    state.tutorialStage === 2;

  if (stage2) {
    if (round === 0) {
      const word =
        state.tutorialGuesses?.[0] ||
        "CHAMP";

      if (tutorialSubStep === 0) {
        showTutorial(
          `Welcome back! This short follow-up teaches you two powers — one for the Inspector, one for the Spy.`,
          {
            enabled: true
          }
        );

        tutorialContinueMode =
          "advance";

        return;
      }

      if (tutorialSubStep === 1) {
        showTutorial(
          `You're the Inspector again, and this time you have a power available: Letter Peek — it reveals one correct letter and its position.`,
          {
            enabled: true
          }
        );

        highlightPowersCol();

        tutorialContinueMode =
          "advance";

        return;
      }

      if (tutorialSubStep === 2) {
        if (
          state.simultaneousGuessSubmitted
        ) {
          showTutorial(
            `Waiting for the Spy to finish picking their secret…`,
            {
              enabled: false
            }
          );
        } else {
          showTutorial(
            `First, enter your opening guess. Enter "${word}" and click ENTER.`,
            {
              enabled: true,
              mode: "hide"
            }
          );

          startKeyDemo(
            `guesser-stage2-round0-${word}`,
            () =>
              tutorialWordKeyEls(
                "guesser",
                word,
                localGuesserDraft
              )
          );
        }

        tutorialContinueMode =
          "hide";

        highlightKeyboardGuesser();
        waitForGuessSubmission(round);

        return;
      }

      hideTutorial();
      return;
    }

    if (round === 1) {
      if (tutorialSubStep === 0) {
        showTutorial(
          `Now let's use your power. Click "Letter Peek" to reveal one correct letter and where it goes.`,
          {
            enabled: false
          }
        );

        highlightPowerButtonByText(
          "Letter Peek"
        );

        tutorialContinueMode =
          "hide";

        waitForPowerUse(
          "revealGreen"
        );

        return;
      }

      if (tutorialSubStep === 1) {
        const word =
          state.tutorialGuesses?.[1] ||
          "CUMIN";

        const info =
          state.revealGreenInfo;

        if (!info) {
          showTutorial(
            `Revealing your letter…`,
            {
              enabled: false
            }
          );

          return;
        }

        showTutorial(
          `Letter Peek revealed "${info.letter}" in position ${info.pos + 1} — see it appear in your action log below. Try a guess that uses it, like "${word}".`,
          {
            enabled: true
          }
        );

        highlightLogEntryByText(
          "Letter Peek",
          "guesser"
        );

        tutorialContinueMode =
          "advance";

        return;
      }

      if (tutorialSubStep === 2) {
        const word =
          state.tutorialGuesses?.[1] ||
          "CUMIN";

        if (state.pendingGuess) {
          showTutorial(
            `Waiting for the Spy to react to "${word}"…`,
            {
              enabled: false
            }
          );
        } else {
          showTutorial(
            `Now enter your second guess: "${word}".`,
            {
              enabled: true,
              mode: "hide"
            }
          );

          startKeyDemo(
            `guesser-stage2-round1-${word}`,
            () =>
              tutorialWordKeyEls(
                "guesser",
                word,
                localGuesserDraft
              )
          );
        }

        highlightKeyboardGuesser();

        tutorialContinueMode =
          "hide";

        waitForGuessSubmission(round);

        return;
      }

      hideTutorial();
      return;
    }

    if (round === 2) {
      if (tutorialSubStep === 0) {
        showTutorial(
          `From here on, finish this round on your own. Once you find the secret, you'll switch roles and try the Spy's power. Good luck!`,
          {
            enabled: true,
            mode: "hide"
          }
        );

        tutorialContinueMode =
          "hide";

        return;
      }

      hideTutorial();
      return;
    }

    return;
  }

  if (round === 0) {
    const word =
      state.tutorialGuesses?.[0] ||
      "CHAMP";

    if (tutorialSubStep === 0) {
      showTutorial(
        `Welcome! You're the Inspector 🕵️. The Spy just hid a secret 5-letter word somewhere in their head.`,
        {
          mode: "advance"
        }
      );

      return;
    }

    if (tutorialSubStep === 1) {
      showTutorial(
        `Your job: figure out the secret word. Try to do it in as few guesses as you can.`,
        {
          mode: "advance"
        }
      );

      return;
    }

    if (tutorialSubStep === 2) {
      if (
        state.simultaneousGuessSubmitted
      ) {
        showTutorial(
          `Guess submitted! Now we wait for the Spy to lock in their secret word...`,
          {
            mode: "hide"
          }
        );

        stopKeyDemo();
      } else {
        showTutorial(
          `Let's make your first guess. Type "${word}" on the keyboard below, then press Enter.`,
          {
            mode: "hide"
          }
        );

        startKeyDemo(
          `guesser-round0-${word}`,
          () =>
            tutorialWordKeyEls(
              "guesser",
              word,
              localGuesserDraft
            )
        );
      }

      highlightKeyboardGuesser();
      waitForGuessSubmission(round);

      return;
    }

    hideTutorial();
    return;
  }

  if (round === 1) {
    if (tutorialSubStep === 0) {
      showTutorial(
        `Nice, you guessed! Now look up at your guess — each letter's tile changed color. Those colors are clues.`,
        {
          mode: "advance"
        }
      );

      highlightHistoryGuesser();

      return;
    }

    if (tutorialSubStep === 1) {
      showTutorial(
        `🟩 Green means that letter is correct AND in the right spot. You found a piece of the secret!`,
        {
          mode: "advance"
        }
      );

      highlightHistoryGuesser();

      return;
    }

    if (tutorialSubStep === 2) {
      showTutorial(
        `🟨 Yellow means that letter IS in the secret word, just in a different spot. Keep it, but try moving it.`,
        {
          mode: "advance"
        }
      );

      highlightHistoryGuesser();

      return;
    }

    if (tutorialSubStep === 3) {
      showTutorial(
        `⬜ Grey means that letter isn't in the secret word at all. You can rule it out completely.`,
        {
          mode: "advance"
        }
      );

      highlightHistoryGuesser();

      return;
    }

    if (tutorialSubStep === 4) {
      showTutorial(
        `One more thing: your guess doesn't have to use only letters that could still be in the secret. Sometimes you won't have a good word using just those.`,
        {
          mode: "advance"
        }
      );

      highlightKeyboardGuesser();

      return;
    }

    if (tutorialSubStep === 5) {
      const word =
        state.tutorialGuesses?.[1] ||
        "CAIRN";

      if (state.pendingGuess) {
        showTutorial(
          `Guess submitted! Waiting for the Spy to respond...`,
          {
            mode: "hide"
          }
        );

        stopKeyDemo();
      } else {
        showTutorial(
          `Now use those clues for your next guess. Try "${word}" — new letters can teach you even more.`,
          {
            mode: "hide"
          }
        );

        startKeyDemo(
          `guesser-round1-${word}`,
          () =>
            tutorialWordKeyEls(
              "guesser",
              word,
              localGuesserDraft
            )
        );
      }

      highlightKeyboardGuesser();
      waitForGuessSubmission(round);

      return;
    }

    hideTutorial();
    return;
  }

  if (round === 2) {
    if (tutorialSubStep === 0) {
      showTutorial(
        `From here on, keep going the same way: enter a 5-letter guess, check the colored feedback, and use it to narrow down the secret.`,
        {
          mode: "advance"
        }
      );

      return;
    }

    if (tutorialSubStep === 1) {
      showTutorial(
        `You've got the hang of it! Finish this round on your own now.`,
        {
          mode: "advance"
        }
      );

      return;
    }

    if (tutorialSubStep === 2) {
      showTutorial(
        `Here's a little hint: the Spy likes well-spiced food. 🌶️`,
        {
          mode: "hide"
        }
      );

      return;
    }

    hideTutorial();
  }
}

function runSetterTutorial(
  state,
  role
) {
  const round =
    state.history?.length ?? 0;

  clearHighlights();

  const stage2 =
    state.tutorialStage === 2;

  if (stage2) {
    if (round === 0) {
      const word =
        state.tutorialSecrets?.[0];

      if (tutorialSubStep === 0) {
        showTutorial(
          `Now you're the Spy, with a power of your own available this time: Counts Only.`,
          {
            enabled: false
          }
        );

        highlightPowersCol();

        tutorialContinueMode =
          "advance";

        return;
      }

      if (tutorialSubStep === 1) {
        if (
          state.simultaneousSecretSubmitted
        ) {
          showTutorial(
            `Waiting for the Inspector to finish their opening guess…`,
            {
              enabled: false
            }
          );
        } else {
          showTutorial(
            `In the first round, you enter a secret word — your opponent won't see it. Enter "${word}".`,
            {
              enabled: false
            }
          );

          startKeyDemo(
            `setter-stage2-round0-${word}`,
            () =>
              tutorialWordKeyEls(
                "setter",
                word,
                window.state?.setterDraft
              )
          );
        }

        highlightKeyboardSetter();

        tutorialContinueMode =
          "hide";

        waitForSecretSubmission(round);

        return;
      }

      hideTutorial();
      return;
    }

    if (round === 1) {
      const word =
        state.tutorialSecrets?.[1];

      if (tutorialSubStep === 0) {
        showTutorial(
          `Let's use your power this turn. Click "Counts Only" — it hides exact tile positions from the Inspector and shows them only how many letters are green or yellow in total.`,
          {
            enabled: true
          }
        );

        highlightPowerButtonByText(
          "Counts Only"
        );

        tutorialContinueMode =
          "hide";

        waitForPowerUse(
          "countOnly"
        );

        return;
      }

      if (tutorialSubStep === 1) {
        showTutorial(
          `Nice — now let's lock in a new secret. Enter "${word}"! After this, finish the round on your own.`,
          {
            enabled: true,
            mode: "hide"
          }
        );

        startKeyDemo(
          `setter-stage2-round1-${word}`,
          () =>
            tutorialWordKeyEls(
              "setter",
              word,
              window.state?.setterDraft
            )
        );

        highlightKeyboardSetter();

        tutorialContinueMode =
          "hide";

        waitForSecretSubmission(round);

        return;
      }

      hideTutorial();
      return;
    }

    if (round === 2) {
      const countEntry =
        [...state.history]
          .reverse()
          .find(e =>
            e.countOnlyApplied &&
            e.extraInfo
          );

      if (tutorialSubStep === 0) {
        showTutorial(
          `From here on, play strategically and try to outsmart your opponent.`,
          {
            enabled: true
          }
        );

        tutorialContinueMode =
          "advance";

        return;
      }

      if (
        tutorialSubStep === 1 &&
        countEntry
      ) {
        const {
          greens,
          yellows
        } = countEntry.extraInfo;

        showTutorial(
          `Counts Only hid the exact tile colors on "${countEntry.guess}" — the Inspector only learned ${greens} letter${greens === 1 ? " was" : "s were"} green and ${yellows} ${yellows === 1 ? "was" : "were"} yellow, not which. The small "?" marks in the bottom-right corner of those tiles show which ones the Inspector saw that way instead of a real color — other powers can leave a similar mark to show what color the Inspector actually saw there.`,
          {
            enabled: true,
            mode: "hide"
          }
        );

        highlightSetterHistory();

        tutorialContinueMode =
          "hide";

        return;
      }

      hideTutorial();
      return;
    }

    return;
  }

  if (round === 0) {
    const word =
      state.tutorialSecrets?.[0];

    if (tutorialSubStep === 0) {
      showTutorial(
        `Now it's your turn to be the Spy 🕵️‍♂️. This time, you're the one hiding a secret word.`,
        {
          mode: "advance"
        }
      );

      return;
    }

    if (tutorialSubStep === 1) {
      showTutorial(
        `Your goal: keep a valid 5-letter secret alive for as many guesses as you can.`,
        {
          mode: "advance"
        }
      );

      return;
    }

    if (
      state.simultaneousSecretSubmitted
    ) {
      showTutorial(
        `Secret locked in! Now we wait for the Inspector's opening guess...`,
        {
          mode: "hide"
        }
      );

      stopKeyDemo();
    } else {
      showTutorial(
        `Let's pick your secret. Type "${word}" on the keyboard below, then press Enter.`,
        {
          mode: "hide"
        }
      );

      startKeyDemo(
        `setter-round0-${word}`,
        () =>
          tutorialWordKeyEls(
            "setter",
            word,
            window.state?.setterDraft
          )
      );
    }

    highlightKeyboardSetter();
    waitForSecretSubmission(round);

    return;
  }

  if (round === 1) {
    const word =
      state.tutorialSecrets?.[1];

    if (tutorialSubStep === 0) {
      // The Inspector's next guess doesn't land as a real pendingGuess the
      // instant this round begins -- it still has to be computed and
      // submitted. Pointing highlightPendingGuessRow() at nothing (and
      // announcing "it's sitting right above your secret" over an empty
      // row) until that arrives is confusing, so wait for it first.
      if (!state.pendingGuess) {
        showTutorial(
          `Waiting for the Inspector's next guess...`,
          {
            mode: "hide"
          }
        );

        return;
      }

      showTutorial(
        `Here's something new: you can see the Inspector's next guess before it's scored — it's sitting right above your secret.`,
        {
          mode: "advance"
        }
      );

      highlightPendingGuessRow();

      return;
    }

    if (tutorialSubStep === 1) {
      showTutorial(
        `Changing your secret is one of the most important things you can do as the Spy — swap in a new word if your current one's getting risky, or just to throw the Inspector off. There's just one rule: any new secret must still match every clue you've already given.`,
        {
          mode: "advance"
        }
      );

      highlightPendingGuessRow();

      return;
    }

    if (tutorialSubStep === 2) {
      showTutorial(
        `Let's see that one rule in action. Type PICKY and press Enter — watch what happens.`,
        {
          mode: "hide"
        }
      );

      highlightKeyboardSetter();

      startKeyDemo(
        "setter-round1-picky-demo",
        () =>
          tutorialWordKeyEls(
            "setter",
            "PICKY",
            window.state?.setterDraft
          )
      );

      // Normally a rejected secret clears itself automatically -- suppressed
      // just for this one demo (see submitSetterNew() in client.js) so the
      // next step can walk through erasing PICKY by hand instead of
      // finding an already-empty draft.
      window.tutorialKeepRejectedDraft = true;

      waitForRejectedSecret();

      return;
    }

    if (tutorialSubStep === 3) {
      showTutorial(
        `Right — PICKY got rejected because it breaks a clue you already gave. Let's clear it out — tap Backspace to erase it.`,
        {
          mode: "hide"
        }
      );

      highlightKeyboardSetter();
      waitForDraftCleared();

      startKeyDemo(
        "setter-round1-backspace-demo",
        () => [tutorialKeyEl("setter", "BACKSPACE")]
      );

      return;
    }

    if (tutorialSubStep === 4) {
      showTutorial(
        `Now try a word that's actually allowed: "${word}".`,
        {
          mode: "hide"
        }
      );

      highlightKeyboardSetter();
      waitForSecretSubmission(round);

      startKeyDemo(
        `setter-round1-${word}`,
        () =>
          tutorialWordKeyEls(
            "setter",
            word,
            window.state?.setterDraft
          )
      );

      return;
    }

    hideTutorial();
    return;
  }

  if (round === 2) {
    if (tutorialSubStep === 0) {
      showTutorial(
        `You won't always need to change it, though — if your secret still fits every clue, the simplest move is keeping it exactly as is. Your draft row is empty on purpose: just tap Submit with nothing typed to lock the same secret back in.`,
        {
          mode: "hide"
        }
      );

      highlightKeyboardSetter();
      waitForSecretSubmission(round);

      startKeyDemo(
        "setter-round2-keep-demo",
        () => [tutorialKeyEl("setter", "ENTER")]
      );

      return;
    }

    hideTutorial();
    return;
  }

  if (round === 3) {
    if (tutorialSubStep === 0) {
      showTutorial(
        `That's the core Spy strategy — stay flexible, stay legal. Finish this round on your own now. You've got this!`,
        {
          mode: "hide"
        }
      );

      return;
    }

    hideTutorial();
  }
}

const POWER_TUTORIAL_SEED_ROUND = 2;
const POWER_TUTORIAL_GUESSER_DRAFT =
  "SNORE";

function prefillPowerTutorialGuesserDraft() {
  if (powerTutorialDraftPrefilled) {
    return;
  }

  powerTutorialDraftPrefilled = true;

  window.setGuesserDraft?.(
    POWER_TUTORIAL_GUESSER_DRAFT
  );
}

function runPowerTutorial(
  state,
  role
) {
  const round =
    state.history?.length ?? 0;

  clearHighlights();

  const powerId =
    state.tutorialPowerId;

  const meta =
    window.POWER_METADATA?.[powerId];

  if (!powerId || !meta) {
    hideTutorial();
    return;
  }

  const powerRole =
    meta.role === "setter"
      ? "setter"
      : "guesser";

  if (role === powerRole) {
    runPowerTutorialTeaching(
      state,
      role,
      meta,
      powerId,
      round
    );
  } else {
    runPowerTutorialReceiving(
      state,
      role,
      meta,
      powerId,
      round
    );
  }
}

function runPowerTutorialTeaching(
  state,
  role,
  meta,
  powerId,
  round
) {
  const isGuesser =
    role === "guesser";

  if (
    round ===
    POWER_TUTORIAL_SEED_ROUND
  ) {
    if (tutorialSubStep === 0) {
      showTutorial(
        `Let's try out ${meta.label}. ${meta.desc}`,
        {
          enabled: true
        }
      );

      tutorialContinueMode =
        "advance";

      return;
    }

    if (
      isGuesser &&
      tutorialSubStep === 1
    ) {
      showTutorial(
        `One more thing: as the Inspector, you also always have a Quest active — a visible challenge shown next to your powers that rewards a free green letter when completed. Check the Powers screen any time for the full list and example words.`,
        {
          enabled: true
        }
      );

      tutorialContinueMode =
        "advance";

      return;
    }

    if (
      tutorialSubStep ===
      (isGuesser ? 2 : 1)
    ) {
      if (isGuesser) {
        prefillPowerTutorialGuesserDraft();
      }

      showTutorial(
        `Tap "${meta.label}" to activate it.`,
        {
          enabled: false
        }
      );

      highlightPowerButtonByText(
        meta.label
      );

      tutorialContinueMode =
        "hide";

      waitForPowerUse(powerId);

      return;
    }

    if (
      tutorialSubStep ===
      (isGuesser ? 3 : 2)
    ) {
      if (
        isGuesser &&
        state.pendingGuess
      ) {
        showTutorial(
          `Waiting for the Spy to react…`,
          {
            enabled: false
          }
        );
      } else {
        showTutorial(
          isGuesser
            ? "Now submit your guess."
            : "Now submit to lock it in.",
          {
            enabled: false
          }
        );
      }

      tutorialContinueMode =
        "hide";

      if (isGuesser) {
        highlightKeyboardGuesser();
        waitForGuessSubmission(round);
      } else {
        highlightKeyboardSetter();
        waitForSecretSubmission(round);
      }

      return;
    }

    hideTutorial();
    return;
  }

  if (
    round ===
    POWER_TUTORIAL_SEED_ROUND + 1
  ) {
    if (!powerTutorialSkipSent) {
      powerTutorialSkipSent = true;

      showTutorial(
        `That's ${meta.label} from your side! Switching to the RECEIVING end now, so you can see what it looks like from there.`,
        {
          enabled: false
        }
      );

      tutorialContinueMode =
        "hide";

      sendGameAction({
        type:
          "TUTORIAL_SKIP_TO_RECEIVING"
      });

      return;
    }

    return;
  }

  hideTutorial();
}

function runPowerTutorialReceiving(
  state,
  role,
  meta,
  powerId,
  round
) {
  const isGuesser =
    role === "guesser";

  if (
    round ===
    POWER_TUTORIAL_SEED_ROUND
  ) {
    if (isGuesser) {
      if (tutorialSubStep === 0) {
        showTutorial(
          `Roles just swapped! Now watch what it's like when your opponent uses ${meta.label} against YOU.`,
          {
            enabled: true
          }
        );

        tutorialContinueMode =
          "advance";

        return;
      }

      if (tutorialSubStep === 1) {
        showTutorial(
          `One more thing: as the Inspector, you also always have a Quest active — a visible challenge shown next to your powers that rewards a free green letter when completed. Check the Powers screen any time for the full list and example words.`,
          {
            enabled: true
          }
        );

        tutorialContinueMode =
          "advance";

        return;
      }

      if (tutorialSubStep === 2) {
        prefillPowerTutorialGuesserDraft();

        showTutorial(
          state.pendingGuess
            ? `Waiting for the Spy to react…`
            : `Submit your guess.`,
          {
            enabled: false
          }
        );

        highlightKeyboardGuesser();

        tutorialContinueMode =
          "hide";

        waitForGuessSubmission(round);

        return;
      }

      hideTutorial();
      return;
    }

    if (!state.pendingGuess) {
      showTutorial(
        `Roles just swapped! Watch what happens when your opponent uses ${meta.label} against you...`,
        {
          enabled: false
        }
      );

      tutorialContinueMode =
        "hide";

      return;
    }

    showTutorial(
      `Your opponent just used ${meta.label}! React normally to finish the round.`,
      {
        enabled: false
      }
    );

    tutorialContinueMode =
      "hide";

    highlightDraftRow("setter");

    return;
  }

  if (
    round ===
    POWER_TUTORIAL_SEED_ROUND + 1
  ) {
    if (tutorialSubStep === 0) {
      showTutorial(
        `That's ${meta.label} in action! You've now seen it from both sides.`,
        {
          enabled: true
        }
      );

      tutorialContinueMode =
        "advance";

      return;
    }

    hideTutorial();
    return;
  }

  hideTutorial();
}
// STAGE "advanced": Guide, Drag & Lock, and Notes.
function runAdvancedTutorial(state, role) {
  clearHighlights();

  if (role === "guesser") {
    runAdvancedTutorialGuesser(state);
  } else {
    runAdvancedTutorialSetter(state);
  }
}

function runAdvancedTutorialGuesser(state) {
  const round =
    state.history?.length ?? 0;

  if (round === 0) {
    if (tutorialSubStep === 0) {
      showTutorial(
        `This tutorial covers three extra tools: Guide, Drag & Lock, and Notes. Powers have their own tutorial.`,
        {
          mode: "advance"
        }
      );

      return;
    }

    if (tutorialSubStep === 1) {
      showTutorial(
        `Guide is a little helper. Turn it on when you want the game to explain what a box or number means.`,
        {
          mode: "advance"
        }
      );

      highlightGuideToggle("guesser");
      return;
    }

    if (tutorialSubStep === 2) {
      const word =
        state.tutorialGuesses?.[0] ||
        "CHAMP";

      if (
        state.simultaneousGuessSubmitted
      ) {
        showTutorial(
          `Your guess is ready. Waiting for the Spy to choose a secret...`,
          {
            mode: "hide"
          }
        );
      } else {
        showTutorial(
          `Enter "${word}" and press Enter.`,
          {
            mode: "hide"
          }
        );
      }

      highlightKeyboardGuesser();
      waitForGuessSubmission(round);
      return;
    }

    hideTutorial();
    return;
  }

  if (round === 1) {
    const word =
      state.tutorialGuesses?.[1] ||
      "CUMIN";

    if (state.pendingGuess) {
      showTutorial(
        `Your guess is ready. Waiting for the Spy to answer...`,
        {
          mode: "hide"
        }
      );
    } else {
      showTutorial(
        `Try Drag & Lock with "${word}". Drag a keyboard letter onto any tile. Tap a filled tile to lock it, so Backspace cannot erase it.`,
        {
          mode: "hide"
        }
      );
    }

    highlightDraftRow("guesser");
    waitForGuessSubmission(round);
    return;
  }

  if (round === 2) {
    showTutorial(
      `Good. You used Guide and Drag & Lock. Next you will be the Spy and learn Notes.`,
      {
        mode: "hide"
      }
    );

    return;
  }

  hideTutorial();
}

function runAdvancedTutorialSetter(state) {
  const round =
    state.history?.length ?? 0;

  if (round === 0) {
    if (tutorialSubStep === 0) {
      showTutorial(
        `Now you are the Spy. Drag & Lock works on your secret row too. We will use Notes after the first guess.`,
        {
          mode: "advance"
        }
      );

      highlightDraftRow("setter");
      return;
    }

    if (tutorialSubStep === 1) {
      const word =
        state.tutorialSecrets?.[0] ||
        "BLIMP";

      if (
        state.simultaneousSecretSubmitted
      ) {
        showTutorial(
          `Your secret is ready. Waiting for the Inspector's first guess...`,
          {
            mode: "hide"
          }
        );
      } else {
        showTutorial(
          `Enter "${word}". You can drag letters into tiles and tap a filled tile to lock it.`,
          {
            mode: "hide"
          }
        );
      }

      highlightDraftRow("setter");
      waitForSecretSubmission(round);
      return;
    }

    hideTutorial();
    return;
  }

  if (round === 1) {
    const candidate = (
      state.tutorialSecrets?.[1] ||
      "LEMUR"
    ).toUpperCase();

    if (tutorialSubStep === 0) {
      showTutorial(
        `It is the Inspector's turn, so your secret keyboard is free. Notes has opened automatically as a scratchpad while you wait.`,
        {
          mode: "advance"
        }
      );

      highlightNotesPanel();
      return;
    }

    if (tutorialSubStep === 1) {
      showTutorial(
        `Your current secret is saved here automatically. Now type "${candidate}" in the five small Notes boxes and press Enter to save another possible secret.`,
        {
          mode: "hide"
        }
      );

      highlightNotesPanel();
      waitForNoteAdded(candidate);
      return;
    }

    if (tutorialSubStep === 2) {
      showTutorial(
        `Saved words that still match every clue stay green. After a new guess arrives, a small number can show how many secrets would remain if you used that word. Bigger is usually safer.`,
        {
          mode: "advance"
        }
      );

      highlightNotesList();
      return;
    }

    if (tutorialSubStep === 3) {
      if (!state.pendingGuess) {
        showTutorial(
          `Your backup word is saved. The Inspector is still thinking...`,
          {
            key:
              `advanced-notes-wait-${round}`
          }
        );

        highlightNotesList();

        setContinue({
          show: false
        });

        return;
      }

      showTutorial(
        `The new guess is here. Tap "${candidate}" in Notes. It will copy straight into your real secret row.`,
        {
          mode: "hide"
        }
      );

      highlightNotesList();
      waitForNoteSelected(candidate);
      return;
    }

    if (tutorialSubStep === 4) {
      showTutorial(
        `"${candidate}" is now in your secret row. Check it, then press Enter to switch. Notes saves typing, but the new secret must still follow every clue.`,
        {
          mode: "hide"
        }
      );

      highlightDraftRow("setter");
      waitForSecretSubmission(round);
      return;
    }

    hideTutorial();
    return;
  }

  if (round === 2) {
    showTutorial(
      `That is the advanced UI: Guide explains things, Drag & Lock helps you place letters, and Notes saves possible secrets while the other player thinks.`,
      {
        mode: "hide"
      }
    );

    return;
  }

  hideTutorial();
}

function runSummaryTutorial(state) {
  clearHighlights();

  const stage2 =
    state.tutorialStage === 2;

  const stageAdvanced =
    state.tutorialStage === "advanced";

  if (stageAdvanced) {
    if (tutorialSubStep === 0) {
      showTutorial(
        `Round done. Next you will be the Spy. That is where Notes is most useful.`,
        {
          mode: "advance"
        }
      );

      highlightRoundSummary();
      return;
    }

    if (tutorialSubStep === 1) {
      showTutorial(
        `Tap Next Round when you are ready.`,
        {
          mode: "hide"
        }
      );

      return;
    }

    hideTutorial();
    return;
  }

  if (stage2) {
    if (tutorialSubStep === 0) {
      showTutorial(
        `Round 1 done — you just used Letter Peek as the Inspector. This recap shows each secret, guess, and the feedback given.`,
        {
          enabled: true
        }
      );

      highlightRoundSummary();

      tutorialContinueMode =
        "advance";

      return;
    }

    if (tutorialSubStep === 1) {
      showTutorial(
        `Next you'll play the Spy and get to try Counts Only. Whoever needs fewer guesses in their round wins the match — good luck!`,
        {
          enabled: true
        }
      );

      tutorialContinueMode =
        "hide";

      return;
    }

    return;
  }

  if (tutorialSubStep === 0) {
    showTutorial(
      `Nice, you found the secret! Here's a quick summary of the round, starting with who played which role.`,
      {
        enabled: true
      }
    );

    highlightRoundSummaryNames();

    tutorialContinueMode =
      "advance";

    return;
  }

  if (tutorialSubStep === 1) {
    showTutorial(
      `It shows how many guesses you took to find the secret — that's the count. Lower is better for you as the Inspector; it also becomes the Spy's score for the round, so higher is better for them.`,
      {
        enabled: true
      }
    );

    highlightRoundSummaryGuessCount();

    tutorialContinueMode =
      "advance";

    return;
  }

  if (tutorialSubStep === 2) {
    showTutorial(
      `Here's every guess you made this round.`,
      {
        enabled: true
      }
    );

    highlightRoundSummaryColumn(
      "guess-cell"
    );

    tutorialContinueMode =
      "advance";

    return;
  }

  if (tutorialSubStep === 3) {
    showTutorial(
      `And here's the feedback you got back for each one.`,
      {
        enabled: true
      }
    );

    highlightRoundSummaryColumn(
      "feedback-cell"
    );

    tutorialContinueMode =
      "advance";

    return;
  }

  if (tutorialSubStep === 4) {
    showTutorial(
      `We'll explain the rest once we've gone through the Spy's side.`,
      {
        enabled: true
      }
    );

    tutorialContinueMode =
      "advance";

    return;
  }

  if (tutorialSubStep === 5) {
    showTutorial(
      `Let's continue — tap Next Round.`,
      {
        enabled: true,
        mode: "hide"
      }
    );

    highlightNextRoundBtn();

    startKeyDemo(
      "round-summary-next-round",
      () => [byId("nextRoundBtn")]
    );

    tutorialContinueMode =
      "hide";
  }
}

function runMatchTutorial(state) {
  clearHighlights();

  const stage2 =
    state.tutorialStage === 2;

  const stagePower =
    state.tutorialStage === "power";

  const stageAdvanced =
    state.tutorialStage ===
    "advanced";

if (stageAdvanced) {
  if (tutorialSubStep === 0) {
    showTutorial(
      `Advanced UI complete. You practiced Guide, Drag & Lock, and Notes.`,
      {
        mode: "advance"
      }
    );

    return;
  }

  if (tutorialSubStep === 1) {
    showTutorial(
      `Powers are taught in the separate Power Tutorial.`,
      {
        mode: "hide"
      }
    );

    return;
  }

  hideTutorial();
  return;
}
  if (stagePower) {
    const meta =
      window.POWER_METADATA?.[
        state.tutorialPowerId
      ];

    const label =
      meta?.label || "that power";

    if (tutorialSubStep === 0) {
      showTutorial(
        `That's ${label} from both sides — how you'd use it, and what it looks like when your opponent uses it on you.`,
        {
          enabled: true
        }
      );

      tutorialContinueMode =
        "advance";

      return;
    }

    if (tutorialSubStep === 1) {
      showTutorial(
        `Head back to the Powers screen any time to try another one, or check the full list on both sides.`,
        {
          enabled: true
        }
      );

      tutorialContinueMode =
        "hide";

      return;
    }

    hideTutorial();
    return;
  }

  if (stage2) {
    if (tutorialSubStep === 0) {
      showTutorial(
        `That's both powers tried — one from each side! Letter Peek and Counts Only are just two of many.`,
        {
          enabled: true
        }
      );

      tutorialContinueMode =
        "advance";

      return;
    }

    if (tutorialSubStep === 1) {
      showTutorial(
        `Check the Powers screen any time from How to Play to see the full list on both sides. That's the tutorial — good luck out there!`,
        {
          enabled: true
        }
      );

      tutorialContinueMode =
        "hide";

      return;
    }

    hideTutorial();
    return;
  }

  if (tutorialSubStep === 0) {
    showTutorial(
      `The game's ended — you've finished your first match of Vowel Play!`,
      {
        enabled: true
      }
    );

    tutorialContinueMode =
      "advance";

    return;
  }

  if (tutorialSubStep === 1) {
    showTutorial(
      `This is the final score. If your opponent needed more guesses than you did, you win!`,
      {
        enabled: true
      }
    );

    highlightMatchScore();

    tutorialContinueMode =
      "advance";

    return;
  }

  if (tutorialSubStep === 2) {
    showTutorial(
      `Here's Round 1's summary — every guess, the feedback, and the secret used.`,
      {
        enabled: true
      }
    );

    highlightStoredRound(0);

    tutorialContinueMode =
      "advance";

    return;
  }

  if (tutorialSubStep === 3) {
    showTutorial(
      `And here's Round 2's.`,
      {
        enabled: true
      }
    );

    highlightStoredRound(1);

    tutorialContinueMode =
      "advance";

    return;
  }

  const secretSteps =
    buildMatchSecretNarrationSteps(
      state
    );

  const secretStepIndex =
    tutorialSubStep - 4;

  if (
    secretStepIndex >= 0 &&
    secretStepIndex < secretSteps.length
  ) {
    const step =
      secretSteps[secretStepIndex];

    showTutorial(step.text, {
      enabled: true
    });

    step.highlight();

    tutorialContinueMode =
      "advance";

    return;
  }

  const buttonsStep =
    4 + secretSteps.length;

  if (tutorialSubStep === buttonsStep) {
    showTutorial(
      `Down here: New Match starts a fresh game, Replay repeats this exact setup, and Leave takes you back to the menu.`,
      {
        enabled: true
      }
    );

    highlightSummaryActions();

    tutorialContinueMode =
      "advance";

    return;
  }

  if (
    tutorialSubStep ===
    buttonsStep + 1
  ) {
    showTutorial(
      `That's the base game — there's more to learn next. Have fun!`,
      {
        enabled: true
      }
    );

    tutorialContinueMode =
      "hide";
  }
}

window.tutorialSteps = tutorialSteps;
