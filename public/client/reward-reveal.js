// client/reward-reveal.js — plays once, right before a Power Choice reward
// modal opens (see power-choice-mode.js's showChoice), replacing the old
// per-turn showTurnIndicator sweep for this specific moment. Secretkeeper:
// one star per point on the current milestone (4/8/12 -- pending.threshold)
// flies out into a ring, then collapses back to the center and bursts.
// Guesser: a single glowing square spins up to speed, then expands off
// screen. Both are pointer-events:none and never touch focus/scroll, and
// both call back once the effect has fully cleared so the reward modal
// opens right as the screen does.
(() => {
  "use strict";

  const STAR_SVG = `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 1.5 L14.7 8.6 L22 9.4 L16.5 14.3 L18.1 21.5 L12 17.6 L5.9 21.5 L7.5 14.3 L2 9.4 L9.3 8.6 Z"/>
  </svg>`;

  function ensureOverlay() {
    let el = document.getElementById("rewardRevealOverlay");
    if (!el) {
      el = document.createElement("div");
      el.id = "rewardRevealOverlay";
      el.setAttribute("aria-hidden", "true");
      document.body.appendChild(el);
    }
    return el;
  }

  function reducedMotion() {
    return !!window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  }

  function playStars(overlay, count, done) {
    const total = Math.max(1, Number(count) || 4);
    // Bigger rings for the higher milestones (more stars need more room
    // to read as individual points rather than a smear) instead of one
    // fixed radius for every stage.
    const radius = Math.min(130, 55 + total * 5);

    overlay.innerHTML = "";
    for (let i = 0; i < total; i++) {
      const star = document.createElement("div");
      star.className = "reward-reveal-star";
      star.style.setProperty("--rr-angle", `${(360 / total) * i}deg`);
      star.style.setProperty("--rr-radius", `-${radius}px`);
      star.style.setProperty("--rr-delay", `${(i % 6) * 35}ms`);
      star.innerHTML = STAR_SVG;
      overlay.appendChild(star);
    }
    overlay.className = "is-setter-active";
    overlay.__timer = setTimeout(done, reducedMotion() ? 400 : 1550);
  }

  function playSquare(overlay, done) {
    overlay.innerHTML = `<div class="reward-reveal-square"></div>`;
    overlay.className = "is-guesser-active";
    overlay.__timer = setTimeout(done, reducedMotion() ? 400 : 1450);
  }

  // role: "setter" | "guesser". count: how many stars to draw for the
  // setter (ignored for guesser). onDone: called once the effect has
  // fully cleared.
  window.showRewardReveal = function ({ role, count, onDone } = {}) {
    const overlay = ensureOverlay();

    // Never stack a second reveal on top of one already mid-flight --
    // clear it and restart clean, same "reflow between remove and re-add"
    // pattern the old turn-indicator cue used for the same reason.
    clearTimeout(overlay.__timer);
    overlay.className = "";
    overlay.innerHTML = "";
    void overlay.offsetWidth;

    const finish = () => {
      overlay.className = "";
      overlay.innerHTML = "";
      onDone?.();
    };

    if (role === "setter") {
      playStars(overlay, count, finish);
    } else {
      playSquare(overlay, finish);
    }
  };
})();
