/* CUDDLE SYNERGIES -- combo bonuses between two upgrades.
 * Owning both halves of a pair switches its combo on for the rest of the
 * run. This file adds seven new combos (their effects live here) and, for
 * the upgrade picker, previews EVERY combo a card would complete -- the new
 * ones and the engine's existing ones (Golden Tempo, Quest Binding,
 * Illustrated Start, Endless Margins), whose effects stay in the engine.
 *
 * A requirement is a list of alternative ids: any one of them owned counts
 * (Golden Tempo accepts either colour-value reward, for example).
 */
(function bootstrapCuddleSynergies() {
  "use strict";

  const Engine = window.CuddleEngine;
  const Game = Engine && Engine.CuddleGame;
  if (!Game) {
    console.error("Cuddle Synergies: the Cuddle engine was not available.");
    return;
  }
  const proto = Game.prototype;

  const COMBOS = Object.freeze([
    { id: "secondWind", icon: "🌬️", title: "Second Wind", requires: [["extraMulligans"], ["mulliganValueBoost"]],
      effect: "Each unused mulligan pays +3 more points when you solve." },
    { id: "questMaster", icon: "🎖️", title: "Quest Master", requires: [["questPoints"], ["questReroll"]],
      effect: "Every completed quest also pays +$2." },
    { id: "deepGrey", icon: "🌫️", title: "Deep Grey", requires: [["greyscale"], ["greyPointBoost"]],
      effect: "Every grey tile pays +1 more point." },
    { id: "fullHouse", icon: "🂡", title: "Full House", requires: [["handSizeBoost"], ["jokerPerRound"]],
      effect: "Every stage opens with +1 mulligan." },
    { id: "scholarsEye", icon: "🔎", title: "Scholar's Eye", requires: [["greenCount"], ["categorySense"]],
      effect: "Every solved stage pays +$3." },
    { id: "busyDay", icon: "📋", title: "Busy Day", requires: [["surprise-assignment"], ["questRefreshes"]],
      effect: "Every completed quest pays +5 more points." },
    { id: "fastStory", icon: "📚", title: "Fast Story", requires: [["storybookStart"], ["earlySolveBoost"]],
      effect: "Solve by guess 3 for +15 points." },
    // Existing engine combos: previewed here, applied by the engine.
    { id: "goldenTempo", icon: "⚡", title: "Golden Tempo", engine: true, requires: [["colourTrade", "yellowPoints"], ["earlySolveBoost", "earlyRoundPoint"]],
      effect: "Every solved stage gives +5 points." },
    { id: "questBinding", icon: "🔗", title: "Quest Binding", engine: true, requires: [["questPoints"], ["questSpark"]],
      effect: "Completed quests give another +5 points." },
    { id: "illustratedStart", icon: "🌟", title: "Illustrated Start", engine: true, requires: [["storybookStart"], ["openingClue"]],
      effect: "Stages open with another +5 points." },
    { id: "endlessMargins", icon: "🖋️", title: "Endless Margins", engine: true, requires: [["wideChoice"], ["questRefreshes"]],
      effect: "Quest reward screens show one extra option." }
  ]);
  const COMBO_BY_ID = new Map(COMBOS.map(combo => [combo.id, combo]));

  function num(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  // "umtHotStreak" -> "hotStreak": rebalance-v5 prefixes its reward ids.
  function normalizeId(id) {
    const text = String(id || "");
    return /^umt[A-Z]/.test(text) ? text.charAt(3).toLowerCase() + text.slice(4) : text;
  }

  function ownedLevel(game, id) {
    const state = game && game.state;
    if (!state) return 0;
    const rebalance = window.CuddleRebalanceV5;
    const candidates = [
      state.upgrades && state.upgrades[id],
      state.cuddleBonuses && state.cuddleBonuses[id],
      state.balanceRewardCounts && state.balanceRewardCounts[id]
    ];
    if (id === "categorySense") candidates.push(state.cuddleCampaign && state.cuddleCampaign.categorySense);
    const mega = state.megaState || {};
    if (id === "greenCount" && mega.greenCountUnlocked) candidates.push(1);
    // Wild Card and Joker Cache share one per-stage Joker counter; Joker
    // Cache's share (two per level) is taken back out to find Wild Card's.
    if (id === "jokerPerRound") {
      const cache = num(state.cuddleRebalanceV5 && state.cuddleRebalanceV5.cuddleUserJokerCachePerRoundLevel);
      candidates.push(num(mega.jokerPerRoundBonus) - 2 * cache);
    }
    if (rebalance && typeof rebalance.upgradeLevel === "function") {
      try { candidates.push(rebalance.upgradeLevel(game, id)); } catch (_error) { /* not tracked there */ }
    }
    // The acquisition ledger is the fallback for rewards with no counter.
    if (Array.isArray(state.rewardBookHistory) && state.rewardBookHistory.some(entry => entry && normalizeId(entry.id) === id)) {
      candidates.push(1);
    }
    return Math.max(0, ...candidates.map(num));
  }

  function groupOwned(game, group) {
    return group.some(id => ownedLevel(game, id) > 0);
  }

  function comboActive(game, combo) {
    return combo.requires.every(group => groupOwned(game, group));
  }

  function titleFor(id) {
    const tree = window.CuddleSkillTree;
    const node = tree && typeof tree.findNode === "function" ? tree.findNode(id) : null;
    return (node && node.title) || id;
  }

  function engineComboOwned(game, combo) {
    const owned = game.state && game.state.rewardSynergies;
    return Array.isArray(owned) && owned.includes(combo.id);
  }

  // The combo THIS card would complete: its id is in one requirement group,
  // and every other group is already owned. Returns the partner's name so
  // the card can say what it combines with.
  function preview(game, optionId) {
    if (!game || !game.state) return null;
    const id = normalizeId(optionId);
    for (const combo of COMBOS) {
      if (combo.engine ? engineComboOwned(game, combo) : ownsCombo(game, combo.id)) continue;
      const mine = combo.requires.findIndex(group => group.includes(id));
      if (mine === -1) continue;
      const others = combo.requires.filter((_group, index) => index !== mine);
      if (!others.every(group => groupOwned(game, group))) continue;
      const partnerId = others.map(group => group.find(candidate => ownedLevel(game, candidate) > 0)).find(Boolean);
      return {
        id: combo.id,
        icon: combo.icon,
        title: combo.title,
        partner: titleFor(partnerId),
        effect: combo.effect,
        description: `${combo.title} with ${titleFor(partnerId)}: ${combo.effect}`
      };
    }
    return null;
  }

  // -- owned combos -----------------------------------------------------------

  function ownedList(game) {
    const state = game.state;
    if (!Array.isArray(state.umtSynergies)) state.umtSynergies = [];
    return state.umtSynergies;
  }

  function ownsCombo(game, id) {
    return ownedList(game).includes(id);
  }

  function refresh(game, announce) {
    if (!game || !game.state) return [];
    const owned = ownedList(game);
    const unlocked = COMBOS.filter(combo => !combo.engine && !owned.includes(combo.id) && comboActive(game, combo));
    unlocked.forEach(combo => owned.push(combo.id));
    if (announce && unlocked.length) {
      game.state.synergyNotice = {
        icon: "✨",
        title: unlocked.length === 1 ? "Combo unlocked" : "Combos unlocked",
        message: unlocked.map(combo => `${combo.icon} ${combo.title}: ${combo.effect}`).join(" ")
      };
    }
    return unlocked;
  }

  function wrap(name, build) {
    const original = proto[name];
    if (typeof original !== "function") return;
    proto[name] = build(original);
  }

  // Surprise Assignment is added to the upgrade pool by
  // cuddle-economy-rarity-v8.js, which also gives the card its own apply()
  // -- but the engine's chooseUpgrade doesn't know the id and refused it
  // ("Unknown upgrade."), so picking it did nothing at all. A pool card
  // the engine rejects but that carries its own apply() is applied here
  // and the pick finishes the way the engine finishes any other.
  function applyPoolOnlyChoice(game, choiceKey) {
    const state = game.state;
    const choice = (state.upgradeChoices || []).find(item => item && item.key === choiceKey);
    if (!choice || typeof choice.apply !== "function") return null;
    try { choice.apply(game); }
    catch (error) {
      console.warn("Cuddle Synergies: could not apply", choice.id, error);
      return null;
    }
    if (!Array.isArray(state.rewardBookHistory)) state.rewardBookHistory = [];
    state.rewardBookHistory.push({
      id: choice.id, icon: choice.icon || "✨", title: choice.title, description: choice.description || "",
      kind: "round", round: num(state.round) || 1
    });
    state.rewardBookHistory = state.rewardBookHistory.slice(-200);
    const special = state.upgradePhase === "difficultyStart" || state.upgradePhase === "milestone";
    state.lastMessage = `${choice.title} acquired.`;
    state.upgradeChoices = [];
    state.upgradePhase = null;
    state.upgradeMilestone = null;
    if (!special && typeof game._advanceRound === "function") game._advanceRound();
    if (typeof game.save === "function") game.save();
    return { ok: true };
  }

  wrap("chooseUpgrade", original => function chooseUpgradeWithCombos(choiceKey) {
    let result = original.apply(this, arguments);
    if (result && result.ok === false && /unknown upgrade/i.test(String(result.error || ""))) {
      result = applyPoolOnlyChoice(this, choiceKey) || result;
    }
    if (!result || result.ok !== false) refresh(this, true);
    return result;
  });

  wrap("_hydrateState", original => function hydrateWithCombos() {
    const result = original.apply(this, arguments);
    refresh(this, false);
    return result;
  });

  // -- effects ------------------------------------------------------------------

  function stageBonus(game, amount, field, label) {
    const rebalance = window.CuddleRebalanceV5;
    if (rebalance && typeof rebalance.addStageBonus === "function") {
      rebalance.addStageBonus(game, amount, field, label);
      return;
    }
    game.state.score = num(game.state.score) + amount;
    game.state.roundScore = num(game.state.roundScore) + amount;
  }

  function moneyBonus(game, amount, note) {
    game.state.cuddleMoney = Math.max(0, num(game.state.cuddleMoney) + amount);
    game.state.lastMessage = `${game.state.lastMessage || ""} ${note}`.trim();
  }

  wrap("_beginRound", original => function beginRoundWithCombos() {
    const result = original.apply(this, arguments);
    if (this.state && !(typeof this.isBossRound === "function" && this.isBossRound()) && ownsCombo(this, "fullHouse")) {
      this.state.mulligansLeft = Math.max(0, num(this.state.mulligansLeft)) + 1;
    }
    return result;
  });

  wrap("submitDraft", original => function submitDraftWithCombos() {
    const state = this.state;
    const before = state && Array.isArray(state.history) ? state.history.length : 0;
    const boss = Boolean(this.isBossRound && this.isBossRound());
    const result = original.apply(this, arguments);
    const history = this.state && Array.isArray(this.state.history) ? this.state.history : [];
    if (!result || !result.ok || boss || history.length <= before) return result;
    const entry = history[history.length - 1];
    const solved = Boolean(entry && this.state.secret && entry.word === this.state.secret);

    if (ownsCombo(this, "deepGrey")) {
      const greys = (entry.feedback || []).filter(value => value === "grey").length;
      if (greys) stageBonus(this, greys, "umtComboDeepGrey", "Deep Grey");
    }
    if (entry.questComplete) {
      if (ownsCombo(this, "busyDay")) stageBonus(this, 5, "umtComboBusyDay", "Busy Day");
      if (ownsCombo(this, "questMaster")) moneyBonus(this, 2, "Quest Master: +$2.");
    }
    if (solved) {
      if (ownsCombo(this, "secondWind")) {
        const spare = Math.max(0, num(this.state.mulligansLeft));
        if (spare) stageBonus(this, spare * 3, "umtComboSecondWind", "Second Wind");
      }
      if (ownsCombo(this, "fastStory") && history.length <= 3) stageBonus(this, 15, "umtComboFastStory", "Fast Story");
      if (ownsCombo(this, "scholarsEye")) moneyBonus(this, 3, "Scholar's Eye: +$3.");
    }
    return result;
  });

  // -- progression tree -------------------------------------------------------
  // The new combos join the tree's Synergy Combos branch, drawn between the
  // two upgrades they need.
  (function addToCatalogue() {
    const tree = window.CuddleSkillTree;
    const branch = tree && Array.isArray(tree.BRANCHES) ? tree.BRANCHES.find(item => item.id === "synergyCombos") : null;
    if (!branch || !Array.isArray(branch.nodes) || Object.isFrozen(branch.nodes)) return;
    COMBOS.filter(combo => !combo.engine).forEach(combo => {
      if (branch.nodes.some(node => node.id === combo.id)) return;
      branch.nodes.push({
        id: combo.id,
        icon: combo.icon,
        title: combo.title,
        tier: "legendary",
        category: "combo",
        maxLevel: 1,
        description: `${combo.requires.map(group => titleFor(group[0])).join(" + ")}: ${combo.effect}`,
        requires: combo.requires.map(group => group[0]),
        level: game => (game && game.state && ownsCombo(game, combo.id) ? 1 : 0)
      });
    });
  }());

  window.CuddleSynergies = Object.freeze({
    combos: COMBOS.map(combo => ({ id: combo.id, icon: combo.icon, title: combo.title, effect: combo.effect, engine: Boolean(combo.engine) })),
    preview,
    owns: (game, id) => (COMBO_BY_ID.get(id) && COMBO_BY_ID.get(id).engine ? engineComboOwned(game, COMBO_BY_ID.get(id)) : ownsCombo(game, id)),
    refresh
  });
}());
