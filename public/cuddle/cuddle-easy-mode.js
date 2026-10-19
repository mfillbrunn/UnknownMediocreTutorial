/* Cuddle: Easy, a short guided run.
 *
 * Easy is a much smaller game than Medium and Hard:
 *   - one world: beating its boss wins the run;
 *   - the map is a straight line of Themed Wordles (and one Free Upgrade
 *     before the boss): no forks, shops, events, Unknown stops, Duels or
 *     Trials;
 *   - two themes of every answer are shown from the start;
 *   - every consonant of the answer is in the hand, from the opening hand
 *     and again after every guess, among a few others: 1 on the first
 *     stage, then 2, 3, 4, and 5 at the boss (DECOYS); no mulligans and no
 *     deck on screen;
 *   - a Crossroads stop after the second stage asks: more themes (every
 *     theme shown from then on) or more consonants (two more in every
 *     hand, and stages pay +50% points);
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
  var BASE_THEMES = 2;
  // Consonants in the hand besides the answer's, by stage (the boss last).
  // Stage 1: none (every letter there, nothing to sort out); stage 2 is the
  // Mulligan stage (MULLIGAN_STAGE); then up to 4, and 5 at the boss.
  var DECOYS = [0, 2, 2, 3, 4];
  var BOSS_DECOYS = 5;
  var MULLIGAN_STAGE = 2;
  var STAGE_MULLIGANS = 2;
  var EXTRA_DECOYS = 2;
  var CONSONANT_BONUS = 0.5;
  var CROSSROADS_ROW = 2;
  // The tour's first two stages use set words, so its cards can talk about
  // them: SCUBA (S, C, B in the hand), then TIGER on the Mulligan stage
  // with K and X beside G and R -- T waits on top of the deck.
  var TOUR_WORDS = {
    1: { word: "SCUBA", decoys: [] },
    2: { word: "TIGER", decoys: ["K", "X"] }
  };

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
          showThemes(state, BASE_THEMES);
          state.mulligansLeft = 0;
          clearQuests(state);
          state.cuddleMoneyTiles = [];
          save(this);
        }
      }
      return result;
    };
  }

  function showThemes(state, count) {
    if (!state.cuddleCampaign || typeof state.cuddleCampaign !== "object") state.cuddleCampaign = {};
    state.cuddleCampaign.categorySense = Math.max(count, Number(state.cuddleCampaign.categorySense) || 0);
  }

  function eduState(state) {
    if (!state.umtEdu || typeof state.umtEdu !== "object") state.umtEdu = { choice: null };
    return state.umtEdu;
  }

  // The Crossroads (cuddle-expanded-stages.js eduCrossroads).
  function choose(game, choice) {
    var state = game && game.state;
    if (!state) return "";
    var edu = eduState(state);
    edu.choice = choice === "consonants" ? "consonants" : "themes";
    if (edu.choice === "themes") {
      showThemes(state, MAX_THEMES);
      return "From here on, every answer shows all of its themes.";
    }
    return "From here on, two more consonants in every hand, and stages pay +50% points.";
  }

  // Which stage this is: Wordles and the boss reached so far (the
  // Crossroads and the Free Upgrade don't count).
  function stageNumber(state) {
    var map = state.branchMap;
    if (!map || !Array.isArray(map.rows) || !map.position) return 1;
    var row = Number(map.position.row);
    var count = 0;
    var stage = function stage(node) { return Boolean(node && node.type !== "event" && node.type !== "upgrade" && node.type !== "shop"); };
    var node = null;
    for (var i = 0; i <= row && i < map.rows.length; i += 1) {
      node = map.rows[i] && map.rows[i].nodes && map.rows[i].nodes[0];
      if (stage(node)) count += 1;
    }
    // Leaving the Crossroads, the next stage's word is picked before the
    // map moves on: that's the next stage.
    if (state.status === "playing" && !stage(node)) count += 1;
    return Math.max(1, count);
  }

  function tourWord(state) {
    if (!state || state.boss) return null;
    return TOUR_WORDS[stageNumber(state)] || null;
  }

  var basePickSecret = proto._pickSecret;
  if (typeof basePickSecret === "function") {
    proto._pickSecret = function pickSecretEasy() {
      // Only on the map's stage itself (the run's start picks a word too).
      var map = this.state && this.state.branchMap;
      var tour = isEasy(this) && map && map.position ? tourWord(this.state) : null;
      if (tour && this.getActiveWords().indexOf(tour.word) !== -1) return tour.word;
      return basePickSecret.apply(this, arguments);
    };
  }

  function decoyCount(state) {
    var base = DECOYS[Math.min(DECOYS.length - 1, stageNumber(state) - 1)];
    if (state.boss) base = BOSS_DECOYS;
    return base + (eduState(state).choice === "consonants" ? EXTRA_DECOYS : 0);
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
    // The Crossroads, once, after the second stage.
    if (!map.umtEduCrossroads && rows.length > CROSSROADS_ROW + 1 && position < CROSSROADS_ROW) {
      rows.splice(CROSSROADS_ROW, 0, { kind: "stops", act: 0, nodes: [{ type: "event", expandedEventId: "eduCrossroads", eduCrossroads: true, next: [] }] });
      map.umtEduCrossroads = true;
      changed = true;
    }
    rows.forEach(function line(row, index) {
      var nodes = row.nodes || [];
      var walked = map.position && Number(map.position.row) === index ? nodes[Number(map.position.col)] : null;
      var keep = walked || nodes.find(function c(node) { return node && node.eduCrossroads; })
        || nodes.find(function n(node) { return node && (node.type === "boss" || node.type === "final"); })
        || (row.restFork ? nodes.find(function u(node) { return node && node.type === "upgrade"; }) : null)
        || nodes[0];
      if (!keep) return;
      // Every stop is a Themed Wordle (cuddle-rebalance-v5.js gives it the
      // variant); here it just loses whatever else it was.
      if (!walked && index > position && !keep.eduCrossroads && keep.type !== "boss" && keep.type !== "final" && keep.type !== "upgrade") {
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
      // The Crossroads stays one (a first run's calm map turns events into
      // Wordles before this runs).
      if (keep.eduCrossroads && !walked && index > position && (keep.type !== "event" || keep.expandedEventId !== "eduCrossroads")) {
        keep.type = "event";
        keep.expandedEventId = "eduCrossroads";
        delete keep.cuddleVariant;
        changed = true;
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

  // The Mulligan stage: one consonant of the answer is held back -- on top
  // of the deck, so the player's first mulligan brings it in.
  function isMulliganStage(state) {
    return Boolean(state && state.status === "playing" && !state.boss && stageNumber(state) === MULLIGAN_STAGE);
  }

  function heldBack(game) {
    var state = game.state;
    if (!isMulliganStage(state)) return null;
    var secret = String(state.secret || "").toUpperCase();
    var key = secret + ":" + (state.round || 0);
    var record = state.umtEduMulligan;
    if (!record || record.key !== key) {
      var letter = secret.split("").find(function consonant(ch) { return "AEIOU".indexOf(ch) === -1; }) || null;
      record = state.umtEduMulligan = { key: key, letter: letter, done: !letter };
      state.mulligansLeft = Math.max(Number(state.mulligansLeft) || 0, STAGE_MULLIGANS);
    }
    return record.done ? null : record.letter;
  }

  function dealAnswer(game) {
    var state = game.state;
    var secret = String(state.secret || "").toUpperCase();
    if (!/^[A-Z]{5}$/.test(secret) || !Array.isArray(state.hand) || !Array.isArray(state.deck)) return;
    var vowel = function vowel(letter) { return typeof game.isVowelGlyph === "function" ? game.isVowelGlyph(letter) : "AEIOU".indexOf(letter) !== -1; };
    var need = {};
    secret.split("").forEach(function count(letter) { if (!vowel(letter)) need[letter] = (need[letter] || 0) + 1; });
    var hold = heldBack(game);
    if (hold) {
      // Out of the hand, onto the top of the deck (drawn first).
      state.hand = state.hand.filter(function keep(card) {
        if (!plain(game, card) || card.glyph !== hold) return true;
        state.deck.push(card);
        return false;
      });
      var top = state.deck.findIndex(function match(card) { return plain(game, card) && card.glyph === hold; });
      if (top < 0 && typeof game._newCard === "function") state.deck.push(game._newCard(hold, "deck"));
      else if (top >= 0 && top !== state.deck.length - 1) state.deck.push(state.deck.splice(top, 1)[0]);
      delete need[hold];
    }
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
    // Then the other consonants: as many as this stage allows.
    var wanted = decoyCount(state);
    var spareCount = function spareCount() {
      var seen = {};
      return state.hand.filter(function spare(card) {
        if (!plain(game, card)) return false;
        seen[card.glyph] = (seen[card.glyph] || 0) + 1;
        return seen[card.glyph] > (need[card.glyph] || 0);
      });
    };
    var tour = tourWord(state);
    var fixed = tour && tour.word === secret ? tour.decoys : [];
    var spares = spareCount();
    // A set word's decoys: any other spare goes first.
    if (fixed.length) {
      spares.sort(function setLast(a, b) { return (fixed.indexOf(a.glyph) !== -1) - (fixed.indexOf(b.glyph) !== -1); }).reverse();
    }
    var unset = function unset() { return fixed.length && spares.length && fixed.indexOf(spares[spares.length - 1].glyph) === -1; };
    while (spares.length > wanted || unset()) {
      var drop = spares.pop();
      state.hand.splice(state.hand.indexOf(drop), 1);
      // To the bottom: the held-back letter stays on top.
      state.deck.unshift(drop);
    }
    while (spares.length < wanted) {
      var from = state.deck.findIndex(function decoy(card) {
        if (!plain(game, card) || need[card.glyph] || card.glyph === hold || String(state.secret).indexOf(card.glyph) !== -1) return false;
        if (spares.some(function same(spare) { return spare.glyph === card.glyph; })) return false;
        return !fixed.length || fixed.indexOf(card.glyph) !== -1;
      });
      if (from < 0) {
        // A set decoy that isn't in the deck (discarded): made for the stage.
        var missing = fixed.find(function absent(letter) { return !spares.some(function same(spare) { return spare.glyph === letter; }); });
        if (!missing || typeof game._newCard !== "function") break;
        state.deck.unshift(game._newCard(missing, "deck"));
        from = 0;
      }
      var card = state.deck.splice(from, 1)[0];
      state.hand.push(card);
      spares.push(card);
    }
  }

  var basePrepare = proto._prepareInitialHand;
  proto._prepareInitialHand = function prepareInitialHandEasy() {
    var result = basePrepare.apply(this, arguments);
    if (isEasy(this)) {
      try { dealAnswer(this); } catch (error) { console.warn("Cuddle Easy: dealing the answer failed.", error); }
    }
    return result;
  };

  // Refills go through the same deal: the answer's consonants and this
  // stage's share of others, not a hand filled to its size.
  var baseDraw = proto.drawToHandLimit;
  if (typeof baseDraw === "function") {
    proto.drawToHandLimit = function drawToHandLimitEasy() {
      if (!isEasy(this) || !this.state || this.state.status !== "playing" || !this.state.secret) return baseDraw.apply(this, arguments);
      try { dealAnswer(this); } catch (error) { console.warn("Cuddle Educational: dealing the answer failed.", error); }
      return [];
    };
  }

  // Is any consonant of the answer missing from the hand (a stage that
  // picks its answer after the deal, say)?
  function handMissesAnswer(game) {
    var state = game.state;
    var secret = String(state.secret || "").toUpperCase();
    if (!/^[A-Z]{5}$/.test(secret) || !Array.isArray(state.hand)) return false;
    var glyphs = state.hand.map(function g(card) { return card && card.glyph; });
    // The Mulligan stage's held-back letter is missing on purpose.
    var record = state.umtEduMulligan;
    var hold = isMulliganStage(state) && record && !record.done ? record.letter : null;
    return secret.split("").some(function missing(letter) {
      if ("AEIOU".indexOf(letter) !== -1 || letter === hold) return false;
      var need = secret.split("").filter(function same(x) { return x === letter; }).length;
      return glyphs.filter(function same(x) { return x === letter; }).length < need;
    });
  }

  function keepHandDealt(game) {
    var state = game && game.state;
    if (!state || state.status !== "playing" || !isEasy(game) || (state.draft || []).length) return false;
    var stale = handMissesAnswer(game) || state.umtEduDealtFor !== String(state.secret) + ":" + (state.history || []).length;
    if (!stale) return false;
    try { dealAnswer(game); } catch (_error) { return false; }
    state.umtEduDealtFor = String(state.secret) + ":" + (state.history || []).length;
    return true;
  }

  // Consonants are spent by a guess: the hand is topped up with the
  // answer's again after each one.
  var baseSubmit = proto.submitDraft;
  if (typeof baseSubmit === "function") {
    proto.submitDraft = function submitDraftEasy() {
      // No mulligans here, whatever a stage's start may have added (they
      // would pay as unused at the solve).
      if (isEasy(this) && this.state && !isMulliganStage(this.state)) this.state.mulligansLeft = 0;
      var result = baseSubmit.apply(this, arguments);
      var state = this.state;
      var history = state && Array.isArray(state.history) ? state.history : [];
      var last = history[history.length - 1];
      if (isEasy(this) && result && result.ok && last && last.word === state.secret && !last.umtEduBonus
          && eduState(state).choice === "consonants" && window.CuddleRebalanceV5 && typeof window.CuddleRebalanceV5.addStageBonus === "function") {
        last.umtEduBonus = true;
        var bonus = Math.round((Number(state.roundScore) || 0) * CONSONANT_BONUS);
        if (bonus > 0) window.CuddleRebalanceV5.addStageBonus(this, bonus, "umtEduConsonants", "More consonants: +50%");
      }
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
      if (!isEasy(this)) return baseMulligan.apply(this, arguments);
      if (!isMulliganStage(this.state)) return { ok: false, error: "No mulligans here: your hand already holds the answer's letters." };
      var result = baseMulligan.apply(this, arguments);
      if (result && result.ok && this.state.umtEduMulligan) this.state.umtEduMulligan.done = true;
      return result;
    };
  }

  // -- no reward after the first stage -----------------------------------------
  // The tour explains the points there; picking a reward comes after the
  // Mulligan stage.
  var baseResolveEnd = proto._resolvePendingRoundEnd;
  if (typeof baseResolveEnd === "function") {
    proto._resolvePendingRoundEnd = function resolvePendingRoundEndEasy() {
      var result = baseResolveEnd.apply(this, arguments);
      var state = this.state;
      var stats = state && state.umtRunStats;
      if (isEasy(this) && state && state.status === "upgrade" && state.upgradePhase === "round" && !state.boss
          && (Number(stats && stats.stages) || 0) <= 1 && stageNumber(state) <= 1 && typeof this._advanceRound === "function") {
        state.upgradeChoices = [];
        state.upgradePhase = null;
        state.upgradeMilestone = null;
        this._advanceRound();
        save(this);
      }
      return result;
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
    document.body.classList.toggle("umt-edu-mulligan", on && isMulliganStage(game.state));
    if (on) {
      keepMapStraight(game);
      if (keepHandDealt(game)) {
        save(game);
        try { window.dispatchEvent(new CustomEvent("cuddle:campaign-update", { detail: { runId: game.state.runId } })); } catch (_error) { /* next render */ }
      }
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

  window.CuddleEasyMode = Object.freeze({ isEasy: isEasy, choose: choose,
    isMulliganStage: function mulliganStage(game) { return isEasy(game) && isMulliganStage(game && game.state); },
    stageNumber: function stage(game) { return game && game.state ? stageNumber(game.state) : 0; }, HELPERS: EASY_HELPERS.slice(), DECOYS: DECOYS.slice() });
}());
