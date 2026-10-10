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
          levels: ["Start every stage with +1 mulligan", "Start every stage with +2 mulligans", "Start every stage with +4 mulligans"],
          level: g => ledgerCount(g, "extraMulligans") },
        { id: "questRefreshes", icon: "♻️", title: "Reward Refresh", tier: "common", type: "quests", maxLevel: 3,
          levels: ["+1 free refresh on every quest reward screen", "+2 free refreshes on every quest reward screen", "+4 free refreshes on every quest reward screen"],
          level: g => ledgerCount(g, "questRefreshes") },
        { id: "questPoints", icon: "🏅", title: "Quest Value", tier: "common", type: "quests", maxLevel: 3,
          levels: ["Each completed quest pays +10 points", "Each completed quest pays +20 points", "Each completed quest pays +40 points"],
          level: g => ledgerCount(g, "questPoints") },
        { id: "questReroll", icon: "🔄", title: "Second Guess Quest", tier: "common", type: "quests", maxLevel: 1,
          description: "Reroll the current quest for free, once per stage", level: g => upgradeCount(g, "questReroll") },
        { id: "mulliganSize", icon: "🃏", title: "Bigger Mulligan", tier: "common", type: "letters", maxLevel: 3,
          levels: ["A mulligan can swap up to 4 of your letters", "A mulligan can swap up to 5 of your letters", "A mulligan can swap your whole hand"],
          level: g => ledgerCount(g, "mulliganSize") },
        { id: "cullOne", icon: "✂️", title: "Cull One Letter", tier: "common", type: "letters", maxLevel: 3,
          levels: ["Removes 1 rare consonant from your deck and all future answers", "Removes 2 rare consonants from your deck and all future answers", "Removes 4 rare consonants from your deck and all future answers"],
          level: g => v5Level(g, "umtCullOne") },
        { id: "cullTwo", icon: "✂️", title: "Cull Two Letters", tier: "epic", type: "letters", maxLevel: 3,
          levels: ["Removes 2 rare consonants from your deck and all future answers", "Removes 4 rare consonants from your deck and all future answers", "Removes 7 rare consonants from your deck and all future answers"],
          level: g => v5Level(g, "umtCullTwo") },
        { id: "categorySense", icon: "🔮", title: "Theme Sense", tier: "rare", type: "clues", maxLevel: 3,
          levels: ["Each stage starts with 1 of the answer's themes shown", "Each stage starts with 2 of the answer's themes shown", "Each stage starts with all of the answer's themes shown"],
          level: g => Number(campaignState(g)?.categorySense) || 0 },
        { id: "storybookStart", icon: "📖", title: "Opening Verse", tier: "common", type: "points", maxLevel: 3,
          levels: ["+10 points at the start of every stage", "+20 points at the start of every stage", "+35 points at the start of every stage"],
          level: g => Number(g?.state?.cuddleBonuses?.storybookStart) || 0 },
        { id: "wideChoice", icon: "🌈", title: "Wide Margins", tier: "common", type: "money", maxLevel: 3,
          levels: ["See 1 extra reward choice", "See 2 extra reward choices", "See 2 extra reward choices · first refresh free"],
          level: g => Number(g?.state?.cuddleBonuses?.wideChoice) || 0 },
        { id: "handSizeBoost", icon: "✋", title: "Bigger Hand", tier: "rare", type: "letters", maxLevel: 3,
          levels: ["Hold +1 consonant in your hand", "Hold +2 consonants in your hand", "Hold +4 consonants in your hand"],
          level: g => Number(g?.state?.balanceRewardCounts?.handSizeBoost) || 0 },
        { id: "mulliganValueBoost", icon: "💱", title: "Mulligan Dividend", tier: "common", type: "points", maxLevel: 3,
          levels: ["Each mulligan you didn't use pays +5 points when you solve", "Each mulligan you didn't use pays +10 points when you solve", "Each mulligan you didn't use pays +25 points when you solve"],
          level: g => Number(g?.state?.balanceRewardCounts?.mulliganValueBoost) || 0 },
        { id: "earlySolveBoost", icon: "🏁", title: "Early Finish", tier: "common", type: "points", maxLevel: 3,
          levels: ["Each guess you have left when you solve pays +5 points", "Each guess you have left when you solve pays +10 points", "Each guess you have left when you solve pays +25 points"],
          level: g => Number(g?.state?.balanceRewardCounts?.earlySolveBoost) || 0 },
        { id: "colourTrade", icon: "🎨", title: "Colour Surge", tier: "common", type: "points", maxLevel: 3,
          levels: ["Every green tile pays +1 point more", "Every green tile pays +2 points more", "Every green tile pays +4 points more"],
          level: g => Number(g?.state?.balanceRewardCounts?.colourTrade) || 0 },
        { id: "greyscale", icon: "⬛", title: "Greyscale", tier: "common", type: "points", maxLevel: 3,
          levels: ["Every grey tile pays +1 point", "Every grey tile pays +2 points", "Every grey tile pays +3 points, and every yellow +1 point more"],
          level: g => Number(g?.state?.balanceRewardCounts?.greyscale) || 0 },
        { id: "rewardEcho", icon: "🔁", title: "Reward Echo", tier: "rare", type: "money", maxLevel: 1, description: "The next reward you pick is applied twice" },
        { id: "greenCount", icon: "🔢", title: "Precise Green", tier: "rare", type: "clues", maxLevel: 1, description: "A green tile also shows how many times its letter appears in the answer" },
        { id: "surprise-assignment", icon: "📜", title: "Surprise Assignment", tier: "rare", type: "quests", maxLevel: 3,
          levels: ["+1 surprise quest appears in every stage", "+2 surprise quests appear in every stage", "+4 surprise quests appear in every stage"],
          level: g => ledgerCount(g, "surprise-assignment") },
        // More special board tiles (cuddle-points-money.js).
        { id: "treasureMap", icon: "🗺️", title: "Treasure Map", tier: "rare", type: "tiles", maxLevel: 3,
          levels: ["+1 special tile on the board every stage", "+2 special tiles on the board every stage", "+4 special tiles on the board every stage"],
          level: g => ledgerCount(g, "treasureMap") },
        // Board tiles beyond money and points each need their unlock.
        { id: "mulliganTiles", icon: "🔄", title: "Mulligan Tiles", tier: "common", type: "tiles", maxLevel: 3,
          levels: ["Special tiles can be Mulligan tiles: a green or yellow on one gives +1 mulligan", "Mulligan tiles show up twice as often", "Mulligan tiles show up four times as often"],
          level: g => ledgerCount(g, "mulliganTiles") },
        { id: "jokerTiles", icon: "🃏", title: "Joker Tiles", tier: "rare", type: "tiles", maxLevel: 3,
          levels: ["Special tiles can be Joker tiles: a green or yellow on one gives +1 Joker", "Joker tiles show up twice as often", "Joker tiles show up four times as often"],
          level: g => ledgerCount(g, "jokerTiles") },
        { id: "oracleTiles", icon: "🔮", title: "Oracle Tiles", tier: "epic", type: "tiles", maxLevel: 3,
          levels: ["Special tiles can be Oracle tiles: a green or yellow on one shows where a letter goes", "Oracle tiles show up twice as often", "Oracle tiles show up four times as often"],
          level: g => ledgerCount(g, "oracleTiles") }
      ]
    },
    {
      id: "economyEngines",
      title: "Economy Engines",
      blurb: "Reward pool that pays out for how you play a round, not just for finishing it.",
      nodes: [
        { id: "rainyDay", icon: "🏦", title: "Rainy Day Fund", tier: "rare", type: "money", maxLevel: 3,
          levels: ["Earn 10% interest on your money every stage (up to $25)", "Earn 20% interest on your money every stage (up to $50)", "Earn 30% interest on your money every stage (up to $120)"],
          level: g => v5Level(g, "umtRainyDay") },
        { id: "encore", icon: "🎬", title: "Encore", tier: "rare", type: "points", maxLevel: 1, description: "Every 3rd stage you solve pays an extra +50 points", level: g => v5Level(g, "umtEncore") },
        { id: "vowelBounty", icon: "🅰️", title: "Vowel Bounty", tier: "common", type: "points", maxLevel: 3,
          levels: ["Each vowel in the answer pays +5 points when you solve", "Each vowel in the answer pays +10 points when you solve", "Each vowel in the answer pays +18 points when you solve"],
          level: g => v5Level(g, "umtVowelBounty") },
        { id: "haggler", icon: "🪙", title: "Haggler", tier: "common", type: "money", maxLevel: 1, description: "Refreshing reward choices costs $0, then $1, $3… instead of $3, $5…", level: g => v5Level(g, "umtHaggler") },
        { id: "doubleDown", icon: "🎲", title: "Double Down", tier: "epic", type: "points", maxLevel: 1, description: "Each stage names a lucky guess (3rd to 7th): solve on exactly that guess for +50 points", level: g => v5Level(g, "umtDoubleDown") }
      ]
    },
    {
      id: "insightTools",
      title: "Insight",
      blurb: "Clues about the answer before you guess, and a little luck. Effects in cuddle-clues.js.",
      nodes: [
        { id: "vowelLamp", icon: "🏮", title: "Vowel Lamp", tier: "rare", type: "clues", maxLevel: 1, description: "Every stage shows how many vowels the answer has", level: g => v5Level(g, "umtVowelLamp") },
        { id: "echoFinder", icon: "👯", title: "Echo Finder", tier: "common", type: "clues", maxLevel: 1, description: "Every stage shows whether the answer repeats a letter", level: g => v5Level(g, "umtEchoFinder") },
        { id: "treasureHunter", icon: "💎", title: "Treasure Hunter", tier: "common", type: "money", maxLevel: 3,
          levels: ["1 in 3 stages hides a treasure word: solve it quickly for +$25", "Treasure words pay +$50 when solved quickly", "Treasure words pay +$100 and appear every second stage"],
          level: g => v5Level(g, "umtTreasureHunter") },
        { id: "patternLens", icon: "🧩", title: "Pattern Lens", tier: "epic", type: "clues", maxLevel: 1, description: "Every stage shows where the answer's vowels and consonants are, like C V C C V", level: g => v5Level(g, "umtPatternLens") },
        { id: "mistakeShield", icon: "🛡️", title: "Mistake Shield", tier: "rare", type: "safety", maxLevel: 1, description: "In bosses and strict stages, your first guess with no green or yellow is given back", level: g => v5Level(g, "umtMistakeShield") },
        { id: "lastLight", icon: "🕯️", title: "Last Light", tier: "legendary", type: "clues", maxLevel: 1, description: "Every stage starts with the answer's last letter in place", level: g => v5Level(g, "umtLastLight") },
        { id: "yellowHint", icon: "🟨", title: "Yellow Guesser Hint", tier: "epic", type: "clues", maxLevel: 2,
          levels: ["Each stage starts with 1 of the answer's letters shown in yellow", "Legendary: that letter is shown green, in its exact place"],
          level: g => v5Level(g, "umtYellowHint") + v5Level(g, "umtClearSight") }
      ]
    },
    {
      id: "solvingAids",
      title: "Solving Aids",
      blurb: "Jokers and letter tools, offered on every difficulty.",
      nodes: [
        { id: "jokerCache", icon: "🃏", title: "Small Joker Cache", tier: "rare", type: "letters", maxLevel: 1, description: "Start every stage with +1 Joker", level: g => v5Level(g, "umtJokerCache") },
        { id: "jokerCacheLarge", icon: "🃏", title: "Large Joker Cache", tier: "legendary", type: "letters", maxLevel: 1, description: "Start every stage with +2 Jokers, on top of Small Joker Cache", level: g => v5Level(g, "umtJokerCacheLarge") },
        { id: "alphabet-compass", icon: "🧭", title: "Alphabet Compass", tier: "epic", type: "clues", maxLevel: 3,
          levels: ["After each guess, 1 tile shows if the answer's letter there is earlier or later in the alphabet", "After each guess, 2 tiles show it", "Legendary: after each guess, every tile shows it"],
          level: g => (window.CuddleCompass && g?.state ? window.CuddleCompass.copiesOwned(g.state) : 0) },
        { id: "consonantSweep", icon: "🔍", title: "Process of Elimination", tier: "epic", type: "clues", maxLevel: 1, description: "After each guess, one more consonant that isn't in the answer is shown", level: g => upgradeCount(g, "consonantSweep") }
      ]
    },
    {
      id: "cuddleCoach",
      title: "Cuddle Coach",
      blurb: "The Cuddle Meter and the Secrets Counter.",
      nodes: [
        { id: "coachPossibleAnswers", icon: "🎧", title: "Secrets Counter", tier: "rare", type: "clues", maxLevel: 1, description: "Shows how many possible answers are still left", level: g => (coachState(g)?.possibleAnswersUnlocked ? 1 : 0) },
        { id: "coachMeterThreshold", icon: "🩶", title: "Softer Cuddle Meter", tier: "common", type: "letters", maxLevel: 3,
          levels: ["The Cuddle Meter needs 2 fewer tiles to fill", "The Cuddle Meter needs 4 fewer tiles to fill", "The Cuddle Meter needs 7 fewer tiles to fill"],
          level: g => Number(coachState(g)?.cuddleThresholdStacks) || 0 },
        { id: "coachMeterReward", icon: "🫶", title: "Bigger Cuddle", tier: "rare", type: "letters", maxLevel: 3,
          levels: ["A full Cuddle Meter tests 1 consonant for you", "A full Cuddle Meter gives +1 Joker", "A full Cuddle Meter puts 1 letter in its exact place"],
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
          levels: ["Each guess with more greens than the one before pays +4 points", "Each guess with more greens than the one before pays +8 points", "Each guess with more greens than the one before pays +15 points"],
          level: g => powerLevel(g, "momentum") },
        { id: "bigOpener", icon: "🎯", title: "Big Opener", tier: "rare", type: "points", maxLevel: 3,
          levels: ["Each green or yellow on your first guess pays +5 points", "Each green or yellow on your first guess pays +10 points", "Each green or yellow on your first guess pays +20 points"],
          level: g => powerLevel(g, "bigOpener") },
        { id: "lastStand", icon: "⚔️", title: "Last Stand", tier: "rare", type: "points", maxLevel: 3,
          levels: ["Solve on the last guess of your guess window for +25 points", "Solve on the last guess of your guess window for +45 points", "Solve on the last guess of your guess window for +100 points"],
          level: g => powerLevel(g, "lastStand") },
        { id: "pickpocket", icon: "💲", title: "Pickpocket", tier: "common", type: "money", maxLevel: 3,
          levels: ["Each yellow tile you find pays +$1", "Each yellow tile you find pays +$2", "Each yellow tile you find pays +$4"],
          level: g => powerLevel(g, "pickpocket") },
        { id: "gracePeriod", icon: "⌛", title: "Grace Period", tier: "rare", type: "safety", maxLevel: 3,
          levels: ["Your first late guess has no point penalty", "Your first 2 late guesses have no point penalty", "Your first 2 late guesses have no penalty, and later ones cost half"],
          level: g => powerLevel(g, "gracePeriod") },
        { id: "boldOpener", icon: "🪄", title: "Bold Opener", tier: "epic", type: "clues", maxLevel: 1,
          description: "Your first guess in each stage can be any 5 letters, real word or not",
          level: g => powerLevel(g, "boldOpener") }
      ]
    },
    {
      id: "synergyCombos",
      title: "Synergy Combos",
      blurb: "Owning both halves of a pair turns the combo on permanently.",
      nodes: [
        { id: "encoreNight", icon: "🎬", title: "Encore Night", tier: "legendary", type: "combo", maxLevel: 1, description: "Each encore also pays +10 points per vowel in that answer", requires: ["encore", "vowelBounty"], level: g => (v5Level(g, "umtEncore") > 0 && v5Level(g, "umtVowelBounty") > 0) ? 1 : 0 }
      ]
    },
    {
      id: "bossRewards",
      title: "Boss Rewards",
      blurb: "Permanent rewards for clearing a boss round. No ordinary upgrade is offered afterward.",
      nodes: [
        { id: "cullRare", icon: "✂️", title: "Deep Cull", tier: "legendary", type: "letters", maxLevel: 1, description: "Removes 4 rare letters from your deck and all future answers" },
        { id: "doubleMulligans", icon: "🔁", title: "Double Mulligans", tier: "epic", type: "letters", maxLevel: 1, description: "Every mulligan you get is doubled, for the rest of the run", level: g => upgradeCount(g, "doubleMulligans") },
        { id: "biggerMulligans", icon: "🖐️", title: "Full Hand Mulligan", tier: "epic", type: "letters", maxLevel: 1, description: "A mulligan can swap up to 5 of your letters", level: g => ledgerCount(g, "biggerMulligans") },
        { id: "freeVowelSweep", icon: "🅰️", title: "Free Vowel Sweep", tier: "legendary", type: "clues", maxLevel: 1, description: "Each stage tests 1 random vowel for free: you learn if it's in the answer", level: g => upgradeCount(g, "freeVowelSweep") },
        { id: "revealGreen", icon: "📍", title: "Position Peek", tier: "common", type: "clues", maxLevel: 1, description: "Your next stage starts with 1 letter in its exact place (one time)" },
        { id: "questDoublePick", icon: "✌️", title: "Double Pick", tier: "legendary", type: "quests", maxLevel: 1, description: "On quest reward screens, pick 2 rewards instead of 1", level: g => upgradeCount(g, "questDoublePick") },
        { id: "questCadence", icon: "❗", title: "Quest Cadence", tier: "epic", type: "quests", maxLevel: 2,
          levels: ["A new quest every second guess, and 1 more can be active at once", "A new quest every guess"],
          level: g => upgradeCount(g, "questCadence") },
        { id: "questPersistReward", icon: "⏳", title: "Lasting Quests", tier: "legendary", type: "quests", maxLevel: 1, description: "A quest you miss stays active for the rest of the stage", level: g => (g?.state?.megaState?.questPersistsForRound ? 1 : 0) },
        { id: "allThemesBoss", icon: "🔮", title: "All-Seeing Atlas", tier: "legendary", type: "clues", maxLevel: 1, description: "Every stage starts with all of the answer's themes shown", level: g => (bossRewardOwned(g, "umtAllThemes") ? 1 : 0) },
        { id: "secondCup", icon: "☕", title: "Second Cup", tier: "epic", type: "safety", maxLevel: 1, description: "Once per run, in a boss or strict stage, get +1 guess when you'd run out", level: g => (bossRewardOwned(g, "secondCup") ? 1 : 0) }
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
    wideChoice: ["+1 choice to see", "+2 choices to see", "+2 choices, free refresh"],
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
    bigOpener: ["+5 per opener colour", "+10 per opener colour", "+20 per opener colour"],
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
        // Keyword style: "+1 mulligan per stage · Lv 2: +2 mulligans per stage · ..."
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
      // Keyword text ("+2 points per green"): no closing full stop.
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
