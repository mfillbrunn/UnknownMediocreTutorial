/* Cuddle: rest the screen when nobody is playing.
 *
 * The decorative loops (map sparks, boss halos, a world's drifting
 * particles, fog, pulsing hints) redraw the screen every frame, which is
 * what keeps a phone warm while it just lies there. After CALM_MS without a
 * tap, key or scroll, every endlessly repeating animation is paused; the
 * next touch resumes them where they were. One-shot animations (a guess's
 * tiles, a cash-out, a pack opening) are left alone.
 */
(function () {
  "use strict";

  if (window.CuddleCalm) return;

  var CALM_MS = 20000;
  var RECHECK_MS = 5000;
  var calm = false;
  var timer = 0;
  var paused = [];

  function looping(animation) {
    try {
      return animation.playState === "running" && animation.effect && animation.effect.getComputedTiming().iterations === Infinity;
    } catch (_error) {
      return false;
    }
  }

  // Pauses whatever loops now; while calm, again every few seconds, since a
  // redraw can start new ones.
  function rest() {
    if (!calm || typeof document.getAnimations !== "function") return;
    document.getAnimations().forEach(function (animation) {
      if (!looping(animation)) return;
      animation.pause();
      paused.push(animation);
    });
    timer = window.setTimeout(rest, RECHECK_MS);
  }

  function wake() {
    window.clearTimeout(timer);
    if (calm) {
      calm = false;
      paused.forEach(function (animation) {
        try { if (animation.playState === "paused") animation.play(); } catch (_error) { /* gone */ }
      });
      paused = [];
    }
    timer = window.setTimeout(function () {
      calm = true;
      rest();
    }, CALM_MS);
  }

  ["pointerdown", "keydown", "wheel", "scroll", "touchstart"].forEach(function (type) {
    window.addEventListener(type, wake, { capture: true, passive: true });
  });
  document.addEventListener("visibilitychange", function () { if (!document.hidden) wake(); });
  wake();

  window.CuddleCalm = Object.freeze({ isCalm: function () { return calm; } });
}());
