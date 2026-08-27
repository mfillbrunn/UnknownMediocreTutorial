// client/reward-reveal.js -- transition into a Power Choice reward picker.
// Secretkeeper: large normal-gold stars orbit and burst. Guesser: the shared
// quest-complete overlay types "Quest completed" from thin air and whooshes
// away; the real reward cards open immediately afterward. No square animation.
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

  function once(fn) {
    let called = false;
    return () => {
      if (called) return;
      called = true;
      fn();
    };
  }

  function playStars(overlay, count, done) {
    const total = Math.max(1, Number(count) || 4);
    const shortViewport = Math.min(
      Number(window.innerWidth) || 1280,
      Number(window.innerHeight) || 720
    );
    const compact = shortViewport < 620;
    const radius = compact
      ? Math.min(118, 58 + total * 5)
      : Math.min(190, 84 + total * 7);

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

  function fallbackGuesserText(overlay, done) {
    const text = "Quest completed";
    overlay.innerHTML = `<div class="reward-reveal-quest-fallback" role="status">
      ${[...text].map((character, index) =>
        `<span style="--rr-letter:${index}">${character === " " ? "&nbsp;" : character}</span>`
      ).join("")}
    </div>`;
    overlay.className = "is-guesser-text-active";
    overlay.__timer = setTimeout(done, reducedMotion() ? 400 : 1150);
  }

  function playGuesserQuestTransition(overlay, done) {
    const finish = once(done);
    overlay.innerHTML = "";
    overlay.className = "";

    // If quest.js already started the server-authoritative completion reveal,
    // wait for that exact sequence and open the cards after it. This prevents
    // a duplicate message when the socket event and state update arrive close
    // together.
    const inFlight = window.__questCompletionAnimationPromise;
    if (inFlight && typeof inFlight.finally === "function") {
      inFlight.finally(finish);
      return;
    }

    if (typeof window.playQuestCompletion === "function") {
      const sequence = window.playQuestCompletion({
        text: "Quest completed",
        messageColor: "var(--guesser-color, #58c9ff)",
        showReward: false
      });
      if (sequence && typeof sequence.finally === "function") {
        sequence.finally(finish);
      } else {
        overlay.__timer = setTimeout(finish, reducedMotion() ? 400 : 1150);
      }
      return;
    }

    // Load-order/network fallback: still use typed text, never the old square.
    fallbackGuesserText(overlay, finish);
  }

  // role: "setter" | "guesser". count is used only for setter stars.
  window.showRewardReveal = function ({ role, count, onDone } = {}) {
    const overlay = ensureOverlay();
    clearTimeout(overlay.__timer);
    overlay.className = "";
    overlay.innerHTML = "";
    void overlay.offsetWidth;

    const finish = once(() => {
      overlay.className = "";
      overlay.innerHTML = "";
      onDone?.();
    });

    if (role === "setter") {
      playStars(overlay, count, finish);
    } else {
      playGuesserQuestTransition(overlay, finish);
    }
  };
})();
