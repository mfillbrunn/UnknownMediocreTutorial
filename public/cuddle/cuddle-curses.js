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
  // losing a Duel. A trial pays its guesses and its spare rows, plus the
  // trial bonus -- never the early-solve bonus.
  var TRIAL_LEVELS = {
    easy: { label: "Easy", blind: 3, open: 6, points: 20, money: 10 },
    medium: { label: "Medium", blind: 5, open: 10, points: 40, money: 20 },
    hard: { label: "Hard", blind: 7, open: 14, points: 70, money: 35 }
  };
  var TRIAL_ORDER = ["easy", "medium", "hard"];

  // The trial node the run stands on (during the stage and its cash-out).
  function trialHere(state) {
    var map = state && state.branchMap;
    var position = map && map.position;
    var row = position && Array.isArray(map.rows) ? map.rows[Number(position.row)] : null;
    var node = row && Array.isArray(row.nodes) ? row.nodes[Number(position.col)] : null;
    return node && node.type === "trial" ? node : null;
  }

  function trialLevel(node) {
    return node && TRIAL_LEVELS[node.trialDifficulty] ? TRIAL_LEVELS[node.trialDifficulty] : null;
  }

  function trialPickGuess(node) {
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

  function isOpenTrial(node) {
    return Boolean(node && node.trialKind === "open");
  }

  function trialSize(node) {
    var level = trialLevel(node) || TRIAL_LEVELS.medium;
    return isOpenTrial(node) ? level.open : level.blind;
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

  // A trial pays its guesses and its spare rows, never the early-solve
  // bonus (there's no guessing early when the list decides the guess):
  // the spare rows' early rate is zero here...
  var baseRules = proto.getRulesSummary;
  if (typeof baseRules === "function") {
    proto.getRulesSummary = function rulesWithPresetTrial() {
      var rules = baseRules.apply(this, arguments);
      if (rules && trialHere(this.state)) rules = Object.assign({}, rules, { earlyPoint: 0 });
      return rules;
    };
  }

  // ...the engine's own early bonus is taken back on the solve, and the
  // trial bonus is paid instead (points and money, by the difficulty).
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
    var early = Math.max(0, Math.round(Number(entry.earlyBonus) || 0));
    var level = trialLevel(trial) || TRIAL_LEVELS.medium;
    var change = level.points - early;
    entry.earlyBonus = 0;
    entry.presetTrialBonus = level.points;
    state.score = (Number(state.score) || 0) + change;
    state.roundScore = (Number(state.roundScore) || 0) + change;
    if (state.pendingRoundEnd) {
      state.pendingRoundEnd.earlyBonus = Math.max(0, (Number(state.pendingRoundEnd.earlyBonus) || 0) - early);
      state.pendingRoundEnd.score = state.score;
    }
    if (state.lastRoundSummary && Number(state.lastRoundSummary.earlyBonus)) {
      state.lastRoundSummary.earlyBonus = Math.max(0, Number(state.lastRoundSummary.earlyBonus) - early);
    }
    trial.trialPaid = true;
    state.cuddleMoney = Math.max(0, (Number(state.cuddleMoney) || 0) + level.money);
    state.lastMessage = ((state.lastMessage || "") + " Trial passed: +" + level.points + " points, +$" + level.money + ".").trim();
    try { this.save(); } catch (_error) { /* next save */ }
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
    var pips = function pips(count) {
      return '<span class="umt-duel-pips" aria-hidden="true">' + [1, 2, 3].map(function pip(n) { return "<i" + (n <= count ? ' class="is-on"' : "") + "></i>"; }).join("") + "</span>";
    };
    var options = TRIAL_ORDER.map(function option(id, index) {
      var level = TRIAL_LEVELS[id];
      var words = open ? level.open : level.blind;
      return '<button type="button" class="umt-duel-option is-' + id + '" data-umt-trial-level="' + id + '">' + pips(index + 1)
        + "<b>" + level.label + "</b>"
        + '<span class="umt-duel-win">' + words + " words · Pass: +" + level.points + " points · +$" + level.money + "</span></button>";
    }).join("");
    return '<div class="umt-trial-pick" role="dialog" aria-modal="true" aria-labelledby="umtTrialPickTitle">'
      + '<section class="umt-stop-panel umt-duel-choose umt-trial-pick-panel">'
      + '<h2 id="umtTrialPickTitle">' + (open ? "Open Trial" : "Preset Trial") + "</h2>"
      + '<p class="umt-stop-lead">' + (open
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
  }, 250);

  window.CuddlePresetTrial = Object.freeze({ LEVELS: TRIAL_LEVELS });
}());
