/* Cuddle: the reward after a stage alternates.
 *
 * The pick after each cleared stage takes turns between a new badge (a
 * choice of ones you don't hold) and level-ups (badges you hold that can
 * still go a level higher), counted afresh in each world:
 *   - world 1: new badge, 1 level-up, new badge, 1 level-up...
 *   - world 2: 2 level-ups, new badge, 2 level-ups, new badge...
 *   - world 3: 3 level-ups, new badge, 3 level-ups, new badge...
 * Several level-ups are picked one after another, each a different badge
 * (the Level-Up stop's two picks work the same way).
 * A level-up stage with nothing left to level offers new badges instead.
 * Only the ordinary after-stage pick follows this: a Free Upgrade stop, an
 * event's pick, a boss's legendary pick and the starting rewards keep
 * their own offers, and so do Easy's guided picks and a school's promised
 * Epic offer. It's settled on the finished offer, after the layers that
 * wrap the draw.
 */
(function () {
  "use strict";

  var Engine = window.CuddleEngine;
  var proto = Engine && Engine.CuddleGame && Engine.CuddleGame.prototype;
  if (!proto || proto.__umtRewardRhythm) return;
  proto.__umtRewardRhythm = true;

  function tree() { return window.CuddleSkillTree || null; }

  function randomOf(game) {
    return typeof game.random === "function" ? function () { return game.random(); } : Math.random;
  }

  function shuffled(items, random) {
    var out = items.slice();
    for (var i = out.length - 1; i > 0; i -= 1) {
      var j = Math.floor(random() * (i + 1));
      var swap = out[i]; out[i] = out[j]; out[j] = swap;
    }
    return out;
  }

  function nodeFor(card) {
    var t = tree();
    if (!t || !card) return null;
    return t.resolve(card.key || card.id) || t.resolve(card.id) || t.resolve(card.title) || null;
  }

  // 0 for a badge not held; -1 when it isn't a badge of the tree at all.
  function levelOf(game, card) {
    var node = nodeFor(card);
    if (!node) return -1;
    return Number(tree().level(game, node)) || 0;
  }

  function canLevel(game, card) {
    var node = nodeFor(card);
    if (!node || node.type === "combo") return false;
    var level = Number(tree().level(game, node)) || 0;
    return level > 0 && level < (Number(node.maxLevel) || 1);
  }

  function nameOf(card) {
    var node = nodeFor(card);
    return node ? node.id : String(card && (card.key || card.id) || "");
  }

  // An ordinary after-stage pick (not a waystone, event, legendary or
  // starting pick).
  function ordinaryPick(state) {
    return Boolean(state && state.status === "upgrade" && state.upgradePhase === "round"
      && !state.waystoneOffer && !state.legendaryOffer && !state.umtEventPick
      && String(state.runId || "").indexOf(":duel:") === -1
      // Easy's short guided run picks its own helpers (cuddle-easy-mode.js).
      && String((state.megaState && state.megaState.difficulty) || state.difficulty || "").toLowerCase() !== "easy");
  }

  // This stage's turn, settled once per stage (the screen is drawn and
  // refreshed more than once).
  function turn(state) {
    var rhythm = state.umtRewardRhythm;
    if (!rhythm || typeof rhythm !== "object") rhythm = state.umtRewardRhythm = { count: 0, key: null, mode: null };
    var world = Math.max(0, Math.min(2, (state.bossGatesDone || []).length));
    var key = [state.runId || "", state.round || 0, state.secret || "", world].join(":");
    if (rhythm.key !== key) {
      // Counted per world: a new world starts its own turns.
      if (rhythm.world !== world) rhythm.count = 0;
      rhythm.world = world;
      rhythm.count += 1;
      rhythm.key = key;
      var first = world === 0 ? "new" : "level";
      rhythm.mode = rhythm.count % 2 === 1 ? first : (first === "new" ? "level" : "new");
      rhythm.picks = world + 1;
    }
    return rhythm;
  }

  function catalog(game) {
    try { return (game._upgradeCatalog() || []).filter(Boolean); } catch (_error) { return []; }
  }

  function withKey(card) {
    return card.key ? card : Object.assign({}, card, { key: card.id });
  }

  // Boss-grade badges that only come up as the economy's legendary picks
  // (applied as a boss reward through their "legendary:" key), so the
  // ordinary catalog never lists their next level.
  var BOSS_GRADE = ["cullRare", "freeVowelSweep", "secondCup"];

  function bossGradeCards(game) {
    var t = tree();
    return BOSS_GRADE.map(function (id) {
      var node = t.findNode(id);
      if (!node) return null;
      return {
        id: id, key: "legendary:" + id, icon: node.icon, title: node.title, name: node.title,
        description: node.description, kind: "legendary", tier: node.tier, rarity: node.tier,
        __cuddleV8Tier: node.tier, __cuddleV8LegendaryReward: id
      };
    }).filter(Boolean);
  }

  // skip: badge ids not to offer (a Level-Up stop's first pick).
  function levelChoices(game, count, skip) {
    var seen = {};
    (skip || []).forEach(function (name) { seen[name] = true; });
    var pool = catalog(game).concat(bossGradeCards(game)).filter(function (card) {
      var bossGrade = BOSS_GRADE.indexOf(card.id) !== -1;
      if ((String(card.key || "").indexOf("legendary:") === 0 && !bossGrade) || !canLevel(game, card)) return false;
      var name = nameOf(card);
      if (seen[name]) return false;
      seen[name] = true;
      return true;
    });
    return weightedPick(pool, count, randomOf(game)).map(withKey);
  }

  // Level-ups favour the cheaper badges: a common badge comes up for its
  // next level most often, an epic or legendary least.
  var LEVEL_WEIGHT = { common: 4, rare: 3, epic: 1.5, legendary: 1 };
  function levelWeight(card) {
    var node = nodeFor(card);
    var tier = String((node && node.tier) || card.__cuddleV8Tier || card.tier || "common").toLowerCase();
    return LEVEL_WEIGHT[tier] || LEVEL_WEIGHT.common;
  }
  // Drawn without repeats, each card's chance in line with its weight.
  function weightedPick(pool, count, random) {
    return pool
      .map(function (card) { return { card: card, key: Math.pow(Math.max(random(), 1e-9), 1 / levelWeight(card)) }; })
      .sort(function (a, b) { return b.key - a.key; })
      .slice(0, count)
      .map(function (entry) { return entry.card; });
  }

  function newChoices(game, generated, count) {
    var picks = generated.filter(function (card) { return levelOf(game, card) <= 0; });
    if (picks.length >= count) return picks.slice(0, count);
    var taken = {};
    picks.forEach(function (card) { taken[nameOf(card)] = true; });
    var tier = generated[0] && generated[0].__cuddleV8Tier;
    var spare = shuffled(catalog(game).filter(function (card) {
      return levelOf(game, card) === 0 && !taken[nameOf(card)] && String(card.key || "").indexOf("legendary:") !== 0;
    }), randomOf(game));
    // Same rarity as the offer first, then any.
    spare.sort(function (a, b) { return (a.__cuddleV8Tier === tier ? 0 : 1) - (b.__cuddleV8Tier === tier ? 0 : 1); });
    for (var i = 0; i < spare.length && picks.length < count; i += 1) {
      taken[nameOf(spare[i])] = true;
      picks.push(withKey(spare[i]));
    }
    return picks.length ? picks : generated;
  }

  // Settles the offer on screen. Runs on the finished offer, after every
  // layer that wraps the draw has had its say, except a school's promised
  // Epic offer (cuddle-schools.js), which is kept.
  // The stop the run is standing on.
  function currentNode(state) {
    var map = state && state.branchMap;
    var position = map && map.position;
    var row = position && Array.isArray(map.rows) ? map.rows[Number(position.row)] : null;
    return row && Array.isArray(row.nodes) ? row.nodes[Number(position.col)] || null : null;
  }

  // A Trial or Duel pays a new badge, not a level: badges of its tier you
  // don't hold yet, topped up from the catalog when the draw brought ones
  // you have.
  function newOfTier(game, drawn, tier) {
    var picks = (drawn || []).filter(function (card) { return levelOf(game, card) <= 0; });
    var taken = {};
    picks.forEach(function (card) { taken[nameOf(card)] = true; });
    var spare = shuffled(catalog(game).filter(function (card) {
      return card.__cuddleV8Tier === tier && levelOf(game, card) === 0 && !taken[nameOf(card)];
    }), randomOf(game));
    for (var i = 0; i < spare.length && picks.length < 3; i += 1) {
      taken[nameOf(spare[i])] = true;
      picks.push(withKey(spare[i]));
    }
    return picks;
  }

  // A passed Trial pays one of three Rare badges instead of the turn's
  // pick (a won Duel pays an Epic one, cuddle-expanded-stages.js).
  function trialPick(game) {
    var state = game.state;
    if (!ordinaryPick(state)) return false;
    var node = currentNode(state);
    var map = window.CuddleBranchMap;
    if (!node || node.type !== "trial" || !map || typeof map.tierChoices !== "function") return false;
    var choices = newOfTier(game, map.tierChoices(game, "rare"), "rare");
    if (!choices.length) return false;
    state.upgradeChoices = choices;
    state.waystoneOffer = true;
    state.umtEventPick = { title: "Trial", kicker: "TRIAL PASSED", tier: "rare" };
    return true;
  }

  function apply(game) {
    var state = game.state;
    if (trialPick(game)) return;
    if (!ordinaryPick(state) || !tree() || !Array.isArray(state.upgradeChoices) || !state.upgradeChoices.length) return;
    if (state.umtSchools && state.umtSchools.epicNext) return;
    var rhythm = turn(state);
    var offered = state.upgradeChoices;
    var count = offered.length;
    if (rhythm.mode === "level") {
      // A refresh of a later pick keeps leaving out the badges already raised.
      var stop = state.umtLevelStop && state.umtLevelStop.key === rhythm.key ? state.umtLevelStop : null;
      var levels = levelChoices(game, Math.max(3, count), stop ? stop.done : []);
      if (levels.length) {
        rhythm.shown = "level";
        state.upgradeChoices = levels;
        var picks = Number(rhythm.picks) || 1;
        if (!stop) state.umtLevelStop = picks > 1 ? { pick: 1, of: picks, done: [], key: rhythm.key } : null;
        return;
      }
    }
    rhythm.shown = "new";
    if (state.umtLevelStop && state.umtLevelStop.key) state.umtLevelStop = null;
    state.upgradeChoices = newChoices(game, offered, count);
  }

  // Where an after-stage offer is made: a stage solved, a boss beaten, a
  // refresh of the offer.
  ["_resolvePendingRoundEnd", "_clearBoss", "refreshUpgradeChoices"].forEach(function (name) {
    var original = proto[name];
    if (typeof original !== "function") return;
    proto[name] = function withRewardRhythm() {
      var result = original.apply(this, arguments);
      try { apply(this); } catch (error) { console.warn("Cuddle reward rhythm:", error); }
      return result;
    };
  });

  // The Level-Up stop (cuddle-branch-map.js openLevelUpStop): after its
  // first pick, a second one, never the badge just raised.
  var pickedBefore = proto.chooseUpgrade;
  if (typeof pickedBefore === "function") {
    proto.chooseUpgrade = function chooseUpgradeLevelStop(choiceKey) {
      var state = this.state;
      var stop = state && state.status === "upgrade" ? state.umtLevelStop : null;
      var picked = stop && (state.upgradeChoices || []).find(function (item) { return item.key === choiceKey; });
      if (!stop) return pickedBefore.apply(this, arguments);
      // Whether a second pick follows is known up front: if so, the stop
      // isn't left behind yet (no _advanceRound, so no stage-clear money
      // twice and no step on the road).
      var done = stop.done.concat(picked ? [nameOf(picked)] : []);
      var next = stop.pick < stop.of ? levelChoices(this, 3, done) : [];
      var result;
      if (next.length) {
        this._advanceRound = function holdLevelStop() { return undefined; };
        try {
          result = pickedBefore.apply(this, arguments);
        } finally {
          delete this._advanceRound;
        }
      } else {
        result = pickedBefore.apply(this, arguments);
      }
      if (!result || result.ok === false) return result;
      state = this.state;
      stop.done = done;
      if (!next.length) {
        state.umtLevelStop = null;
        return result;
      }
      stop.pick += 1;
      state.umtLevelStop = stop;
      state.status = "upgrade";
      state.upgradePhase = "round";
      state.upgradeMilestone = null;
      state.upgradeChoices = next;
      // A Level-Up stop's offer stays a waystone's (no refreshes); an
      // after-stage pick stays an ordinary one.
      state.waystoneOffer = Boolean(stop.waystone);
      try { this.save(); } catch (_error) { /* next save */ }
      return result;
    };
  }

  window.CuddleRewardRhythm = Object.freeze({
    newOfTier: newOfTier,
    levelChoices: levelChoices,
    // New badges only, from an offer (topped up from the catalog).
    newChoices: function (game, generated, count) {
      var picks = newChoices(game, generated || [], count);
      return picks.filter(function (card) { return levelOf(game, card) <= 0; });
    },
    nameOf: nameOf,
    // "level" or "new" for the reward screen on now, or null.
    shown: function shown(state) {
      return ordinaryPick(state) && state.umtRewardRhythm ? state.umtRewardRhythm.shown || null : null;
    }
  });
}());
