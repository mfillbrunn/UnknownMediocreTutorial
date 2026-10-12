/* CUDDLE SYNERGIES -- combo bonuses between two upgrades.
 * Owning both halves of a pair switches its combo on for the rest of the
 * run. This file adds its own combos (their effects live here) and, for
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

  // Combos are Legendary: each should be worth chasing on its own. Most
  // point at one of the run's strategies (Sprint, Eliminator, Minimalist,
  // Deck Churn, Untouched, Quests, Banker, Gambler, Purist, Painter) so a
  // player who leans into one is told where it can go next.
  const COMBOS = Object.freeze([
    { id: "secondWind", icon: "🌬️", title: "Second Wind", requires: [["extraMulligans"], ["mulliganValueBoost"]],
      effect: "Each unused mulligan pays +8 points more when you solve" },
    { id: "questMaster", icon: "🎖️", title: "Quest Master", requires: [["questPoints"], ["questReroll"]],
      effect: "Each completed quest also pays +$5 and +10 points" },
    { id: "fullHouse", icon: "🂡", title: "Full House", requires: [["handSizeBoost"], ["jokerCache", "jokerCacheLarge"]],
      effect: "Start every stage with +2 mulligans" },
    // Combos around the Legendary and boss rewards.
    { id: "cartographer", icon: "🗺️", title: "Cartographer", requires: [["allThemesBoss", "allThemes"], ["categorySense"]],
      effect: "Every solved stage pays +30 points" },
    { id: "questEngine", icon: "⚙️", title: "Quest Engine", requires: [["questPersistReward"], ["questDoublePick"]],
      effect: "Each completed quest also pays +$6 and +10 points" },
    { id: "cleanSweep", icon: "🧹", title: "Clean Sweep", requires: [["cullRare"], ["freeVowelSweep"]],
      effect: "Start every stage with +2 mulligans" },
    { id: "safetyNet", icon: "🪢", title: "Safety Net", requires: [["secondCup"], ["doubleMulligans"]],
      effect: "Solve on the last guess of your guess window for +60 points" },
    { id: "scholarsEye", icon: "🔎", title: "Scholar's Eye", requires: [["greenCount"], ["categorySense"]],
      effect: "Every solved stage pays +$8" },
    { id: "busyDay", icon: "📋", title: "Busy Day", requires: [["surprise-assignment"], ["questRefreshes"]],
      effect: "Each completed quest pays +15 points more" },
    { id: "fastStory", icon: "📚", title: "Fast Story", requires: [["storybookStart"], ["earlySolveBoost"]],
      effect: "Solve by guess 3 for +40 points" },
    // Insight combos (rewards in cuddle-clues.js).
    { id: "lamplighter", icon: "🏮", title: "Lamplighter", requires: [["vowelLamp"], ["patternLens"]],
      effect: "Start every stage with +2 mulligans" },
    // Strategy combos.
    { id: "scorchedEarth", icon: "🔥", title: "Scorched Earth", requires: [["greyscale"], ["strikeThrough"]],
      effect: "A guess with no green or yellow at all pays +15 points" },
    { id: "staticCharge", icon: "⚡", title: "Static Charge", requires: [["strikeThrough"], ["coachMeterThreshold"]],
      effect: "Every consonant ruled out also charges the Cuddle Meter by 1" },
    { id: "ascetic", icon: "🕯️", title: "Ascetic", requires: [["leanBuild"], ["monksVow"]],
      effect: "Skipping a reward pays +30 points more" },
    { id: "riptide", icon: "🌊", title: "Riptide", requires: [["waveTiles"], ["fullCircle"]],
      effect: "Every time your deck reshuffles, gain +2 mulligans" },
    { id: "stillWaters", icon: "🌙", title: "Still Waters", requires: [["mulliganValueBoost"], ["luckyClover"]],
      effect: "Solve a stage without using a mulligan for +30 points" },
    { id: "blitz", icon: "🚀", title: "Blitz", requires: [["earlySolveBoost"], ["bigOpener"]],
      effect: "Solve by guess 2 for +50 points" },
    { id: "overtime", icon: "⏱️", title: "Overtime", requires: [["questPoints"], ["questCadence"]],
      effect: "Each completed quest pays +20 points more" },
    { id: "compound", icon: "🏦", title: "Compound Interest", requires: [["rainyDay", "umtRainyDay"], ["treasureHunter", "umtTreasureHunter"]],
      effect: "Every solved stage pays +$8" },
    { id: "jackpot", icon: "🎲", title: "Jackpot", requires: [["highRoller"], ["doubleDown", "umtDoubleDown"]],
      effect: "A won High Roller bet pays half the bet again" },
    { id: "purist", icon: "🎯", title: "Purist", requires: [["hardMode"], ["momentum"]],
      effect: "A hard-mode solve pays +30 points more" },
    { id: "brushwork", icon: "🎨", title: "Brushwork", requires: [["colourTrade", "yellowPoints"], ["momentum"]],
      effect: "Each guess with 3 or more greens pays +10 points" },
    // Existing engine combos: previewed here, applied by the engine.
    { id: "goldenTempo", icon: "⚡", title: "Golden Tempo", engine: true, requires: [["colourTrade", "yellowPoints"], ["earlySolveBoost", "earlyRoundPoint"]],
      effect: "Every solved stage pays +20 points" },
    { id: "endlessMargins", icon: "🖋️", title: "Endless Margins", engine: true, requires: [["wideChoice"], ["questRefreshes"]],
      effect: "Quest reward screens show 1 extra choice" }
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
    // A guess past the window earns nothing, money included.
    const history = game.state && Array.isArray(game.state.history) ? game.state.history : [];
    const last = history[history.length - 1];
    if (last && num(last.latePenalty) > 0) return;
    game.state.cuddleMoney = Math.max(0, num(game.state.cuddleMoney) + amount);
    game.state.lastMessage = `${game.state.lastMessage || ""} ${note}`.trim();
  }

  function stageKeyOf(state) {
    return [state.runId || "", state.round || 0, state.secret || ""].join(":");
  }

  // Still Waters: remember a stage in which a mulligan was used.
  wrap("mulligan", original => function mulliganNoted() {
    const result = original.apply(this, arguments);
    if (result && result.ok && this.state) this.state.umtMulliganUsed = stageKeyOf(this.state);
    return result;
  });

  wrap("_beginRound", original => function beginRoundWithCombos() {
    const result = original.apply(this, arguments);
    // Combos work in every stage, boss fights included.
    if (this.state) {
      // A badge picked through a path that skips chooseUpgrade (playstyle
      // powers, packs, the shop) still switches its combo on here.
      refresh(this, true);
      const extra = (ownsCombo(this, "fullHouse") ? 2 : 0) + (ownsCombo(this, "cleanSweep") ? 2 : 0)
        + (ownsCombo(this, "lamplighter") ? 2 : 0);
      const gained = extra && typeof this.mulliganGain === "function" ? this.mulliganGain(extra) : extra;
      if (gained) this.state.mulligansLeft = Math.max(0, num(this.state.mulligansLeft)) + gained;
    }
    return result;
  });

  wrap("submitDraft", original => function submitDraftWithCombos() {
    const state = this.state;
    const before = state && Array.isArray(state.history) ? state.history.length : 0;
    const result = original.apply(this, arguments);
    const history = this.state && Array.isArray(this.state.history) ? this.state.history : [];
    if (!result || !result.ok || history.length <= before) return result;
    const entry = history[history.length - 1];
    const solved = Boolean(entry && this.state.secret && entry.word === this.state.secret);

    // A guess past the quick-solve window earns nothing but its penalty.
    if (num(entry.latePenalty) > 0) return result;
    const shown = Array.isArray(entry.shownFeedback) ? entry.shownFeedback : (entry.feedback || []);
    const greens = shown.filter(value => value === "green").length;
    const yellows = shown.filter(value => value === "yellow").length;
    if (ownsCombo(this, "scorchedEarth") && !solved && greens + yellows === 0 && shown.length) {
      stageBonus(this, 15, "umtComboScorchedEarth", "Scorched Earth");
    }
    if (ownsCombo(this, "brushwork") && greens >= 3) stageBonus(this, 10, "umtComboBrushwork", "Brushwork");
    if (ownsCombo(this, "deepGrey")) {
      const greys = (entry.feedback || []).filter(value => value === "grey").length;
      if (greys) stageBonus(this, greys, "umtComboDeepGrey", "Deep Grey");
    }
    if (entry.questComplete) {
      if (ownsCombo(this, "busyDay")) stageBonus(this, 15, "umtComboBusyDay", "Busy Day");
      if (ownsCombo(this, "overtime")) stageBonus(this, 20, "umtComboOvertime", "Overtime");
      if (ownsCombo(this, "questMaster")) {
        stageBonus(this, 10, "umtComboQuestMaster", "Quest Master");
        moneyBonus(this, 5, "Quest Master: +$5.");
      }
      if (ownsCombo(this, "questEngine")) {
        stageBonus(this, 10, "umtComboQuestEngine", "Quest Engine");
        moneyBonus(this, 6, "Quest Engine: +$6.");
      }
    }
    if (solved) {
      if (ownsCombo(this, "secondWind")) {
        const spare = Math.max(0, num(this.state.mulligansLeft));
        if (spare) stageBonus(this, spare * 8, "umtComboSecondWind", "Second Wind");
      }
      if (ownsCombo(this, "fastStory") && history.length <= 3) stageBonus(this, 40, "umtComboFastStory", "Fast Story");
      if (ownsCombo(this, "blitz") && history.length <= 2) stageBonus(this, 50, "umtComboBlitz", "Blitz");
      if (ownsCombo(this, "stillWaters") && this.state.umtMulliganUsed !== stageKeyOf(this.state)) {
        stageBonus(this, 30, "umtComboStillWaters", "Still Waters");
      }
      if (ownsCombo(this, "scholarsEye")) moneyBonus(this, 8, "Scholar's Eye: +$8.");
      if (ownsCombo(this, "compound")) moneyBonus(this, 8, "Compound Interest: +$8.");
      if (ownsCombo(this, "cartographer")) stageBonus(this, 30, "umtComboCartographer", "Cartographer");
      if (ownsCombo(this, "compassRose") && history.length <= 4) moneyBonus(this, 4, "Compass Rose: +$4.");
      if (ownsCombo(this, "safetyNet")) {
        // The last guess of the bonus window: anything later is a late
        // guess, which earns nothing but its penalty (returned above).
        const lastRow = typeof this._solveGuessThreshold === "function" ? this._solveGuessThreshold() : 6;
        if (lastRow && history.length === lastRow) stageBonus(this, 60, "umtComboSafetyNet", "Safety Net");
      }
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
