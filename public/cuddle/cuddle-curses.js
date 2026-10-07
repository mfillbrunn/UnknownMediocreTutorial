/* Cuddle: the Preset Trial curse.
 *
 * Beating the Preset Trial boss leaves a curse on one guess (3rd to 5th)
 * of every later stage. That guess is the stage's last: instead of
 * building a word from tiles, the player picks the answer from a short
 * list -- as many words as the guess number (3 on guess 3, 4 on guess 4,
 * 5 on guess 5). A right pick solves the stage; a wrong one is out of
 * guesses, the same as missing a strict stage's limit.
 *
 * The other words are real answers that the feedback so far rules out,
 * closest first, so careful reading of the board always finds the
 * answer. Loaded after every other layer so its canSubmit wrapper is the
 * outermost one.
 */
(function () {
  "use strict";

  var Engine = window.CuddleEngine;
  if (!Engine || !Engine.CuddleGame) return;
  var proto = Engine.CuddleGame.prototype;
  if (proto.__cuddleCurses) return;
  proto.__cuddleCurses = true;

  var PRESET_ID = "presetWordsTrial";
  var MIN_WORDS = 3;
  var MAX_WORDS = 6;
  var LOOKAHEAD = 12;

  function inDuel(state) {
    return String((state && state.runId) || "").indexOf(":duel:") !== -1;
  }

  function megaOf(state) {
    if (!state.megaState || typeof state.megaState !== "object") state.megaState = {};
    return state.megaState;
  }

  function stageKey(state) {
    return [state.runId || "run", state.round || 0, state.secret || ""].join(":");
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

  // How many tiles of the board so far `word` disagrees with, were it the
  // answer. Only colours the player was really shown count: a tile a boss,
  // challenge or curse marked (hidden, delayed, faked...) proves nothing.
  function contradictions(word, history) {
    var count = 0;
    (history || []).forEach(function check(entry) {
      if (!entry || !entry.word || !Array.isArray(entry.feedback)) return;
      var masked = Array.isArray(entry.maskedIndices) ? entry.maskedIndices : [];
      var shown = Array.isArray(entry.shownFeedback) ? entry.shownFeedback : entry.feedback;
      var would = Engine.evaluateFeedback(word, String(entry.word).toUpperCase());
      for (var i = 0; i < 5; i += 1) {
        if (masked.indexOf(i) !== -1) continue;
        var seen = shown[i];
        if (seen !== "green" && seen !== "yellow" && seen !== "grey") continue;
        if (would[i] !== seen) count += 1;
      }
    });
    return count;
  }

  function buildChoices(game, size) {
    var state = game.state;
    var secret = String(state.secret || "").toUpperCase();
    var removed = Array.isArray(state.removedLetters) ? state.removedLetters : [];
    var played = {};
    (state.history || []).forEach(function mark(entry) { if (entry && entry.word) played[String(entry.word).toUpperCase()] = true; });
    var source = typeof game.getActiveWords === "function" ? game.getActiveWords() : [];
    if (!source || !source.length) source = typeof game.getFeasibleWords === "function" ? game.getFeasibleWords() : [];
    var seen = {};
    var pool = [];
    (source || []).forEach(function add(raw) {
      var word = String(raw).toUpperCase();
      if (!/^[A-Z]{5}$/.test(word) || word === secret || played[word] || seen[word]) return;
      if (removed.some(function has(letter) { return word.indexOf(letter) !== -1; })) return;
      seen[word] = true;
      pool.push(word);
    });
    var random = typeof game.random === "function" ? game.random : Math.random;
    var scored = shuffled(pool, random).map(function score(word) {
      return { word: word, misses: contradictions(word, state.history) };
    });
    // Ruled-out words, the hardest to rule out first; a word the board
    // can't tell from the answer is only used if nothing else is left.
    var ruledOut = scored.filter(function out(item) { return item.misses > 0; })
      .sort(function closest(a, b) { return a.misses - b.misses; });
    var shortlist = shuffled(ruledOut.slice(0, Math.max(size * 4, 12)), random);
    var decoys = shortlist.slice(0, size - 1).map(function word(item) { return item.word; });
    if (decoys.length < size - 1) {
      scored.forEach(function fill(item) {
        if (decoys.length < size - 1 && decoys.indexOf(item.word) === -1) decoys.push(item.word);
      });
    }
    return decoys.concat(secret).sort();
  }

  // The guess (1-based) this stage's Preset Trial curse lands on, or 0.
  // Ordinary stages only: a boss fight keeps its own rules, and a Duel
  // alternates with the AI.
  proto.presetPickGuess = function presetPickGuess() {
    var state = this.state;
    if (!state || inDuel(state) || typeof Engine.ratchetForGuess !== "function") return 0;
    if (typeof this.isBossRound === "function" && this.isBossRound()) return 0;
    var mega = megaOf(state);
    if (!(mega.ratchetDebuffs || []).some(function preset(item) { return item && item.bossId === PRESET_ID; })) return 0;
    for (var guess = 1; guess <= LOOKAHEAD; guess += 1) {
      var debuff = Engine.ratchetForGuess(this, guess);
      if (debuff && debuff.bossId === PRESET_ID) return guess;
    }
    return 0;
  };

  // The open pick -- { guess, words } -- while the next guess is the
  // cursed one, else null. Kept on the run so a reload shows the same list.
  proto.presetPick = function presetPick() {
    var state = this.state;
    if (!state || state.status !== "playing") return null;
    var guess = this.presetPickGuess();
    if (!guess || (Number(state.guessesUsed) || 0) + 1 !== guess) return null;
    var mega = megaOf(state);
    var key = stageKey(state) + ":" + guess;
    if (!mega.presetPick || mega.presetPick.key !== key || !Array.isArray(mega.presetPick.words)) {
      var size = Math.max(MIN_WORDS, Math.min(MAX_WORDS, guess));
      mega.presetPick = { key: key, guess: guess, words: buildChoices(this, size) };
    }
    return mega.presetPick;
  };

  // Plays the picked word as this guess, without tiles: five one-turn
  // cards carry it through the ordinary submit, so scoring, quests and the
  // solve all work as usual, then leave with the guess.
  proto.submitPresetPick = function submitPresetPick(rawWord) {
    var pick = this.presetPick();
    var word = String(rawWord || "").toUpperCase();
    if (!pick) return { ok: false, error: "There is no word list to pick from." };
    if (pick.words.indexOf(word) === -1) return { ok: false, error: "Pick one of the listed words." };
    var state = this.state;
    var savedDraft = Array.isArray(state.draft) ? state.draft.slice() : [];
    var game = this;
    var cards = word.split("").map(function make(letter) { return game._newCard(letter, "extra"); });
    var ids = cards.map(function id(card) { return card.id; });
    state.hand = state.hand.concat(cards);
    state.draft = ids.slice();
    this._presetPickWord = word;
    var result;
    try {
      result = this.submitDraft();
    } finally {
      this._presetPickWord = null;
    }
    if (!result || result.ok === false) {
      state.hand = state.hand.filter(function keep(card) { return ids.indexOf(card.id) === -1; });
      state.draft = savedDraft;
      return result || { ok: false, error: "That pick could not be played." };
    }
    return result;
  };

  // The picked word skips the hand and the stage's word rules -- it was
  // offered by the game, not built by the player.
  var baseCanSubmit = proto.canSubmit;
  proto.canSubmit = function canSubmitWithPresetPick() {
    if (this._presetPickWord && typeof this.getDraftWord === "function"
        && String(this.getDraftWord()).toUpperCase() === this._presetPickWord) {
      return { ok: true, word: this._presetPickWord };
    }
    return baseCanSubmit.apply(this, arguments);
  };

  // The cursed guess is the stage's last. Each row a rescue (Second Cup)
  // adds to the stage's guess allowance still adds one more.
  var baseHardLimit = proto._hardGuessLimit;
  proto._hardGuessLimit = function hardGuessLimitWithPresetPick() {
    var limit = baseHardLimit.apply(this, arguments);
    var guess = this.presetPickGuess();
    if (!guess) return limit;
    var state = this.state;
    var mega = megaOf(state);
    var key = stageKey(state);
    if (!mega.presetStage || mega.presetStage.key !== key) {
      mega.presetStage = { key: key, baseMax: Number(state.maxGuesses) || 0 };
    }
    var rescued = Math.max(0, (Number(state.maxGuesses) || 0) - mega.presetStage.baseMax);
    return Math.min(limit, guess + rescued);
  };
}());
