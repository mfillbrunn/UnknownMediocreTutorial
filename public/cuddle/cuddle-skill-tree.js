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

  // Copies taken, from the reward ledger -- for rewards whose upgrade
  // field holds an amount rather than a count (upgrades.questPoints is
  // quest points, so Quest Head Start's +10 read as "Lv 10").
  function ledgerCount(game, id) {
    const history = game?.state?.rewardBookHistory;
    return Array.isArray(history) ? history.filter(entry => entry && entry.id === id).length : 0;
  }

  // Level of a reward kept by cuddle-rebalance-v5.js under its "umt" id.
  function v5Level(game, id) {
    try {
      return Number(window.CuddleRebalanceV5?.upgradeLevel?.(game, id)) || 0;
    } catch (_error) {
      return 0;
    }
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
    easierStages: { label: "Easier Stages", color: "#a3e635" },
    insight: { label: "Insight", color: "#5eead4" },
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
        { id: "extraMulligans", icon: "🔄", title: "Second Thoughts", tier: "common", category: "easierStages", description: "Gain one additional mulligan every stage.", level: g => upgradeCount(g, "extraMulligans") },
        { id: "questRefreshes", icon: "♻️", title: "Reward Refresh", tier: "common", category: "quests", description: "Every quest reward screen gets one more free refresh. Stacks.", level: g => upgradeCount(g, "questRefreshes") },
        { id: "questPoints", icon: "🏅", title: "Quest Value", tier: "common", category: "quests", description: "Quests are worth 10 points more. Stacks.", level: g => ledgerCount(g, "questPoints") },
        { id: "questReroll", icon: "🔄", title: "Second Guess Quest", tier: "common", category: "quests", description: "Once per stage, reroll the current quest for free.", level: g => upgradeCount(g, "questReroll") },
        { id: "mulliganSize", icon: "🃏", title: "Bigger Mulligan", tier: "common", category: "easierStages", maxLevel: 2, description: "Each mulligan may replace one additional card.", level: g => upgradeCount(g, "mulliganSize") },
        { id: "cullOne", icon: "✂️", title: "Cull One Letter", tier: "common", category: "easierStages", maxLevel: 6, description: "Permanently remove one rare consonant from your deck and every future answer. Can be taken again.", level: g => v5Level(g, "umtCullOne") },
        { id: "cullTwo", icon: "✂️", title: "Cull Two Letters", tier: "epic", category: "easierStages", maxLevel: 3, description: "Permanently remove two rare consonants from your deck and every future answer. Can be taken again.", level: g => v5Level(g, "umtCullTwo") },
        { id: "categorySense", icon: "🔮", title: "Theme Sense", tier: "rare", category: "solving", maxLevel: 6, description: "From now on, reveal one category at the start of every solution. Stacks.", level: g => Number(campaignState(g)?.categorySense) || 0 },
        // Round rewards the live pool offers that this catalogue used to be
        // missing entirely (so they never appeared on the tree). Icons are
        // emoji rather than the pool's text badges ("H+", "Y/G") so every
        // node reads as a picture on the progression tree. Descriptions
        // state what the engine actually applies.
        { id: "storybookStart", icon: "📖", title: "Opening Verse", tier: "common", category: "economy", maxLevel: 3, description: "Start every non-boss stage with +10 points, banked straight away. Stacks up to three times.", level: g => Number(g?.state?.cuddleBonuses?.storybookStart) || 0 },
        { id: "wideChoice", icon: "🌈", title: "Wide Margins", tier: "common", category: "easierStages", maxLevel: 2, description: "See one additional between-round upgrade choice. Stacks up to two times." },
        { id: "handSizeBoost", icon: "✋", title: "Bigger Hand", tier: "rare", category: "easierStages", description: "Hold one more consonant in your hand from now on." },
        { id: "mulliganValueBoost", icon: "💱", title: "Mulligan Dividend", tier: "common", category: "economy", description: "Each unused mulligan is worth 5 points more when you solve." },
        { id: "earlySolveBoost", icon: "🏁", title: "Early Finish", tier: "common", category: "economy", description: "Each unused guess earns 5 points more on an early solve." },
        { id: "colourTrade", icon: "🎨", title: "Colour Surge", tier: "common", maxLevel: 3, category: "economy", description: "Green tiles are worth 1 point more per level, 2 more at level 3.", level: g => Number(g?.state?.balanceRewardCounts?.colourTrade) || 0 },
        { id: "greyscale", icon: "⬛", title: "Greyscale", tier: "common", category: "economy", description: "Grey tiles gain 2 points and yellow 1 per level; grey 3 and yellow 2 at level 3.", maxLevel: 3, level: g => Number(g?.state?.balanceRewardCounts?.greyscale) || 0 },
        { id: "rewardEcho", icon: "🔁", title: "Reward Echo", tier: "rare", category: "easierStages", description: "The next round reward you pick is applied three times." },
        { id: "greenCount", icon: "🔢", title: "Precise Green", tier: "rare", category: "solving", maxLevel: 1, description: "A green tile also shows how many times that letter appears in the secret." },
        { id: "surprise-assignment", icon: "📜", title: "Surprise Assignment", tier: "rare", category: "quests", description: "Add one extra quest at a random turn in every stage. Each copy schedules another quest." },
        // More special board tiles (cuddle-points-money.js).
        { id: "treasureMap", icon: "🗺️", title: "Treasure Map", tier: "rare", category: "economy", maxLevel: 3, description: "One more special tile on the board every stage. Up to 3 levels.", level: g => Number(g?.state?.cuddleBonuses?.treasureMap) || 0 }
      ]
    },
    {
      id: "economyEngines",
      title: "Economy Engines",
      blurb: "Reward pool that pays out for how you play a round, not just for finishing it.",
      nodes: [
        { id: "rainyDay", icon: "🏦", title: "Rainy Day Fund", tier: "rare", category: "economy", maxLevel: 2, description: "Every non-boss stage opens by paying 10% interest on your wallet, up to $25. A second copy doubles both.", level: g => upgradeCount(g, "rainyDay") },
        { id: "encore", icon: "🎬", title: "Encore", tier: "rare", category: "economy", maxLevel: 1, description: "Every third stage you solve pays a 50-point encore bonus.", level: g => upgradeCount(g, "encore") },
        { id: "vowelBounty", icon: "🅰️", title: "Vowel Bounty", tier: "common", category: "economy", maxLevel: 2, description: "Every vowel in a secret you solve pays 5 points.", level: g => upgradeCount(g, "vowelBounty") },
        { id: "doubleDown", icon: "🎲", title: "Double Down", tier: "epic", category: "economy", maxLevel: 1, description: "Each stage names a lucky guess, from the 3rd to the 7th. Solve the word on exactly that guess for +50 points, even if that's past your bonus window.", level: g => upgradeCount(g, "doubleDown") }
      ]
    },
    {
      id: "insightTools",
      title: "Insight",
      blurb: "Clues about the answer before you guess, and a little luck. Effects in cuddle-clues.js.",
      nodes: [
        { id: "vowelLamp", icon: "🏮", title: "Vowel Lamp", tier: "rare", category: "insight", maxLevel: 1, description: "Every stage, boss fights included, tells you how many vowels the answer has.", level: g => v5Level(g, "umtVowelLamp") },
        { id: "echoFinder", icon: "👯", title: "Echo Finder", tier: "common", category: "insight", maxLevel: 1, description: "Every stage, boss fights included, tells you whether the answer uses a letter twice.", level: g => v5Level(g, "umtEchoFinder") },
        { id: "treasureHunter", icon: "💎", title: "Treasure Hunter", tier: "common", category: "insight", maxLevel: 2, description: "About one stage in three hides a treasure word: solve it for +$8. Stacks: +$8 more per copy.", level: g => v5Level(g, "umtTreasureHunter") },
        { id: "patternLens", icon: "🧩", title: "Pattern Lens", tier: "rare", category: "insight", maxLevel: 1, description: "Every non-boss stage shows where the answer's vowels and consonants sit, like C V C C V.", level: g => v5Level(g, "umtPatternLens") },
        { id: "mistakeShield", icon: "🛡️", title: "Mistake Shield", tier: "rare", category: "insight", maxLevel: 1, description: "In a boss or a strict stage, the first guess with no green or yellow gives you an extra guess back.", level: g => v5Level(g, "umtMistakeShield") },
        { id: "lastLight", icon: "🕯️", title: "Last Light", tier: "legendary", category: "insight", maxLevel: 1, description: "Every non-boss stage opens with the answer's last letter already in place.", level: g => v5Level(g, "umtLastLight") },
        { id: "yellowHint", icon: "🟨", title: "Yellow Guesser Hint", tier: "epic", category: "insight", maxLevel: 2, description: "Every stage, boss fights included, opens with one letter of the answer shown as in the word. Level 2 is Clear Sight (Legendary): the letter comes in its exact place.", level: g => v5Level(g, "umtYellowHint") + v5Level(g, "umtClearSight") }
      ]
    },
    {
      id: "solvingAids",
      title: "Solving Aids",
      blurb: "Jokers and letter tools, offered on every difficulty.",
      nodes: [
        { id: "jokerCache", icon: "🃏", title: "Small Joker Cache", tier: "rare", category: "easierStages", maxLevel: 1, description: "One extra Joker every stage.", level: g => v5Level(g, "umtJokerCache") },
        { id: "jokerCacheLarge", icon: "🃏", title: "Large Joker Cache", tier: "legendary", category: "easierStages", maxLevel: 1, description: "Two Jokers every stage. Replaces Small Joker Cache.", level: g => v5Level(g, "umtJokerCacheLarge") },
        { id: "alphabet-compass", icon: "🧭", title: "Alphabet Compass", tier: "epic", category: "solving", maxLevel: 3, description: "After every guess, a tile shows whether the answer's letter there comes earlier or later in the alphabet. Level 2 adds a tile; level 3 is the Legendary Full Alphabet Compass: every tile.", level: g => (window.CuddleCompass && g?.state ? window.CuddleCompass.copiesOwned(g.state) : 0) },
        { id: "consonantSweep", icon: "🔍", title: "Process of Elimination", tier: "epic", category: "solving", maxLevel: 1, description: "In non-boss stages, every guess rules out one consonant that is not in the answer.", level: g => upgradeCount(g, "consonantSweep") }
      ]
    },
    {
      id: "cuddleCoach",
      title: "Cuddle Coach",
      blurb: "The Cuddle Meter and the Secrets Counter.",
      nodes: [
        { id: "coachPossibleAnswers", icon: "🎧", title: "Secrets Counter", tier: "rare", category: "solving", maxLevel: 1, description: "Always see how many possible answers are left, next to the theme.", level: g => (coachState(g)?.possibleAnswersUnlocked ? 1 : 0) },
        { id: "coachMeterThreshold", icon: "🩶", title: "Softer Cuddle Meter", tier: "common", category: "easierStages", maxLevel: 3, description: "The Cuddle Meter fills one tile sooner. Up to 3 levels (minimum: five).", level: g => Number(coachState(g)?.cuddleThresholdStacks) || 0 },
        { id: "coachMeterReward", icon: "🫶", title: "Bigger Cuddle", tier: "rare", category: "easierStages", maxLevel: 2, description: "A full Cuddle Meter gives a Joker instead of a mulligan; at level 2, a letter in its exact place.", level: g => Number(coachState(g)?.cuddleRewardTier) || 0 }
      ]
    },
    {
      id: "synergyCombos",
      title: "Synergy Combos",
      blurb: "Owning both halves of a pair turns the combo on permanently.",
      nodes: [
        { id: "encoreNight", icon: "🎬", title: "Encore Night", tier: "legendary", category: "combo", maxLevel: 1, description: "Encore + Vowel Bounty: every encore also pays 10 points for each vowel in that stage's secret.", requires: ["encore", "vowelBounty"], level: g => (upgradeCount(g, "encore") > 0 && upgradeCount(g, "vowelBounty") > 0) ? 1 : 0 }
      ]
    },
    {
      id: "bossRewards",
      title: "Boss Rewards",
      blurb: "Permanent rewards for clearing a boss round. No ordinary upgrade is offered afterward.",
      nodes: [
        { id: "cullRare", icon: "✂️", title: "Deep Cull", tier: "legendary", category: "boss", maxLevel: 1, description: "Remove four rare letters from the deck and from every future secret." },
        { id: "doubleMulligans", icon: "🔁", title: "Double Mulligans", tier: "epic", category: "boss", maxLevel: 1, description: "Double the number of mulligans you get each stage.", level: g => upgradeCount(g, "doubleMulligans") },
        { id: "biggerMulligans", icon: "🖐️", title: "Full Hand Mulligan", tier: "epic", category: "boss", maxLevel: 1, description: "Every mulligan can now replace up to five cards.", level: g => upgradeCount(g, "mulliganSize") },
        { id: "freeVowelSweep", icon: "🅰️", title: "Free Vowel Sweep", tier: "epic", category: "boss", maxLevel: 1, description: "Each stage opens with one random vowel tested for free: you learn whether it's in the answer, not where.", level: g => upgradeCount(g, "freeVowelSweep") },
        { id: "revealGreen", icon: "📍", title: "Position Peek", tier: "rare", category: "boss", maxLevel: 1, description: "Your next stage opens with one letter of the answer already in its exact place. One time." },
        { id: "questDoublePick", icon: "✌️", title: "Double Pick", tier: "legendary", category: "boss", maxLevel: 1, description: "Quest reward screens let you choose two options instead of one, for the rest of the run.", level: g => upgradeCount(g, "questDoublePick") },
        { id: "questCadence", icon: "❗", title: "Quest Cadence", tier: "epic", category: "boss", maxLevel: 2, description: "Quests come more often (every second guess, then every guess) and one more can be active at a time. Stacks twice.", level: g => upgradeCount(g, "questCadence") },
        { id: "questPersistReward", icon: "⏳", title: "Lasting Quests", tier: "legendary", category: "boss", maxLevel: 1, description: "A quest you don't complete stays active for the rest of the stage instead of expiring after one guess, boss fights included.", level: g => (g?.state?.megaState?.questPersistsForRound ? 1 : 0) },
        { id: "allThemesBoss", icon: "🔮", title: "All-Seeing Atlas", tier: "legendary", category: "boss", maxLevel: 1, description: "Reveal every available theme at the start of every non-boss Wordle.", level: g => (bossRewardOwned(g, "umtAllThemes") ? 1 : 0) },
        { id: "secondCup", icon: "☕", title: "Second Cup", tier: "epic", category: "boss", maxLevel: 1, description: "Once per run, when you would run out of guesses in a boss or strict stage, you get one extra guess.", level: g => (bossRewardOwned(g, "secondCup") ? 1 : 0) },
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
