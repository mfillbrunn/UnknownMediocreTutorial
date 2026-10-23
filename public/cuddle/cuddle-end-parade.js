/* Cuddle: the parade behind a won run's end screen.
 *
 * Once the final boss falls, the win screen's card opens with an endless
 * little side-scroller in a band across its top: the run's worlds roll by one after another (the same
 * landscapes the world crossings draw, cuddle-world-travel.js), letter
 * tiles drift past in Wordle colours, and the cuddle creature floats along
 * the road with the Setter and the Guesser from multiplayer
 * (index.html's #icon-role-secretkeeper and #icon-role-guesser) walking
 * beside it. It loops for as long as the screen is up.
 */
(function () {
  "use strict";

  if (window.CuddleEndParade) return;

  var WORDS = ["CUDDLE", "GUESS", "WORLD", "TILES", "CHAMP", "QUEST", "BADGE", "SOLVE"];
  var COLOURS = ["green", "yellow", "grey", "green", "yellow"];

  function activeGame() {
    try {
      return window.CuddleBranchMap && typeof window.CuddleBranchMap.getActiveGame === "function"
        ? window.CuddleBranchMap.getActiveGame() : null;
    } catch (_error) {
      return null;
    }
  }

  // The run's three worlds, then the first again, so the loop joins up.
  function landscapes(game) {
    var travel = window.CuddleWorldTravel;
    if (!travel || typeof travel.scene !== "function") return "";
    var scenes = [];
    for (var index = 0; index < 3; index += 1) {
      var world = travel.worldAt(game, index);
      if (world) scenes.push(travel.scene(world, "p" + index));
    }
    if (!scenes.length) return "";
    scenes.push(scenes[0]);
    return '<div class="umt-parade-strip" style="--parade-count:' + scenes.length + '">' + scenes.join("") + "</div>";
  }

  // Letter tiles drifting past at different heights, sizes and speeds.
  function tiles() {
    var out = "";
    var letters = WORDS.join("").split("");
    for (var index = 0; index < 14; index += 1) {
      var letter = letters[(index * 7) % letters.length];
      var colour = COLOURS[index % COLOURS.length];
      out += '<span class="umt-parade-tile is-' + colour + '" style="--row:' + ((index * 37) % 62 + 6) + '%;--size:' + (22 + (index * 11) % 18)
        + 'px;--speed:' + (11 + (index * 5) % 9) + 's;--delay:-' + ((index * 2.3) % 14).toFixed(1) + 's">' + letter + "</span>";
    }
    return out;
  }

  // A walker: its figure, two feet stepping in turn, and dust behind.
  function walker(kind, figure) {
    return '<span class="umt-parade-walker is-' + kind + '"><span class="umt-parade-body">' + figure + "</span>"
      + '<i class="umt-parade-foot is-back"></i><i class="umt-parade-foot is-front"></i>'
      + '<i class="umt-parade-dust"></i></span>';
  }
  function role(id) {
    return '<svg viewBox="0 0 120 120" aria-hidden="true"><use href="#' + id + '"></use></svg>';
  }

  function markup(game) {
    return '<div class="umt-parade" aria-hidden="true" data-umt-keep>'
      + landscapes(game)
      + '<div class="umt-parade-tiles">' + tiles() + "</div>"
      + '<div class="umt-parade-walkers">'
      + walker("setter", role("icon-role-secretkeeper"))
      + walker("cuddle", '<img src="cuddle/icons/cuddle-logo.svg" alt="" draggable="false">')
      + walker("guesser", role("icon-role-guesser"))
      + "</div></div>";
  }

  function sync() {
    var card = document.querySelector(".cuddle-win-overlay .cuddle-win-modal");
    if (!card || card.querySelector(":scope > .umt-parade")) return;
    var game = activeGame();
    if (!game || !game.state) return;
    card.insertAdjacentHTML("afterbegin", markup(game));
  }

  var pending = false;
  function schedule() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(function () { pending = false; sync(); });
  }
  function start() {
    var screen = document.getElementById("cuddleScreen") || document.body;
    new MutationObserver(schedule).observe(screen, { childList: true, subtree: true });
    schedule();
  }
  if (document.body) start();
  else document.addEventListener("DOMContentLoaded", start, { once: true });

  window.CuddleEndParade = Object.freeze({ sync: schedule });
}());
