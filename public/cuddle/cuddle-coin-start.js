/* Cuddle: inserting the coin.
 *
 * Starting a run costs a Cuddle Coin (cuddle-achievements.js); this plays
 * that moment like an arcade: a little cabinet, the coin arcs into its
 * slot, the slot flashes and reads "1 CREDIT", the screen lights up, and
 * the view zooms into the screen -- straight onto the run's world map --
 * with a "RUN START" banner on the way in. About three seconds; tap or
 * press a key to skip. Reduced motion gets the banner alone.
 *
 * cuddle-ui.js startNewRun calls play() right after the coin is spent.
 */
(function () {
  "use strict";

  if (window.CuddleCoinStart) return;

  var LENGTH = 3300;
  var REDUCED_LENGTH = 1100;

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function swap(character) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" }[character];
    });
  }

  function subtitle(options) {
    var difficulty = String(options && options.difficulty || "hard").toLowerCase();
    var name = difficulty.charAt(0).toUpperCase() + difficulty.slice(1);
    var level = Number(options && options.ascension) || 0;
    return level > 0 ? name + " · Ascension " + level : name;
  }

  // The cabinet, drawn with plain elements so it scales with the screen.
  function cabinetHtml() {
    return '<div class="umt-cs-cabinet" aria-hidden="true">'
      + '<div class="umt-cs-marquee"><span>CUDDLE</span></div>'
      + '<div class="umt-cs-bezel"><div class="umt-cs-screen">'
      + '<span class="umt-cs-scan"></span>'
      + '<span class="umt-cs-dot is-a"></span><span class="umt-cs-dot is-b"></span><span class="umt-cs-dot is-c"></span>'
      + '<span class="umt-cs-path"></span>'
      + '<span class="umt-cs-ready">READY?</span>'
      + "</div></div>"
      + '<div class="umt-cs-deck"><i></i><i></i><i class="is-big"></i></div>'
      + '<div class="umt-cs-door">'
      + '<span class="umt-cs-coin"></span>'
      + '<div class="umt-cs-slot"><span class="umt-cs-slot-mouth"></span></div>'
      + '<span class="umt-cs-label"><b class="is-insert">INSERT COIN</b><b class="is-credit">1 CREDIT</b></span>'
      + "</div>"
      + "</div>";
  }

  var layer = null;

  function play(options) {
    var host = document.getElementById("cuddleScreen") || document.body;
    if (!host) return;
    if (layer) layer.remove();
    var reduced = Boolean(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    var el = document.createElement("div");
    el.className = "umt-cs" + (reduced ? " is-reduced" : "");
    el.setAttribute("role", "status");
    el.setAttribute("aria-label", "Coin inserted. Run start: " + subtitle(options) + ".");
    el.innerHTML = '<div class="umt-cs-backdrop"></div>'
      + '<div class="umt-cs-stage">' + cabinetHtml() + "</div>"
      + '<div class="umt-cs-banner" aria-hidden="true"><b>RUN START</b><small>' + escapeHtml(subtitle(options)) + "</small></div>";
    host.appendChild(el);
    layer = el;

    var done = false;
    var timer = null;
    var finish = function finish() {
      if (done) return;
      done = true;
      clearTimeout(timer);
      document.removeEventListener("keydown", onKey, true);
      el.classList.add("is-leaving");
      setTimeout(function remove() {
        el.remove();
        if (layer === el) layer = null;
      }, 260);
    };
    var onKey = function onKey(event) {
      if (!el.isConnected) { document.removeEventListener("keydown", onKey, true); return; }
      event.stopPropagation();
      event.preventDefault();
      finish();
    };
    el.addEventListener("click", finish);
    el.addEventListener("pointerdown", function skip(event) { event.stopPropagation(); });
    document.addEventListener("keydown", onKey, true);
    timer = setTimeout(finish, reduced ? REDUCED_LENGTH : LENGTH);
  }

  window.CuddleCoinStart = Object.freeze({ play: play });
}());
