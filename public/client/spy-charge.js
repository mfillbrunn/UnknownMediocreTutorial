(() => {
  "use strict";

  const MAX_CHARGE = 12;
  const POWER_UNLOCK_AT = 5;
  const RESET_THRESHOLDS = [8, 12];

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
              value === 5 ? "power" :
              value === 8 || value === 12 ? "reset" : "";

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
        <span>5⚡</span>
        <span>8↺</span>
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

  // One overlaid button on top of the meter now does both jobs the old
  // separate hint bubble + reset button used to: it always shows the
  // bonus-star target letter (falling back to the ↺ glyph when there's no
  // active hint), and it flashes once a letter-reset is actually available
  // to use, same trigger (armResetLetter) as before.
  function renderActionButton(charge, state) {
    const button = byId("spyChargeActionBtn");
    const letterEl = byId("spyChargeHintLetter");
    const countEl = byId("spyChargeResetCount");
    if (!button || !letterEl || !countEl) return;

    const hint = charge?.hint;
    const hasHint = !!hint?.letter && Number.isInteger(hint.position);
    const position = hasHint ? hint.position + 1 : null;

    letterEl.innerHTML = hasHint
      ? `${String(hint.letter).toUpperCase()}<sup>${position}</sup>`
      : "↺";

    const available = availableResetCount(state);
    countEl.textContent = String(available);
    countEl.classList.toggle("hidden", available <= 0);
    button.disabled = available <= 0;
    button.classList.toggle("is-ready", available > 0);
    button.classList.toggle("is-armed", resetArmed);

    const hintText = hasHint
      ? `Bonus star: change to a legal secret with ${String(hint.letter).toUpperCase()} in position ${position}. `
      : "";
    const title = `${hintText}${available > 0 ? "Tap to reset a letter's feedback." : "Reset a letter's feedback (unlocks at 8 stars)."}`;
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
    const shouldShow = role === "setter" && !!charge?.enabled;

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

  function createFlightStar(sourceRect, targetRect, bonus, delayMs) {
    return new Promise(resolve => {
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
              transform: "translate(-50%, -50%) scale(0.65) rotate(-18deg)"
            },
            {
              opacity: 1,
              offset: 0.16,
              transform: "translate(-50%, -58%) scale(1.2) rotate(0deg)"
            },
            {
              opacity: 1,
              offset: 0.72,
              transform: `translate(calc(-50% + ${dx * 0.82}px), calc(-50% + ${dy * 0.82 - 12}px)) scale(0.82) rotate(14deg)`
            },
            {
              opacity: 0,
              transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0.38) rotate(28deg)`
            }
          ],
          {
            duration: 420,
            easing: "cubic-bezier(0.22, 1, 0.36, 1)",
            fill: "forwards"
          }
        );

        animation.finished
          .catch(() => {})
          .finally(() => {
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
  const STAR_LAUNCH_STAGGER = 70;

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

    const landings = stars.map((isBonus, index) => {
      const beforeLanding = Math.min(MAX_CHARGE, startTotal + index);
      const afterLanding = Math.min(MAX_CHARGE, startTotal + index + 1);
      const targetIndex = Math.min(MAX_CHARGE - 1, beforeLanding);
      const target = document.querySelector(
        `[data-charge-index="${targetIndex}"]`
      );
      if (!target) return Promise.resolve();

      return createFlightStar(
        entry.sourceRect,
        target.getBoundingClientRect(),
        isBonus,
        index * STAR_LAUNCH_STAGGER
      ).then(() => {
        visualTotal = afterLanding;
        target.classList.add("just-charged");
        setTimeout(() => target.classList.remove("just-charged"), 420);

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
  }

  // Exposed so ui/setter-sidebar.js's idle auto-expand can hold off popping
  // Notes out until this finishes -- it used to trigger the instant the
  // setter's turn ended, which is the exact same moment this animation
  // starts, so Notes floating out would visually clash with the stars
  // still flying to the charge meter.
  window.isSpyChargeAwardAnimating = () => awardRunning || awardQueue.length > 0;

  function drainAwardQueue() {
    if (awardRunning || !awardQueue.length) return;
    if (window.myRole !== "setter") return;

    awardRunning = true;
    const entry = awardQueue.shift();

    waitForLatestReveal(async () => {
      try {
        await animateAward(entry);
      } finally {
        awardRunning = false;

        if (awardQueue.length) {
          drainAwardQueue();
        } else {
          setTimeout(() => {
            visualTotal = null;
            renderHud(window.state, window.myRole);
            window.PowerEngine?.updateButtonStates?.(
              window.state,
              window.myRole,
              window.currentUser?.id
            );
            // Now safe for Notes to pop out, if the turn is still idle.
            window.updateSetterIdleExpand?.(window.state);
          }, 160);
        }
      }
    });
  }

  socket.on("spyChargeAward", payload => {
    visualTotal = Math.max(0, Math.min(MAX_CHARGE, Number(payload?.before) || 0));

    awardQueue.push({
      payload: payload || {},
      sourceRect: captureStarSource()
    });

    renderHud(window.state, window.myRole);
  });

  function clientLetterHasFeedback(letter) {
    const target = String(letter || "").toUpperCase();

    return (window.state?.history || []).some(entry => {
      const guess = String(entry?.guess || "").toUpperCase();

      return [...guess].some((value, index) => {
        if (value !== target) return false;

        return !!(
          (Array.isArray(entry.fb) && entry.fb[index]) ||
          (Array.isArray(entry.fbGuesser) && entry.fbGuesser[index])
        );
      });
    });
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
      window.toast?.(`${letter} has no feedback to reset`);
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
        desc: `Erase every feedback result for ${letter} from this round.`,
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
