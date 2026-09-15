// public/cuddle/cuddle-skill-tree.js
// Read-only reference data for the Cuddle "skill tree" screen AND for the
// live reward-card decorator in cuddle-economy-rarity-v8.js: every
// permanent upgrade and boss reward the game can offer, across every add-on
// module, tagged with a category (for color-coding) and a level function.
// This file only knows about data -- it never mutates game state.
(function () {
  "use strict";

  // Some rewards share a single numeric field in state.upgrades with a
  // second reward from a different pool (for example the "Richer Colours"
  // boss reward and the "Golden Value" round reward both add to
  // state.upgrades.yellowPoints -- the engine itself does not keep them
  // separate). Those nodes report their level from the same shared field;
  // that is a property of the underlying save data, not an approximation
  // introduced here.
  function upgradeCount(game, key) {
    const value = game?.state?.upgrades?.[key];
    return Number.isFinite(Number(value)) ? Number(value) : 0;
  }

  function coachState(game) {
    return game?.state?.cuddleCoachExpansion || null;
  }

  function campaignState(game) {
    return game?.state?.cuddleCampaign || null;
  }

  function bossRewardOwned(game, id) {
    const coach = coachState(game);
    const owned = coach?.newBossRewardsOwned;
    if (Array.isArray(owned)) return owned.includes(id);
    if (owned && typeof owned === "object") return Boolean(owned[id]);
    return false;
  }

  // Category-> {label, color} shown as a small colored badge on live
  // reward cards (cuddle-economy-rarity-v8.js) and used to color-group
  // the skill tree's own branches. "boss" always wins over a node's
  // functional category (see BRANCHES' bossRewards below) -- a boss
  // reward is visually a boss reward first, whatever it actually does.
  const CATEGORIES = Object.freeze({
    economy: { label: "Economy", color: "#5cd6a0" },
    solving: { label: "Solving Aid", color: "#5aa9ff" },
    easierStages: { label: "Easier Stages", color: "#b98cff" },
    quests: { label: "Quest", color: "#f6a94a" },
    combo: { label: "Combo", color: "#ff6fb0" },
    boss: { label: "Boss Reward", color: "#fb7185" }
  });

  // A node with no level() function at all (rather than one that returns
  // 0) means the current save format has no durable count for it -- it is
  // a one-shot effect (Position Peek) or only ever mutates a field it
  // shares with something else in a way that can't be told apart (Deep
  // Cull's removed-letter list). Those nodes always render as "not yet
  // picked up" / omit a level tag rather than guessing.
  const BRANCHES = Object.freeze([
    {
      id: "roundRewards",
      title: "Round Rewards",
      blurb: "Offered after most non-boss stages.",
      nodes: [
        { id: "extraMulligans", icon: "🔄", title: "Second Thoughts", tier: "common", category: "easierStages", description: "Gain one additional mulligan each round.", level: g => upgradeCount(g, "extraMulligans") },
        { id: "yellowPoints", icon: "🟨", title: "Golden Value", tier: "common", category: "economy", description: "Every yellow tile is worth 1 point more.", level: g => upgradeCount(g, "yellowPoints") },
        { id: "earlyRoundPoint", icon: "⏱️", title: "Quick Cuddle", tier: "common", category: "economy", description: "Each unused guess in the solve bonus is worth 1 point more.", level: g => upgradeCount(g, "earlyRoundPoint") },
        { id: "questRefreshes", icon: "♻️", title: "Reward Refresh", tier: "common", category: "quests", description: "Gain one refresh whenever you choose a quest reward.", level: g => upgradeCount(g, "questRefreshes") },
        { id: "questPoints", icon: "🏅", title: "Quest Value", tier: "common", category: "quests", description: "Quests are worth 5 points more. Stacks every time you take it.", level: g => upgradeCount(g, "questPoints") },
        { id: "questReroll", icon: "🔄", title: "Second Guess Quest", tier: "common", category: "quests", description: "Gain one charge to reroll your active quest for a different one, any turn you like.", level: g => upgradeCount(g, "questReroll") },
        { id: "mulliganSize", icon: "🃏", title: "Bigger Mulligan", tier: "common", category: "easierStages", maxLevel: 2, description: "Each mulligan may replace one additional card.", level: g => upgradeCount(g, "mulliganSize") },
        { id: "categorySense", icon: "🔮", title: "Theme Sense", tier: "rare", category: "solving", maxLevel: 6, description: "From now on, reveal one category at the start of every solution. Stacks.", level: g => Number(campaignState(g)?.categorySense) || 0 }
      ]
    },
    {
      id: "economyEngines",
      title: "Economy Engines",
      blurb: "Reward pool that pays out for how you play a round, not just for finishing it.",
      nodes: [
        { id: "rainyDay", icon: "🏦", title: "Rainy Day Fund", tier: "common", category: "economy", maxLevel: 2, description: "Every non-boss stage opens by paying 5% interest on your wallet, up to $25. Stacks.", level: g => upgradeCount(g, "rainyDay") },
        { id: "encore", icon: "🎬", title: "Encore", tier: "rare", category: "economy", maxLevel: 1, description: "Every third stage you solve pays a 75-point encore bonus.", level: g => upgradeCount(g, "encore") },
        { id: "hotStreak", icon: "🔥", title: "Hot Streak", tier: "rare", category: "economy", maxLevel: 2, description: "Each guess in a row that pins a new green pays a growing bonus: 5, then 10, then 15 points. A guess with no new green resets it.", level: g => upgradeCount(g, "hotStreak") },
        { id: "vowelBounty", icon: "🅰️", title: "Vowel Bounty", tier: "common", category: "economy", maxLevel: 2, description: "Every vowel in a secret you solve pays 5 points.", level: g => upgradeCount(g, "vowelBounty") },
        { id: "doubleDown", icon: "🎲", title: "Double Down", tier: "legendary", category: "economy", maxLevel: 1, description: "Solve on your very last guess and the whole stage pays double.", level: g => upgradeCount(g, "doubleDown") }
      ]
    },
    {
      id: "solvingAids",
      title: "Solving Aids",
      blurb: "Easy difficulty only -- Medium and Hard skip this entire branch.",
      easyOnly: true,
      nodes: [
        { id: "openingInsight", icon: "💡", title: "Opening Insight", tier: "rare", category: "solving", maxLevel: 2, description: "Start every non-boss Wordle with one additional exact-position hint.", level: g => upgradeCount(g, "openingInsight") },
        { id: "quickStudy", icon: "⏳", title: "Quick Study", tier: "common", category: "solving", maxLevel: 2, description: "Automatic hints arrive one guess sooner (minimum: every two guesses).", level: g => upgradeCount(g, "quickStudy") },
        { id: "jokerCache", icon: "🃏", title: "Joker Cache", tier: "legendary", category: "easierStages", maxLevel: 2, description: "Gain two new Jokers at the beginning of every round. Live Joker cards and reserve charges both count.", level: g => upgradeCount(g, "jokerCache") },
        { id: "reserveDividend", icon: "🏦", title: "Reserve Dividend", tier: "rare", category: "economy", maxLevel: 1, description: "At a win, earn 5 points extra for every unused mulligan and every unused Joker.", level: g => upgradeCount(g, "reserveDividend") },
        { id: "consonantSweep", icon: "🔍", title: "Process of Elimination", tier: "rare", category: "solving", maxLevel: 1, description: "Every guess rules out one consonant that is not in the secret.", level: g => upgradeCount(g, "consonantSweep") }
      ]
    },
    {
      id: "cuddleCoach",
      title: "Cuddle Coach",
      blurb: "Permanent upgrades bought from the Coach. Guesser Hint and Earlier Hints are Easy only.",
      nodes: [
        { id: "coachPossibleAnswers", icon: "🎧", title: "Remaining Setter Box", tier: "common", category: "solving", maxLevel: 1, description: "Unlock an exact Secrets Remaining counter next to the theme readout.", level: g => (coachState(g)?.possibleAnswersUnlocked ? 1 : 0) },
        { id: "coachHint", icon: "💡", title: "Guesser Hint", tier: "rare", category: "solving", maxLevel: 4, description: "Gain one exact letter-and-position hint in every eligible round. Stacks up to four hints per round.", easyOnly: true, level: g => Number(coachState(g)?.hintsPerRound) || 0 },
        { id: "coachEarlierHint", icon: "⏪", title: "Earlier Hints", tier: "rare", category: "solving", maxLevel: 3, description: "Unlock your first Guesser Hint for the next round if needed, then move its permanent start earlier. Stacks until round 1.", easyOnly: true, level: g => Math.max(0, 4 - (Number(coachState(g)?.hintStartRound ?? 4))) },
        { id: "coachMeterThreshold", icon: "🩶", title: "Softer Cuddle Meter", tier: "common", category: "easierStages", maxLevel: 3, description: "The Cuddle Meter needs one fewer visible grey tile to fill per stack. Minimum: seven.", level: g => Number(coachState(g)?.cuddleThresholdStacks) || 0 },
        { id: "coachMeterReward", icon: "🫶", title: "Bigger Cuddle", tier: "common", category: "easierStages", maxLevel: 3, description: "Improve a full meter's reward in order: mulligan → joker → hint → extra row.", level: g => Number(coachState(g)?.cuddleRewardTier) || 0 }
      ]
    },
    {
      id: "synergyCombos",
      title: "Synergy Combos",
      blurb: "Owning both halves of a pair turns the combo on permanently.",
      nodes: [
        { id: "compoundCuddle", icon: "🏦", title: "Compound Cuddle", tier: "legendary", category: "combo", maxLevel: 1, description: "Rainy Day Fund + Reserve Dividend: interest doubles its cap and unused Jokers count toward the balance it pays on.", requires: ["rainyDay", "reserveDividend"], level: g => (upgradeCount(g, "rainyDay") > 0 && upgradeCount(g, "reserveDividend") > 0) ? 1 : 0 },
        { id: "goldenStreak", icon: "🔥", title: "Golden Streak", tier: "legendary", category: "combo", maxLevel: 1, description: "Hot Streak + Golden Value: a guess that pins a new yellow keeps the streak alive too.", requires: ["hotStreak", "yellowPoints"], level: g => (upgradeCount(g, "hotStreak") > 0 && upgradeCount(g, "yellowPoints") > 0) ? 1 : 0 },
        { id: "encoreNight", icon: "🎬", title: "Encore Night", tier: "legendary", category: "combo", maxLevel: 1, description: "Encore + Vowel Bounty: every encore also pays 10 points for each vowel in that stage's secret.", requires: ["encore", "vowelBounty"], level: g => (upgradeCount(g, "encore") > 0 && upgradeCount(g, "vowelBounty") > 0) ? 1 : 0 },
        { id: "allIn", icon: "🎲", title: "All In", tier: "legendary", category: "combo", maxLevel: 1, description: "Double Down + Hot Streak: a last-guess solve also pays the streak bonus at its highest step.", requires: ["doubleDown", "hotStreak"], level: g => (upgradeCount(g, "doubleDown") > 0 && upgradeCount(g, "hotStreak") > 0) ? 1 : 0 }
      ]
    },
    {
      id: "bossRewards",
      title: "Boss Rewards",
      blurb: "Permanent rewards for clearing a boss round. No ordinary upgrade is offered afterward.",
      nodes: [
        { id: "cullRare", icon: "✂️", title: "Deep Cull", tier: "legendary", category: "boss", maxLevel: 1, description: "Remove three rare letters from the deck and from every future secret." },
        { id: "doubleMulligans", icon: "🔁", title: "Double Mulligans", tier: "legendary", category: "boss", maxLevel: 1, description: "Double the number of mulligans you get each round.", level: g => upgradeCount(g, "doubleMulligans") },
        { id: "biggerMulligans", icon: "🖐️", title: "Full Hand Mulligan", tier: "legendary", category: "boss", maxLevel: 1, description: "Every mulligan can now replace up to five cards.", level: g => upgradeCount(g, "mulliganSize") },
        { id: "richerColours", icon: "💰", title: "Richer Colours", tier: "legendary", category: "boss", maxLevel: 1, description: "Every yellow and green tile is worth 2 points more.", level: g => upgradeCount(g, "yellowPoints") },
        { id: "freeVowelSweep", icon: "🅰️", title: "Free Vowel Sweep", tier: "legendary", category: "boss", maxLevel: 1, description: "Each round opens with one random vowel tested for free -- you learn whether it's in the secret, not where.", level: g => upgradeCount(g, "freeVowelSweep") },
        { id: "questHead", icon: "🏅", title: "Quest Head Start", tier: "legendary", category: "boss", maxLevel: 1, description: "Quests are worth 10 points more for the rest of the run.", level: g => upgradeCount(g, "questPoints") },
        { id: "revealGreen", icon: "📍", title: "Position Peek", tier: "legendary", category: "boss", maxLevel: 1, description: "Reveal one hidden position and make that letter reusable for this round." },
        { id: "openingClue", icon: "🔮", title: "Margin Note", tier: "legendary", category: "boss", maxLevel: 1, description: "Reveal that one letter is in the secret at the start of every future non-boss stage -- not where.", level: g => Number(g?.state?.cuddleBonuses?.openingClue) || 0 },
        { id: "questDoublePick", icon: "✌️", title: "Double Pick", tier: "legendary", category: "boss", maxLevel: 1, description: "Quest reward screens let you choose two options instead of one, for the rest of the run.", level: g => upgradeCount(g, "questDoublePick") },
        { id: "questCadence", icon: "❗", title: "Quest Cadence", tier: "legendary", category: "boss", maxLevel: 2, description: "One additional quest is active at the same time, for the rest of the run. Stacks.", level: g => upgradeCount(g, "questCadence") },
        { id: "overtimeReward", icon: "➕", title: "Overtime", tier: "legendary", category: "boss", maxLevel: 1, description: "Gain one additional guess every round.", level: g => Number(g?.state?.megaState?.extraGuesses) || 0 },
        { id: "questPersistReward", icon: "⏳", title: "Lasting Quests", tier: "legendary", category: "boss", maxLevel: 1, description: "Quests stay active for the rest of the round instead of expiring after one guess.", level: g => (g?.state?.megaState?.questPersistsForRound ? 1 : 0) },
        { id: "backupPlanReward", icon: "🧰", title: "Backup Plan", tier: "legendary", category: "boss", maxLevel: 1, description: "Gain one additional mulligan every round.", level: g => upgradeCount(g, "extraMulligans") },
        { id: "clearSight", icon: "🟢", title: "Clear Sight", tier: "legendary", category: "boss", maxLevel: 1, description: "Upgrade Margin Note: it now reveals a letter's exact position instead of just that it's present.", level: g => (bossRewardOwned(g, "clearSight") ? 1 : 0) },
        { id: "allThemesBoss", icon: "🔮", title: "All-Seeing Atlas", tier: "legendary", category: "boss", maxLevel: 1, description: "Reveal every available theme at the start of every non-boss Wordle.", level: g => (bossRewardOwned(g, "umtAllThemes") ? 1 : 0) },
        { id: "goldenCompass", icon: "🧭", title: "Golden Compass", tier: "legendary", category: "boss", maxLevel: 1, description: "Once per round, reveal the most useful untested letter among the remaining possible answers.", level: g => (bossRewardOwned(g, "goldenCompass") ? 1 : 0) },
        { id: "secondCup", icon: "☕", title: "Second Cup", tier: "legendary", category: "boss", maxLevel: 1, description: "Once per run, automatically add one rescue row when the final row would fail.", level: g => (bossRewardOwned(g, "secondCup") ? 1 : 0) },
        { id: "goldenThread", icon: "🧵", title: "Golden Thread", tier: "legendary", category: "boss", maxLevel: 1, description: "A full five-letter draft pulses and vibrates when it contains an answer letter you have not learned yet.", level: g => (bossRewardOwned(g, "goldenThread") ? 1 : 0) }
      ]
    }
  ]);

  function normName(value) {
    return String(value == null ? "" : value)
      .toLowerCase()
      .replace(/[’']/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  const NODES_BY_ID = new Map();
  const NODES_BY_NAME = new Map();
  for (const branch of BRANCHES) {
    for (const node of branch.nodes) {
      NODES_BY_ID.set(node.id, node);
      NODES_BY_NAME.set(normName(node.title), node);
    }
  }

  function nodeLevel(game, node) {
    if (!game || typeof node?.level !== "function") return 0;
    try {
      const value = Number(node.level(game));
      return Number.isFinite(value) && value > 0 ? value : 0;
    } catch (_error) {
      return 0;
    }
  }

  function isOwned(game, node) {
    return nodeLevel(game, node) > 0;
  }

  function findNode(id) {
    return NODES_BY_ID.get(id) || null;
  }

  function findNodeByName(name) {
    return NODES_BY_NAME.get(normName(name)) || null;
  }

  window.CuddleSkillTree = Object.freeze({
    BRANCHES,
    CATEGORIES,
    isOwned,
    level: nodeLevel,
    findNode,
    findNodeByName
  });
})();
