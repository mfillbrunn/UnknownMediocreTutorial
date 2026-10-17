/* Cuddle: Easy, a short guided run.
 *
 * Easy is a much smaller game than Medium and Hard:
 *   - one world: beating its boss wins the run;
 *   - the map is a straight line of Themed Wordles (and one Free Upgrade
 *     before the boss): no forks, shops, events, Unknown stops, Duels or
 *     Trials;
 *   - every theme of the answer is shown from the start (Theme Sense at
 *     its top level);
 *   - every consonant of the answer is in the hand, from the opening hand
 *     and again after every guess; no mulligans and no deck on screen;
 *   - no quests, special squares or badge packs;
 *   - badges stay out of sight: no badge page or counts, and a reward
 *     screen offers three simple helpers, shown by what they do rather than
 *     as badges.
 * The run is marked when it starts (state.umtEasyMode). It reuses the
 * first-run hooks (cuddle-first-run.js) for quests, squares and the map.
 */
(function () {
  "use strict";

  var Engine = window.CuddleEngine;
  var Game = Engine && Engine.CuddleGame;
  if (!Game || Game.prototype.__cuddleEasyMode) return;
  var proto = Game.prototype;
  proto.__cuddleEasyMode = true;

  // The helpers an Easy reward screen offers: simple, and all about
  // finding the word.
  // (No hand, mulligan or Joker helpers: the hand always holds the answer's
  // letters, and there are no mulligans or deck to manage.)
  var EASY_HELPERS = ["vowelLamp", "echoFinder", "yellowHint", "patternLens", "greenCount", "lastLight",
    "alphabet-compass", "consonantSweep", "coachPossibleAnswers", "boldOpener", "goldenOpener"];
  var MAX_THEMES = 3;

  function stateOf(gameOrState) {
    if (!gameOrState) return null;
    return gameOrState.state && typeof gameOrState.state === "object" ? gameOrState.state : gameOrState;
  }

  function isEasy(gameOrState) {
    var game = gameOrState && gameOrState.state ? gameOrState : null;
    if (game && game.__umtEasyPending) return true;
    var state = stateOf(gameOrState);
    return Boolean(state && state.umtEasyMode && String(state.runId || "").indexOf(":duel:") === -1);
  }

  function save(game) {
    try { if (game && typeof game.save === "function") game.save(); } catch (_error) { /* next save */ }
  }

  // -- marking the run ------------------------------------------------------------
  var baseStartNew = proto.startNew;
  if (typeof baseStartNew === "function") {
    proto.startNew = function startNewEasy(difficulty) {
      var easy = String(difficulty || "").toLowerCase() === "easy";
      this.__umtEasyPending = easy;
      var result;
      try {
        result = baseStartNew.apply(this, arguments);
      } finally {
        this.__umtEasyPending = false;
      }
      var state = this.state;
      if (state) {
        state.umtEasyMode = easy;
        if (easy) {
          // No badge packs: not the free one at the start, nor later ones.
          state.umtPackOffer = null;
          state.umtPackTrack = { seen: [0, 0, 0], offered: [true, true, true] };
          showAllThemes(state);
          state.mulligansLeft = 0;
          clearQuests(state);
          state.cuddleMoneyTiles = [];
          save(this);
        }
      }
      return result;
    };
  }

  function showAllThemes(state) {
    if (!state.cuddleCampaign || typeof state.cuddleCampaign !== "object") state.cuddleCampaign = {};
    state.cuddleCampaign.categorySense = Math.max(MAX_THEMES, Number(state.cuddleCampaign.categorySense) || 0);
  }

  function clearQuests(state) {
    state.activeQuest = null;
    if (Array.isArray(state.activeQuests)) state.activeQuests = [];
    if (state.megaState && Array.isArray(state.megaState.activeQuests)) state.megaState.activeQuests = [];
  }

  // -- no quests ----------------------------------------------------------------------
  var baseEnsureQuest = proto._ensureQuestForNextGuess;
  if (typeof baseEnsureQuest === "function") {
    proto._ensureQuestForNextGuess = function ensureQuestEasy() {
      if (isEasy(this)) {
        clearQuests(this.state);
        return undefined;
      }
      return baseEnsureQuest.apply(this, arguments);
    };
  }

  // -- the straight map -------------------------------------------------------------
  // Only the first world, one stop per row: plain Wordles, the Free Upgrade
  // of the rest stop, then the boss. Rows already walked keep their stop.
  function straightLine(game, map) {
    if (!map || !Array.isArray(map.rows) || !map.rows.length) return false;
    var bossIndex = map.rows.findIndex(function boss(row) {
      return row && (row.kind === "boss" || (row.nodes || []).some(function b(node) { return node && (node.type === "boss" || node.type === "final"); }));
    });
    if (bossIndex < 0) return false;
    var position = map.position ? Number(map.position.row) : -1;
    var changed = false;
    var rows = [];
    map.rows.slice(0, bossIndex + 1).forEach(function keep(row, index) {
      if (!row) return;
      if (row.kind === "duel" || row.kind === "trial") {
        if (index > position) { changed = true; return; }
      }
      rows.push(row);
    });
    if (rows.length !== map.rows.length) changed = true;
    rows.forEach(function line(row, index) {
      var nodes = row.nodes || [];
      var walked = map.position && Number(map.position.row) === index ? nodes[Number(map.position.col)] : null;
      var keep = walked || nodes.find(function n(node) { return node && (node.type === "boss" || node.type === "final"); })
        || (row.restFork ? nodes.find(function u(node) { return node && node.type === "upgrade"; }) : null)
        || nodes[0];
      if (!keep) return;
      // Every stop is a Themed Wordle (cuddle-rebalance-v5.js gives it the
      // variant); here it just loses whatever else it was.
      if (!walked && index > position && keep.type !== "boss" && keep.type !== "final" && keep.type !== "upgrade") {
        if (keep.type !== "theme") changed = true;
        keep.type = "theme";
        delete keep.mysteryType;
        delete keep.mysteryRevealed;
        delete keep.eventId;
        delete keep.expandedEventId;
        delete keep.challengeId;
        delete keep.shopSlot;
        if (keep.cuddleVariant && keep.cuddleVariant.kind !== "themedWordle") delete keep.cuddleVariant;
      }
      if (keep.restChoice) { delete keep.restChoice; changed = true; }
      if (nodes.length !== 1) changed = true;
      row.nodes = [keep];
      delete row.restFork;
    });
    rows.forEach(function link(row, index) {
      var node = row.nodes[0];
      node.row = index;
      node.col = 0;
      node.next = index < rows.length - 1 ? [0] : [];
    });
    if (map.position && Number(map.position.col) !== 0) { map.position.col = 0; changed = true; }
    map.rows = rows;
    // Nothing more to insert into this map.
    map.expandedDuelRowsInserted = true;
    map.expandedTrialRowsInserted = true;
    return changed;
  }

  // -- reuse the first run's hooks: no quests, no squares, the map ---------------
  function wrapFirstRun() {
    var first = window.CuddleFirstRun;
    if (!first || first.__umtEasy) return Boolean(first);
    window.CuddleFirstRun = Object.freeze(Object.assign({}, first, {
      __umtEasy: true,
      noQuests: function noQuests(game) { return isEasy(game) || first.noQuests(game); },
      noSquares: function noSquares(game) { return isEasy(game) || first.noSquares(game); },
      questChallenges: function questChallenges(game) {
        return isEasy(game) ? ["questEndurance", "questTrial"] : first.questChallenges(game);
      },
      schoolsHidden: function schoolsHidden(game) { return isEasy(game) || first.schoolsHidden(game); },
      calmMap: function calmMap(game, map) {
        var calmed = first.calmMap(game, map);
        return isEasy(game) ? straightLine(game, map) || calmed : calmed;
      }
    }));
    return true;
  }
  if (!wrapFirstRun()) {
    var tries = 0;
    var timer = setInterval(function retry() { if (wrapFirstRun() || (tries += 1) > 80) clearInterval(timer); }, 50);
  }

  // Other layers decorate stops after the map is laid out (stage tiers,
  // challenges), so the line is kept straight before every step and
  // whenever the map is on screen.
  var baseEnter = proto.enterBranchNode;
  if (typeof baseEnter === "function") {
    proto.enterBranchNode = function enterBranchNodeEasy() {
      if (isEasy(this) && this.state && this.state.branchMap) straightLine(this, this.state.branchMap);
      return baseEnter.apply(this, arguments);
    };
  }

  function keepMapStraight(game) {
    var state = game && game.state;
    if (!state || state.status !== "branchMap" || !state.branchMap || !isEasy(game)) return;
    if (!straightLine(game, state.branchMap)) return;
    save(game);
    try { window.dispatchEvent(new CustomEvent("cuddle:campaign-update", { detail: { runId: state.runId } })); } catch (_error) { /* next render */ }
  }

  // -- the opening hand holds every consonant of the answer -----------------------
  function plain(game, card) {
    return card && card.source === "deck" && /^[A-Z]$/.test(String(card.glyph || ""))
      && !card.dead && !card.lucky && !card.idea && !card.wave && !card.jokerTile
      && !(typeof game.isInfiniteCard === "function" && game.isInfiniteCard(card));
  }

  function dealAnswer(game) {
    var state = game.state;
    var secret = String(state.secret || "").toUpperCase();
    if (!/^[A-Z]{5}$/.test(secret) || !Array.isArray(state.hand) || !Array.isArray(state.deck)) return;
    var vowel = function vowel(letter) { return typeof game.isVowelGlyph === "function" ? game.isVowelGlyph(letter) : "AEIOU".indexOf(letter) !== -1; };
    var need = {};
    secret.split("").forEach(function count(letter) { if (!vowel(letter)) need[letter] = (need[letter] || 0) + 1; });
    var held = {};
    state.hand.forEach(function count(card) { if (plain(game, card)) held[card.glyph] = (held[card.glyph] || 0) + 1; });
    Object.keys(need).forEach(function bring(letter) {
      while ((held[letter] || 0) < need[letter]) {
        var from = state.deck.findIndex(function match(card) { return plain(game, card) && card.glyph === letter; });
        if (from < 0) {
          // A doubled letter: the deck holds one of each, so the second
          // copy is made for this stage.
          if (typeof game._newCard !== "function") break;
          state.deck.push(game._newCard(letter, "deck"));
          from = state.deck.length - 1;
        }
        // Swap out a card the answer doesn't use.
        var out = state.hand.findIndex(function spare(card) {
          return plain(game, card) && !(need[card.glyph] && (held[card.glyph] || 0) <= need[card.glyph]);
        });
        var card = state.deck.splice(from, 1)[0];
        if (out >= 0) {
          var spare = state.hand[out];
          state.hand[out] = card;
          state.deck.splice(from, 0, spare);
          held[spare.glyph] = (held[spare.glyph] || 1) - 1;
        } else {
          state.hand.push(card);
        }
        held[letter] = (held[letter] || 0) + 1;
      }
    });
  }

  var basePrepare = proto._prepareInitialHand;
  proto._prepareInitialHand = function prepareInitialHandEasy() {
    var result = basePrepare.apply(this, arguments);
    if (isEasy(this)) {
      try { dealAnswer(this); } catch (error) { console.warn("Cuddle Easy: dealing the answer failed.", error); }
    }
    return result;
  };

  // Consonants are spent by a guess: the hand is topped up with the
  // answer's again after each one.
  var baseSubmit = proto.submitDraft;
  if (typeof baseSubmit === "function") {
    proto.submitDraft = function submitDraftEasy() {
      // No mulligans here, whatever a stage's start may have added (they
      // would pay as unused at the solve).
      if (isEasy(this) && this.state) this.state.mulligansLeft = 0;
      var result = baseSubmit.apply(this, arguments);
      if (isEasy(this) && this.state && this.state.status === "playing") {
        try { dealAnswer(this); } catch (error) { console.warn("Cuddle Educational: dealing the answer failed.", error); }
      }
      return result;
    };
  }

  // -- no mulligans --------------------------------------------------------------
  var baseAllowance = proto.getMulliganAllowance;
  if (typeof baseAllowance === "function") {
    proto.getMulliganAllowance = function getMulliganAllowanceEasy() {
      return isEasy(this) ? 0 : baseAllowance.apply(this, arguments);
    };
  }
  var baseMulligan = proto.mulligan;
  if (typeof baseMulligan === "function") {
    proto.mulligan = function mulliganEasy() {
      if (isEasy(this)) return { ok: false, error: "No mulligans in Educational: your hand already holds the answer's letters." };
      return baseMulligan.apply(this, arguments);
    };
  }

  // -- the first boss ends the run --------------------------------------------------
  var baseClearBoss = proto._clearBoss;
  if (typeof baseClearBoss === "function") {
    proto._clearBoss = function clearBossEasy() {
      var easy = isEasy(this);
      var boss = easy && this.state ? this.state.boss : null;
      var result = baseClearBoss.apply(this, arguments);
      var state = this.state;
      if (easy && state && state.status !== "lost" && Array.isArray(state.bossGatesDone) && state.bossGatesDone.length) {
        state.status = "won";
        state.failureReason = null;
        state.upgradeChoices = [];
        state.upgradePhase = null;
        state.legendaryOffer = null;
        state.lastMessage = "You beat " + ((boss && boss.title) || "the boss") + " and won the run!";
        save(this);
      }
      return result;
    };
  }

  // -- rewards: three simple helpers -----------------------------------------------
  function helperChoices(game) {
    var tree = window.CuddleSkillTree;
    var catalog = typeof game._upgradeCatalog === "function" ? (game._upgradeCatalog() || []) : [];
    var seen = {};
    var pool = catalog.filter(function easy(card) {
      if (!card) return false;
      var node = tree && typeof tree.resolve === "function" ? tree.resolve(card.key || card.id) || tree.resolve(card.title) : null;
      var id = node ? node.id : card.id;
      if (EASY_HELPERS.indexOf(id) === -1 || seen[id]) return false;
      var level = 0;
      try { level = node ? Number(tree.level(game, node)) || 0 : 0; } catch (_error) { level = 0; }
      if (node && node.maxLevel && level >= node.maxLevel) return false;
      seen[id] = true;
      return true;
    });
    var random = typeof game.random === "function" ? game.random : Math.random;
    for (var i = pool.length - 1; i > 0; i -= 1) {
      var j = Math.floor(random() * (i + 1));
      var held = pool[i]; pool[i] = pool[j]; pool[j] = held;
    }
    return pool.slice(0, 3);
  }

  function isHelper(choice) {
    var tree = window.CuddleSkillTree;
    if (!choice || !tree || typeof tree.resolve !== "function") return false;
    var node = tree.resolve(choice.key || choice.id) || tree.resolve(choice.id) || tree.resolve(choice.title);
    return Boolean(node && EASY_HELPERS.indexOf(node.id) !== -1);
  }

  // Other layers wrap the reward draw too, some of them later on (the
  // rarity layer swaps cards for others of the same rarity), so Easy's
  // wrapper is put back on the outside whenever another lands on top.
  function wrapGenerate() {
    var current = proto._generateUpgradeChoices;
    if (typeof current !== "function" || current.__umtEasy) return;
    var wrapped = function generateUpgradeChoicesEasy() {
      if (!isEasy(this)) return current.apply(this, arguments);
      var picks = helperChoices(this);
      return picks.length ? picks : current.apply(this, arguments);
    };
    wrapped.__umtEasy = true;
    proto._generateUpgradeChoices = wrapped;
  }
  wrapGenerate();
  setInterval(wrapGenerate, 1000);

  // Any reward screen that still shows something else (a Free Upgrade, a
  // starting pick) gets the helpers instead.
  function keepHelpers(game) {
    var state = game && game.state;
    if (!state || state.status !== "upgrade" || !isEasy(game) || !Array.isArray(state.upgradeChoices) || !state.upgradeChoices.length) return false;
    if (state.upgradeChoices.every(isHelper)) return false;
    var picks = helperChoices(game);
    if (!picks.length) return false;
    state.upgradeChoices = picks;
    state.legendaryOffer = null;
    return true;
  }

  var baseChoose = proto.chooseUpgrade;
  if (typeof baseChoose === "function") {
    proto.chooseUpgrade = function chooseUpgradeEasy(key) {
      if (isEasy(this) && this.state && Array.isArray(this.state.upgradeChoices)) {
        var index = this.state.upgradeChoices.findIndex(function match(choice) { return choice && (choice.key === key || choice.id === key); });
        if (keepHelpers(this)) {
          var swap = this.state.upgradeChoices[Math.max(0, Math.min(this.state.upgradeChoices.length - 1, index))];
          key = swap && (swap.key || swap.id);
        }
      }
      return baseChoose.call(this, key);
    };
  }

  // -- on screen: the page knows it's Easy -------------------------------------
  function activeGame() {
    try {
      return window.CuddleBranchMap && typeof window.CuddleBranchMap.getActiveGame === "function" ? window.CuddleBranchMap.getActiveGame() : null;
    } catch (_error) {
      return null;
    }
  }

  function syncBodyClass() {
    var game = activeGame();
    var screen = document.getElementById("cuddleScreen");
    var on = Boolean(game && isEasy(game) && screen && screen.classList.contains("active"));
    document.body.classList.toggle("umt-easy-mode", on);
    if (on) {
      keepMapStraight(game);
      if (keepHelpers(game)) {
        save(game);
        try { window.dispatchEvent(new CustomEvent("cuddle:campaign-update", { detail: { runId: game.state.runId } })); } catch (_error) { /* next render */ }
      }
    }
  }

  function attach() {
    var host = document.getElementById("cuddleScreen");
    if (!host) {
      document.addEventListener("DOMContentLoaded", attach, { once: true });
      return;
    }
    var pending = false;
    new MutationObserver(function schedule() {
      if (pending) return;
      pending = true;
      requestAnimationFrame(function run() { pending = false; syncBodyClass(); });
    }).observe(host, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
    syncBodyClass();
  }
  attach();

  window.CuddleEasyMode = Object.freeze({ isEasy: isEasy, HELPERS: EASY_HELPERS.slice() });
}());
