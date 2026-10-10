// public/cuddle/cuddle-skill-tree.js
// The power registry: every permanent upgrade ("power") and boss reward the
// game can offer, across every add-on module, in one list. Each entry has:
//   type      what it does (Points, Money, Clues, Letters, Tiles, Quests,
//             Safety) -- every power has exactly one, shown on its card and
//             used to sort the badge page
//   tier      its rarity (Common, Rare, Epic, Legendary)
//   maxLevel  how many times it can be taken. A power that can be taken
//             more than once tops out at three, and the third pick is
//             always a bigger step than the first two (levels[2])
//   levels    what it does at each level, for cards and badges
//   level     how many times this run has it
// Reward screens, packs and the shop never offer a power at its maxLevel
// (cuddle-economy-rarity-v8.js isMaxedReward). The third-level bonuses
// themselves live in cuddle-powers.js or in the effect's own code.
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

  // Copies taken, from the reward ledger every pick is recorded in -- the
  // one count that means "times picked" for every power, whatever field
  // its effect keeps (a third-level bonus can push that field past 3).
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

  // A power from cuddle-powers.js keeps its own count.
  function powerLevel(game, id) {
    const kept = Number(game?.state?.umtPowers?.levels?.[id]) || 0;
    return Math.max(kept, ledgerCount(game, id));
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

  // What a power does. Every power has one type, in addition to its
  // rarity; the order here is the order of the badge page's sections.
  const TYPES = Object.freeze({
    points: { label: "Points", color: "#57d69a", blurb: "Score more per stage." },
    money: { label: "Money", color: "#f6c956", blurb: "Earn money, or spend less of it." },
    clues: { label: "Clues", color: "#5aa9ff", blurb: "Learn about the answer." },
    letters: { label: "Letters", color: "#c08bff", blurb: "Your hand, mulligans, Jokers and deck." },
    tiles: { label: "Tiles", color: "#4fd1c5", blurb: "Special tiles on the board." },
    quests: { label: "Quests", color: "#f6a94a", blurb: "Quests and their rewards." },
    safety: { label: "Safety", color: "#fb7185", blurb: "Second chances." }
  });
  const TYPE_ORDER = Object.freeze(Object.keys(TYPES));

  // Card colours by type (cuddle-economy-rarity-v8.js puts a chip with the
  // label on every reward card). "combo" marks the combos between powers.
  const CATEGORIES = Object.freeze({
    ...TYPES,
    combo: { label: "Combo", color: "#ff6fb0", blurb: "Two powers together." }
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
        { id: "extraMulligans", icon: "🔄", title: "Second Thoughts", tier: "common", type: "letters", maxLevel: 3,
          levels: ["+1 mulligan/stage", "+2 mulligans/stage", "+4 mulligans/stage"],
          level: g => ledgerCount(g, "extraMulligans") },
        { id: "questRefreshes", icon: "♻️", title: "Reward Refresh", tier: "common", type: "quests", maxLevel: 3,
          levels: ["+1 free quest-reward refresh", "+2 free quest-reward refreshes", "+4 free quest-reward refreshes"],
          level: g => ledgerCount(g, "questRefreshes") },
        { id: "questPoints", icon: "🏅", title: "Quest Value", tier: "common", type: "quests", maxLevel: 3,
          levels: ["+10 pts per quest", "+20 pts per quest", "+40 pts per quest"],
          level: g => ledgerCount(g, "questPoints") },
        { id: "questReroll", icon: "🔄", title: "Second Guess Quest", tier: "common", type: "quests", maxLevel: 1,
          description: "1 free quest reroll/stage", level: g => upgradeCount(g, "questReroll") },
        { id: "mulliganSize", icon: "🃏", title: "Bigger Mulligan", tier: "common", type: "letters", maxLevel: 3,
          levels: ["Mulligan swaps up to 4", "Mulligan swaps up to 5", "Mulligan swaps whole hand"],
          level: g => ledgerCount(g, "mulliganSize") },
        { id: "cullOne", icon: "✂️", title: "Cull One Letter", tier: "common", type: "letters", maxLevel: 3,
          levels: ["−1 rare consonant, for good", "−2 rare consonants, for good", "−4 rare consonants, for good"],
          level: g => v5Level(g, "umtCullOne") },
        { id: "cullTwo", icon: "✂️", title: "Cull Two Letters", tier: "epic", type: "letters", maxLevel: 3,
          levels: ["−2 rare consonants, for good", "−4 rare consonants, for good", "−7 rare consonants, for good"],
          level: g => v5Level(g, "umtCullTwo") },
        { id: "categorySense", icon: "🔮", title: "Theme Sense", tier: "rare", type: "clues", maxLevel: 3,
          levels: ["1 theme shown/stage", "2 themes shown/stage", "All themes shown/stage"],
          level: g => Number(campaignState(g)?.categorySense) || 0 },
        { id: "storybookStart", icon: "📖", title: "Opening Verse", tier: "common", type: "points", maxLevel: 3,
          levels: ["+10 pts/stage", "+20 pts/stage", "+35 pts/stage"],
          level: g => Number(g?.state?.cuddleBonuses?.storybookStart) || 0 },
        { id: "wideChoice", icon: "🌈", title: "Wide Margins", tier: "common", type: "money", maxLevel: 3,
          levels: ["+1 reward card", "+2 reward cards", "+2 reward cards · 1st refresh free"],
          level: g => Number(g?.state?.cuddleBonuses?.wideChoice) || 0 },
        { id: "handSizeBoost", icon: "✋", title: "Bigger Hand", tier: "rare", type: "letters", maxLevel: 3,
          levels: ["+1 consonant in hand", "+2 consonants in hand", "+4 consonants in hand"],
          level: g => Number(g?.state?.balanceRewardCounts?.handSizeBoost) || 0 },
        { id: "mulliganValueBoost", icon: "💱", title: "Mulligan Dividend", tier: "common", type: "points", maxLevel: 3,
          levels: ["+5 pts per unused mulligan", "+10 pts per unused mulligan", "+25 pts per unused mulligan"],
          level: g => Number(g?.state?.balanceRewardCounts?.mulliganValueBoost) || 0 },
        { id: "earlySolveBoost", icon: "🏁", title: "Early Finish", tier: "common", type: "points", maxLevel: 3,
          levels: ["+5 pts per spare guess", "+10 pts per spare guess", "+25 pts per spare guess"],
          level: g => Number(g?.state?.balanceRewardCounts?.earlySolveBoost) || 0 },
        { id: "colourTrade", icon: "🎨", title: "Colour Surge", tier: "common", type: "points", maxLevel: 3,
          levels: ["+1 pt per green", "+2 pts per green", "+4 pts per green"],
          level: g => Number(g?.state?.balanceRewardCounts?.colourTrade) || 0 },
        { id: "greyscale", icon: "⬛", title: "Greyscale", tier: "common", type: "points", maxLevel: 3,
          levels: ["+1 pt per grey", "+2 pts per grey", "+3 pts per grey · +1 per yellow"],
          level: g => Number(g?.state?.balanceRewardCounts?.greyscale) || 0 },
        { id: "rewardEcho", icon: "🔁", title: "Reward Echo", tier: "rare", type: "money", maxLevel: 1, description: "Next reward counts ×2" },
        { id: "greenCount", icon: "🔢", title: "Precise Green", tier: "rare", type: "clues", maxLevel: 1, description: "Greens show how often the letter appears" },
        { id: "surprise-assignment", icon: "📜", title: "Surprise Assignment", tier: "rare", type: "quests", maxLevel: 3,
          levels: ["+1 surprise quest/stage", "+2 surprise quests/stage", "+4 surprise quests/stage"],
          level: g => ledgerCount(g, "surprise-assignment") },
        // More special board tiles (cuddle-points-money.js).
        { id: "treasureMap", icon: "🗺️", title: "Treasure Map", tier: "rare", type: "tiles", maxLevel: 3,
          levels: ["+1 special tile/stage", "+2 special tiles/stage", "+4 special tiles/stage"],
          level: g => ledgerCount(g, "treasureMap") },
        // Board tiles beyond money and points each need their unlock.
        { id: "mulliganTiles", icon: "🔄", title: "Mulligan Tiles", tier: "common", type: "tiles", maxLevel: 3,
          levels: ["Mulligan tiles: hit one → +1 mulligan", "Mulligan tiles ×2 as common", "Mulligan tiles ×4 as common"],
          level: g => ledgerCount(g, "mulliganTiles") },
        { id: "jokerTiles", icon: "🃏", title: "Joker Tiles", tier: "rare", type: "tiles", maxLevel: 3,
          levels: ["Joker tiles: hit one → +1 Joker", "Joker tiles ×2 as common", "Joker tiles ×4 as common"],
          level: g => ledgerCount(g, "jokerTiles") },
        { id: "oracleTiles", icon: "🔮", title: "Oracle Tiles", tier: "epic", type: "tiles", maxLevel: 3,
          levels: ["Oracle tiles: hit one → 1 letter placed", "Oracle tiles ×2 as common", "Oracle tiles ×4 as common"],
          level: g => ledgerCount(g, "oracleTiles") }
      ]
    },
    {
      id: "economyEngines",
      title: "Economy Engines",
      blurb: "Reward pool that pays out for how you play a round, not just for finishing it.",
      nodes: [
        { id: "rainyDay", icon: "🏦", title: "Rainy Day Fund", tier: "rare", type: "money", maxLevel: 3,
          levels: ["+10% interest/stage (max $25)", "+20% interest/stage (max $50)", "+30% interest/stage (max $120)"],
          level: g => v5Level(g, "umtRainyDay") },
        { id: "encore", icon: "🎬", title: "Encore", tier: "rare", type: "points", maxLevel: 1, description: "+50 pts every 3rd solve", level: g => v5Level(g, "umtEncore") },
        { id: "vowelBounty", icon: "🅰️", title: "Vowel Bounty", tier: "common", type: "points", maxLevel: 3,
          levels: ["+5 pts per vowel in the answer", "+10 pts per vowel in the answer", "+18 pts per vowel in the answer"],
          level: g => v5Level(g, "umtVowelBounty") },
        { id: "haggler", icon: "🪙", title: "Haggler", tier: "common", type: "money", maxLevel: 1, description: "Reward refreshes: $0, $1, $3… (was $3, $5…)", level: g => v5Level(g, "umtHaggler") },
        { id: "doubleDown", icon: "🎲", title: "Double Down", tier: "epic", type: "points", maxLevel: 1, description: "+50 pts for solving on the lucky guess (3rd–7th)", level: g => v5Level(g, "umtDoubleDown") }
      ]
    },
    {
      id: "insightTools",
      title: "Insight",
      blurb: "Clues about the answer before you guess, and a little luck. Effects in cuddle-clues.js.",
      nodes: [
        { id: "vowelLamp", icon: "🏮", title: "Vowel Lamp", tier: "rare", type: "clues", maxLevel: 1, description: "Shows the answer's vowel count", level: g => v5Level(g, "umtVowelLamp") },
        { id: "echoFinder", icon: "👯", title: "Echo Finder", tier: "common", type: "clues", maxLevel: 1, description: "Shows if a letter repeats", level: g => v5Level(g, "umtEchoFinder") },
        { id: "treasureHunter", icon: "💎", title: "Treasure Hunter", tier: "common", type: "money", maxLevel: 3,
          levels: ["Treasure word (1 in 3 stages): fast solve +$25", "Treasure word: +$50", "Treasure word every 2nd stage: +$100"],
          level: g => v5Level(g, "umtTreasureHunter") },
        { id: "patternLens", icon: "🧩", title: "Pattern Lens", tier: "epic", type: "clues", maxLevel: 1, description: "Shows the vowel pattern (C V C C V)", level: g => v5Level(g, "umtPatternLens") },
        { id: "mistakeShield", icon: "🛡️", title: "Mistake Shield", tier: "rare", type: "safety", maxLevel: 1, description: "Boss/strict: 1st all-grey guess refunded", level: g => v5Level(g, "umtMistakeShield") },
        { id: "lastLight", icon: "🕯️", title: "Last Light", tier: "legendary", type: "clues", maxLevel: 1, description: "Last letter placed/stage", level: g => v5Level(g, "umtLastLight") },
        { id: "yellowHint", icon: "🟨", title: "Yellow Guesser Hint", tier: "epic", type: "clues", maxLevel: 2,
          levels: ["1 yellow letter/stage", "Legendary: 1 green letter/stage"],
          level: g => v5Level(g, "umtYellowHint") + v5Level(g, "umtClearSight") }
      ]
    },
    {
      id: "solvingAids",
      title: "Solving Aids",
      blurb: "Jokers and letter tools, offered on every difficulty.",
      nodes: [
        { id: "jokerCache", icon: "🃏", title: "Small Joker Cache", tier: "rare", type: "letters", maxLevel: 1, description: "+1 Joker/stage", level: g => v5Level(g, "umtJokerCache") },
        { id: "jokerCacheLarge", icon: "🃏", title: "Large Joker Cache", tier: "legendary", type: "letters", maxLevel: 1, description: "+2 Jokers/stage (stacks with Small)", level: g => v5Level(g, "umtJokerCacheLarge") },
        { id: "alphabet-compass", icon: "🧭", title: "Alphabet Compass", tier: "epic", type: "clues", maxLevel: 3,
          levels: ["1 tile/guess: answer letter earlier or later (A–Z)", "2 tiles/guess", "Legendary: every tile/guess"],
          level: g => (window.CuddleCompass && g?.state ? window.CuddleCompass.copiesOwned(g.state) : 0) },
        { id: "consonantSweep", icon: "🔍", title: "Process of Elimination", tier: "epic", type: "clues", maxLevel: 1, description: "−1 wrong consonant shown per guess", level: g => upgradeCount(g, "consonantSweep") }
      ]
    },
    {
      id: "cuddleCoach",
      title: "Cuddle Coach",
      blurb: "The Cuddle Meter and the Secrets Counter.",
      nodes: [
        { id: "coachPossibleAnswers", icon: "🎧", title: "Secrets Counter", tier: "rare", type: "clues", maxLevel: 1, description: "Shows possible answers left", level: g => (coachState(g)?.possibleAnswersUnlocked ? 1 : 0) },
        { id: "coachMeterThreshold", icon: "🩶", title: "Softer Cuddle Meter", tier: "common", type: "letters", maxLevel: 3,
          levels: ["Cuddle Meter −2 to fill", "Cuddle Meter −4 to fill", "Cuddle Meter −7 to fill"],
          level: g => Number(coachState(g)?.cuddleThresholdStacks) || 0 },
        { id: "coachMeterReward", icon: "🫶", title: "Bigger Cuddle", tier: "rare", type: "letters", maxLevel: 3,
          levels: ["Full meter → test 1 consonant", "Full meter → +1 Joker", "Full meter → 1 green letter"],
          level: g => Number(coachState(g)?.cuddleRewardTier) || 0 }
      ]
    },
    {
      // Powers that change how a stage is played (cuddle-powers.js).
      id: "playstylePowers",
      title: "Playstyle",
      blurb: "Powers that change how you play a stage.",
      nodes: [
        { id: "momentum", icon: "📈", title: "Momentum", tier: "common", type: "points", maxLevel: 3,
          levels: ["+4 pts per guess with more greens", "+8 pts per guess with more greens", "+15 pts per guess with more greens"],
          level: g => powerLevel(g, "momentum") },
        { id: "bigOpener", icon: "🎯", title: "Big Opener", tier: "rare", type: "points", maxLevel: 3,
          levels: ["+4 pts per colour on guess 1", "+7 pts per colour on guess 1", "+16 pts per colour on guess 1"],
          level: g => powerLevel(g, "bigOpener") },
        { id: "lastStand", icon: "⚔️", title: "Last Stand", tier: "rare", type: "points", maxLevel: 3,
          levels: ["+25 pts for a last-window solve", "+45 pts for a last-window solve", "+100 pts for a last-window solve"],
          level: g => powerLevel(g, "lastStand") },
        { id: "pickpocket", icon: "💲", title: "Pickpocket", tier: "common", type: "money", maxLevel: 3,
          levels: ["+$1 per yellow", "+$2 per yellow", "+$4 per yellow"],
          level: g => powerLevel(g, "pickpocket") },
        { id: "gracePeriod", icon: "⌛", title: "Grace Period", tier: "rare", type: "safety", maxLevel: 3,
          levels: ["1st late guess free", "First 2 late guesses free", "First 2 late guesses free · rest half"],
          level: g => powerLevel(g, "gracePeriod") },
        { id: "boldOpener", icon: "🪄", title: "Bold Opener", tier: "epic", type: "clues", maxLevel: 1,
          description: "Guess 1: any 5 letters",
          level: g => powerLevel(g, "boldOpener") }
      ]
    },
    {
      id: "synergyCombos",
      title: "Synergy Combos",
      blurb: "Owning both halves of a pair turns the combo on permanently.",
      nodes: [
        { id: "encoreNight", icon: "🎬", title: "Encore Night", tier: "legendary", type: "combo", maxLevel: 1, description: "Encore +10 pts per vowel", requires: ["encore", "vowelBounty"], level: g => (v5Level(g, "umtEncore") > 0 && v5Level(g, "umtVowelBounty") > 0) ? 1 : 0 }
      ]
    },
    {
      id: "bossRewards",
      title: "Boss Rewards",
      blurb: "Permanent rewards for clearing a boss round. No ordinary upgrade is offered afterward.",
      nodes: [
        { id: "cullRare", icon: "✂️", title: "Deep Cull", tier: "legendary", type: "letters", maxLevel: 1, description: "−4 rare letters, for good" },
        { id: "doubleMulligans", icon: "🔁", title: "Double Mulligans", tier: "epic", type: "letters", maxLevel: 1, description: "Mulligans ×2", level: g => upgradeCount(g, "doubleMulligans") },
        { id: "biggerMulligans", icon: "🖐️", title: "Full Hand Mulligan", tier: "epic", type: "letters", maxLevel: 1, description: "Mulligan swaps up to 5", level: g => ledgerCount(g, "biggerMulligans") },
        { id: "freeVowelSweep", icon: "🅰️", title: "Free Vowel Sweep", tier: "legendary", type: "clues", maxLevel: 1, description: "1 vowel tested free/stage", level: g => upgradeCount(g, "freeVowelSweep") },
        { id: "revealGreen", icon: "📍", title: "Position Peek", tier: "common", type: "clues", maxLevel: 1, description: "Next stage: 1 green letter (once)" },
        { id: "questDoublePick", icon: "✌️", title: "Double Pick", tier: "legendary", type: "quests", maxLevel: 1, description: "Pick 2 quest rewards", level: g => upgradeCount(g, "questDoublePick") },
        { id: "questCadence", icon: "❗", title: "Quest Cadence", tier: "epic", type: "quests", maxLevel: 2,
          levels: ["Quest every 2nd guess · +1 active", "Quest every guess"],
          level: g => upgradeCount(g, "questCadence") },
        { id: "questPersistReward", icon: "⏳", title: "Lasting Quests", tier: "legendary", type: "quests", maxLevel: 1, description: "Missed quests stay active", level: g => (g?.state?.megaState?.questPersistsForRound ? 1 : 0) },
        { id: "allThemesBoss", icon: "🔮", title: "All-Seeing Atlas", tier: "legendary", type: "clues", maxLevel: 1, description: "All themes shown/stage", level: g => (bossRewardOwned(g, "umtAllThemes") ? 1 : 0) },
        { id: "secondCup", icon: "☕", title: "Second Cup", tier: "epic", type: "safety", maxLevel: 1, description: "Boss/strict: +1 guess once/run", level: g => (bossRewardOwned(g, "secondCup") ? 1 : 0) }
      ]
    }
  ]);

  // A few words per level, for the badge page's hexagons.
  const SHORT_LEVELS = {
    extraMulligans: ["+1 mulligan a stage", "+2 mulligans a stage", "+4 mulligans a stage"],
    questRefreshes: ["+1 quest refresh", "+2 quest refreshes", "+4 quest refreshes"],
    questPoints: ["+10 per quest", "+20 per quest", "+40 per quest"],
    mulliganSize: ["Mulligans swap 4", "Mulligans swap 5", "Mulligans swap all"],
    cullOne: ["1 letter culled", "2 letters culled", "4 letters culled"],
    cullTwo: ["2 letters culled", "4 letters culled", "7 letters culled"],
    categorySense: ["1 theme shown", "2 themes shown", "All themes shown"],
    storybookStart: ["+10 a stage", "+20 a stage", "+35 a stage"],
    wideChoice: ["+1 reward card", "+2 reward cards", "+2 cards, free refresh"],
    handSizeBoost: ["+1 consonant", "+2 consonants", "+4 consonants"],
    mulliganValueBoost: ["+5 per spare mulligan", "+10 per spare mulligan", "+25 per spare mulligan"],
    earlySolveBoost: ["+5 per spare guess", "+10 per spare guess", "+25 per spare guess"],
    colourTrade: ["Greens +1", "Greens +2", "Greens +4"],
    greyscale: ["Greys pay 1", "Greys pay 2", "Greys 3, yellows +1"],
    "surprise-assignment": ["+1 quest a stage", "+2 quests a stage", "+4 quests a stage"],
    treasureMap: ["+1 special tile", "+2 special tiles", "+4 special tiles"],
    mulliganTiles: ["Mulligan tiles", "Mulligan tiles x2", "Mulligan tiles x4"],
    jokerTiles: ["Joker tiles", "Joker tiles x2", "Joker tiles x4"],
    oracleTiles: ["Oracle tiles", "Oracle tiles x2", "Oracle tiles x4"],
    rainyDay: ["10% interest", "20% interest", "30% interest"],
    vowelBounty: ["+5 per vowel", "+10 per vowel", "+18 per vowel"],
    treasureHunter: ["Treasure +$25", "Treasure +$50", "Treasure +$100"],
    yellowHint: ["1 letter shown", "1 letter placed"],
    "alphabet-compass": ["1 compass tile", "2 compass tiles", "Every tile"],
    coachMeterThreshold: ["Meter 2 sooner", "Meter 4 sooner", "Meter 7 sooner"],
    coachMeterReward: ["Meter tests a letter", "Meter gives a Joker", "Meter places a letter"],
    momentum: ["+4 per better guess", "+8 per better guess", "+15 per better guess"],
    bigOpener: ["+4 per opener colour", "+7 per opener colour", "+16 per opener colour"],
    lastStand: ["+25 last-guess solve", "+45 last-guess solve", "+100 last-guess solve"],
    pickpocket: ["+$1 per yellow", "+$2 per yellow", "+$4 per yellow"],
    gracePeriod: ["1st late guess free", "2 late guesses free", "2 free, then half"],
    questCadence: ["Quests every 2nd guess", "Quests every guess"]
  };

  // A stackable power's description lists every level, and says the third
  // is the big one. The type doubles as the old colour category.
  for (const branch of BRANCHES) {
    for (const node of branch.nodes) {
      node.category = node.type;
      if (SHORT_LEVELS[node.id]) node.short = SHORT_LEVELS[node.id];
      if (Array.isArray(node.levels) && node.levels.length) {
        // Keyword style: "+1 mulligan/stage · Lv 2: +2 mulligans/stage · ..."
        node.description = node.levels.map((text, index) => (index ? `Lv ${index + 1}: ${text}` : text)).join(" · ");
      }
    }
  }

  function normName(value) {
    return String(value == null ? "" : value)
      .toLowerCase()
      .replace(/[’']/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  // Reward ids come in a few spellings across the add-on layers
  // ("umtRainyDay" for "rainyDay", "legendary:cullRare").
  function canonicalId(id) {
    const raw = String(id || "").replace(/^legendary:/, "");
    const stripped = raw.replace(/^umt(?=[A-Z])/, "");
    return stripped ? stripped.charAt(0).toLowerCase() + stripped.slice(1) : raw;
  }

  const NODES_BY_ID = new Map();
  const NODES_BY_NAME = new Map();
  for (const branch of BRANCHES) {
    for (const node of branch.nodes) {
      NODES_BY_ID.set(node.id, node);
      NODES_BY_NAME.set(normName(node.title), node);
    }
  }
  // Names a power also goes by on a card.
  const ALIASES = { "full alphabet compass": "alphabet-compass", "clear sight": "yellowHint", "color surge": "colourTrade", "grayscale": "greyscale" };
  for (const [alias, id] of Object.entries(ALIASES)) {
    if (NODES_BY_ID.has(id)) NODES_BY_NAME.set(alias, NODES_BY_ID.get(id));
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
    return NODES_BY_ID.get(id) || NODES_BY_ID.get(canonicalId(id)) || null;
  }

  function findNodeByName(name) {
    return NODES_BY_NAME.get(normName(name)) || null;
  }

  // Either an id or a card title.
  function resolve(idOrName) {
    return findNode(idOrName) || findNodeByName(idOrName);
  }

  function typeOf(idOrName) {
    const node = resolve(idOrName);
    return node ? node.type : null;
  }

  // What the power does at `level` (1-based), or its description.
  function levelText(node, level) {
    if (!node) return "";
    if (Array.isArray(node.levels) && node.levels.length) {
      const index = Math.max(0, Math.min(node.levels.length, Math.floor(Number(level) || 1)) - 1);
      // Keyword text ("+2 pts per green"): no closing full stop.
      return String(node.levels[index] || "");
    }
    return node.description || "";
  }

  // Sorts anything that names a power by type (in TYPE_ORDER), then by
  // rarity, then by name. `nodeOf(item)` finds an item's node.
  const TIER_RANK = { legendary: 0, epic: 1, rare: 2, common: 3 };
  function sortByType(items, nodeOf) {
    const rank = node => {
      const type = node && node.type;
      const index = TYPE_ORDER.indexOf(type);
      return index === -1 ? TYPE_ORDER.length : index;
    };
    return items.slice().sort((a, b) => {
      const na = nodeOf(a);
      const nb = nodeOf(b);
      return rank(na) - rank(nb)
        || (TIER_RANK[na && na.tier] ?? 4) - (TIER_RANK[nb && nb.tier] ?? 4)
        || String(na && na.title || "").localeCompare(String(nb && nb.title || ""));
    });
  }

  window.CuddleSkillTree = Object.freeze({
    BRANCHES,
    CATEGORIES,
    TYPES,
    TYPE_ORDER,
    isOwned,
    level: nodeLevel,
    findNode,
    findNodeByName,
    resolve,
    typeOf,
    levelText,
    sortByType,
    canonicalId
  });
})();
