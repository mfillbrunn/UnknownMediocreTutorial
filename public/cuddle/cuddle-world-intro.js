/* Cuddle: the guess window, explained once per world.
 *
 * Each world has a guess window (6, 5, then 4 guesses -- the engine's
 * _solveGuessThreshold) and every guess past it costs points
 * (_lateGuessPenalty). Rather than a banner on the board, a small popup
 * explains it the first time the player stands on the map in a world:
 * at the start of the run and after each boss. Seen worlds are kept on the
 * run (state.umtWorldIntro), so a reload doesn't show it again.
 *
 * The popup lives outside #cuddleRoot, waits for any other overlay (the
 * cash-out, the badge reveal, a pack) to close first, and shows only the
 * numbers the engine itself uses.
 */
(function () {
  "use strict";

  if (window.CuddleWorldIntro) return;

  var EXTRA_SLOTS = 2;

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function activeGame() {
    try {
      return window.CuddleBranchMap && typeof window.CuddleBranchMap.getActiveGame === "function"
        ? window.CuddleBranchMap.getActiveGame()
        : null;
    } catch (_error) {
      return null;
    }
  }

  function worldIndex(state) {
    var cleared = Array.isArray(state && state.bossGatesDone) ? state.bossGatesDone.length : 0;
    return Math.max(0, Math.min(2, cleared));
  }

  function seenList(state) {
    var intro = state.umtWorldIntro;
    if (!intro || typeof intro !== "object" || !Array.isArray(intro.seen)) intro = state.umtWorldIntro = { seen: [] };
    return intro.seen;
  }

  function worldName(game, index) {
    var Worlds = window.CuddleWorlds;
    if (!Worlds || typeof Worlds.themedWorld !== "function") return "";
    try {
      var world = Worlds.themedWorld(game.state.branchMap, index);
      return world && world.name ? String(world.name) : "";
    } catch (_error) {
      return "";
    }
  }

  // Anything else on screen goes first.
  function busy(state) {
    var money = window.CuddleMoneyMode;
    return Boolean(state.umtPackOffer
      || document.querySelector(".umt-pack-overlay")
      || document.getElementById("cuddleMoneyPayoutOverlay")
      || document.querySelector(".umt-pt-overlay")
      || (money && typeof money.payoutActive === "function" && money.payoutActive())
      || (state.cuddleMoneyMode && state.cuddleMoneyMode.pendingPayout)
      || (state.branchMap && (state.branchMap.expandedEvent || state.branchMap.expandedEventResult)));
  }

  function costLine(game, window) {
    var first = game._lateGuessPenalty(window + 1);
    var second = game._lateGuessPenalty(window + 2);
    if (first === second) return "Every guess after that costs <b>" + first + " points</b>.";
    return "Guesses after that cost <b>" + first + "</b>, then <b>" + second + "</b>, <b>"
      + game._lateGuessPenalty(window + 3) + "</b>&hellip; points, more each time.";
  }

  function dialogHtml(game, index) {
    var window = game._solveGuessThreshold();
    var slots = "";
    for (var i = 1; i <= window + EXTRA_SLOTS; i += 1) {
      var late = i > window;
      slots += '<span class="umt-wi-slot' + (late ? " is-late" : "") + '">'
        + (late ? "&minus;" + game._lateGuessPenalty(i) : i) + "</span>";
    }
    var name = worldName(game, index);
    return '<section class="umt-wi-dialog" role="dialog" aria-modal="true" aria-labelledby="umtWiTitle">'
      + '<span class="umt-wi-kicker">World ' + (index + 1) + (name ? " &middot; " + escapeHtml(name) : "") + "</span>"
      + '<h2 id="umtWiTitle">Solve within ' + window + " guesses</h2>"
      + '<div class="umt-wi-slots" aria-hidden="true">' + slots + "</div>"
      + "<p>" + costLine(game, window) + "</p>"
      + (index > 0 ? '<p class="umt-wi-note">The window is tighter than last world&rsquo;s.</p>' : "")
      + '<button type="button" class="cuddle-btn cuddle-btn-primary" data-umt-world-intro="close">Got it</button>'
      + "</section>";
  }

  var shownFor = -1;

  function sync() {
    var game = activeGame();
    var state = game && game.state;
    var existing = document.querySelector(".umt-wi-overlay");
    var ready = Boolean(state && state.status === "branchMap" && document.getElementById("cuddleRoot") && !document.querySelector(".cuddle-landing")
      && typeof game._solveGuessThreshold === "function" && typeof game._lateGuessPenalty === "function"
      && String(state.runId || "").indexOf(":duel:") === -1);
    var index = ready ? worldIndex(state) : -1;
    var show = ready && seenList(state).indexOf(index) === -1 && !busy(state);
    if (!show) {
      if (existing && !(ready && seenList(state).indexOf(index) === -1)) existing.remove();
      if (!existing) shownFor = -1;
      return;
    }
    if (existing && shownFor === index) return;
    if (!existing) {
      existing = document.createElement("div");
      existing.className = "umt-wi-overlay";
      (document.getElementById("cuddleScreen") || document.body).appendChild(existing);
    }
    shownFor = index;
    existing.innerHTML = dialogHtml(game, index);
    var button = existing.querySelector("[data-umt-world-intro]");
    if (button) button.focus();
  }

  var pending = false;
  function schedule() {
    if (pending) return;
    pending = true;
    var run = function run() { pending = false; sync(); };
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(run);
    else setTimeout(run, 0);
  }

  document.addEventListener("click", function onIntroClick(event) {
    var button = event.target.closest && event.target.closest("[data-umt-world-intro]");
    if (!button) return;
    var game = activeGame();
    if (game && game.state) {
      var seen = seenList(game.state);
      var index = worldIndex(game.state);
      if (seen.indexOf(index) === -1) seen.push(index);
      try {
        if (typeof game.save === "function") game.save();
      } catch (_error) {
        // The popup closing matters more than the save.
      }
    }
    var overlay = document.querySelector(".umt-wi-overlay");
    if (overlay) overlay.remove();
    shownFor = -1;
  });

  function attach() {
    var root = document.getElementById("cuddleRoot");
    if (!root) {
      document.addEventListener("DOMContentLoaded", attach, { once: true });
      return;
    }
    var screen = document.getElementById("cuddleScreen") || document.body;
    new MutationObserver(schedule).observe(screen, { childList: true, subtree: true });
    window.addEventListener("cuddle:campaign-update", schedule);
    schedule();
  }

  window.CuddleWorldIntro = Object.freeze({ sync: schedule });
  attach();
}());
