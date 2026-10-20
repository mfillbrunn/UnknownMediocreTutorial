/* Cuddle: the Preset Trial curse.
 *
 * Also the Preset Trial stops (Blind, Open and Pair), further down.
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

  // -- the Preset Trial stage -------------------------------------------------
  // A stop of its own on the map (cuddle-expanded-stages.js addTrialRows),
  // one or two a run. Two kinds:
  //   Blind  three guesses as usual, then on guess 4 the answer is one of a
  //          short list that appears only then (the harder read: more
  //          guesses for fewer words).
  //   Open   a longer list is shown from the start; two guesses to narrow
  //          it down, then the pick on guess 3 (more words per guess).
  // The player picks a difficulty on arriving: the harder, the more words
  // to choose from and the bigger the bonus. The right pick passes it; a
  // wrong one is the stage's last guess, which ends the run, the same as
  // losing a Duel. A trial pays its guesses, its early solve and its spare
  // rows -- counted up to its last guess, not the world's -- plus the
  // trial bonus.
  //   Pair   the list is shown from the start, but you never type: each
  //          guess is one of two words offered (any everyday words, not
  //          only the list's), tapped to play it. After each, look at two more words or pick the answer
  //          (latest on guess 5). The sooner you pass, the more it pays.
  var TRIAL_LEVELS = {
    easy: { label: "Easy", blind: 3, open: 6, pairs: 6, points: 20, money: 10 },
    medium: { label: "Medium", blind: 5, open: 10, pairs: 8, points: 40, money: 20 },
    hard: { label: "Hard", blind: 7, open: 14, pairs: 10, points: 70, money: 35 }
  };
  // A Pair trial's pass pays this share of its bonus by the guess it's
  // solved on (1st, 2nd, 3rd, 4th, 5th).
  var PAIR_PAY = [1, 0.75, 0.5, 0.35, 0.25];
  var PAIR_PICK_GUESS = 5;
  var TRIAL_ORDER = ["easy", "medium", "hard"];

  function trialLevel(node) {
    return node && TRIAL_LEVELS[node.trialDifficulty] ? TRIAL_LEVELS[node.trialDifficulty] : null;
  }

  function trialPickGuess(node) {
    if (node && node.trialKind === "pairs") return PAIR_PICK_GUESS;
    return node && node.trialKind === "open" ? 3 : 4;
  }

  function trialNode(state) {
    if (!state || state.status !== "playing") return null;
    var map = state.branchMap;
    var position = map && map.position;
    var row = position && Array.isArray(map.rows) ? map.rows[Number(position.row)] : null;
    var node = row && Array.isArray(row.nodes) ? row.nodes[Number(position.col)] : null;
    return node && node.type === "trial" ? node : null;
  }

  // Open and Pair trials show their list from the start.
  function isOpenTrial(node) {
    return Boolean(node && (node.trialKind === "open" || node.trialKind === "pairs"));
  }

  function isPairTrial(node) {
    return Boolean(node && node.trialKind === "pairs");
  }

  function trialSize(node) {
    var level = trialLevel(node) || TRIAL_LEVELS.medium;
    if (isPairTrial(node)) return level.pairs;
    return isOpenTrial(node) ? level.open : level.blind;
  }

  // What passing pays if the answer is found on guess `guess` (1-based):
  // the full bonus, or a Pair trial's share of it.
  function trialBonus(node, guess) {
    var level = trialLevel(node) || TRIAL_LEVELS.medium;
    if (!isPairTrial(node)) return { points: level.points, money: level.money };
    var share = PAIR_PAY[Math.max(0, Math.min(PAIR_PAY.length - 1, guess - 1))];
    return { points: Math.round(level.points * share), money: Math.round(level.money * share) };
  }

  // An Open trial's list, drawn once at the start of the stage (before any
  // guess, so nothing on it is ruled out yet) and kept for the whole stage.
  proto.presetOpenList = function presetOpenList() {
    var state = this.state;
    var node = trialNode(state);
    if (!isOpenTrial(node) || !trialLevel(node)) return null;
    var mega = megaOf(state);
    var key = stageKey(state);
    if (!mega.presetOpen || mega.presetOpen.key !== key || !Array.isArray(mega.presetOpen.words)) {
      mega.presetOpen = { key: key, words: buildChoices(this, trialSize(node)) };
    }
    return mega.presetOpen.words;
  };

  // The guess (1-based) this stage's Preset Trial curse lands on, or 0.
  // Ordinary stages only: a boss fight keeps its own rules, and a Duel
  // alternates with the AI.
  proto.presetPickGuess = function presetPickGuess() {
    var state = this.state;
    if (!state || inDuel(state)) return 0;
    if (typeof this.isBossRound === "function" && this.isBossRound()) return 0;
    var trial = trialNode(state);
    if (trial) return trialPickGuess(trial);
    if (typeof Engine.ratchetForGuess !== "function") return 0;
    var mega = megaOf(state);
    if (!(mega.ratchetDebuffs || []).some(function preset(item) { return item && item.bossId === PRESET_ID; })) return 0;
    for (var guess = 1; guess <= LOOKAHEAD; guess += 1) {
      var debuff = Engine.ratchetForGuess(this, guess);
      if (debuff && debuff.bossId === PRESET_ID) return guess;
    }
    return 0;
  };

  // An Open trial's answer can be locked in early, from the list shown
  // since the start: tapping a word opens the pick on this guess. It's the
  // same final answer as the pick on guess 3 -- right passes the trial,
  // wrong ends the run. "Keep guessing" closes it again.
  proto.openPresetPickEarly = function openPresetPickEarly() {
    var state = this.state;
    var trial = trialNode(state);
    var guess = this.presetPickGuess();
    if (!isOpenTrial(trial) || !guess || (Number(state.guessesUsed) || 0) + 1 >= guess) return false;
    megaOf(state).presetEarly = stageKey(state) + ":" + (Number(state.guessesUsed) || 0);
    return true;
  };

  proto.closePresetPickEarly = function closePresetPickEarly() {
    if (this.state) megaOf(this.state).presetEarly = null;
  };

  // True while an early pick is open (only until the next guess is played).
  proto.presetPickIsEarly = function presetPickIsEarly() {
    var state = this.state;
    if (!state || state.status !== "playing" || !trialNode(state)) return false;
    var early = megaOf(state).presetEarly;
    return Boolean(early) && early === stageKey(state) + ":" + (Number(state.guessesUsed) || 0);
  };

  // The open pick -- { guess, words } -- while the next guess is the
  // cursed one (or an early pick is open), else null. Kept on the run so a
  // reload shows the same list.
  proto.presetPick = function presetPick() {
    var state = this.state;
    if (!state || state.status !== "playing") return null;
    var guess = this.presetPickGuess();
    if (!guess) return null;
    if ((Number(state.guessesUsed) || 0) + 1 !== guess && !this.presetPickIsEarly()) return null;
    var mega = megaOf(state);
    var key = stageKey(state) + ":" + guess;
    if (!mega.presetPick || mega.presetPick.key !== key || !Array.isArray(mega.presetPick.words)) {
      var trial = trialNode(state);
      var openList = isOpenTrial(trial) ? this.presetOpenList() : null;
      var size = trial ? trialSize(trial) : Math.max(MIN_WORDS, Math.min(MAX_WORDS, guess));
      mega.presetPick = { key: key, guess: guess, words: openList ? openList.slice() : buildChoices(this, size) };
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
    // A wrong early pick is still the final answer: this guess becomes the
    // stage's last, so the engine ends the run as it does for a wrong pick
    // on guess 3. (Only when wrong: a right one keeps its spare rows.)
    var early = this.presetPickIsEarly();
    if (early && word !== String(state.secret || "").toUpperCase()) this._presetFinalGuess = (Number(state.guessesUsed) || 0) + 1;
    var cards = word.split("").map(function make(letter) { return game._newCard(letter, "extra"); });
    var ids = cards.map(function id(card) { return card.id; });
    state.hand = state.hand.concat(cards);
    state.draft = ids.slice();
    this._presetPickWord = word;
    var trial = trialNode(state);
    var result;
    try {
      result = this.submitDraft();
    } finally {
      this._presetPickWord = null;
      this._presetFinalGuess = 0;
      if (early) megaOf(state).presetEarly = null;
    }
    // A wrong pick ends the run: say so plainly, not as a missed guess limit.
    if (trial && result && result.ok !== false && state.status === "lost") {
      state.failureReason = "Wrong pick in the Preset Trial: the answer was " + String(state.secret || "").toUpperCase() + ".";
      try { this.save(); } catch (_error) { /* next save */ }
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
    if (this._presetFinalGuess > 0) return Math.min(limit, this._presetFinalGuess);
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

  // A stage that ends on a preset pick (a Preset Trial stop, or the curse)
  // measures its early solve and spare rows against that last guess, not
  // the world's window: solving on guess 2 of 3 pays one spare row, not
  // the four a 6-guess world would. (Second Cup's rescue rows still add.)
  var baseThreshold = proto._solveGuessThreshold;
  var readingPick = false;
  proto._solveGuessThreshold = function solveThresholdWithPresetPick() {
    var window = baseThreshold.apply(this, arguments);
    if (readingPick) return window;
    readingPick = true;
    try {
      var last = typeof this._hardGuessLimit === "function" && this.presetPickGuess() > 0
        ? Number(this._hardGuessLimit()) : 0;
      return last > 0 ? Math.min(window, last) : window;
    } catch (_error) {
      return window;
    } finally {
      readingPick = false;
    }
  };

  // On a solve, the trial bonus is paid on top (points and money, by the
  // difficulty).
  var baseSubmit = proto.submitDraft;
  proto.submitDraft = function submitDraftWithPresetTrial() {
    var state = this.state;
    var trial = state && !inDuel(state) ? trialNode(state) : null;
    var before = trial && Array.isArray(state.history) ? state.history.length : 0;
    var result = baseSubmit.apply(this, arguments);
    state = this.state;
    if (!trial || !result || result.ok === false || !Array.isArray(state.history) || state.history.length <= before) return result;
    var entry = state.history[state.history.length - 1];
    if (!entry || String(entry.word || "").toUpperCase() !== String(state.secret || "").toUpperCase() || trial.trialPaid) return result;
    var level = trialBonus(trial, state.history.length);
    var change = level.points;
    entry.presetTrialBonus = level.points;
    state.score = (Number(state.score) || 0) + change;
    state.roundScore = (Number(state.roundScore) || 0) + change;
    if (state.pendingRoundEnd) state.pendingRoundEnd.score = state.score;
    trial.trialPaid = true;
    state.cuddleMoney = Math.max(0, (Number(state.cuddleMoney) || 0) + level.money);
    state.lastMessage = ((state.lastMessage || "") + " Trial passed: +" + level.points + " points, +$" + level.money + ".").trim();
    try { this.save(); } catch (_error) { /* next save */ }
    return result;
  };

  // -- the Pair trial's guesses ------------------------------------------------
  // Each guess is a word from the list, one of two shown. After it, the
  // player looks at two more words, or picks the answer (the early pick).
  // Kept on the run: { key, guess, phase: "pair" | "decide", pair }.
  function pairRecord(game) {
    var state = game.state;
    var mega = megaOf(state);
    var key = stageKey(state);
    var guess = Number(state.guessesUsed) || 0;
    var record = mega.presetPairs;
    if (!record || record.key !== key || record.guess !== guess) {
      // A new stage starts on a pair; after a guess, the player decides.
      record = mega.presetPairs = { key: key, guess: guess, phase: guess ? "decide" : "pair", pair: [] };
    }
    if (record.phase === "pair" && (!Array.isArray(record.pair) || !record.pair.length)) record.pair = drawPair(game);
    return record;
  }

  // Two everyday words to play, from all of them (not only the list), never
  // one already played or one using a letter culled from the run.
  function drawPair(game) {
    var state = game.state;
    var played = {};
    (state.history || []).forEach(function mark(entry) { if (entry && entry.word) played[String(entry.word).toUpperCase()] = true; });
    var removed = Array.isArray(state.removedLetters) ? state.removedLetters : [];
    var source = typeof game.getActiveWords === "function" ? game.getActiveWords() : [];
    if (!source || !source.length) source = game.presetOpenList() || [];
    var random = typeof game.random === "function" ? game.random : Math.random;
    var picked = [];
    for (var tries = 0; tries < 200 && picked.length < 2; tries += 1) {
      var word = String(source[Math.floor(random() * source.length)] || "").toUpperCase();
      if (!/^[A-Z]{5}$/.test(word) || played[word] || picked.indexOf(word) !== -1) continue;
      if (removed.some(function has(letter) { return word.indexOf(letter) !== -1; })) continue;
      picked.push(word);
    }
    return picked.sort();
  }

  // What the Pair trial's panel shows now, or null when it isn't one (or
  // the answer pick is open instead).
  proto.presetPairPanel = function presetPairPanel() {
    var state = this.state;
    var trial = trialNode(state);
    if (!isPairTrial(trial) || !trialLevel(trial) || inDuel(state)) return null;
    if (state.pendingRoundEnd || this.presetPick()) return null;
    var record = pairRecord(this);
    var guess = (Number(state.guessesUsed) || 0) + 1;
    var game = this;
    return {
      key: record.key + ":" + record.guess,
      phase: record.phase,
      // A word from the list is marked as such; which of them the board
      // already rules out is for the player to work out.
      pair: record.pair.map(function word(item) {
        return { word: item, listed: (game.presetOpenList() || []).indexOf(item) !== -1 };
      }),
      guess: guess,
      lastProbe: guess === PAIR_PICK_GUESS - 1,
      payNow: trialBonus(trial, guess),
      payNext: trialBonus(trial, guess + 1)
    };
  };

  // "Show two more words".
  proto.presetPairNext = function presetPairNext() {
    var panel = this.presetPairPanel();
    if (!panel || panel.phase !== "decide") return false;
    var record = pairRecord(this);
    record.phase = "pair";
    record.pair = drawPair(this);
    try { this.save(); } catch (_error) { /* next save */ }
    return true;
  };

  // Plays one of the two words shown as this guess (not the final answer:
  // only the pick is).
  proto.submitPairWord = function submitPairWord(rawWord) {
    var panel = this.presetPairPanel();
    var word = String(rawWord || "").toUpperCase();
    if (!panel || panel.phase !== "pair") return { ok: false, error: "There's no pair of words to choose from." };
    if (!panel.pair.some(function has(item) { return item.word === word; })) return { ok: false, error: "Choose one of the two words." };
    var state = this.state;
    var game = this;
    var savedDraft = Array.isArray(state.draft) ? state.draft.slice() : [];
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
      return result || { ok: false, error: "That word could not be played." };
    }
    return result;
  };

  // -- choosing the trial's difficulty ---------------------------------------
  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function swap(character) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" }[character];
    });
  }

  function needsDifficulty(state) {
    var node = trialNode(state);
    return Boolean(node && !trialLevel(node) && !(state.history || []).length);
  }

  function pickerHtml(state) {
    var node = trialNode(state);
    var open = isOpenTrial(node);
    var pairs = isPairTrial(node);
    var pips = function pips(count) {
      return '<span class="umt-duel-pips" aria-hidden="true">' + [1, 2, 3].map(function pip(n) { return "<i" + (n <= count ? ' class="is-on"' : "") + "></i>"; }).join("") + "</span>";
    };
    var options = TRIAL_ORDER.map(function option(id, index) {
      var level = TRIAL_LEVELS[id];
      var words = pairs ? level.pairs : open ? level.open : level.blind;
      return '<button type="button" class="umt-duel-option is-' + id + '" data-umt-trial-level="' + id + '">' + pips(index + 1)
        + "<b>" + level.label + "</b>"
        + '<span class="umt-duel-win">' + words + " words · Pass: " + (pairs ? "up to " : "") + "+" + level.points + " points · +$" + level.money + "</span></button>";
    }).join("");
    return '<div class="umt-trial-pick" role="dialog" aria-modal="true" aria-labelledby="umtTrialPickTitle">'
      + '<section class="umt-stop-panel umt-duel-choose umt-trial-pick-panel">'
      + '<h2 id="umtTrialPickTitle">' + (pairs ? "Pair Trial" : open ? "Open Trial" : "Preset Trial") + "</h2>"
      + '<p class="umt-stop-lead">' + (pairs
        ? "The answer is one of the listed words. Each guess, choose one of two words to play. After each, see two more or pick the answer. The sooner you pass, the more it pays."
        : open
          ? "The answer is one of the listed words, shown from the start. Two guesses, then pick it."
          : "Three guesses, then the answer is one of a list. Pick it.")
      + " A wrong pick ends the run. Harder means more words to choose from.</p>"
      + '<div class="umt-duel-options">' + options + "</div></section></div>";
  }

  function renderPicker(root, game) {
    var existing = document.querySelector(".umt-trial-pick");
    var state = game && game.state;
    if (!state || inDuel(state) || !needsDifficulty(state)) {
      if (existing) existing.remove();
      return;
    }
    if (existing) return;
    var host = document.getElementById("cuddleScreen") || document.body;
    host.insertAdjacentHTML("beforeend", pickerHtml(state));
  }

  document.addEventListener("click", function chooseLevel(event) {
    var button = event.target.closest && event.target.closest("[data-umt-trial-level]");
    if (!button) return;
    event.preventDefault();
    var game = window.CuddleBranchMap && typeof window.CuddleBranchMap.getActiveGame === "function"
      ? window.CuddleBranchMap.getActiveGame() : null;
    var node = game && trialNode(game.state);
    if (!node || !TRIAL_LEVELS[button.dataset.umtTrialLevel]) return;
    node.trialDifficulty = button.dataset.umtTrialLevel;
    try { game.save(); } catch (_error) { /* next save */ }
    var layer = document.querySelector(".umt-trial-pick");
    if (layer) layer.remove();
    window.dispatchEvent(new CustomEvent("cuddle:campaign-update", { detail: { runId: game.state.runId } }));
  });

  setInterval(function watch() {
    var game = window.CuddleBranchMap && typeof window.CuddleBranchMap.getActiveGame === "function"
      ? window.CuddleBranchMap.getActiveGame() : null;
    if (document.getElementById("cuddleRoot")) renderPicker(document.getElementById("cuddleRoot"), game);
  }, 500);

  window.CuddlePresetTrial = Object.freeze({ LEVELS: TRIAL_LEVELS, PAIR_PAY: PAIR_PAY, PAIR_PICK_GUESS: PAIR_PICK_GUESS });
}());
