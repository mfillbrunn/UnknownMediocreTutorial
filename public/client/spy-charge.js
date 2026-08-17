(() => {
  "use strict";

  const MAX_CHARGE = 12;
  const POWER_UNLOCK_AT = 8;
  const RESET_THRESHOLDS = [5, 12];

  let visualTotal = null;
  let awardQueue = [];
  let awardRunning = false;
  let resetArmed = false;
  let lastChargeKey = "";

  const byId = id => document.getElementById(id);

  function getCharge(state = window.state) {
    return state?.powers?.spyCharge || null;
  }

  function chargeKey(state = window.state) {
    if (!state) return "";
    return [
      state.matchId || "",
      state.roundIndex ?? "",
      state.setter || ""
    ].join("|");
  }

  function displayedTotal(state = window.state) {
    const authoritative = Math.max(
      0,
      Math.min(MAX_CHARGE, Number(getCharge(state)?.total) || 0)
    );

    return visualTotal == null
      ? authoritative
      : Math.max(0, Math.min(MAX_CHARGE, visualTotal));
  }

  function unlockedResetCount(total) {
    return RESET_THRESHOLDS.reduce(
      (count, threshold) => count + (total >= threshold ? 1 : 0),
      0
    );
  }

  function availableResetCount(state = window.state) {
    const charge = getCharge(state);
    if (!charge?.enabled) return 0;

    return Math.max(
      0,
      unlockedResetCount(displayedTotal(state)) -
        (Number(charge.resetsUsed) || 0)
    );
  }

  function ensureHud() {
    let hud = byId("spyChargeHud");
    if (hud) return hud;

    const section = document.querySelector(
      "#setterScreen .setter-sidebar-powers"
    );

    if (!section) return null;

    hud = document.createElement("div");
    hud.id = "spyChargeHud";
    hud.className = "spy-charge-hud hidden";
    hud.innerHTML = `
      <div class="spy-charge-bar-wrap">
        <div
          id="spyChargeMeter"
          class="spy-charge-meter"
          role="meter"
          aria-valuemin="0"
          aria-valuemax="12"
          aria-valuenow="0"
          aria-label="Spy charge: 0 of 12 stars"
        >
          ${Array.from({ length: MAX_CHARGE }, (_, index) => {
            const value = index + 1;
            const milestone =
              value === 8 ? "power" :
              value === 5 || value === 12 ? "reset" : "";

            return `<span
              class="spy-charge-segment${milestone ? ` milestone-${milestone}` : ""}"
              data-charge-index="${index}"
              data-charge-value="${value}"
            ></span>`;
          }).join("")}
        </div>
        <button
          type="button"
          id="spyChargeActionBtn"
          class="spy-charge-action-btn"
          aria-label="Reset one letter's feedback"
          title="Reset one letter's feedback"
          disabled
        >
          <span id="spyChargeHintLetter">↺</span>
          <span id="spyChargeResetCount" class="spy-charge-reset-count hidden">0</span>
        </button>
      </div>
      <div class="spy-charge-milestones" aria-hidden="true">
        <span>5↺</span>
        <span>8⚡</span>
        <span>12↺</span>
      </div>
    `;

    section.prepend(hud);

    byId("spyChargeActionBtn")?.addEventListener("click", event => {
      event.stopPropagation();
      armResetLetter();
    });

    return hud;
  }

  function renderMeter(state) {
    const meter = byId("spyChargeMeter");
    if (!meter) return;

    const total = displayedTotal(state);

    meter.querySelectorAll(".spy-charge-segment").forEach((segment, index) => {
      segment.classList.toggle("is-filled", index < total);
      segment.classList.toggle("is-next", index === total && total < MAX_CHARGE);
    });

    meter.setAttribute("aria-valuenow", String(total));
    meter.setAttribute("aria-label", `Spy charge: ${total} of ${MAX_CHARGE} stars`);
  }

  // This button still does the reset job the old separate reset button
  // used to (flashes once a letter-reset is actually available, same
  // trigger, armResetLetter, as before). The bonus-star hint itself shows
  // in the letter/position label above the draft row instead (see
  // ui/setter-board.js's renderCoverStars), so this stays the plain ↺
  // glyph; the hint text is still in the title/aria-label below for
  // anyone hovering/using a screen reader.
  function renderActionButton(charge, state) {
    const button = byId("spyChargeActionBtn");
    const letterEl = byId("spyChargeHintLetter");
    const countEl = byId("spyChargeResetCount");
    if (!button || !letterEl || !countEl) return;

    const hint = charge?.hint;
    const hasHint = !!hint?.letter && Number.isInteger(hint.position);
    const position = hasHint ? hint.position + 1 : null;

    letterEl.textContent = "↺";

    const available = availableResetCount(state);
    countEl.textContent = String(available);
    countEl.classList.toggle("hidden", available <= 0);
    button.disabled = available <= 0;
    button.classList.toggle("is-ready", available > 0);
    button.classList.toggle("is-armed", resetArmed);

    const hintText = hasHint
      ? `Bonus star: change to a legal secret with ${String(hint.letter).toUpperCase()} in position ${position}. `
      : "";
    const title = `${hintText}${available > 0 ? "Tap to reset a letter's feedback." : "Reset a letter's feedback (unlocks at 5 stars)."}`;
    button.title = title;
    button.setAttribute("aria-label", title);
  }

  function updateLockedPowerCard(state) {
    const charge = getCharge(state);
    const lockedPowerId = charge?.lockedPowerId || null;
    const total = displayedTotal(state);

    for (const [id, mod] of Object.entries(window.PowerEngine?.powers || {})) {
      const wrapper = mod?.wrapperEl;
      if (!wrapper) continue;

      const locked = !!(
        charge?.enabled &&
        lockedPowerId &&
        id === lockedPowerId &&
        total < POWER_UNLOCK_AT
      );

      wrapper.classList.toggle("spy-charge-power-locked", locked);
      wrapper.dataset.spyChargePower = id;

      if (locked) {
        wrapper.dataset.unlockAt = String(POWER_UNLOCK_AT);
        if (mod.buttonEl) {
          mod.buttonEl.setAttribute(
            "aria-label",
            `${window.POWER_METADATA?.[id]?.label || id}, locked until ${POWER_UNLOCK_AT} stars`
          );
        }
      } else {
        delete wrapper.dataset.unlockAt;
      }
    }
  }

  function renderHud(state = window.state, role = window.myRole) {
    const hud = ensureHud();
    if (!hud) return;

    const charge = getCharge(state);
    // Power Choice mode has its own Spyometer + reward-choice modal (see
    // power-choice-mode.js) built on the same underlying spyCharge state --
    // this older standalone meter/reset-button HUD was never suppressed
    // for that mode, so both rendered at once: the reward modal already
    // applies a reward's effect (including letter resets) immediately, but
    // this HUD's own "is-ready" reset button kept showing alongside it as
    // a redundant, confusing extra "power button".
    const shouldShow =
      role === "setter" &&
      !!charge?.enabled &&
      state?.gameMode !== "powerChoice";

    hud.classList.toggle("hidden", !shouldShow);

    if (!shouldShow) {
      updateLockedPowerCard(state);
      return;
    }

    renderMeter(state);
    renderActionButton(charge, state);
    updateLockedPowerCard(state);
  }

  window.getDisplayedSpyChargeTotal = () => displayedTotal(window.state);

  window.isSpyPowerChargeLocked = function (powerId, state = window.state) {
    const charge = getCharge(state);
    if (!charge?.enabled || !charge.lockedPowerId) return false;

    return (
      powerId === charge.lockedPowerId &&
      displayedTotal(state) < POWER_UNLOCK_AT
    );
  };

  window.renderSetterCoverStars = function (strength) {
    const el = byId("setterCoverStars");
    if (!el) return;

    const show = !!strength?.visible && window.myRole === "setter";
    el.classList.toggle("hidden", !show);
    if (!show) return;

    const count = Math.max(0, Math.min(3, Number(strength.stars) || 0));

    el.querySelectorAll("[data-cover-star]").forEach((star, index) => {
      star.classList.toggle("is-filled", index < count);
    });

    const bonus = el.querySelector("[data-cover-bonus-star]");
    if (bonus) {
      bonus.classList.toggle("is-visible", !!strength.bonusAvailable);
      bonus.classList.toggle("is-filled", !!strength.bonusStar);
    }

    const bonusText = strength.bonusStar ? " plus one bonus star" : "";
    el.setAttribute(
      "aria-label",
      `${count} of 3 cover-strength stars${bonusText}`
    );
  };

  function captureStarSource() {
    const stars = byId("setterCoverStars");
    if (stars && !stars.classList.contains("hidden")) {
      const rect = stars.getBoundingClientRect();
      if (rect.width && rect.height) return rect;
    }

    const pendingSource = window._pendingSpyChargeSourceRect;
    if (pendingSource?.width && pendingSource?.height) {
      return pendingSource;
    }

    const draft = document.querySelector(
      "#draftSetter .history-row.setter-draft, " +
      "#draftSetter .history-row.ghost-secret"
    );

    return draft?.getBoundingClientRect?.() || null;
  }

  function waitForLatestReveal(callback) {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const lastTile = document.querySelector(
          "#setterGuesserSubmitted .history-row-wrap:last-child .history-tile:last-child"
        );

        if (!lastTile) {
          setTimeout(callback, 420);
          return;
        }

        let done = false;
        let timer = null;

        const finish = () => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          lastTile.removeEventListener("animationend", onEnd);
          callback();
        };

        const onEnd = event => {
          if (event.target !== lastTile) return;
          if (!/flip|reveal|cover/i.test(event.animationName || "")) return;
          finish();
        };

        lastTile.addEventListener("animationend", onEnd);
        timer = setTimeout(finish, 2700);
      });
    });
  }

  const deferredHistoryReleases = [];
  let deferredHistoryTimer = null;
  let lastAwardFinishedAt = 0;

  function flushDeferredHistory() {
    clearTimeout(deferredHistoryTimer);
    deferredHistoryTimer = null;
    window._pendingSpyChargeSourceRect = null;

    const releases = deferredHistoryReleases.splice(0);

    for (const release of releases) {
      requestAnimationFrame(() => {
        try {
          release();
        } catch (error) {
          console.error("Deferred setter history flight failed:", error);
        }
      });
    }
  }

  window.deferSetterHistoryUntilSpyCharge = function (release) {
    if (typeof release !== "function") return false;

    const charge = getCharge(window.state);

    if (
      window.myRole !== "setter" ||
      !charge?.enabled
    ) {
      return false;
    }

    /* The award event can arrive just before or just after stateUpdate.
       If it already finished, the row may move immediately. */
    if (
      !awardRunning &&
      awardQueue.length === 0 &&
      Date.now() - lastAwardFinishedAt < 1600
    ) {
      requestAnimationFrame(release);
      return true;
    }

    deferredHistoryReleases.push(release);

    clearTimeout(deferredHistoryTimer);
    deferredHistoryTimer = setTimeout(() => {
      if (!awardRunning && awardQueue.length === 0) {
        flushDeferredHistory();
      }
    }, 1100);

    if (awardQueue.length) {
      drainAwardQueue();
    }

    return true;
  };


  // Full-screen solid backdrop, up for exactly as long as stars are
  // actually flying/landing -- without it the board keeps changing
  // (feedback tiles resolving, turn handing off) visibly behind the
  // flight, which reads as distracting clutter rather than "the reward
  // for that switch is now flying to the meter". Lazily created, same
  // pattern as every other one-off overlay in this file.
  function ensureAwardBackdrop() {
    let backdrop = byId("spyChargeAwardBackdrop");
    if (backdrop) return backdrop;

    backdrop = document.createElement("div");
    backdrop.id = "spyChargeAwardBackdrop";
    backdrop.className = "spy-charge-award-backdrop";
    document.body.appendChild(backdrop);
    return backdrop;
  }

  function showAwardBackdrop() {
    ensureAwardBackdrop().classList.add("show");
  }

  function hideAwardBackdrop() {
    byId("spyChargeAwardBackdrop")?.classList.remove("show");
  }

  function createFlightStar(sourceRect, targetRect, bonus, delayMs) {
    return new Promise(resolve => {
      if (!targetRect?.width || !targetRect?.height) {
        resolve();
        return;
      }

      const star = document.createElement("div");
      star.className = `spy-charge-flight-star${bonus ? " is-bonus" : ""}`;
      star.textContent = "★";

      const startX = sourceRect
        ? sourceRect.left + sourceRect.width / 2
        : window.innerWidth / 2;

      const startY = sourceRect
        ? sourceRect.top + sourceRect.height / 2
        : window.innerHeight / 2;

      const endX = targetRect.left + targetRect.width / 2;
      const endY = targetRect.top + targetRect.height / 2;
      const dx = endX - startX;
      const dy = endY - startY;
      const distance = Math.max(1, Math.hypot(dx, dy));

      /* Bend the path away from the straight line, then pull it into the
         meter quickly at the end. This reads more like a fighting-game
         resource pickup than a plain DOM translation. */
      const normalX = -dy / distance;
      const normalY = dx / distance;
      const arc = Math.min(96, Math.max(38, distance * 0.22));

      const p1x = dx * 0.30 + normalX * arc;
      const p1y = dy * 0.30 + normalY * arc - 18;
      const p2x = dx * 0.72 + normalX * arc * 0.42;
      const p2y = dy * 0.72 + normalY * arc * 0.42 - 8;

      Object.assign(star.style, {
        left: `${startX}px`,
        top: `${startY}px`
      });

      document.body.appendChild(star);

      setTimeout(() => {
        const animation = star.animate(
          [
            {
              opacity: 0,
              transform: "translate(-50%, -50%) scale(0.45) rotate(-45deg)"
            },
            {
              opacity: 1,
              offset: 0.14,
              transform: "translate(-50%, calc(-50% - 13px)) scale(1.35) rotate(18deg)"
            },
            {
              opacity: 1,
              offset: 0.46,
              transform: `translate(calc(-50% + ${p1x}px), calc(-50% + ${p1y}px)) scale(1.08) rotate(230deg)`
            },
            {
              opacity: 1,
              offset: 0.78,
              transform: `translate(calc(-50% + ${p2x}px), calc(-50% + ${p2y}px)) scale(0.78) rotate(510deg)`
            },
            {
              opacity: 0,
              transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0.24) rotate(760deg)`
            }
          ],
          {
            duration: 720,
            easing: "cubic-bezier(0.18, 0.82, 0.22, 1)",
            fill: "forwards"
          }
        );

        animation.finished
          .catch(() => {})
          .finally(() => {
            window.spawnSpyChargeLandingBurst?.(
              targetRect,
              bonus
            );

            star.remove();
            resolve();
          });
      }, delayMs);
    });
  }

  function pulseZeroAward(sourceRect) {
    const stars = byId("setterCoverStars");
    if (stars) {
      stars.classList.remove("zero-award-pulse");
      void stars.offsetWidth;
      stars.classList.add("zero-award-pulse");
      setTimeout(() => stars.classList.remove("zero-award-pulse"), 520);
      return;
    }

    if (!sourceRect) return;
  }

  // Multiple stars in one award used to fly fully sequentially (each one
  // awaited to completion before the next even started), so 2-3 stars
  // read as a slow single-file line. They're now launched close together
  // instead -- each star's target segment and before/after charge value
  // are fixed up front from its index (not read off the shared mutable
  // visualTotal at landing time), so landing order stays correct
  // regardless of exact animation timing as long as later-launched stars
  // don't finish before earlier ones (guaranteed here: same flight
  // duration, strictly increasing launch stagger).
  const STAR_LAUNCH_STAGGER = 115;

  // A small, escalating congratulation for the switch that was JUST
  // scored (1-4 stars: base 0-3 plus the bonus star) -- separate from
  // the compact big-announce banners above (those fire for a METER
  // MILESTONE being crossed, a different thing that can coincide with
  // this on the same submission), so the two never fight over that
  // shared #bigAnnouncePopup singleton. Purely a self-contained,
  // dynamically-created element in the same spirit as
  // setter-board-polish.js's spawnSpyChargeLandingBurst -- no static
  // markup needed, it just removes itself when the animation ends.
  const STAR_CONGRATS_TEXT = {
    1: "Nice!",
    2: "Great!",
    3: "Super!",
    4: "Amazing!"
  };

  function showSpyChargeCongrats(totalStars) {
    const text = STAR_CONGRATS_TEXT[totalStars];
    if (!text) return;

    const anchor = byId("spyChargeHud");
    const rect = anchor?.getBoundingClientRect();
    if (!rect) return;

    const el = document.createElement("div");
    el.className = `spy-charge-congrats tier-${totalStars}`;
    el.textContent = text;

    // Centers on this x/y via the .show transform's translate(-50%, -100%)
    // below -- both clamped a fixed, generous distance from the nearest
    // edge (rather than measuring the popup's own rendered size first)
    // since it's short-lived text that's never wide enough to need an
    // exact fit, same tradeoff-for-simplicity as the reduced-motion
    // fallback above.
    el.style.left = `${Math.min(Math.max(rect.left + rect.width / 2, 100), window.innerWidth - 100)}px`;
    el.style.top = `${Math.max(64, rect.top)}px`;

    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add("show"));

    // Held on screen a little longer at higher tiers -- the bigger the
    // moment, the more time it deserves before it fades.
    const holdMs = 700 + totalStars * 150;
    setTimeout(() => {
      el.classList.remove("show");
      setTimeout(() => el.remove(), 260);
    }, holdMs);
  }

  async function animateAward(entry) {
    const payload = entry.payload;
    const appliedBase = Math.max(0, Number(payload.appliedBaseStars) || 0);
    const appliedBonus = Math.max(0, Number(payload.appliedBonusStars) || 0);
    const stars = [
      ...Array.from({ length: appliedBase }, () => false),
      ...Array.from({ length: appliedBonus }, () => true)
    ];

    const startTotal = Math.max(0, Math.min(MAX_CHARGE, Number(payload.before) || 0));
    visualTotal = startTotal;
    renderHud(window.state, window.myRole);

    if (!stars.length) {
      pulseZeroAward(entry.sourceRect);
      await new Promise(resolve => setTimeout(resolve, 520));
      return;
    }

    showAwardBackdrop();

    const landings = stars.map((isBonus, index) => {
      const beforeLanding = Math.min(MAX_CHARGE, startTotal + index);
      const afterLanding = Math.min(MAX_CHARGE, startTotal + index + 1);
      const targetIndex = Math.min(MAX_CHARGE - 1, beforeLanding);
      const target = document.querySelector(
        `[data-charge-index="${targetIndex}"]`
      );
      const drawerClosed = document
        .getElementById("setterScreen")
        ?.classList.contains("setter-sidebar-collapsed");
      const flightTarget = drawerClosed
        ? document.getElementById("setterSidebarToggle")
        : target;

      if (!target || !flightTarget) return Promise.resolve();

      return createFlightStar(
        entry.sourceRect,
        flightTarget.getBoundingClientRect(),
        isBonus,
        index * STAR_LAUNCH_STAGGER
      ).then(() => {
        visualTotal = afterLanding;
        target.classList.add("just-charged");
        setTimeout(() => target.classList.remove("just-charged"), 420);

        if (drawerClosed) {
          flightTarget.classList.add("just-charged");
          setTimeout(() => flightTarget.classList.remove("just-charged"), 420);
        }

        renderHud(window.state, window.myRole);

        if (beforeLanding < POWER_UNLOCK_AT && afterLanding >= POWER_UNLOCK_AT) {
          const powerId = getCharge(window.state)?.lockedPowerId;
          window.showBigAnnounce?.({
            icon: "⚡",
            title: "Second power unlocked",
            sub: window.POWER_METADATA?.[powerId]?.label || "Your locked Spy power is ready.",
            roleClass: "role-setter",
            duration: 1900,
            compact: true
          });
        }

        for (const threshold of RESET_THRESHOLDS) {
          if (beforeLanding < threshold && afterLanding >= threshold) {
            window.showBigAnnounce?.({
              icon: "↺",
              title: "Letter reset unlocked",
              sub: "Tap the reset button beside the charge meter, then choose a letter.",
              roleClass: "role-setter",
              duration: 1900,
              compact: true
            });
          }
        }
      });
    });

    await Promise.all(landings);
    hideAwardBackdrop();

    showSpyChargeCongrats(stars.length);
  }

  // Exposed so ui/setter-sidebar.js's idle auto-expand can hold off popping
  // Notes out until this finishes -- it used to trigger the instant the
  // setter's turn ended, which is the exact same moment this animation
  // starts, so Notes floating out would visually clash with the stars
  // still flying to the charge meter.
  window.isSpyChargeAwardAnimating = () =>
    awardRunning ||
    awardQueue.length > 0 ||
    deferredHistoryReleases.length > 0;

  async function drainAwardQueue() {
    if (awardRunning || !awardQueue.length) return;
    if (window.myRole !== "setter") return;

    awardRunning = true;
    const entry = awardQueue.shift();

    try {
      await animateAward(entry);
    } finally {
      awardRunning = false;

      if (awardQueue.length) {
        drainAwardQueue();
        return;
      }

      lastAwardFinishedAt = Date.now();

      /* Let the final landing burst breathe for a fraction of a second,
         then move the submitted pending row into history. */
      setTimeout(() => {
        if (awardRunning || awardQueue.length) return;

        flushDeferredHistory();
        visualTotal = null;
        renderHud(window.state, window.myRole);

        window.PowerEngine?.updateButtonStates?.(
          window.state,
          window.myRole,
          window.currentUser?.id
        );

        window.updateSetterIdleExpand?.(window.state);
      }, 150);
    }
  }

  socket.on("spyChargeAward", payload => {
  if (window.state?.gameMode === "powerChoice") return; // power-choice-mode-v2.2
    visualTotal = Math.max(0, Math.min(MAX_CHARGE, Number(payload?.before) || 0));

    awardQueue.push({
      payload: payload || {},
      sourceRect: captureStarSource()
    });

    renderHud(window.state, window.myRole);

    window._pendingSpyChargeSourceRect = null;
    drainAwardQueue();
  });

  function clientLetterHasFeedback(letter) {
    const target = String(letter || "").toUpperCase();

    const hasHistoryFeedback = (window.state?.history || []).some(entry => {
      const guess = String(entry?.guess || "").toUpperCase();

      return [...guess].some((value, index) => {
        if (value !== target) return false;

        return !!(
          (Array.isArray(entry.fb) && entry.fb[index]) ||
          (Array.isArray(entry.fbGuesser) && entry.fbGuesser[index])
        );
      });
    });

    const hasConstraint = (window.state?.extraConstraints || []).some(
      constraint => {
        const type = String(constraint?.type || "").toUpperCase();
        const constraintLetter = String(
          constraint?.letter || ""
        ).toUpperCase();

        // ABSENT included to stay in step with the server's
        // hasLetterKnowledge/eraseLetterKnowledge (resetLetterKnowledge.js):
        // a Power Choice reward that ruled a letter out is knowledge about
        // it, so it's a legal reset target and the reset lifts the block.
        return (
          (type === "GREEN" || type === "YELLOW" || type === "ABSENT") &&
          constraintLetter === target
        );
      }
    );

    return hasHistoryFeedback || hasConstraint;
  }

  function disarmResetLetter() {
    resetArmed = false;
    document.body.classList.remove("spy-charge-reset-armed");
    renderActionButton(getCharge(window.state), window.state);
  }

  function armResetLetter() {
    if (availableResetCount(window.state) <= 0) return;

    resetArmed = true;
    document.body.classList.add("spy-charge-reset-armed");
    renderActionButton(getCharge(window.state), window.state);
    window.toast?.("Choose a keyboard letter to reset");
  }

  window.spyChargeResetKbActive = () => resetArmed;
  window.spyChargeResetKbReset = disarmResetLetter;

  window.spyChargeResetKbInput = function (event) {
    if (!resetArmed) return false;
    if (event.type !== "LETTER") return true;

    const letter = String(event.value || "").toUpperCase();

    if (!clientLetterHasFeedback(letter)) {
      window.toast?.(`${letter} has no feedback or constraint to reset`);
      return true;
    }

    disarmResetLetter();

    const useReset = () => {
      window.sendGameAction?.({
        type: "USE_SPY_CHARGE_RESET",
        letter
      });
    };

    if (typeof window.showPowerActionPopup === "function") {
      window.showPowerActionPopup({
        emoji: "↺",
        title: `Reset ${letter}?`,
        desc: `Erase every feedback result and green/yellow constraint for ${letter} from this round.`,
        useLabel: `Reset ${letter}`,
        showUse: true,
        useEnabled: true,
        onUse: useReset
      });
    } else if (window.confirm(`Reset every feedback result for ${letter}?`)) {
      useReset();
    }

    return true;
  };

  window.updateSpyChargeUI = function (state, role) {
    const nextKey = chargeKey(state);

    if (nextKey !== lastChargeKey) {
      lastChargeKey = nextKey;
      awardQueue = [];
      awardRunning = false;
      visualTotal = null;
      disarmResetLetter();
    }

    renderHud(state, role);

    window.PowerEngine?.updateButtonStates?.(
      state,
      role,
      window.currentUser?.id
    );

    if (awardQueue.length) {
      drainAwardQueue();
    }
  };
})();
