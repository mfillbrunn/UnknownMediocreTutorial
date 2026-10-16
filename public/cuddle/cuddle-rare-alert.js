/* Cuddle: a red alert when a stage's answer is a rare word.
 *
 * A Rare Word stage (cuddle-rebalance-v5.js, alone or stacked with other
 * challenges) is easy to miss now that a stage starts without a briefing.
 * So when one begins, a light red wash pulls over the screen, its edges
 * glow red once, and a "RARE WORD" banner with a small alarm light says
 * so. It lasts about 2 seconds; a tap closes it sooner. Shown once per stage (a reload doesn't replay it).
 */
(function () {
  "use strict";

  if (window.CuddleRareAlert) return;

  var SHOW_MS = 1900;

  function activeGame() {
    try {
      return window.CuddleBranchMap && typeof window.CuddleBranchMap.getActiveGame === "function"
        ? window.CuddleBranchMap.getActiveGame() : null;
    } catch (_error) {
      return null;
    }
  }

  function stageKey(state) {
    return [state.runId || "", state.round || 0, state.secret || ""].join(":");
  }

  function isRareStage(state) {
    var custom = state && state.cuddleRebalanceV5;
    var challenge = custom && custom.activeChallenge;
    if (challenge && challenge.rareSecret && !challenge.paid) return true;
    var secret = String(state && state.secret || "").toUpperCase();
    return Boolean(challenge && challenge.mandatory && secret && Array.isArray(window.CuddleRareWords)
      && window.CuddleRareWords.indexOf(secret) !== -1);
  }

  function reducedMotion() {
    try {
      return Boolean(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    } catch (_error) {
      return false;
    }
  }

  function show() {
    if (document.querySelector(".umt-rare-alert")) return;
    var el = document.createElement("div");
    el.className = "umt-rare-alert" + (reducedMotion() ? " is-still" : "");
    el.setAttribute("role", "alert");
    el.innerHTML = '<div class="umt-rare-wash" aria-hidden="true"></div>'
      + '<div class="umt-rare-edges" aria-hidden="true"></div>'
      + '<div class="umt-rare-banner">'
      + '<span class="umt-rare-siren" aria-hidden="true"><i></i></span>'
      + '<strong>Rare word</strong>'
      + '<small>The answer is an uncommon word this stage.</small>'
      + '</div>';
    var close = function closeAlert() {
      if (!el.parentNode) return;
      el.classList.add("is-leaving");
      setTimeout(function gone() { el.remove(); }, 260);
    };
    el.addEventListener("click", close);
    document.body.appendChild(el);
    setTimeout(close, SHOW_MS);
  }

  function check() {
    var game = activeGame();
    var state = game && game.state;
    if (!state || state.status !== "playing" || !state.secret) return;
    if (String(state.runId || "").indexOf(":duel:") !== -1) return;
    if ((Number(state.guessesUsed) || 0) > 0 || (state.history || []).length) return;
    if (!document.querySelector("#cuddleScreen .cuddle-board")) return;
    var key = stageKey(state);
    if (state.umtRareAlert === key || !isRareStage(state)) return;
    state.umtRareAlert = key;
    try { if (typeof game.save === "function") game.save(); } catch (_error) { /* next save */ }
    // After the world intro or any stage-start screen has had a moment.
    setTimeout(show, 350);
  }

  var pending = false;
  function schedule() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(function run() {
      pending = false;
      try { check(); } catch (error) { console.warn("Cuddle rare alert:", error); }
    });
  }

  function attach() {
    var host = document.getElementById("cuddleScreen");
    if (!host) {
      document.addEventListener("DOMContentLoaded", attach, { once: true });
      return;
    }
    new MutationObserver(schedule).observe(host, { childList: true, subtree: true });
    schedule();
  }
  attach();

  window.CuddleRareAlert = Object.freeze({ show: show, check: check });
}());
