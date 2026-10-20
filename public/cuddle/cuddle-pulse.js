/* Cuddle: one "something changed" signal for the add-ons that used to poll.
 *
 * Several layers watched the game on their own timers (every 0.5-1.5s),
 * which woke the phone ~11 times a second for things that change only
 * when the player does something. They listen here instead: the signal
 * fires (once, just after) whenever the game saves -- every change to a
 * run goes through save() -- the Cuddle screen is redrawn, a campaign
 * update is announced, or the page is shown again. Each listener keeps a slow safety timer for
 * anything that changes some other way.
 *
 * Frozen, so the rarity layer's method wrapping leaves it alone.
 */
(function () {
  "use strict";

  if (window.CuddlePulse) return;

  var listeners = [];
  var queued = false;

  function fire() {
    queued = false;
    listeners.slice().forEach(function (listener) {
      try { listener(); } catch (error) { console.warn("Cuddle pulse:", error); }
    });
  }

  function signal() {
    if (queued) return;
    queued = true;
    setTimeout(fire, 0);
  }

  var proto = window.CuddleEngine && window.CuddleEngine.CuddleGame && window.CuddleEngine.CuddleGame.prototype;
  if (proto && typeof proto.save === "function") {
    var baseSave = proto.save;
    proto.save = function saveWithPulse() {
      var result = baseSave.apply(this, arguments);
      signal();
      return result;
    };
  }
  window.addEventListener("cuddle:campaign-update", signal);
  // And after every redraw of the Cuddle screen (layers re-add what a
  // redraw cleared).
  function watchRoot() {
    var root = document.getElementById("cuddleRoot");
    if (root) new MutationObserver(signal).observe(root, { childList: true });
  }
  if (document.getElementById("cuddleRoot")) watchRoot();
  else document.addEventListener("DOMContentLoaded", watchRoot, { once: true });
  document.addEventListener("visibilitychange", function () { if (!document.hidden) signal(); });

  // Runs `listener` on every signal, and every `safetyMs` anyway.
  function on(listener, safetyMs) {
    listeners.push(listener);
    if (safetyMs) setInterval(listener, safetyMs);
  }

  // For re-hooking checks that matter while the page's layers are still
  // installing: every `fastMs` for the first `fastForMs`, then every
  // `slowMs`.
  function settle(listener, fastMs, slowMs, fastForMs) {
    var started = Date.now();
    var timer = setInterval(function () {
      listener();
      if (Date.now() - started < fastForMs) return;
      clearInterval(timer);
      setInterval(listener, slowMs);
    }, fastMs);
  }

  window.CuddlePulse = Object.freeze({ on: on, signal: signal, settle: settle });
}());
