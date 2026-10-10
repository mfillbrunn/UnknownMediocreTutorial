/* Cuddle: turned away at the boss.
 *
 * When the road ends at a boss the run hasn't the points to challenge
 * (cuddle-branch-map.js endRunIfGateUnreachable flags state.umtGateDefeat),
 * a short scene plays before the game-over screen: the paw climbs the road
 * to the boss, the boss swipes, and the paw tumbles back down. Tap to skip.
 * It plays once per run.
 */
(function () {
  "use strict";

  if (window.CuddleGateDefeat) return;

  var LENGTH = 3800;

  function activeGame() {
    try {
      return window.CuddleBranchMap && typeof window.CuddleBranchMap.getActiveGame === "function"
        ? window.CuddleBranchMap.getActiveGame()
        : null;
    } catch (_error) {
      return null;
    }
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function swap(character) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" }[character];
    });
  }

  function icon(name) {
    var icons = window.CuddleIcons;
    return icons && typeof icons.svg === "function" ? icons.svg(name) : "";
  }

  function bossIcon(final) {
    var worlds = window.CuddleWorlds;
    return worlds && typeof worlds.iconSvg === "function" ? worlds.iconSvg(final ? "final" : "boss", "umt-gd-boss-icon") : "";
  }

  var layer = null;

  function play(game, info) {
    var host = document.getElementById("cuddleScreen") || document.body;
    if (!host) return;
    if (layer) layer.remove();
    var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var el = document.createElement("div");
    el.className = "umt-gd" + (reduced ? " is-reduced" : "");
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-label", "The boss turned you away: " + info.score + " of " + info.required + " points. Tap to continue.");
    el.tabIndex = 0;
    el.innerHTML = '<div class="umt-gd-backdrop"></div>'
      + '<div class="umt-gd-stage" aria-hidden="true">'
      + '<span class="umt-gd-road"></span>'
      + '<span class="umt-gd-boss"><span class="umt-gd-boss-glow"></span>' + bossIcon(info.final)
      + '<b class="umt-gd-need">' + escapeHtml(info.required) + '</b></span>'
      + '<span class="umt-gd-paw">' + icon("paw") + '</span>'
      + '<svg class="umt-gd-slash" viewBox="0 0 100 100" preserveAspectRatio="none">'
      + '<path d="M18 22 L74 82"/><path d="M30 14 L86 74"/><path d="M8 34 L62 92"/></svg>'
      + '<span class="umt-gd-flash"></span>'
      + '</div>'
      + '<div class="umt-gd-text">'
      + '<h2>' + (info.final ? "The final boss turned you away" : "The boss turned you away") + '</h2>'
      + '<p><b>' + escapeHtml(info.score) + '</b> of the <b>' + escapeHtml(info.required) + '</b> points needed to challenge it.</p>'
      + '</div>'
      + '<p class="umt-gd-skip">Tap to continue</p>';
    host.appendChild(el);
    layer = el;
    el.focus({ preventScroll: true });
    var finished = false;
    var finish = function finish() {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      document.removeEventListener("keydown", onKey, true);
      el.classList.add("is-leaving");
      setTimeout(function remove() {
        el.remove();
        if (layer === el) layer = null;
      }, reduced ? 100 : 380);
    };
    var onKey = function onKey(event) {
      if (!el.isConnected) { document.removeEventListener("keydown", onKey, true); return; }
      event.stopPropagation();
      if (event.key === "Enter" || event.key === " " || event.key === "Escape") {
        event.preventDefault();
        finish();
      }
    };
    // It stays on its last frame until tapped, so the score can be read.
    var timer = setTimeout(function settle() { el.classList.add("is-done"); }, reduced ? 200 : LENGTH);
    el.addEventListener("click", finish);
    document.addEventListener("keydown", onKey, true);
  }

  function check() {
    var game = activeGame();
    var state = game && game.state;
    var info = state && state.umtGateDefeat;
    if (!info || info.shown || state.status !== "lost") return;
    info.shown = true;
    try { game.save(); } catch (_error) { /* next save */ }
    play(game, info);
  }

  setInterval(check, 200);

  window.CuddleGateDefeat = Object.freeze({ play: play, check: check });
}());
