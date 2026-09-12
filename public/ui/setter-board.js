(() => {
  "use strict";

  const byId = id => document.getElementById(id);

  let meterObserver = null;
  let meterWaitObserver = null;

  function screen() {
    return byId("setterScreen");
  }

  function syncMiniCharge() {
    const mini = byId("setterSidebarChargeMini");
    if (!mini) return;

    const total = typeof window.getDisplayedSpyChargeTotal === "function"
      ? Number(window.getDisplayedSpyChargeTotal()) || 0
      : document.querySelectorAll("#spyChargeMeter .spy-charge-segment.is-filled").length;

    // This runs as meterObserver's own callback -- it watches
    // #spyChargeMeter's class/aria-valuenow, which spy-charge.js's
    // renderMeter() writes unconditionally on every render (setAttribute
    // always queues a mutation record, even when the value is unchanged).
    // An unconditional write here used to turn that into a closed loop:
    // this textContent assignment is itself a childList mutation, which
    // other files' page-wide body/documentElement observers pick up and
    // use to schedule another render, which calls renderMeter() again,
    // which fires meterObserver again -- forever, for the length of any
    // match with the Secretkeeper's sidebar ever rendered. Guard it like
    // the rest of this controller already guards its own writes.
    const text = String(total);
    if (mini.textContent !== text) mini.textContent = text;
    // Only meaningful while the panel is shut -- the meter itself is
    // visible inside it otherwise. Read straight off the screen's class
    // (the collapsed state's single source of truth, written by
    // ui/sidebar-toggle.js) rather than through a global, so this can't
    // depend on module load order.
    mini.classList.toggle("hidden", !screen()?.classList.contains("setter-sidebar-collapsed"));
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
    if (meterObserver || meterWaitObserver) return;

    // #spyChargeMeter only exists inside #setterScreen, which most of a
    // session never shows at all (the main menu, lobby, tutorials, Cuddle,
    // and an entire match spent as Guesser all have no such element). This
    // used to fall back to `requestAnimationFrame(scheduleChargeObserver)`
    // -- a call-itself-every-frame loop with no way to ever stop short of
    // the meter actually appearing, so it burned a full animation frame's
    // worth of work 60 times a second for the ENTIRE browser session on
    // every screen of the site that isn't the Secretkeeper's board. Watch
    // for the element to be inserted instead: a MutationObserver callback
    // only runs when the DOM genuinely changes (and coalesces a burst of
    // changes into one call), and this one disconnects itself the first
    // time #spyChargeMeter shows up, for good.
    if (typeof MutationObserver === "undefined" || !document.body) return;
    meterWaitObserver = new MutationObserver(() => {
      if (!byId("spyChargeMeter")) return;
      meterWaitObserver.disconnect();
      meterWaitObserver = null;
      observeChargeMeter();
    });
    meterWaitObserver.observe(document.body, { childList: true, subtree: true });
  }

  // The drawer itself -- the button, its state, persistence and the swipe
  // -- belongs to ui/sidebar-toggle.js, which owns both roles' panels
  // through a single delegated listener. This file only reacts to the
  // panel having moved, with the Secretkeeper-specific follow-ups that
  // are its own business.
  document.addEventListener("umt:sidebartoggle", event => {
    if (event.detail?.role !== "setter") return;
    const collapsed = !!event.detail.collapsed;
    const setterScreen = screen();
    if (!setterScreen) return;

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
    // own to trigger one. notifyTutorialSidebarToggled (fired by the
    // toggle owner alongside this event) only re-renders when a step was
    // already waiting specifically on this tap, which can't be true the
    // very first time the panel gets collapsed -- so nudge it here too,
    // scoped to this one tutorial to avoid changing render timing for
    // anything else.
    if (window.state?.tutorialStage === "star") {
      window.tutorialSteps?.(window.state, window.myRole);
    }

    requestAnimationFrame(() => {
      window.reanchorSetterIdleNotes?.();
      window.dispatchEvent(new Event("resize"));
    });
  });

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
// UMT_STAR_DANCE_FIX_V1
let _previousCoverStarFill = [false, false, false];

function stopCoverStarDance(star) {
  if (!star) return;
  if (star.__coverStarDanceHandler) {
    star.removeEventListener("animationend", star.__coverStarDanceHandler);
    delete star.__coverStarDanceHandler;
  }
  star.classList.remove("is-newly-earned");
  star.style.removeProperty("--star-dance-delay");
}

  function pickPraise(list) {
    return list[Math.floor(Math.random() * list.length)] || "";
  }

  // Recomputes _praiseText for the current rating without touching the DOM.
  function updateStarPraise(count, strength) {
    const rated = ["rated", "same", "locked"].includes(strength?.status);
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

  // Normalizes #setterCoverStars' star markup to exactly 2 base-star slots
  // plus 1 separate bonus-star slot, no matter what's actually there right
  // now -- stale markup from an older build, a future accidental edit, or
  // draftrow.js's own initial 2+1 markup should all converge on the same
  // shape. Idempotent: a render tick that finds the markup already valid
  // does nothing but read it back out.
  function ensureCoverStarSlots(el) {
    const host = el.querySelector(".setter-cover-stars-core") || el;

    let baseStars = [...host.querySelectorAll("[data-cover-star]")].filter(
      star => !star.hasAttribute("data-cover-bonus-star")
    );
    let bonusStars = [...host.querySelectorAll("[data-cover-bonus-star]")];

    const valid =
      baseStars.length === 2 &&
      bonusStars.length === 1 &&
      !bonusStars[0].hasAttribute("data-cover-star");

    if (!valid) {
      host
        .querySelectorAll("[data-cover-star], [data-cover-bonus-star]")
        .forEach(node => node.remove());

      const fragment = document.createDocumentFragment();

      for (let index = 0; index < 2; index += 1) {
        fragment.appendChild(
          window.buildCoverStarElement("setter-cover-base-star", "data-cover-star")
        );
      }

      fragment.appendChild(
        window.buildCoverStarElement("setter-cover-bonus-star", "data-cover-bonus-star")
      );

      host.prepend(fragment);

      baseStars = [...host.querySelectorAll("[data-cover-star]")].filter(
        star => !star.hasAttribute("data-cover-bonus-star")
      );
      bonusStars = [...host.querySelectorAll("[data-cover-bonus-star]")];
    }

    baseStars.forEach(star => {
      star.classList.add("setter-cover-star", "setter-cover-base-star");
    });

    const bonusStar = bonusStars[0] || null;
    bonusStar?.classList.add("setter-cover-star", "setter-cover-bonus-star");

    return { baseStars, bonusStar };
  }
  window.ensureSetterCoverStarSlots = ensureCoverStarSlots;

  // Wipes every trace of the last rating: the filled pips and the
  // escalating glow classes. Called whenever the stars go away (submitted,
  // roles switched, new match) -- renderCoverStars used to just add
  // .hidden and return, which left all of that stale underneath. The
  // charge-hint tile outline is deliberately NOT reset here -- it marks
  // which tile the bonus star is on, which is still worth showing on an
  // untouched draft that has no rating to display yet.
  function clearCoverStars(el) {
    el.classList.remove("stars-2", "stars-3");
    const { baseStars, bonusStar } = ensureCoverStarSlots(el);
    [...baseStars, bonusStar].filter(Boolean).forEach(star => {
      stopCoverStarDance(star);
      star.classList.remove("is-filled");
    });
    bonusStar?.classList.remove("is-available");
    _previousCoverStarFill = [false, false, false];
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

    const baseCount = Math.max(0, Math.min(2, Number(strength?.stars) || 0));
    const isSetter = window.myRole === "setter";
    updateDecisionMetaVisibility(isSetter);

    const charge = window.state?.powers?.spyCharge;
    const hint = charge?.hint;
    const hasHint = isSetter && !!hint?.letter && Number.isInteger(hint.position);
    const hintLetter = hasHint ? String(hint.letter).toUpperCase() : "";
    const draft = String(window.state?.setterDraft || "")
      .replace(/\s/g, "")
      .toUpperCase();

    const computedBonusEarned = !!(
      hasHint &&
      strength?.draftValid &&
      !strength?.draftIsCurrent &&
      !strength?.draftIsPending &&
      draft.length === 5 &&
      draft[hint.position] === hintLetter
    );
    const bonusFilled = Boolean(strength?.bonusStar ?? computedBonusEarned);
    window.__setterBonusEarned = bonusFilled;
    updateHintSlotTile(hint, hasHint, bonusFilled);
    byId("setterCoverTarget")?.classList.add("hidden");

    const rated = ["rated", "same", "locked"].includes(strength?.status);
    const show =
      !!strength?.visible &&
      isSetter &&
      rated &&
      baseCount > 0 &&
      !decisionAlreadyMade();

    el.classList.toggle("hidden", !show);
    if (!show) {
      clearCoverStars(el);
      return;
    }

    const { baseStars, bonusStar } = ensureCoverStarSlots(el);
    const stars = [...baseStars, bonusStar].filter(Boolean);
    const nextFilled = [baseCount >= 1, baseCount >= 2, bonusFilled];
    const canCelebrate =
      show &&
      rated &&
      !strength?.draftIsPending &&
      !!strength?.draftValid;
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    stars.forEach((star, index) => {
      const filled = !!nextFilled[index];
      star.classList.toggle("is-filled", filled);
      if (!filled || !canCelebrate) stopCoverStarDance(star);

      if (canCelebrate && !reducedMotion && filled && !_previousCoverStarFill[index]) {
        stopCoverStarDance(star);
        star.style.setProperty("--star-dance-delay", `${index * 80}ms`);
        void star.offsetWidth;
        const onAnimationEnd = () => stopCoverStarDance(star);
        star.__coverStarDanceHandler = onAnimationEnd;
        star.classList.add("is-newly-earned");
        star.addEventListener("animationend", onAnimationEnd, { once: true });
      }
    });

    bonusStar?.classList.toggle("is-available", hasHint);
    _previousCoverStarFill = canCelebrate ? nextFilled : [false, false, false];

    const totalCount = baseCount + (bonusFilled ? 1 : 0);
    el.classList.toggle("stars-2", canCelebrate && totalCount === 2);
    el.classList.toggle("stars-3", canCelebrate && totalCount === 3);
    updateStarPraise(baseCount, { ...strength, bonusStar: bonusFilled });
    el.setAttribute(
      "aria-label",
      `${baseCount} of 2 yellow stars; blue bonus star ${bonusFilled ? "earned" : "not earned"}`
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
    initDecisionButtons();
    scheduleChargeObserver();
  }

  // window.isSetterSidebarCollapsed (read by tutorial-ui.js's
  // highlightPowerButtonByText, which has to force this collapsible panel
  // open before it can measure a power card inside it) is published by
  // ui/sidebar-toggle.js along with the rest of the drawer's state.

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
