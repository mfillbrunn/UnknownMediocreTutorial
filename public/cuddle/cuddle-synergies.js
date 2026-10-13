/* CUDDLE SYNERGIES -- combo bonuses between two upgrades.
 * The combos themselves were retired for the schools (cuddle-schools.js),
 * and the engine's own pairs (Golden Tempo and the rest) are switched off
 * there too. What stays: the combo machinery (empty for now), and the fix
 * that lets a pool-only card with its own apply() be picked.
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

  // The two-badge combos were replaced by the schools' ranks
  // (cuddle-schools.js): a school rewards leaning into a whole style, not
  // one particular pair. The machinery stays for any combo added later;
  // combos a save already unlocked no longer do anything.
  const COMBOS = Object.freeze([]);
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
    // Playstyle powers (cuddle-powers.js, cuddle-strategies.js) keep their
    // own levels; the Cuddle Meter's threshold lives on the coach.
    if (state.umtPowers && state.umtPowers.levels) candidates.push(state.umtPowers.levels[id]);
    if (id === "coachMeterThreshold") candidates.push(state.cuddleCoachExpansion && state.cuddleCoachExpansion.cuddleThresholdStacks);
    const mega = state.megaState || {};
    if (id === "greenCount" && mega.greenCountUnlocked) candidates.push(1);
    if (Array.isArray(state.umtBossRewardsTaken)
        && state.umtBossRewardsTaken.some(taken => normalizeId(taken) === id || taken === id)) candidates.push(1);
    // Boss / Legendary rewards that keep their own flag rather than a counter.
    const rebalanceState = state.cuddleRebalanceV5 || {};
    const coachOwned = (state.cuddleCoachExpansion && state.cuddleCoachExpansion.newBossRewardsOwned) || [];
    if ((id === "allThemes" || id === "allThemesBoss") && (rebalanceState.allThemesUnlocked || coachOwned.includes("umtAllThemes"))) candidates.push(1);
    if (id === "jokerCache") candidates.push(num(rebalanceState.cuddleUserJokerCachePerRoundLevel), num(rebalanceState.upgrades && rebalanceState.upgrades.umtJokerCache));
    if (id === "jokerCacheLarge") candidates.push(num(rebalanceState.upgrades && rebalanceState.upgrades.umtJokerCacheLarge));
    if (id === "questPersistReward" && mega.questPersistsForRound) candidates.push(1);
    if ((id === "goldenCompass" || id === "secondCup") && coachOwned.includes(id)) candidates.push(1);
    if (id === "alphabet-compass" && window.CuddleEconomyRarityV8 && typeof window.CuddleEconomyRarityV8.stack === "function") {
      candidates.push(num(window.CuddleEconomyRarityV8.stack(state, "alphabet-compass")));
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

  // Names for requirement ids the talent tree files under another id.
  const TITLES = Object.freeze({
    allThemes: "All-Seeing Atlas", allThemesBoss: "All-Seeing Atlas", jokerCache: "Small Joker Cache", jokerCacheLarge: "Large Joker Cache", cullRare: "Deep Cull",
    freeVowelSweep: "Free Vowel Sweep", doubleMulligans: "Double Mulligans", backupPlanReward: "Backup Plan",
    questPersistReward: "Lasting Quests", questDoublePick: "Double Pick", secondCup: "Second Cup",
    goldenCompass: "Golden Compass", "alphabet-compass": "Alphabet Compass",
    vowelLamp: "Vowel Lamp", patternLens: "Pattern Lens", deadLetter: "Dead Letter", treasureHunter: "Treasure Hunter"
  });
  function titleFor(id) {
    const tree = window.CuddleSkillTree;
    const node = tree && typeof tree.findNode === "function" ? tree.findNode(id) : null;
    return (node && node.title) || TITLES[id] || id;
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
    return COMBO_BY_ID.has(id) && ownedList(game).includes(id);
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
    if (!choice) return null;
    // apply() is a function and is lost when the run is saved and reloaded
    // on its reward screen; the rarity layer can still run the effect from
    // the id it left on the card.
    const v8 = window.CuddleEconomyRarityV8;
    const run = typeof choice.apply === "function"
      ? () => choice.apply(game)
      : choice.__cuddleV8Effect && v8 && typeof v8.applyEffect === "function"
        ? () => v8.applyEffect(choice.__cuddleV8Effect, game)
        : null;
    if (!run) return null;
    try { run(); }
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

  // A boss reward (or a Legendary pick, applied the same way) can complete a
  // combo too -- not only a between-round pick.
  wrap("_applyBossReward", original => function applyBossRewardWithCombos(rewardId) {
    const result = original.apply(this, arguments);
    // Some boss rewards (Deep Cull) leave no counter behind, so the ids
    // granted this way are recorded for ownedLevel.
    if (this.state && rewardId) {
      if (!Array.isArray(this.state.umtBossRewardsTaken)) this.state.umtBossRewardsTaken = [];
      if (!this.state.umtBossRewardsTaken.includes(rewardId)) this.state.umtBossRewardsTaken.push(rewardId);
    }
    refresh(this, true);
    return result;
  });

  wrap("_hydrateState", original => function hydrateWithCombos() {
    const result = original.apply(this, arguments);
    refresh(this, false);
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
        type: "combo",
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
