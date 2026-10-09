/* Cuddle: never stuck without a legal word.
 *
 * A rule on a guess (Consonant Crunch's "at most one vowel", Perfect
 * Opener's five different letters...) can leave a hand that spells no
 * legal word at all. With a mulligan left the player can swap letters;
 * with none, nothing used to let them go on -- the stage simply hung.
 *
 * When that happens -- no mulligans (or Steady Hand still has them
 * locked) and no legal word in the hand -- the consonants are swapped for
 * new ones, free, up to three times a guess. If even that finds nothing,
 * the guess is passed (it counts as a used guess) so the stage can go on.
 */
(function () {
  "use strict";

  var Engine = window.CuddleEngine;
  var Game = Engine && Engine.CuddleGame;
  if (!Game || Game.prototype.__cuddleStuckGuard) return;
  Game.prototype.__cuddleStuckGuard = true;

  var MAX_SWAPS = 3;

  function activeGame() {
    try {
      return window.CuddleBranchMap && typeof window.CuddleBranchMap.getActiveGame === "function"
        ? window.CuddleBranchMap.getActiveGame()
        : null;
    } catch (_error) {
      return null;
    }
  }

  function canMulligan(game) {
    var state = game.state;
    if (Number(state.mulligansLeft) <= 0) return false;
    if (state.boss && state.boss.id === "noMulligans" && typeof game._steadyHandTurns === "function"
        && Number(state.guessesUsed || 0) < game._steadyHandTurns()) return false;
    return true;
  }

  function words(game) {
    if (game.guessSet && typeof game.guessSet.forEach === "function") return game.guessSet;
    return typeof game.getActiveWords === "function" ? game.getActiveWords() : [];
  }

  // Is there any word the hand can spell that the game would accept now?
  function hasLegalWord(game) {
    var state = game.state;
    var savedDraft = state.draft;
    var found = false;
    try {
      var hand = state.hand || [];
      var draftSet = new Set(state.draft || []);
      var cards = hand.filter(function free(card) { return game.isInfiniteCard(card) || !draftSet.has(card.id); });
      var list = words(game);
      var check = function check(word) {
        if (found) return;
        var upper = String(word).toUpperCase();
        if (upper.length !== 5 || !game.canBuildWord(upper, cards)) return;
        // Put the word in the draft and ask the game itself.
        var used = new Set();
        var ids = [];
        for (var index = 0; index < upper.length; index += 1) {
          var letter = upper[index];
          var card = hand.find(function match(item) { return item.glyph === letter && (game.isInfiniteCard(item) || !used.has(item.id)); });
          if (!card) return;
          used.add(card.id);
          ids.push(card.id);
        }
        state.draft = ids;
        var verdict = game.canSubmit();
        if (verdict && verdict.ok) found = true;
      };
      if (typeof list.forEach === "function") list.forEach(check);
    } catch (_error) {
      found = true; // When in doubt, leave the player alone.
    } finally {
      state.draft = savedDraft;
    }
    return found;
  }

  function stageKey(state) {
    return [state.runId || "", state.round || 0, state.secret || "", state.guessesUsed || 0].join(":");
  }

  var lastChecked = "";

  function check() {
    var game = activeGame();
    var state = game && game.state;
    if (!state || state.status !== "playing" || state.pendingRoundEnd || state.roundIntroPending) return;
    if (!document.getElementById("cuddleRoot") || canMulligan(game)) return;
    if (typeof game.canBuildWord !== "function" || typeof game.canSubmit !== "function") return;
    var hand = (state.hand || []).map(function id(card) { return card.id; }).sort().join(",");
    var key = stageKey(state) + "|" + hand;
    if (key === lastChecked) return;
    lastChecked = key;
    if (hasLegalWord(game)) return;

    var guard = state.umtStuckGuard && state.umtStuckGuard.key === stageKey(state) ? state.umtStuckGuard : { key: stageKey(state), swaps: 0 };
    state.umtStuckGuard = guard;
    if (guard.swaps < MAX_SWAPS && typeof game._discardCards === "function" && typeof game.drawCards === "function") {
      guard.swaps += 1;
      var draft = new Set(state.draft || []);
      var ids = (state.hand || []).filter(function swap(card) { return !game.isInfiniteCard(card) && !draft.has(card.id); })
        .map(function id(card) { return card.id; });
      state.draft = [];
      game._discardCards(ids);
      game.drawCards(ids.length);
      state.lastMessage = "No legal word could be made from your letters, so they were swapped for free.";
    } else if (typeof game.forfeitGuess === "function") {
      state.draft = [];
      game.forfeitGuess();
      state.lastMessage = ((state.lastMessage || "") + " No legal word was possible, so this guess was passed.").trim();
    }
    try { game.save(); } catch (_error) { /* next save */ }
    window.dispatchEvent(new CustomEvent("cuddle:campaign-update", { detail: { runId: state.runId } }));
  }

  var pending = false;
  function schedule() {
    if (pending) return;
    pending = true;
    setTimeout(function run() { pending = false; check(); }, 60);
  }

  function attach() {
    var root = document.getElementById("cuddleRoot");
    if (!root) {
      document.addEventListener("DOMContentLoaded", attach, { once: true });
      return;
    }
    new MutationObserver(schedule).observe(document.getElementById("cuddleScreen") || document.body, { childList: true, subtree: true });
    window.addEventListener("cuddle:campaign-update", schedule);
  }

  window.CuddleStuckGuard = Object.freeze({ check: check, hasLegalWord: hasLegalWord });
  attach();
}());
