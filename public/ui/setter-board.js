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

  // Short bit of praise beside the stars for a genuinely good decision.
  // Only rendered for a rated draft (not while idle/invalid), and only
  // re-inserted when the wording actually changes so its pop-in animation
  // fires once per achievement rather than on every render tick.
  const STAR_PRAISE = {
    2: ["Nice", "Solid", "Good one", "Sharp"],
    3: ["Amazing", "Perfect!", "Superb", "Flawless", "Brilliant"]
  };
  const BONUS_PRAISE = ["Well done", "Great", "Spot on", "Excellent"];

  // The wording is picked once per achievement and held until the
  // achievement itself changes, so it doesn't reshuffle on every render.
  let _praiseKey = "";
  let _praiseText = "";

  function pickPraise(list) {
    return list[Math.floor(Math.random() * list.length)] || "";
  }

  function renderStarPraise(mount, count, strength) {
    const rated = strength?.status === "rated" || strength?.status === "same";
    const bonus = !!strength?.bonusStar;
    // Praise belongs to the decision being *considered*. Once the secret
    // is submitted the draft is no longer live (draftIsPending), and on
    // the guesser's turn there's nothing being decided at all -- in both
    // cases the celebration has to stop rather than sit there cheering a
    // choice that's already made.
    const live = rated && !strength?.draftIsPending && !!strength?.draftValid;
    const key = live ? `${count}|${bonus ? "b" : ""}` : "";

    let praise = mount.parentElement?.querySelector(".setter-star-praise");
    if (!key || (!bonus && !STAR_PRAISE[count])) {
      _praiseKey = "";
      _praiseText = "";
      praise?.remove();
      return;
    }

    if (key !== _praiseKey) {
      _praiseKey = key;
      _praiseText = bonus
        ? (count >= 3 ? pickPraise(STAR_PRAISE[3]) : pickPraise(BONUS_PRAISE))
        : pickPraise(STAR_PRAISE[count] || []);
    }
    const text = _praiseText;
    if (!text) {
      praise?.remove();
      return;
    }
    if (praise && praise.textContent === text) return;
    if (!praise) {
      praise = document.createElement("span");
      praise.className = "setter-star-praise";
      praise.setAttribute("aria-live", "polite");
      mount.insertAdjacentElement("afterend", praise);
    }
    praise.textContent = text;
    praise.style.animation = "none";
    void praise.offsetWidth;
    praise.style.animation = "";
  }

  // Wipes every trace of the last rating: the filled pips, the escalating
  // glow classes, and the praise word. Called whenever the stars go away
  // (submitted, roles switched, new match) -- renderCoverStars used to just
  // add .hidden and return, which left all of that stale underneath. The
  // praise word is the visible half of that bug: it's a SIBLING of this
  // element (see renderStarPraise's insertAdjacentElement("afterend")), so
  // hiding the stars never hid it and it sat on the board into the next
  // match. The charge-hint tile outline is deliberately NOT reset here --
  // it marks which tile the bonus star is on, which is still worth showing
  // on an untouched draft that has no rating to display yet.
  function clearCoverStars(el) {
    el.classList.remove("stars-2", "stars-3");
    el.querySelectorAll("[data-cover-star]").forEach(star => {
      star.classList.remove("is-filled");
    });
    el.parentElement?.querySelector(".setter-star-praise")?.remove();
    _praiseKey = "";
    _praiseText = "";
  }

  // The Spy's decision for the guess currently on the board has been sent.
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

  // Floats the praise word up over the board for a moment after the Spy
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
    const praiseText =
      stars?.parentElement?.querySelector(".setter-star-praise")?.textContent || "";

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
  };

  function renderCoverStars(strength) {
    const el = byId("setterCoverStars");
    if (!el) return;

    const count = Math.max(0, Math.min(3, Number(strength?.stars) || 0));
    const isSetter = window.myRole === "setter";

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

    el.querySelectorAll("[data-cover-star]").forEach((star, index) => {
      star.classList.toggle("is-filled", index < count);
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
    el.classList.toggle("stars-2", celebrating && count === 2);
    el.classList.toggle("stars-3", celebrating && count >= 3);
    renderStarPraise(el, count, strength);

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

  // Exposed for tutorial-ui.js's highlightPowerButtonByText -- the Spy's
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
