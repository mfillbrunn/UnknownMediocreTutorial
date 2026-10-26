/* Cuddle: how common the answers are, by difficulty.
 *
 * The answer pool is narrowed to the more common words:
 *   - Standard: the most common half of the answer list;
 *   - Hard: the most common 85% (only the obscure tail is left out).
 * A Rare Word stage draws from the rare list (cuddle-rare-words.js, most
 * common first): its more familiar 60% on Standard, all of it on Hard.
 * The Tutorial keeps its own everyday words (cuddle-easy-mode.js).
 *
 * How common a word is comes from the server's frequency table
 * (/api/cuddle/secret-order, server/cuddle/wordFrequency.js): the answer
 * list sorted most common first. Until it arrives nothing is narrowed.
 * getActiveWords is narrowed (not just the pick), so the counters and
 * hints that read the pool agree with what can be drawn; the answer in
 * play always stays in it.
 */
(function () {
  "use strict";

  var Engine = window.CuddleEngine;
  var Game = Engine && Engine.CuddleGame;
  if (!Game || Game.prototype.__umtWordFrequency) return;
  var proto = Game.prototype;
  proto.__umtWordFrequency = true;

  // The share of each list (most common first) a difficulty draws from.
  var SECRET_SHARE = { medium: 0.5, hard: 0.85 };
  var RARE_SHARE = { medium: 0.6, hard: 1 };
  // Never narrow a pool below this many words (removed letters can thin it).
  var MIN_POOL = 40;

  var secretRank = null;
  var rareRank = null;

  function rareRanks() {
    if (rareRank) return rareRank;
    var list = Array.isArray(window.CuddleRareWords) ? window.CuddleRareWords : [];
    if (!list.length) return null;
    rareRank = new Map();
    list.forEach(function rank(word, index) { rareRank.set(word, index / list.length); });
    return rareRank;
  }

  try {
    fetch("/api/cuddle/secret-order")
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (order) {
        if (!Array.isArray(order) || !order.length) return;
        secretRank = new Map();
        order.forEach(function rank(word, index) { secretRank.set(String(word).toUpperCase(), index / order.length); });
      })
      .catch(function () { /* the pool stays as it is */ });
  } catch (_error) { /* no network */ }

  function difficultyOf(state) {
    return String((state && state.megaState && state.megaState.difficulty) || "").toLowerCase();
  }

  // Where a word sits (0 most common, 1 rarest) in its list, or null when
  // it isn't ranked (kept as it is).
  function placeOf(word) {
    var rare = rareRanks();
    if (rare && rare.has(word)) return { rare: true, at: rare.get(word) };
    if (secretRank && secretRank.has(word)) return { rare: false, at: secretRank.get(word) };
    return null;
  }

  // `words` narrowed to this run's difficulty.
  function narrow(game, words) {
    var difficulty = difficultyOf(game && game.state);
    if (!SECRET_SHARE[difficulty] || !Array.isArray(words) || !words.length) return words;
    var secret = String((game.state && game.state.secret) || "").toUpperCase();
    var kept = words.filter(function common(word) {
      if (word === secret) return true;
      var place = placeOf(word);
      if (!place) return true;
      return place.at < (place.rare ? RARE_SHARE : SECRET_SHARE)[difficulty];
    });
    if (kept.length >= Math.min(MIN_POOL, words.length)) return kept;
    // Too few left: the most common words that still fit.
    var sorted = words.slice().sort(function byPlace(a, b) {
      var pa = placeOf(a);
      var pb = placeOf(b);
      return (pa ? pa.at : 0) - (pb ? pb.at : 0);
    });
    var top = sorted.slice(0, Math.min(MIN_POOL, sorted.length));
    if (secret && words.indexOf(secret) !== -1 && top.indexOf(secret) === -1) top.push(secret);
    return top;
  }

  // (A Rare Word stage's pool comes from cuddle-rebalance-v5.js
  // rareWordPool, which narrows it here too.)
  var baseActive = proto.getActiveWords;
  if (typeof baseActive === "function") {
    proto.getActiveWords = function getActiveWordsByFrequency() {
      return narrow(this, baseActive.apply(this, arguments));
    };
  }

  window.CuddleWordFrequency = Object.freeze({
    ready: function ready() { return Boolean(secretRank); },
    narrow: narrow,
    SECRET_SHARE: SECRET_SHARE,
    RARE_SHARE: RARE_SHARE
  });
}());
