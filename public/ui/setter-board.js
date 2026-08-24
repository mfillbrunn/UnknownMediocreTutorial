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
    setterScreen.dataset.sidebarCollapsed = collapsed ? "true" : "false";
    toggle.setAttribute("aria-expanded", String(!collapsed));
    toggle.setAttribute(
      "aria-label",
      collapsed ? "Show Secretkeeper side panel" : "Hide Secretkeeper side panel"
    );
    toggle.title = collapsed ? "Show side panel" : "Hide side panel";

    if (icon) icon.textContent = collapsed ? "›" : "‹";
    if (persist) saveCollapsed(collapsed);

    // Collapsing while the Guesser-turn Notes popout is showing
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

    // The Star Tutorial gates its own opening steps on this panel being
    // open (the Spyometer lives inside it) and re-checks that on every
    // render -- but a plain toggle click has no server round-trip of its
    // own to trigger one. notifyTutorialSidebarToggled (called right
    // after this by every caller) only re-renders when a step was
    // already waiting specifically on this tap, which can't be true the
    // very first time the panel gets collapsed -- so nudge it here too,
    // scoped to this one tutorial to avoid changing render timing for
    // anything else.
    if (window.state?.tutorialStage === "star") {
      window.tutorialSteps?.(window.state, window.myRole);
    }

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
      window.notifyTutorialSidebarToggled?.();
    }

    if (current.direction === "open" && dx >= SWIPE_THRESHOLD) {
      setCollapsed(false);
      window.notifyTutorialSidebarToggled?.();
    }
  }

  function initDrawer() {
    const setterScreen = screen();
    const sidebar = byId("setterSidebar");
    const toggle = byId("setterSidebarToggle");
    const edge = byId("setterSidebarSwipeEdge");

    if (!setterScreen || !sidebar || !toggle || !edge) return;

    // Reconnect/polish code may invoke initializers more than once -- bind
    // the listeners below exactly once regardless, and still resync visual
    // state (class, dataset, aria) every call.
    if (toggle.dataset.drawerBound === "true") {
      setCollapsed(readCollapsed(), false);
      return;
    }
    toggle.dataset.drawerBound = "true";

    setCollapsed(readCollapsed(), false);

    toggle.addEventListener("click", event => {
      event.stopPropagation();
      setCollapsed(!isCollapsed());
      window.notifyTutorialSidebarToggled?.();
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

  // Congratulation text for a genuinely good decision -- shown ONLY as the
  // floating popup once the Secretkeeper actually commits (see floatPraise /
  // onSetterDecisionSubmitted below), never inline beside the stars while
  // the decision is still being weighed. It used to render inline too, but
  // "Perfect!"/"Flawless" sitting next to a draft that hasn't been sent yet
  // reads as praise for a choice that isn't final -- the congratulation
  // belongs on the commit, not the consideration.
  const STAR_PRAISE = {
    2: ["Nice", "Solid", "Good one", "Sharp"],
    3: ["Amazing", "Perfect!", "Superb", "Flawless", "Brilliant"]
  };
  const BONUS_PRAISE = ["Well done", "Great", "Spot on", "Excellent"];

  // The wording is picked once per achievement and held until the
  // achievement itself changes, so it doesn't reshuffle on every render --
  // and so the float popup shown on submit says the same thing the player
  // would have seen had they kept looking at the (now-removed) inline text.
  let _praiseKey = "";
  let _praiseText = "";

  function pickPraise(list) {
    return list[Math.floor(Math.random() * list.length)] || "";
  }

  // Recomputes _praiseText for the current rating without touching the DOM.
  function updateStarPraise(count, strength) {
    const rated = strength?.status === "rated" || strength?.status === "same";
    const bonus = !!strength?.bonusStar;
    // Praise belongs to the decision being *considered*. Once the secret
    // is submitted the draft is no longer live (draftIsPending), and on
    // the guesser's turn there's nothing being decided at all -- in both
    // cases the celebration has to stop rather than sit there cheering a
    // choice that's already made.
    const live = rated && !strength?.draftIsPending && !!strength?.draftValid;
    const key = live ? `${count}|${bonus ? "b" : ""}` : "";

    if (!key || (!bonus && !STAR_PRAISE[count])) {
      _praiseKey = "";
      _praiseText = "";
      return;
    }

    if (key !== _praiseKey) {
      _praiseKey = key;
      // Base stars top out at 2 -- a bonus star on top of a 2-star switch
      // (3 total) is the best possible outcome now, same spot STAR_PRAISE[3]
      // used to celebrate back when a base switch alone could hit 3.
      _praiseText = bonus
        ? (count >= 2 ? pickPraise(STAR_PRAISE[3]) : pickPraise(BONUS_PRAISE))
        : pickPraise(STAR_PRAISE[count] || []);
    }
  }

  // Wipes every trace of the last rating: the filled pips and the
  // escalating glow classes. Called whenever the stars go away (submitted,
  // roles switched, new match) -- renderCoverStars used to just add
  // .hidden and return, which left all of that stale underneath. The
  // charge-hint tile outline is deliberately NOT reset here -- it marks
  // which tile the bonus star is on, which is still worth showing on an
  // untouched draft that has no rating to display yet.
  function clearCoverStars(el) {
    el.classList.remove("stars-2", "stars-3");
    el.querySelectorAll("[data-cover-star]").forEach(star => {
      star.classList.remove("is-filled");
    });
    _praiseKey = "";
    _praiseText = "";
  }

  // The Secretkeeper's decision for the guess currently on the board has been sent.
  // Held as the pending guess itself rather than a bare boolean so it
  // clears itself the moment the next guess arrives, with no separate
  // reset path to keep in step.
  let _decidedForPending = null;

  function decisionAlreadyMade() {
    const pending = String(window.state?.pendingGuess || "").toUpperCase();
    return !!_decidedForPending && _decidedForPending === pending;
  }

  // Shared with remaining-words.js so the Keep -> New counts disappear on
  // exactly the same signal the stars do.
  window.setterDecisionCommitted = decisionAlreadyMade;

  // Floats the praise word up over the board for a moment after the Secretkeeper
  // commits. Beside the stars it was only ever visible while the decision
  // was still being made -- the point of the congratulation is to land ON
  // the commit, which is also when the stars themselves go away.
  function floatPraise(text, anchor) {
    if (!text) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    const rect = anchor?.getBoundingClientRect?.();
    const el = document.createElement("div");
    el.className = "setter-praise-float";
    el.setAttribute("role", "status");
    el.textContent = text;

    const x = rect?.width
      ? rect.left + rect.width / 2
      : window.innerWidth / 2;
    const y = rect?.height ? rect.top : window.innerHeight * 0.3;

    el.style.left = `${Math.min(Math.max(x, 90), window.innerWidth - 90)}px`;
    el.style.top = `${Math.max(56, y)}px`;

    document.body.appendChild(el);
    el.addEventListener("animationend", () => el.remove(), { once: true });
    setTimeout(() => el.remove(), 2200);
  }

  // Called by client.js the instant a Keep/New secret is actually sent, so
  // the stars, the praise, and the Keep -> New counts all disappear
  // together on the commit -- rather than lingering under the submitted
  // row's outline as it flies to history while the server round-trip and
  // the star-award animation play out.
  window.onSetterDecisionSubmitted = function () {
    if (window.myRole !== "setter") return;
    _decidedForPending = String(window.state?.pendingGuess || "").toUpperCase() || null;

    const stars = byId("setterCoverStars");
    const praiseText = _praiseText;

    if (stars) {
      floatPraise(praiseText, stars);
      stars.classList.add("hidden");
      clearCoverStars(stars);
    }

    // The Keep -> New readout is the other half of the same decision.
    const box = byId("SetterRemainingBox");
    if (box) {
      box.hidden = true;
      box.innerHTML = "";
    }

    // Hides the wrapper itself immediately rather than waiting for the
    // next render tick -- decisionAlreadyMade() already reads true by
    // this point, so this and the next natural render agree either way,
    // but there is no reason to let an empty bordered bar sit visible for
    // even one extra frame after the decision is genuinely done.
    updateDecisionMetaVisibility(true);
  };

  // The stars/bonus-pill/Keep-New row as a whole -- separate from the
  // stars' own narrower gate below (which additionally requires an actual
  // rating). This one is just "is there a live Keep/New decision to show
  // ANYTHING about right now": not during the simultaneous opening (no
  // prior secret to compare against yet), not on the Guesser's turn,
  // and not once this turn's decision has already been sent. Previously
  // the wrapper itself had no visibility gate at all -- its border-bottom
  // divider and min-height sat there as an empty bar even while every
  // child inside correctly hid itself.
  function updateDecisionMetaVisibility(isSetter) {
    const meta = byId("setterDecisionMeta");
    if (!meta) return;
    const state = window.state;
    const show =
      isSetter &&
      state?.phase === "normal" &&
      state?.turn === state?.setter &&
      !decisionAlreadyMade();
    meta.classList.toggle("pc-decision-meta-hidden", !show);
  }
  window.updateSetterDecisionMetaVisibility = updateDecisionMetaVisibility;

  function renderCoverStars(strength) {
    const el = byId("setterCoverStars");
    if (!el) return;

    const count = Math.max(0, Math.min(3, Number(strength?.stars) || 0));
    const isSetter = window.myRole === "setter";
    updateDecisionMetaVisibility(isSetter);

    // The charge hint's own tile outline tracks the hint, not the rating,
    // so it's resolved before the visibility gate below -- an untouched
    // draft shows no stars but should still mark the bonus tile.
    const charge = window.state?.powers?.spyCharge;
    const hint = charge?.hint;
    const hasHint = isSetter && !!hint?.letter && Number.isInteger(hint.position);
    const hintLetter = hasHint ? String(hint.letter).toUpperCase() : "";

    const draft = String(window.state?.setterDraft || "")
      .replace(/\s/g, "")
      .toUpperCase();

    const bonusEarned = !!(
      hasHint &&
      strength?.draftValid &&
      !strength?.draftIsCurrent &&
      !strength?.draftIsPending &&
      draft.length === 5 &&
      draft[hint.position] === hintLetter
    );

    // Exposed for power-choice-mode.js's bonus-star pill so both places
    // that reflect this state (the pill and the draft-tile outline) stay
    // in sync off one computation instead of two separately-derived ones.
    window.__setterBonusEarned = bonusEarned;
    updateHintSlotTile(hint, hasHint, bonusEarned);

    // The letter/position readout used to also live here as a "P in 3rd"
    // text label next to the stars -- that's now shown once, in the
    // bonus-star pill on the Keep/New row (see normalizeBonusTarget in
    // power-choice-mode.js), so #setterCoverTarget stays hidden here to
    // avoid showing the same information twice.
    byId("setterCoverTarget")?.classList.add("hidden");

    // The stars themselves are only ever on screen for a rating that has
    // actually been earned on a decision still being made. Everything else
    // -- an untouched or half-typed draft ("available"), an illegal one
    // ("invalid"), the guesser's turn, and the moment the secret is
    // submitted (the server drops visible the same turn) -- shows nothing
    // at all rather than a row of empty outlines.
    const rated =
      strength?.status === "rated" ||
      strength?.status === "same" ||
      strength?.status === "locked";

    const show =
      !!strength?.visible &&
      isSetter &&
      rated &&
      count > 0 &&
      !decisionAlreadyMade();

    el.classList.toggle("hidden", !show);
    if (!show) {
      clearCoverStars(el);
      return;
    }

    // Base stars top out at 2 now -- the 3rd pip is only ever reachable
    // through the bonus star on top of a base switch, so the row has to
    // count both together to still show the true total (up to 3).
    const totalCount = Math.min(3, count + (strength?.bonusStar ? 1 : 0));

    el.querySelectorAll("[data-cover-star]").forEach((star, index) => {
      star.classList.toggle("is-filled", index < totalCount);
    });

    // Drives the escalating glow/animation in gameplay-ui.css: nothing at
    // one star, a gentle lift at two, a full celebration at three. Gated
    // on the decision still being live -- once the secret is submitted
    // (draftIsPending) or it's the guesser's turn, the stars go quiet
    // instead of animating on over a choice already made.
    const celebrating =
      (strength?.status === "rated" || strength?.status === "same") &&
      !strength?.draftIsPending &&
      !!strength?.draftValid;
    el.classList.toggle("stars-2", celebrating && totalCount === 2);
    el.classList.toggle("stars-3", celebrating && totalCount >= 3);
    updateStarPraise(count, strength);

    el.setAttribute(
      "aria-label",
      `${count} of 3 cover-strength stars${bonusEarned ? " plus one bonus star" : ""}`
    );
  }

  // The draft tile at the hint's own position: no letter or star drawn on
  // it anymore (that info lives in the label above, see renderCoverStars)
  // -- just an outline marking which tile it is, so the setter isn't
  // hunting for a corner icon while they type. Shakes once, the instant
  // typing that position produces a real match (not on every render while
  // it stays matched) -- same off->on transition pattern the old tile
  // badge used before it was removed.
  let _hintSlotMatched = false;

  function updateHintSlotTile(hint, hasHint, matched) {
    const draftRow = byId("draftSetter")?.__draftRows?.draft;
    if (!draftRow?.__tiles) return;

    draftRow.__tiles.forEach((tile, i) => {
      const isSlot = hasHint && i === hint.position;
      tile.classList.toggle("draft-tile-hint-slot", isSlot);
      if (!isSlot) tile.classList.remove("draft-tile-hint-slot-matched");
    });

    if (!hasHint) {
      _hintSlotMatched = false;
      return;
    }

    const tile = draftRow.__tiles[hint.position];
    if (!tile) return;

    tile.classList.toggle("draft-tile-hint-slot-matched", matched);

    if (matched && !_hintSlotMatched) {
      tile.classList.remove("draft-tile-hint-slot-shake");
      void tile.offsetWidth;
      tile.classList.add("draft-tile-hint-slot-shake");
    }
    _hintSlotMatched = matched;
  }

  function installStarRenderer() {
    window.renderSetterCoverStars = renderCoverStars;
  }

  // One primary button whose label/color/enabled-state is driven entirely
  // by computeSetterSecretStatus() (client.js) -- see that function for
  // what each mode means. No separate permanent "Keep" button: the
  // primary button itself IS the keep action whenever the draft is empty
  // or matches the current secret.
  const MODE_CLASS = {
    keep: "setter-keep-btn",
    same: "setter-keep-btn",
    new: "setter-submit-btn",
    partial: "setter-submit-btn",
    invalid: "setter-invalid-btn",
    blocked: "setter-keep-btn"
  };
  const PRIMARY_MODE_CLASSES = [
    "setter-keep-btn",
    "setter-submit-btn",
    "setter-invalid-btn"
  ];

  window.updateSetterDecisionControls = function (status) {
    const actions = document.querySelector(
      "#setterScreen .setter-decision-actions"
    );
    const clearButton = byId("setterClearDraftBtn");
    const submitButton = byId("setterSubmitSecretBtn");
    if (!actions || !clearButton || !submitButton) return;

    const {
      mode = "blocked",
      primaryLabel = "KEEP CURRENT SECRET",
      primaryEnabled = false,
      clearVisible = false,
      clearEnabled = false
    } = status || {};

    // Deliberately NOT disabled (native `disabled`, or `aria-disabled` --
    // the latter makes assistive tech, and Playwright's own actionability
    // checks, treat it as unclickable too) on either button -- a real
    // invalid/partial/blocked draft still needs a tap to produce its
    // rejection feedback (shake + toast/popup, see submitSetterNew's
    // reportSetterSecretRejection and clearSetterDraftFromButton's own
    // shake-on-blocked), and the tutorial's own "type PICKY, tap Submit"
    // demo relies on that tap actually reaching the click handler even
    // while the word is rejected. `.is-disabled` gets the exact same dim
    // look via CSS (see setter-board.css) without blocking the click.
    clearButton.classList.toggle("hidden", !clearVisible);
    clearButton.classList.toggle("is-disabled", !clearEnabled);

    // Draft empty (Clear hidden) -- the primary button spans the full row
    // instead of sharing it with an empty/hidden Clear slot.
    actions.classList.toggle("setter-decision-single", !clearVisible);

    submitButton.textContent = primaryLabel;
    submitButton.classList.toggle("is-disabled", !primaryEnabled);
    submitButton.classList.remove(...PRIMARY_MODE_CLASSES);
    submitButton.classList.add(MODE_CLASS[mode] || "setter-keep-btn");
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

  // Exposed for tutorial-ui.js's highlightPowerButtonByText -- the Secretkeeper's
  // power cards live inside this collapsible sidebar, so a tutorial step
  // trying to highlight one has to force it open first or the highlight
  // ring ends up positioned against a hidden (zero-size) element.
  window.isSetterSidebarCollapsed = isCollapsed;
  window.setSetterSidebarCollapsed = setCollapsed;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
