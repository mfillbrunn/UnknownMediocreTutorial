/* Cuddle: the logo's little creature drifting by, now and then.
 *
 * Some stages (about one in four), a while after the stage opens, the
 * Cuddle from the start screen floats across the play screen behind
 * everything: slowly, bobbing a little, once, then it's gone. It sits
 * behind the board and the hand (the stage's own background shows it in
 * the gaps), never blocks a tap, and skips the Duel and reduced motion.
 * Tapping it where it peeks out gets a wave back.
 */
(function () {
  "use strict";

  if (window.CuddleDrifter) return;

  var Engine = window.CuddleEngine;
  var proto = Engine && Engine.CuddleGame && Engine.CuddleGame.prototype;
  if (!proto || typeof proto._beginRound !== "function") return;

  var CHANCE = 0.25;
  var DELAY_MS = [5000, 20000];
  var DRIFT_MS = 16000;
  var pending = 0;
  var active = null;

  function reducedMotion() {
    return Boolean(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }

  function activeGame() {
    try { return window.CuddleBranchMap && window.CuddleBranchMap.getActiveGame(); } catch (_error) { return null; }
  }

  // The stage's play screen, and nothing over it.
  function playShell() {
    var screen = document.getElementById("cuddleScreen");
    if (!screen || !screen.classList.contains("active") || document.hidden) return null;
    var game = activeGame();
    var state = game && game.state;
    if (!state || state.status !== "playing" || String(state.runId || "").indexOf(":duel:") !== -1) return null;
    if (document.querySelector(".umt-boss-entrance, .cuddle-money-overlay, .umt-pack-overlay")) return null;
    return screen.querySelector("#cuddleRoot > .cuddle-shell:not(.cuddle-branch-shell):not(.cuddle-shop-shell)");
  }

  function drift() {
    pending = 0;
    var shell = playShell();
    if (!shell || active) return;
    var el = document.createElement("button");
    el.type = "button";
    el.className = "umt-drifter";
    el.tabIndex = -1;
    el.setAttribute("aria-hidden", "true");
    // Kept through redraws (cuddle-morph.js) while it crosses.
    el.setAttribute("data-umt-keep", "");
    var fromLeft = Math.random() < 0.5;
    el.classList.add(fromLeft ? "is-rightward" : "is-leftward");
    el.style.setProperty("--drift-top", (12 + Math.random() * 56).toFixed(1) + "%");
    el.style.setProperty("--drift-ms", DRIFT_MS + "ms");
    el.innerHTML = "<img src=\"cuddle/icons/cuddle-logo.svg\" alt=\"\" width=\"56\" height=\"56\" draggable=\"false\">";
    el.addEventListener("click", function wave() {
      if (el.classList.contains("is-waving")) return;
      el.classList.add("is-waving");
      var heart = document.createElement("span");
      heart.className = "umt-drifter-heart";
      heart.textContent = "♥";
      el.appendChild(heart);
      window.setTimeout(function () { el.classList.remove("is-waving"); heart.remove(); }, 1200);
    });
    shell.classList.add("umt-has-drifter");
    shell.insertBefore(el, shell.firstChild);
    active = el;
    window.setTimeout(function gone() {
      el.remove();
      if (active === el) active = null;
      if (shell.isConnected && !shell.querySelector(".umt-drifter")) shell.classList.remove("umt-has-drifter");
    }, DRIFT_MS + 200);
  }

  var baseBeginRound = proto._beginRound;
  proto._beginRound = function beginRoundWithDrifter() {
    var result = baseBeginRound.apply(this, arguments);
    try {
      if (pending) { window.clearTimeout(pending); pending = 0; }
      if (!reducedMotion() && Math.random() < CHANCE && String(this.state && this.state.runId || "").indexOf(":duel:") === -1) {
        pending = window.setTimeout(drift, DELAY_MS[0] + Math.random() * (DELAY_MS[1] - DELAY_MS[0]));
      }
    } catch (_error) { /* never block the game */ }
    return result;
  };

  window.CuddleDrifter = Object.freeze({ drift: drift });
}());
