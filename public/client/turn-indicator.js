// client/turn-indicator.js — a restrained, non-blocking cue for a turn
// handoff (e.g. "Guess again" after simultaneous opening moves), replacing
// the old full-screen showBigAnnounce() popup for this specific case. A
// single role-color sheen sweeps across the viewport plus a small,
// short-lived badge; both are pointer-events:none, never move focus, and
// never touch scroll position -- gameplay stays fully usable while it plays.
(function () {
  let sheenEl = null;
  let badgeEl = null;
  let liveEl = null;
  let activeTimer = null;

  function ensureEls() {
    if (sheenEl && badgeEl && liveEl) return;

    sheenEl = document.getElementById("turnIndicatorSheen");
    if (!sheenEl) {
      sheenEl = document.createElement("div");
      sheenEl.id = "turnIndicatorSheen";
      sheenEl.setAttribute("aria-hidden", "true");
      document.body.appendChild(sheenEl);
    }

    badgeEl = document.getElementById("turnIndicatorBadge");
    if (!badgeEl) {
      badgeEl = document.createElement("div");
      badgeEl.id = "turnIndicatorBadge";
      badgeEl.setAttribute("aria-hidden", "true");
      document.body.appendChild(badgeEl);
    }

    liveEl = document.getElementById("turnIndicatorLive");
    if (!liveEl) {
      liveEl = document.createElement("div");
      liveEl.id = "turnIndicatorLive";
      liveEl.setAttribute("aria-live", "polite");
      liveEl.setAttribute("role", "status");
      // Visually hidden, not display:none -- screen readers skip
      // display:none content, and this needs to actually be announced.
      Object.assign(liveEl.style, {
        position: "absolute",
        width: "1px",
        height: "1px",
        overflow: "hidden",
        clip: "rect(0,0,0,0)",
        whiteSpace: "nowrap"
      });
      document.body.appendChild(liveEl);
    }
  }

  // label: shown on the small badge and announced via aria-live. accentVar:
  // a CSS custom property name (e.g. "--guesser-color") supplying the
  // sweep/badge tint -- resolved at animation time, not baked into markup,
  // so it always reflects the current role palette.
  window.showTurnIndicator = function ({ label = "Guess again", accentVar = "--guesser-color" } = {}) {
    ensureEls();
    clearTimeout(activeTimer);

    sheenEl.style.setProperty("--ti-accent", `var(${accentVar})`);
    badgeEl.style.setProperty("--ti-accent", `var(${accentVar})`);

    // Never stack duplicate indicators: force a clean restart even if one
    // is already mid-flight, via a reflow between remove and re-add.
    sheenEl.classList.remove("is-active");
    badgeEl.classList.remove("is-active");
    void sheenEl.offsetWidth;

    sheenEl.classList.add("is-active");
    badgeEl.classList.add("is-active");
    badgeEl.textContent = label;
    liveEl.textContent = label;

    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    const duration = reduced ? 900 : 1000;
    activeTimer = setTimeout(() => {
      sheenEl.classList.remove("is-active");
      badgeEl.classList.remove("is-active");
    }, duration + 500);
  };
})();
