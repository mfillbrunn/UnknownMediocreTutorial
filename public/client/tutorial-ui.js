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

      if (tutorialPendingReveal) {
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

    scheduleTutorialLayout();
  });
}

function clearHighlights() {
  tutorialHighlightDraft = [];
  queueHighlightCommit();
}

function highlightEl(el) {
  if (!el) return;

  tutorialHighlightDraft.push(el);
  queueHighlightCommit();
}

function positionTutorialFocusRing() {
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

function highlightRoundSummary() {
  highlightEl(
    byId("roundSummary")
  );
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

        if (state.pendingGuess) {
          showTutorial(
            `Waiting for the Spy to react to "${word}"…`,
            {
              enabled: false
            }
          );
        } else {
          showTutorial(
            `Nice — that's a free hint toward the secret. Now enter your second guess: "${word}".`,
            {
              enabled: true,
              mode: "hide"
            }
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
      } else {
        showTutorial(
          `Let's make your first guess. Type "${word}" on the keyboard below, then press Enter.`,
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
      } else {
        showTutorial(
          `Now use those clues for your next guess. Try "${word}" — new letters can teach you even more.`,
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

  if (round === 2) {
    if (tutorialSubStep === 0) {
      showTutorial(
        `You've got the hang of it! Finish this round on your own now.`,
        {
          mode: "advance"
        }
      );

      return;
    }

    if (tutorialSubStep === 1) {
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
      showTutorial(
        `From here on, play strategically and try to outsmart your opponent.`,
        {
          mode: "hide"
        }
      );

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
    } else {
      showTutorial(
        `Let's pick your secret. Type "${word}" on the keyboard below, then press Enter.`,
        {
          mode: "hide"
        }
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
        `You get to choose: keep your current secret, or swap in a new one. There's just one rule — any new secret must still match every clue you've already given.`,
        {
          mode: "advance"
        }
      );

      highlightPendingGuessRow();

      return;
    }

    if (tutorialSubStep === 2) {
      showTutorial(
        `Let's see that rule in action. Type PICKY and press Enter — watch what happens.`,
        {
          mode: "hide"
        }
      );

      highlightKeyboardSetter();
      waitForRejectedSecret();

      return;
    }

    if (tutorialSubStep === 3) {
      showTutorial(
        `Right — PICKY got rejected because it breaks a clue you already gave. Now try a word that's actually allowed: "${word}".`,
        {
          mode: "hide"
        }
      );

      highlightKeyboardSetter();
      waitForSecretSubmission(round);

      return;
    }

    hideTutorial();
    return;
  }

  if (round === 2) {
    if (tutorialSubStep === 0) {
      showTutorial(
        `One more useful tool before you're on your own: this box shows how many secret words are still possible.`,
        {
          mode: "advance"
        }
      );

      highlightEl(
        byId("SetterRemainingBox")
      );

      return;
    }

    if (tutorialSubStep === 1) {
      showTutorial(
        `Old / Keep / New each show a count. An X means that option is no longer legal. More remaining words means more places to hide!`,
        {
          mode: "advance"
        }
      );

      highlightEl(
        byId("SetterRemainingBox")
      );

      return;
    }

    if (tutorialSubStep === 2) {
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
      `Nice, you found the secret! Here's a quick summary of the round.`,
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
      `It shows how many guesses you took — that's your opponent's score. Lower is better for them.`,
      {
        enabled: true
      }
    );

    tutorialContinueMode =
      "advance";

    return;
  }

  if (tutorialSubStep === 2) {
    showTutorial(
      `It also shows every guess you made, and what the secret word was.`,
      {
        enabled: true
      }
    );

    tutorialContinueMode =
      "advance";

    return;
  }

  if (tutorialSubStep === 3) {
    showTutorial(
      `Let's continue — click Next Round.`,
      {
        enabled: true,
        mode: "hide"
      }
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

    highlightRoundSummary();

    tutorialContinueMode =
      "advance";

    return;
  }

  if (tutorialSubStep === 2) {
    showTutorial(
      `Below: every guess, each round's secret, who played which role, and how many words remained.`,
      {
        enabled: true
      }
    );

    tutorialContinueMode =
      "advance";

    return;
  }

  if (tutorialSubStep === 3) {
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
