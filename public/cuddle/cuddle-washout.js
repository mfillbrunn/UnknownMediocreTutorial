/* Cuddle: washing out the hand.
 *
 * Tap the deck (or the ✕ on it) to wash out the hand: every consonant card
 * goes back, new ones are drawn, and you get 2 more mulligans. It costs a
 * guess: the board fills a row marked "Washed out", like a guess with no
 * word (the same as a Quick Mode guess that ran out of time). It's refused
 * when it would leave no guess to play. Vowels, Jokers and
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

  var WASH_MULLIGANS = 2;

  function num(value) {
    var parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function inDuel(state) {
    return String((state && state.runId) || "").indexOf(":duel:") !== -1;
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
    if (guessesLeft(this) < 2) return "It costs a guess, and this is your last one.";
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
    // The guess it costs: a row with no word. It pays nothing, but past the
    // quick-solve window it costs the late-guess penalty like any guess.
    var late = num(state.guessesUsed) + 1 > this._solveGuessThreshold();
    state.guessesUsed = num(state.guessesUsed) + 1;
    var penalty = late && typeof this._lateGuessPenalty === "function" ? Math.max(0, num(this._lateGuessPenalty(state.guessesUsed))) : 0;
    if (penalty) {
      state.score = num(state.score) - penalty;
      state.roundScore = num(state.roundScore) - penalty;
    }
    state.history.push({
      word: "",
      feedback: [],
      shownFeedback: [],
      timedOut: true,
      umtWashout: true,
      scoreDelta: 0,
      latePenalty: penalty,
      yellowCount: 0,
      greenCount: 0,
      greyCount: 0,
      usedCards: [],
      replacements: 0,
      infiniteUnlocked: [],
      questId: state.activeQuest ? state.activeQuest.id || null : null,
      questComplete: false,
      earlyBonus: 0
    });
    var gained = typeof this.mulliganGain === "function" ? this.mulliganGain(WASH_MULLIGANS) : WASH_MULLIGANS;
    state.mulligansLeft = num(state.mulligansLeft) + gained;
    var drawn = this.drawToHandLimit();
    state.lastMessage = "Washed out: new consonants, +" + gained + " mulligans." + (penalty ? " Late guess: -" + penalty + " points." : "");
    if (typeof this._ensureQuestForNextGuess === "function") this._ensureQuestForNextGuess();
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
    var host = document.getElementById("cuddleScreen") || document.body;
    host.insertAdjacentHTML("beforeend",
      '<div class="cuddle-overlay umt-washout-overlay" role="dialog" aria-modal="true" aria-labelledby="umtWashoutTitle">'
      + '<section class="cuddle-modal umt-washout-modal">'
      + '<h2 id="umtWashoutTitle">Wash out your hand?</h2>'
      + (blocked
        ? '<p class="umt-washout-text">' + blocked + "</p>"
          + '<div class="umt-washout-actions is-single"><button type="button" class="cuddle-btn" data-umt-washout="cancel">OK</button></div>'
        : '<p class="umt-washout-text">New consonants and +' + WASH_MULLIGANS + " mulligans.</p>"
          + '<p class="umt-washout-cost">Costs a guess.</p>'
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
