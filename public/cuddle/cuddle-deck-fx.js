/* Cuddle: the tile deck and its animations.
 *
 * The hand panel shows a small deck (with how many tiles are left in it)
 * beside Mulligan. Tiles fly out of it into the hand: the whole hand at
 * the start of a stage, then each newly drawn tile after a guess. A
 * mulligan shuffles the deck first, then deals the replacements.
 *
 * Every render rebuilds #cuddleRoot, so this watches the DOM instead of
 * hooking a renderer: a card button carries data-fx-glyph / data-fx-count,
 * and the deck carries data-deck-key (one value per stage). A glyph whose
 * count went up since the last render is a freshly drawn tile. Flights
 * are timed against the clock, so a re-render mid-flight resumes it
 * (negative delay) rather than restarting or dropping it.
 */
(function () {
  "use strict";

  if (window.CuddleDeckFx) return;

  var FLY_MS = 480;
  var STAGGER_MS = 55;
  var SHUFFLE_MS = 560;

  var fx = { key: "", counts: null, flights: {}, shuffleAt: 0 };
  var animated = typeof WeakSet === "function" ? new WeakSet() : null;

  function now() {
    return typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
  }

  function reducedMotion() {
    try {
      return Boolean(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    } catch (_error) {
      return false;
    }
  }

  function centre(element) {
    var box = element.getBoundingClientRect();
    return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
  }

  function once(element) {
    if (!animated) return true;
    if (animated.has(element)) return false;
    animated.add(element);
    return true;
  }

  function flyIn(button, deck, start, at) {
    var elapsed = at - start;
    if (elapsed >= FLY_MS || typeof button.animate !== "function" || !once(button)) return;
    var from = centre(deck);
    var to = centre(button);
    var dx = Math.round(from.x - to.x);
    var dy = Math.round(from.y - to.y);
    button.animate([
      { transform: "translate(" + dx + "px, " + dy + "px) scale(0.42) rotate(-12deg)", opacity: 0 },
      { opacity: 1, offset: 0.18 },
      { transform: "translate(0, 0) scale(1.06) rotate(0deg)", offset: 0.82 },
      { transform: "none", opacity: 1 }
    ], {
      duration: FLY_MS,
      delay: -elapsed,
      easing: "cubic-bezier(.2,.75,.25,1)",
      fill: "backwards"
    });
  }

  function shuffle(deck, at) {
    var elapsed = at - fx.shuffleAt;
    if (!fx.shuffleAt || elapsed >= SHUFFLE_MS || !once(deck)) return;
    var cards = deck.querySelectorAll(".cuddle-deck-card");
    [].forEach.call(cards, function swing(card, index) {
      if (typeof card.animate !== "function") return;
      var side = index % 2 === 0 ? -1 : 1;
      card.animate([
        { transform: "none" },
        { transform: "translateX(" + (side * 11) + "px) rotate(" + (side * 12) + "deg)", offset: 0.25 },
        { transform: "translateX(" + (-side * 7) + "px) rotate(" + (-side * 6) + "deg)", offset: 0.55 },
        { transform: "translateX(" + (side * 4) + "px) rotate(" + (side * 3) + "deg)", offset: 0.8 },
        { transform: "none" }
      ], { duration: SHUFFLE_MS, delay: -elapsed, easing: "ease-in-out" });
    });
  }

  // A soft bump on the deck while it deals, so the tiles read as coming
  // out of it.
  function deal(deck, at, until) {
    if (until <= at || typeof deck.animate !== "function" || !once(deck)) return;
    deck.animate([
      { transform: "none" },
      { transform: "translateY(-2px) scale(1.06)" },
      { transform: "none" }
    ], { duration: 240, iterations: Math.max(1, Math.ceil((until - at) / 240)), easing: "ease-in-out" });
  }

  function scan(root) {
    var deck = root.querySelector("[data-deck-key]");
    if (!deck) return;
    var buttons = [].slice.call(root.querySelectorAll("[data-fx-glyph][data-fx-count]"));
    // No hand on screen (an overlay, the Preset Trial pick): keep what
    // was last seen, so the hand coming back doesn't read as new tiles.
    if (!buttons.length) return;
    var at = now();
    var counts = {};
    buttons.forEach(function count(button) {
      counts[button.dataset.fxGlyph] = Number(button.dataset.fxCount) || 0;
    });
    var key = deck.dataset.deckKey;
    if (key !== fx.key || !fx.counts) {
      // A new stage: the whole hand is dealt out of the deck.
      fx.key = key;
      fx.flights = {};
      fx.shuffleAt = 0;
      buttons.forEach(function stagger(button, index) {
        fx.flights[button.dataset.fxGlyph] = at + index * STAGGER_MS;
      });
    } else {
      var shuffling = fx.shuffleAt && at - fx.shuffleAt < SHUFFLE_MS;
      var base = shuffling ? fx.shuffleAt + SHUFFLE_MS * 0.7 : at;
      var order = 0;
      Object.keys(counts).forEach(function drawn(glyph) {
        if (counts[glyph] > (fx.counts[glyph] || 0) && !(fx.flights[glyph] > at - FLY_MS)) {
          fx.flights[glyph] = base + order * STAGGER_MS;
          order += 1;
        }
      });
    }
    fx.counts = counts;
    if (reducedMotion()) return;
    var last = 0;
    buttons.forEach(function fly(button) {
      var glyph = button.dataset.fxGlyph;
      var start = fx.flights[glyph];
      if (start == null) return;
      if (at - start >= FLY_MS) {
        delete fx.flights[glyph];
        return;
      }
      last = Math.max(last, start + FLY_MS);
      flyIn(button, deck, start, at);
    });
    shuffle(deck, at);
    if (!fx.shuffleAt || at - fx.shuffleAt >= SHUFFLE_MS) deal(deck, at, last - FLY_MS * 0.6);
  }

  function attach() {
    var root = document.getElementById("cuddleRoot");
    if (!root) {
      document.addEventListener("DOMContentLoaded", attach, { once: true });
      return;
    }
    if (root.__cuddleDeckFx) return;
    root.__cuddleDeckFx = true;
    var observer = new MutationObserver(function changed() { scan(root); });
    observer.observe(root, { childList: true, subtree: true });
    scan(root);
  }

  // The deck tile stack, shared by the stage hand and the Duel hand.
  function deckHtml(count, key) {
    var left = Math.max(0, Number(count) || 0);
    var label = left + " tile" + (left === 1 ? "" : "s") + " left in the deck";
    return '<div class="cuddle-deck' + (left ? "" : " is-empty") + '" data-deck-key="' + String(key).replace(/[^\w:.-]/g, "") + '" role="img" aria-label="' + label + '" title="' + label + '">'
      + '<span class="cuddle-deck-card"></span><span class="cuddle-deck-card"></span><span class="cuddle-deck-card"></span>'
      + '<b class="cuddle-deck-count">' + left + "</b></div>";
  }

  window.CuddleDeckFx = Object.freeze({
    deckHtml: deckHtml,
    // Called when a mulligan is confirmed: the next render shuffles the
    // deck, then deals the replacements.
    shuffle: function markShuffle() { fx.shuffleAt = now(); }
  });

  attach();
}());
