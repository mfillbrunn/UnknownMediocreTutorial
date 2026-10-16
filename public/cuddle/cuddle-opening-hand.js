/* Cuddle: how a stage's opening hand draws its consonants.
 *
 * The consonants are split into two buckets: the rare ones (Q, X, Z, J)
 * and the common rest. Counting the opening hand's consonants in order:
 *   1st-3rd   always common
 *   4th-5th   rare 1 time in 10
 *   6th-7th   rare 1 time in 5
 *   later     whatever comes next in the deck
 * Draws later in the stage are the deck's usual order.
 *
 * Runs after every other layer has dealt the hand (cuddle-burdens.js
 * shuffles special cards in and deals again), and only re-deals the plain
 * consonant cards: special cards (lucky, idea, wave, dead, Joker) stay
 * where they landed, and the deck keeps its special cards in place.
 */
(function () {
  "use strict";

  var Engine = window.CuddleEngine;
  var Game = Engine && Engine.CuddleGame;
  if (!Game || Game.prototype.__cuddleOpeningHand) return;
  var proto = Game.prototype;
  proto.__cuddleOpeningHand = true;

  var RARE = new Set(["Q", "X", "Z", "J"]);
  var VOWELS = "AEIOU";
  // The chance each opening consonant slot is drawn from the rare bucket.
  var RARE_CHANCE = [0, 0, 0, 0.1, 0.1, 0.2, 0.2];

  function inDuel(state) {
    return String((state && state.runId) || "").indexOf(":duel:") !== -1;
  }

  function randomOf(game) {
    return typeof game.random === "function" ? game.random : Math.random;
  }

  function plainConsonant(game, card) {
    if (!card || card.source !== "deck") return false;
    if (card.dead || card.lucky || card.idea || card.wave || card.jokerTile) return false;
    var glyph = String(card.glyph || "");
    if (!/^[A-Z]$/.test(glyph) || VOWELS.indexOf(glyph) !== -1) return false;
    return !(typeof game.isInfiniteCard === "function" && game.isInfiniteCard(card));
  }

  function shuffled(list, random) {
    var copy = list.slice();
    for (var i = copy.length - 1; i > 0; i -= 1) {
      var j = Math.floor(random() * (i + 1));
      var held = copy[i];
      copy[i] = copy[j];
      copy[j] = held;
    }
    return copy;
  }

  function dealByBuckets(game) {
    var state = game.state;
    if (!state || inDuel(state) || !Array.isArray(state.hand) || !Array.isArray(state.deck)) return;
    var slots = [];
    state.hand.forEach(function slot(card, index) {
      if (plainConsonant(game, card)) slots.push(index);
    });
    if (!slots.length) return;
    var random = randomOf(game);
    // Every plain consonant in hand and deck, in a fresh random order.
    var pool = shuffled(slots.map(function card(index) { return state.hand[index]; })
      .concat(state.deck.filter(function plain(card) { return plainConsonant(game, card); })), random);
    slots.forEach(function deal(handIndex, n) {
      var chance = RARE_CHANCE[n];
      var at = 0;
      if (chance !== undefined) {
        var wantRare = random() < chance;
        at = pool.findIndex(function inBucket(card) { return RARE.has(card.glyph) === wantRare; });
        // That bucket is empty (culled letters, say): take the other.
        if (at < 0) at = 0;
      }
      state.hand[handIndex] = pool.splice(at, 1)[0];
    });
    // The rest go back into the deck's consonant places, in their new order.
    var next = 0;
    state.deck = state.deck.map(function refill(card) {
      return plainConsonant(game, card) ? pool[next++] : card;
    });
  }

  var basePrepare = proto._prepareInitialHand;
  proto._prepareInitialHand = function prepareInitialHandByBuckets() {
    var result = basePrepare.apply(this, arguments);
    try {
      dealByBuckets(this);
    } catch (error) {
      console.warn("Cuddle opening hand: bucket deal failed.", error);
    }
    return result;
  };

  window.CuddleOpeningHand = Object.freeze({ RARE: Array.from(RARE), RARE_CHANCE: RARE_CHANCE.slice() });
}());
