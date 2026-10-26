/* Cuddle: washing out the hand.
 *
 * Tap the deck beside Mulligan to wash out the hand: every consonant card
 * goes back and new ones are drawn, mulligans or not. It costs a guess:
 *   - an ordinary stage counts one guess further along, so its quick-solve
 *     window (and the late-guess penalties past it) comes a guess sooner;
 *   - a boss fight or a strict stage loses one of its guesses.
 * It's refused when it would leave no guess to play. Vowels, Jokers and
 * special cards (lucky, idea, dead, angel) stay in the hand. Duels keep
 * their own deck and aren't washed.
 */
(function () {
  "use strict";

  var Engine = window.CuddleEngine;
  var Game = Engine && Engine.CuddleGame;
  if (!Game || Game.prototype.__umtWashout) return;
  var proto = Game.prototype;
  proto.__umtWashout = true;

  function num(value) {
    var parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function stageToken(state) {
    return [state.runId || "", state.round || 0, state.secret || ""].join(":");
  }

  // This stage's washes: { token, used }.
  function washesUsed(state) {
    var record = state && state.umtWashout;
    return record && record.token === stageToken(state) ? num(record.used) : 0;
  }

  function inDuel(state) {
    return String((state && state.runId) || "").indexOf(":duel:") !== -1;
  }

  // An ordinary stage's window comes a guess sooner for each wash.
  var baseThreshold = proto._solveGuessThreshold;
  if (typeof baseThreshold === "function") {
    proto._solveGuessThreshold = function solveGuessThresholdAfterWashout() {
      var value = baseThreshold.apply(this, arguments);
      return Math.max(1, value - washesUsed(this.state));
    };
  }

  // The consonant letter cards a wash sends back.
  function washable(game) {
    var hand = (game.state && game.state.hand) || [];
    var joker = Engine.CUDDLE_JOKER_GLYPH;
    return hand.filter(function consonant(card) {
      if (!card || !/^[A-Z]$/.test(String(card.glyph || ""))) return false;
      if (game.isVowelGlyph(card.glyph) || game.isInfiniteCard(card)) return false;
      return card.glyph !== joker && card.source !== "joker";
    });
  }

  // Guesses left to play, or Infinity on an ordinary stage.
  function guessesLeft(game) {
    var limit = typeof game._hardGuessLimit === "function" ? game._hardGuessLimit() : Infinity;
    return Number.isFinite(limit) ? limit - num(game.state.guessesUsed) : Infinity;
  }

  // Why a wash isn't possible now, or "".
  proto.washoutBlocked = function washoutBlocked() {
    var state = this.state;
    if (!state || state.status !== "playing") return "You can only wash out your hand during a stage.";
    if (inDuel(state)) return "Duels keep their own deck.";
    if (typeof this.presetPick === "function" && this.presetPick()) return "Pick the answer first.";
    if (!washable(this).length) return "There are no consonants in your hand to wash out.";
    if (guessesLeft(this) < 2) return "Washing out costs a guess, and this is your last one.";
    return "";
  };

  proto.washoutCount = function washoutCount() {
    return washable(this).length;
  };

  proto.washOutHand = function washOutHand() {
    var blocked = this.washoutBlocked();
    if (blocked) return { ok: false, error: blocked };
    var state = this.state;
    var cards = washable(this);
    state.draft = [];
    this._discardCards(cards.map(function id(card) { return card.id; }));
    // The guess it costs.
    var token = stageToken(state);
    state.umtWashout = { token: token, used: washesUsed(state) + 1 };
    var strict = (typeof this.isBossRound === "function" && this.isBossRound()) || state.strictGuessLimit;
    if (strict && !state.strictGuessLimit) state.maxGuesses = Math.max(1, num(state.maxGuesses) - 1);
    if (state.strictGuessLimit) state.maxGuesses = this._solveGuessThreshold();
    var drawn = this.drawToHandLimit();
    state.lastMessage = "Washed out " + cards.length + " consonant" + (cards.length === 1 ? "" : "s")
      + (strict ? ": one guess fewer this stage." : ": this stage counts one guess further along.");
    if (window.CuddleDeckFx && typeof window.CuddleDeckFx.shuffle === "function") window.CuddleDeckFx.shuffle();
    if (typeof this.save === "function") this.save();
    return { ok: true, washed: cards.length, drawn: Array.isArray(drawn) ? drawn.length : 0 };
  };

  // -- the deck asks first --------------------------------------------------------
  function activeGame() {
    try {
      return window.CuddleBranchMap && typeof window.CuddleBranchMap.getActiveGame === "function"
        ? window.CuddleBranchMap.getActiveGame() : null;
    } catch (_error) {
      return null;
    }
  }

  function closeAsk() {
    document.querySelectorAll(".umt-washout-overlay").forEach(function (el) { el.remove(); });
  }

  function ask(game) {
    closeAsk();
    var blocked = game.washoutBlocked();
    var strict = (typeof game.isBossRound === "function" && game.isBossRound()) || game.state.strictGuessLimit;
    var count = game.washoutCount();
    var cost = strict
      ? "It costs a guess: you'll have one guess fewer this stage."
      : "It costs a guess: this stage counts one guess further along, so the quick-solve window comes a guess sooner.";
    var host = document.getElementById("cuddleScreen") || document.body;
    host.insertAdjacentHTML("beforeend",
      '<div class="cuddle-overlay umt-washout-overlay" role="dialog" aria-modal="true" aria-labelledby="umtWashoutTitle">'
      + '<section class="cuddle-modal umt-washout-modal">'
      + '<h2 id="umtWashoutTitle">Wash out your hand?</h2>'
      + (blocked
        ? '<p class="umt-washout-text">' + blocked + "</p>"
          + '<div class="umt-washout-actions is-single"><button type="button" class="cuddle-btn" data-umt-washout="cancel">OK</button></div>'
        : '<p class="umt-washout-text">All ' + count + " consonant" + (count === 1 ? "" : "s") + " in your hand go back and you draw new ones, even without a mulligan. Vowels and special cards stay.</p>"
          + '<p class="umt-washout-cost">' + cost + "</p>"
          + '<div class="umt-washout-actions"><button type="button" class="cuddle-btn" data-umt-washout="cancel">Keep my hand</button>'
          + '<button type="button" class="cuddle-btn cuddle-btn-primary" data-umt-washout="go">Wash out</button></div>')
      + "</section></div>");
  }

  document.addEventListener("click", function onWashout(event) {
    var target = event.target && event.target.closest ? event.target : null;
    if (!target) return;
    var choice = target.closest("[data-umt-washout]");
    if (choice) {
      event.preventDefault();
      var game = activeGame();
      closeAsk();
      if (choice.getAttribute("data-umt-washout") === "go" && game) {
        var result = game.washOutHand();
        if (result && result.ok) window.dispatchEvent(new CustomEvent("cuddle:campaign-update", { detail: { runId: game.state.runId } }));
      }
      return;
    }
    if (target.classList.contains("umt-washout-overlay")) { closeAsk(); return; }
    // The play screen's deck (a Duel's board has its own).
    var deck = target.closest("#cuddleScreen .cuddle-hand-panel .cuddle-deck");
    if (!deck || deck.closest(".umt-duel-board, .umt-duel-hand")) return;
    var current = activeGame();
    if (!current || !current.state || current.state.status !== "playing") return;
    event.preventDefault();
    ask(current);
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") closeAsk();
  });

  // A small ✕ floating on the deck's corner (the Fish Hook takes the other)
  // opens the same question.
  function placeButton() {
    var game = activeGame();
    var row = document.querySelector("#cuddleScreen .cuddle-hand-panel .cuddle-submit-row.has-deck");
    if (row && row.closest("[class*='umt-duel']")) row = null;
    var existing = document.querySelector("#cuddleScreen .umt-washout-btn");
    var show = Boolean(row && game && game.state && game.state.status === "playing" && !inDuel(game.state))
      && !row.classList.contains("is-mulligan-mode");
    if (!show) {
      if (existing) existing.remove();
      return;
    }
    if (existing && existing.parentNode === row) return;
    if (existing) existing.remove();
    row.insertAdjacentHTML("beforeend", '<button type="button" class="umt-washout-btn" data-umt-washout-open aria-label="Wash out your hand (costs a guess)" title="Wash out your hand (costs a guess)">✕</button>');
  }

  document.addEventListener("click", function onWashoutButton(event) {
    var button = event.target && event.target.closest && event.target.closest("[data-umt-washout-open]");
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    var game = activeGame();
    if (game && game.state) ask(game);
  }, true);

  (function attach() {
    var host = document.getElementById("cuddleScreen");
    if (!host) {
      document.addEventListener("DOMContentLoaded", attach, { once: true });
      return;
    }
    var pending = false;
    new MutationObserver(function schedule() {
      if (pending) return;
      pending = true;
      requestAnimationFrame(function run() { pending = false; placeButton(); });
    }).observe(host, { childList: true, subtree: true });
    placeButton();
  }());
}());
