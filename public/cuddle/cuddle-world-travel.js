/* Cuddle: the road from one world to the next.
 *
 * After a boss falls, the first time the player stands on the new world's
 * map, a short scene plays before the world's intro (cuddle-world-intro.js
 * waits for it): the old world's landscape slides away, a little traveller
 * (the Guesser) walks along the road, and the new world's landscape comes in with its
 * name. Each landscape is drawn from its world's own colours and scenery
 * (cuddle-worlds.js themes), so every crossing looks different. The
 * victory music carries on through it (or plays again if it had ended).
 * A tap skips it. Played crossings are kept on the run
 * (state.umtWorldTravel), so a reload doesn't replay them.
 */
(function () {
  "use strict";

  if (window.CuddleWorldTravel) return;

  var DURATION = 5200;

  // The Guesser from multiplayer (index.html's #icon-role-guesser) seen
  // from the side, facing right: his glasses, hair and hoodie, with legs
  // and arms that swing in turn (cuddle-world-travel.css).
  var INK = "#241a30";
  var SKIN = "#f4ede0";
  function limb(kind, side, d, fill, extra, stroke) {
    return '<g class="umt-wt-' + kind + " is-" + side + '"><path d="' + d + '" fill="' + fill + '"'
      + (stroke ? ' stroke="' + stroke + '" stroke-width="2.5"' : "") + "/>" + (extra || "") + "</g>";
  }
  var LEG = "M53 112h13l-1 30h-11z";
  var SHOE = '<path d="M51 140h16c6 0 10 3 10 7H51z" fill="' + INK + '"/>';
  var ARM = "M56 86c4-2 9-1 10 3l-3 25c-1 4-8 4-9 0z";
  var HAND = '<circle cx="59" cy="116" r="5" fill="' + SKIN + '"/>';
  var GUESSER_SIDE = '<svg class="umt-wt-guesser" viewBox="0 0 120 160">'
    + limb("leg", "back", LEG, "#2f3a66", SHOE)
    + limb("arm", "back", ARM, "#5a9fd6", HAND)
    + '<g class="umt-wt-torso">'
    // Hoodie
    + '<path d="M40 92c0-12 9-20 21-20s21 8 21 20v22c0 4-3 6-7 6H47c-4 0-7-2-7-6z" fill="#7cc8ff"/>'
    + '<path d="M44 82c4-6 10-9 17-9" stroke="#5a9fd6" stroke-width="4" fill="none" stroke-linecap="round"/>'
    // Head
    + '<circle cx="62" cy="46" r="29" fill="' + SKIN + '"/>'
    + '<path d="M89 49c3 1 4 4 1 6l-3 1z" fill="' + SKIN + '"/>'
    // Hair: over the top and down the back
    + '<path d="M34 50c-3-22 10-37 30-37 15 0 25 7 27 19-9 2-18-1-24-8-6 8-16 13-27 14 0 5-1 9-3 12z" fill="' + INK + '"/>'
    // Ear
    + '<circle cx="50" cy="52" r="6" fill="' + SKIN + '" stroke="' + INK + '" stroke-width="2"/>'
    // Glasses: the near lens and its arm back to the ear
    + '<path d="M54 47H72" stroke="' + INK + '" stroke-width="4" stroke-linecap="round"/>'
    + '<circle cx="80" cy="47" r="10" fill="' + SKIN + '" stroke="' + INK + '" stroke-width="5"/>'
    + '<circle cx="84" cy="48" r="3.5" fill="' + INK + '"/>'
    // Smile
    + '<path d="M74 64q6 4 11-1" stroke="' + INK + '" stroke-width="3" fill="none" stroke-linecap="round"/>'
    + "</g>"
    + limb("leg", "front", LEG, "#3b4a7a", SHOE)
    + limb("arm", "front", ARM, "#7cc8ff", HAND, "#3f86c2")
    + "</svg>";

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function worldAt(game, index) {
    var Worlds = window.CuddleWorlds;
    try {
      return Worlds && typeof Worlds.themedWorld === "function" ? Worlds.themedWorld(game.state.branchMap, index) : null;
    } catch (_error) {
      return null;
    }
  }

  // One landscape, 400 x 240: sky, its scenery, the ground with the road.
  function scenery(decor, accent, glow) {
    var a = esc(accent || "#ffffff");
    var g = esc(glow || a);
    var out = "";
    var i;
    switch (decor) {
      case "meadow":
        out += '<ellipse cx="90" cy="200" rx="160" ry="60" fill="' + g + '" opacity=".35"/><ellipse cx="320" cy="205" rx="170" ry="55" fill="' + g + '" opacity=".28"/>';
        for (i = 0; i < 14; i += 1) out += '<circle cx="' + (20 + i * 28) + '" cy="' + (176 + (i % 3) * 6) + '" r="4" fill="' + a + '"/>';
        break;
      case "marsh":
        out += '<rect x="0" y="178" width="400" height="30" fill="' + g + '" opacity=".25"/>';
        for (i = 0; i < 16; i += 1) out += '<path d="M' + (12 + i * 25) + ' 190 q4 -' + (34 + (i % 4) * 9) + ' 2 -' + (50 + (i % 3) * 12) + '" stroke="' + a + '" stroke-width="3" fill="none" opacity=".75"/>';
        out += '<ellipse cx="200" cy="120" rx="190" ry="18" fill="#ffffff" opacity=".07"/>';
        break;
      case "caverns":
        for (i = 0; i < 9; i += 1) {
          var cx = 22 + i * 45;
          var h = 50 + (i % 3) * 28;
          out += '<path d="M' + (cx - 14) + ' 196 L' + cx + ' ' + (196 - h) + ' L' + (cx + 14) + ' 196 Z" fill="' + (i % 2 ? a : g) + '" opacity=".7"/>';
        }
        for (i = 0; i < 7; i += 1) out += '<path d="M' + (30 + i * 58) + ' 0 L' + (40 + i * 58) + ' ' + (26 + (i % 2) * 18) + ' L' + (50 + i * 58) + ' 0 Z" fill="' + g + '" opacity=".45"/>';
        break;
      case "frost":
      case "glacier":
        out += '<path d="M0 196 L70 92 L120 150 L190 64 L260 140 L320 86 L400 170 L400 196 Z" fill="' + g + '" opacity=".45"/>';
        out += '<path d="M190 64 L172 92 L208 92 Z M70 92 L56 112 L84 112 Z M320 86 L306 106 L334 106 Z" fill="#ffffff" opacity=".9"/>';
        if (decor === "glacier") for (i = 0; i < 6; i += 1) out += '<path d="M' + (20 + i * 68) + ' 196 l14 -40 l22 8 l10 32 Z" fill="' + a + '" opacity=".55"/>';
        for (i = 0; i < 18; i += 1) out += '<circle cx="' + ((i * 53) % 400) + '" cy="' + ((i * 37) % 150 + 10) + '" r="2" fill="#ffffff" opacity=".7"/>';
        break;
      case "library":
        for (i = 0; i < 26; i += 1) {
          var bh = 40 + (i * 13) % 50;
          out += '<rect x="' + (6 + i * 15) + '" y="' + (196 - bh) + '" width="12" height="' + bh + '" rx="2" fill="' + (i % 3 === 0 ? a : g) + '" opacity="' + (i % 2 ? ".55" : ".75") + '"/>';
        }
        out += '<rect x="0" y="120" width="400" height="5" fill="' + a + '" opacity=".35"/>';
        break;
      case "tides":
        for (i = 0; i < 3; i += 1) out += '<path d="M0 ' + (150 + i * 16) + ' q25 -12 50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0" stroke="' + (i === 1 ? a : g) + '" stroke-width="4" fill="none" opacity=".7"/>';
        for (i = 0; i < 10; i += 1) out += '<circle cx="' + (30 + i * 38) + '" cy="' + (60 + (i * 29) % 70) + '" r="' + (3 + i % 3) + '" fill="none" stroke="' + a + '" stroke-width="2" opacity=".6"/>';
        break;
      case "citadel":
        for (i = 0; i < 5; i += 1) {
          var tx = 20 + i * 80;
          var th = 70 + (i % 2) * 40;
          out += '<rect x="' + tx + '" y="' + (196 - th) + '" width="44" height="' + th + '" fill="' + g + '" opacity=".55"/>';
          out += '<path d="M' + tx + ' ' + (196 - th) + ' h8 v-10 h8 v10 h12 v-10 h8 v10 h8" fill="' + g + '" opacity=".55"/>';
          out += '<rect x="' + (tx + 18) + '" y="' + (206 - th) + '" width="8" height="14" rx="4" fill="' + a + '"/>';
        }
        out += '<circle cx="320" cy="50" r="24" fill="' + a + '" opacity=".8"/><circle cx="330" cy="46" r="22" fill="#000000" opacity=".55"/>';
        break;
      case "storm":
        out += '<path d="M200 196 L180 196 L196 40 L204 40 L220 196 Z" fill="' + g + '" opacity=".6"/>';
        out += '<path d="M120 20 L100 70 L118 70 L96 120 L140 62 L120 62 L138 20 Z" fill="' + a + '"/>';
        out += '<ellipse cx="90" cy="24" rx="90" ry="20" fill="' + g + '" opacity=".35"/><ellipse cx="310" cy="30" rx="110" ry="22" fill="' + g + '" opacity=".3"/>';
        break;
      case "forge":
        out += '<rect x="290" y="70" width="34" height="126" fill="' + g + '" opacity=".55"/><rect x="60" y="150" width="90" height="16" rx="4" fill="' + g + '" opacity=".7"/><rect x="88" y="166" width="34" height="30" fill="' + g + '" opacity=".7"/>';
        for (i = 0; i < 14; i += 1) out += '<circle cx="' + (290 + (i * 17) % 40) + '" cy="' + (60 - (i * 9) % 50) + '" r="3" fill="' + a + '" opacity=".85"/>';
        out += '<path d="M180 196 q10 -40 20 -10 q10 -50 20 0 q10 -30 18 10 Z" fill="' + a + '" opacity=".8"/>';
        break;
      default: // woods
        for (i = 0; i < 11; i += 1) {
          var px = 10 + i * 38;
          var ph = 70 + (i % 3) * 22;
          out += '<path d="M' + (px - 18) + ' 196 L' + px + ' ' + (196 - ph) + ' L' + (px + 18) + ' 196 Z" fill="' + (i % 2 ? g : a) + '" opacity="' + (i % 2 ? ".45" : ".6") + '"/>';
        }
        for (i = 0; i < 6; i += 1) out += '<circle cx="' + (40 + i * 66) + '" cy="' + (50 + (i * 23) % 50) + '" r="2.5" fill="' + a + '" opacity=".8"/>';
    }
    return out;
  }

  function scene(world, side) {
    var top = esc(world.skyTop || "#1f1a2c");
    var bottom = esc(world.skyBottom || "#120e17");
    // The sky fills the screen; the landscape is a band along the bottom.
    return '<div class="umt-wt-scene umt-wt-scene-' + side + '" style="--wt-glow:' + esc(world.glow || world.accent || "#ffffff") + ';background:linear-gradient(180deg,' + top + "," + bottom + ')">'
      + '<svg viewBox="0 0 400 240" preserveAspectRatio="xMidYMax slice" aria-hidden="true">'
      + scenery(world.decor || world.id, world.accent, world.glow)
      + '<rect x="0" y="196" width="400" height="44" fill="#000000" opacity=".35"/>'
      + '<path d="M0 214 H400" stroke="' + esc(world.accent || "#ffffff") + '" stroke-width="3" stroke-dasharray="10 12" opacity=".6"/>'
      + "</svg></div>";
  }

  function record(state) {
    if (!state.umtWorldTravel || typeof state.umtWorldTravel !== "object" || !Array.isArray(state.umtWorldTravel.seen)) state.umtWorldTravel = { seen: [] };
    return state.umtWorldTravel;
  }

  // Whether the crossing into world `index` still has to play.
  function pending(game, index) {
    var state = game && game.state;
    if (!state || index < 1 || String(state.runId || "").indexOf(":duel:") !== -1) return false;
    return record(state).seen.indexOf(index) === -1;
  }

  function finish(game, index) {
    var layer = document.querySelector(".umt-world-travel");
    if (layer) layer.remove();
    if (game && game.state) {
      var seen = record(game.state).seen;
      if (seen.indexOf(index) === -1) seen.push(index);
      try { game.save(); } catch (_error) { /* next save */ }
    }
    if (window.CuddleWorldIntro) window.CuddleWorldIntro.sync();
  }

  function play(game, index) {
    if (document.querySelector(".umt-world-travel")) return true;
    var from = worldAt(game, index - 1);
    var to = worldAt(game, index);
    if (!from || !to) return false;
    var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var layer = document.createElement("div");
    layer.className = "umt-world-travel" + (reduced ? " is-still" : "");
    layer.setAttribute("role", "dialog");
    layer.setAttribute("aria-label", "On to World " + (index + 1) + ": " + to.name);
    layer.style.setProperty("--wt-from", from.accent || "#ffffff");
    layer.style.setProperty("--wt-to", to.accent || "#ffffff");
    layer.innerHTML = '<div class="umt-wt-strip">' + scene(from, "a") + scene(to, "b") + "</div>"
      + '<div class="umt-wt-traveller" aria-hidden="true">' + GUESSER_SIDE + "</div>"
      + '<div class="umt-wt-text">'
      + '<p class="umt-wt-from"><span>World ' + index + " cleared</span><b>" + esc(from.name) + "</b></p>"
      + '<p class="umt-wt-to"><span>World ' + (index + 1) + "</span><b>" + esc(to.name) + "</b>"
      + (to.tagline ? "<i>" + esc(to.tagline) + "</i>" : "") + "</p>"
      + "</div>"
      + '<button type="button" class="umt-wt-skip">Tap to continue</button>';
    (document.getElementById("cuddleScreen") || document.body).appendChild(layer);
    // The victory music goes on (or starts again) over the crossing.
    var audio = window.CuddleAudio;
    if (audio && typeof audio.moment === "function") audio.moment("victory");
    var done = false;
    var end = function () {
      if (done) return;
      done = true;
      finish(game, index);
    };
    var started = Date.now();
    layer.addEventListener("click", function () {
      if (Date.now() - started > 700) end();
    });
    setTimeout(end, reduced ? 3200 : DURATION);
    return true;
  }

  window.CuddleWorldTravel = Object.freeze({
    pending: pending,
    play: play,
    // A world's landscape (sky and scenery), for other scenes to reuse
    // (cuddle-end-parade.js).
    scene: scene,
    worldAt: worldAt,
    active: function () { return Boolean(document.querySelector(".umt-world-travel")); }
  });
}());
