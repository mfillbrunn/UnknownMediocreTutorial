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
          levels: ["+1 mulligan each stage", "+2 mulligans each stage", "+4 mulligans each stage"],
          level: g => ledgerCount(g, "extraMulligans") },
        { id: "questRefreshes", icon: "♻️", title: "Reward Refresh", tier: "common", type: "quests", maxLevel: 3,
          levels: ["+1 free refresh on quest rewards", "+2 free refreshes on quest rewards", "+4 free refreshes on quest rewards"],
          level: g => ledgerCount(g, "questRefreshes") },
        { id: "questPoints", icon: "🏅", title: "Quest Value", tier: "common", type: "quests", maxLevel: 3,
          levels: ["Quests pay +10 points", "Quests pay +20 points", "Quests pay +40 points"],
          level: g => ledgerCount(g, "questPoints") },
        { id: "questReroll", icon: "🔄", title: "Second Guess Quest", tier: "common", type: "quests", maxLevel: 1,
          description: "Reroll the current quest for free, once per stage", level: g => upgradeCount(g, "questReroll") },
        { id: "mulliganSize", icon: "🃏", title: "Bigger Mulligan", tier: "common", type: "letters", maxLevel: 3,
          levels: ["Mulligans swap up to 4 letters", "Mulligans swap up to 5 letters", "Mulligans swap your whole hand"],
          level: g => ledgerCount(g, "mulliganSize") },
        { id: "cullOne", icon: "✂️", title: "Cull One Letter", tier: "common", type: "letters", maxLevel: 3,
          levels: ["Remove 1 rare consonant from deck and answers", "Remove 2 rare consonants from deck and answers", "Remove 4 rare consonants from deck and answers"],
          level: g => v5Level(g, "umtCullOne") },
        { id: "cullTwo", icon: "✂️", title: "Cull Two Letters", tier: "epic", type: "letters", maxLevel: 3,
          levels: ["Remove 2 rare consonants from deck and answers", "Remove 3 rare consonants from deck and answers", "Remove 5 rare consonants from deck and answers"],
          level: g => v5Level(g, "umtCullTwo") },
        { id: "categorySense", icon: "🔮", title: "Theme Sense", tier: "rare", type: "clues", maxLevel: 3,
          levels: ["Stages start with 1 theme shown", "Stages start with 2 themes shown", "Stages start with all themes shown"],
          level: g => Number(campaignState(g)?.categorySense) || 0 },
        { id: "storybookStart", icon: "📖", title: "Opening Verse", tier: "rare", type: "points", maxLevel: 3,
          levels: ["+10 points at each stage start", "+20 points at each stage start", "+40 points at each stage start"],
          level: g => Number(g?.state?.cuddleBonuses?.storybookStart) || 0 },
        { id: "wideChoice", icon: "🌈", title: "Wide Margins", tier: "common", type: "money", maxLevel: 3,
          levels: ["See 1 extra reward choice", "See 2 extra reward choices", "See 2 extra reward choices · first refresh free"],
          level: g => Number(g?.state?.cuddleBonuses?.wideChoice) || 0 },
        { id: "handSizeBoost", icon: "✋", title: "Bigger Hand", tier: "rare", type: "letters", maxLevel: 3,
          levels: ["+1 consonant in your hand", "+2 consonants in your hand", "+4 consonants in your hand"],
          level: g => Number(g?.state?.balanceRewardCounts?.handSizeBoost) || 0 },
        { id: "mulliganValueBoost", icon: "💱", title: "Mulligan Dividend", tier: "common", type: "points", maxLevel: 3,
          levels: ["Unused mulligans pay +5 each when you solve", "Unused mulligans pay +10 each when you solve", "Unused mulligans pay +25 each when you solve"],
          level: g => Number(g?.state?.balanceRewardCounts?.mulliganValueBoost) || 0 },
        { id: "earlySolveBoost", icon: "🏁", title: "Early Finish", tier: "rare", type: "points", maxLevel: 3,
          levels: ["Spare guesses pay +5 each when you solve", "Spare guesses pay +10 each when you solve", "Spare guesses pay +25 each when you solve"],
          level: g => Number(g?.state?.balanceRewardCounts?.earlySolveBoost) || 0 },
        { id: "colourTrade", icon: "🎨", title: "Colour Surge", tier: "common", type: "points", maxLevel: 3,
          levels: ["Greens pay +0.5 points more", "Greens pay +1 point more", "Greens pay +2 points more"],
          level: g => Number(g?.state?.balanceRewardCounts?.colourTrade) || 0 },
        { id: "greyscale", icon: "⬛", title: "Greyscale", tier: "common", type: "points", maxLevel: 3,
          levels: ["Greys pay +1 point", "Greys pay +2 points", "Greys pay +4 points"],
          level: g => Number(g?.state?.balanceRewardCounts?.greyscale) || 0 },
        { id: "rewardEcho", icon: "🔁", title: "Reward Echo", tier: "rare", type: "money", maxLevel: 1, description: "The next reward you pick is applied twice" },
        { id: "greenCount", icon: "🔢", title: "Precise Green", tier: "rare", type: "clues", maxLevel: 1, description: "Greens show how many times their letter appears",
          level: g => (g?.state?.megaState?.greenCountUnlocked ? 1 : 0) },
        { id: "surprise-assignment", icon: "📜", title: "Surprise Assignment", tier: "rare", type: "quests", maxLevel: 3,
          levels: ["+1 surprise quest a stage", "+2 surprise quests a stage", "+4 surprise quests a stage"],
          level: g => ledgerCount(g, "surprise-assignment") },
        // More special board tiles (cuddle-points-money.js).
        { id: "treasureMap", icon: "🗺️", title: "Treasure Map", tier: "rare", type: "tiles", maxLevel: 3,
          levels: ["+1 special board tile a stage", "+2 special board tiles a stage", "+4 special board tiles a stage"],
          level: g => ledgerCount(g, "treasureMap") },
        // Board tiles beyond money and points each need their unlock.
        { id: "mulliganTiles", icon: "🔄", title: "Mulligan Tiles", tier: "common", type: "tiles", maxLevel: 3,
          levels: ["Mulligan tiles: hit one for +1 mulligan", "Mulligan tiles 2× as common", "Mulligan tiles 4× as common"],
          level: g => ledgerCount(g, "mulliganTiles") },
        { id: "jokerTiles", icon: "🃏", title: "Joker Tiles", tier: "rare", type: "tiles", maxLevel: 3,
          levels: ["Joker tiles: hit one for +1 Joker", "Joker tiles 2× as common", "Joker tiles 4× as common"],
          level: g => ledgerCount(g, "jokerTiles") },
        { id: "oracleTiles", icon: "🔮", title: "Oracle Tiles", tier: "epic", type: "tiles", maxLevel: 3,
          levels: ["Oracle tiles: hit one to place a letter", "Oracle tiles 2× as common", "Oracle tiles 4× as common"],
          level: g => ledgerCount(g, "oracleTiles") }
      ]
    },
    {
      id: "economyEngines",
      title: "Economy Engines",
      blurb: "Reward pool that pays out for how you play a round, not just for finishing it.",
      nodes: [
        { id: "rainyDay", icon: "🏦", title: "Rainy Day Fund", tier: "rare", type: "money", maxLevel: 3,
          levels: ["5% interest a stage (max $10)", "10% interest a stage (max $20)", "20% interest a stage (max $40)"],
          level: g => v5Level(g, "umtRainyDay") },
        { id: "encore", icon: "🎬", title: "Encore", tier: "common", type: "points", maxLevel: 1, description: "Every 3rd stage you solve pays an extra +50 points", level: g => v5Level(g, "umtEncore") },
        { id: "vowelBounty", icon: "🅰️", title: "Vowel Bounty", tier: "rare", type: "points", maxLevel: 3,
          levels: ["The answer's vowels pay +5 each when you solve", "The answer's vowels pay +10 each when you solve", "The answer's vowels pay +20 each when you solve"],
          level: g => v5Level(g, "umtVowelBounty") },
        { id: "haggler", icon: "🪙", title: "Haggler", tier: "common", type: "money", maxLevel: 1, description: "Reward refreshes cost $0, $1, $3… (not $3, $5…)", level: g => v5Level(g, "umtHaggler") },
        { id: "doubleDown", icon: "🎲", title: "Double Down", tier: "rare", type: "points", maxLevel: 1, description: "Solve on the stage's lucky guess (3rd–7th): +50 points", level: g => v5Level(g, "umtDoubleDown") }
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
          levels: ["1 in 3 stages has a treasure word: solve it fast for +$20", "Treasure words pay +$30", "Treasure words pay +$50, every other stage"],
          level: g => v5Level(g, "umtTreasureHunter") },
        { id: "patternLens", icon: "🧩", title: "Pattern Lens", tier: "epic", type: "clues", maxLevel: 1, description: "From guess 2, shows the answer's vowel/consonant pattern (C V C C V)", level: g => v5Level(g, "umtPatternLens") },
        { id: "mistakeShield", icon: "🛡️", title: "Mistake Shield", tier: "rare", type: "safety", maxLevel: 1, description: "Bosses and strict stages: your first all-grey guess is given back", level: g => v5Level(g, "umtMistakeShield") },
        { id: "lastLight", icon: "🕯️", title: "Last Light", tier: "legendary", type: "clues", maxLevel: 1, description: "After guess 2, the answer's last letter is placed", level: g => v5Level(g, "umtLastLight") },
        { id: "yellowHint", icon: "🟨", title: "Yellow Guesser Hint", tier: "epic", type: "clues", maxLevel: 2,
          levels: ["After guess 1, an answer letter shows yellow", "Legendary: it shows green, in its place"],
          level: g => v5Level(g, "umtYellowHint") + v5Level(g, "umtClearSight") }
      ]
    },
    {
      id: "solvingAids",
      title: "Solving Aids",
      blurb: "Jokers and letter tools, offered on every difficulty.",
      nodes: [
        // One Joker per level, straight up to three (by request, an even step
        // rather than a bigger third pick).
        { id: "jokerCache", icon: "🃏", title: "Small Joker Cache", tier: "rare", type: "letters", maxLevel: 3,
          levels: ["1 Joker tile in your deck each stage", "2 Joker tiles in your deck each stage", "4 Joker tiles in your deck each stage"],
          description: "1 Joker tile per level in your deck every stage: draw it for a Joker", level: g => v5Level(g, "umtJokerCache") },
        { id: "jokerCacheLarge", icon: "🃏", title: "Large Joker Cache", tier: "legendary", type: "letters", maxLevel: 1, description: "+2 Joker tiles in your deck each stage, on top of Small", level: g => v5Level(g, "umtJokerCacheLarge") },
        { id: "alphabet-compass", icon: "🧭", title: "Alphabet Compass", tier: "epic", type: "clues", maxLevel: 3,
          levels: ["After each guess, 1 tile shows earlier/later in the alphabet", "After each guess, 2 tiles show earlier/later", "Legendary: every tile shows earlier/later"],
          level: g => (window.CuddleCompass && g?.state ? window.CuddleCompass.copiesOwned(g.state) : 0) },
        { id: "consonantSweep", icon: "🔍", title: "Process of Elimination", tier: "epic", type: "clues", maxLevel: 1, description: "After each guess, one more consonant is ruled out", level: g => Math.max(upgradeCount(g, "consonantSweep"), upgradeCount(g, "umtConsonantSweep"),
            Number(g?.state?.cuddleRebalanceV5?.upgrades?.umtConsonantSweep) || 0) }
      ]
    },
    {
      id: "cuddleCoach",
      title: "Cuddle Coach",
      blurb: "The Cuddle Meter and the Secrets Counter.",
      nodes: [
        { id: "coachPossibleAnswers", icon: "🎧", title: "Secrets Counter", tier: "rare", type: "clues", maxLevel: 1, description: "Shows how many possible answers are still left", level: g => (coachState(g)?.possibleAnswersUnlocked ? 1 : 0) },
        { id: "coachMeterThreshold", icon: "🩶", title: "Softer Cuddle Meter", tier: "common", type: "letters", maxLevel: 3,
          levels: ["Cuddle Meter fills 2 tiles sooner", "Cuddle Meter fills 4 tiles sooner", "Cuddle Meter fills 6 tiles sooner"],
          level: g => Number(coachState(g)?.cuddleThresholdStacks) || 0 },
        { id: "coachMeterReward", icon: "🫶", title: "Bigger Cuddle", tier: "rare", type: "letters", maxLevel: 3,
          levels: ["Full Cuddle Meter: tests a consonant", "Full Cuddle Meter: +1 Joker", "Full Cuddle Meter: places a letter"],
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
          levels: ["More greens than your last guess: +4 points", "More greens than your last guess: +8 points", "More greens than your last guess: +15 points"],
          level: g => powerLevel(g, "momentum") },
        { id: "bigOpener", icon: "🎯", title: "Big Opener", tier: "rare", type: "points", maxLevel: 3,
          levels: ["Guess 1: +5 per green or yellow", "Guess 1: +10 per green or yellow", "Guess 1: +20 per green or yellow"],
          level: g => powerLevel(g, "bigOpener") },
        { id: "lastStand", icon: "⚔️", title: "Last Stand", tier: "rare", type: "points", maxLevel: 3,
          levels: ["Solve on your window's last guess: +25 points", "Solve on your window's last guess: +45 points", "Solve on your window's last guess: +100 points"],
          level: g => powerLevel(g, "lastStand") },
        { id: "pickpocket", icon: "💲", title: "Pickpocket", tier: "common", type: "money", maxLevel: 3,
          levels: ["Each yellow pays +$1", "Each yellow pays +$2", "Each yellow pays +$4"],
          level: g => powerLevel(g, "pickpocket") },
        { id: "gracePeriod", icon: "⌛", title: "Grace Period", tier: "rare", type: "safety", maxLevel: 3,
          levels: ["Your first late guess costs nothing", "Your first 2 late guesses cost nothing", "First 2 late guesses free, later ones half"],
          level: g => powerLevel(g, "gracePeriod") },
        { id: "boldOpener", icon: "🪄", title: "Bold Opener", tier: "epic", type: "clues", maxLevel: 1,
          description: "Guess 1 can be any 5 letters, real word or not",
          level: g => powerLevel(g, "boldOpener") },
        { id: "ideaTiles", icon: "💡", title: "Idea Tiles", tier: "rare", type: "clues", maxLevel: 3,
          levels: ["1 idea tile: mulligan it for a yellow hint", "2 idea tiles: mulligan each for a yellow hint", "3 idea tiles: mulligan each for a yellow hint"],
          level: g => powerLevel(g, "ideaTiles") },
        { id: "waveTiles", icon: "🌊", title: "Wave Tiles", tier: "common", type: "letters", maxLevel: 3,
          levels: ["1 wave tile: drawing it swaps all your consonants", "2 wave tiles: drawing one swaps all your consonants", "4 wave tiles: drawing one swaps all your consonants"],
          level: g => powerLevel(g, "waveTiles") },
        { id: "fullCircle", icon: "♻️", title: "Full Circle", tier: "epic", type: "clues", maxLevel: 1,
          description: "First reshuffle each stage places a letter (a green hint)",
          level: g => powerLevel(g, "fullCircle") },
        // Minimalist and Eliminator (cuddle-strategies.js).
        { id: "leanBuild", icon: "🧹", title: "Lean Build", tier: "epic", type: "points", maxLevel: 1,
          description: "Solves pay 20 / 40 / 100 by world, −5 per other badge you own",
          level: g => powerLevel(g, "leanBuild") },
        { id: "monksVow", icon: "🕯️", title: "Monk's Vow", tier: "rare", type: "money", maxLevel: 1,
          description: "Skipping a reward pays both: +40 points and +$15",
          level: g => powerLevel(g, "monksVow") },
        { id: "strikeThrough", icon: "✂️", title: "Strike-Through", tier: "rare", type: "points", maxLevel: 3,
          levels: ["Each consonant ruled out: +0.5 points", "Each consonant ruled out: +1 point", "Each consonant ruled out: +2 points"],
          level: g => powerLevel(g, "strikeThrough") },
        { id: "highRoller", icon: "🎲", title: "High Roller", tier: "common", type: "points", maxLevel: 3,
          levels: ["Bet 10 a stage: win it double by guess 5 (4 in worlds 2–3)", "Bet 20 a stage: win it double by guess 5 (4 in worlds 2–3)", "Bet 50 a stage: win it double by guess 5 (4 in worlds 2–3)"],
          level: g => powerLevel(g, "highRoller") },
        { id: "hardMode", icon: "🎯", title: "Hard Mode", tier: "common", type: "points", maxLevel: 3,
          levels: ["Hard-mode solve (keep greens, use yellows): +10 points", "Hard-mode solve (keep greens, use yellows): +20 points", "Hard-mode solve (keep greens, use yellows): +40 points"],
          level: g => powerLevel(g, "hardMode") },
        { id: "combine", icon: "🧩", title: "Combine", tier: "rare", type: "letters", maxLevel: 1,
          description: "Turns one of your playstyle badges into a random badge a rarity higher",
          level: () => 0 },
        { id: "luckyClover", icon: "🍀", title: "Lucky Clover", tier: "rare", type: "points", maxLevel: 3,
          levels: ["1 lucky tile: +10 if in hand when you solve (+5 if mulliganed)", "2 lucky tiles: +20 each in hand when you solve", "4 lucky tiles: +40 each in hand when you solve"],
          level: g => powerLevel(g, "luckyClover") }
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
        { id: "cullRare", icon: "✂️", title: "Deep Cull", tier: "legendary", type: "letters", maxLevel: 1, description: "Removes 5 rare letters from your deck and all future answers" },
        { id: "doubleMulligans", icon: "🔁", title: "Double Mulligans", tier: "epic", type: "letters", maxLevel: 1, description: "Every mulligan you get is doubled, for the rest of the run", level: g => upgradeCount(g, "doubleMulligans") },
        { id: "biggerMulligans", icon: "🖐️", title: "Full Hand Mulligan", tier: "epic", type: "letters", maxLevel: 1, description: "A mulligan can swap up to 5 of your letters", level: g => ledgerCount(g, "biggerMulligans") },
        { id: "freeVowelSweep", icon: "🅰️", title: "Free Vowel Sweep", tier: "legendary", type: "clues", maxLevel: 1, description: "Each stage tests 1 vowel for free", level: g => upgradeCount(g, "freeVowelSweep") },
        { id: "revealGreen", icon: "📍", title: "Position Peek", tier: "common", type: "clues", maxLevel: 1, description: "Your next stage starts with 1 letter in its exact place (one time)" },
        { id: "questDoublePick", icon: "✌️", title: "Double Pick", tier: "legendary", type: "quests", maxLevel: 1, description: "On quest reward screens, pick 2 rewards instead of 1", level: g => upgradeCount(g, "questDoublePick") },
        { id: "questCadence", icon: "❗", title: "Quest Cadence", tier: "epic", type: "quests", maxLevel: 2,
          levels: ["Also a quest on guess 3 (2, 3, 5)", "Also a quest on guess 1 (1, 2, 3, 5)"],
          level: g => upgradeCount(g, "questCadence") },
        { id: "questPersistReward", icon: "⏳", title: "Lasting Quests", tier: "legendary", type: "quests", maxLevel: 1, description: "A quest you miss stays active for the rest of the stage", level: g => (g?.state?.megaState?.questPersistsForRound ? 1 : 0) },
        { id: "allThemesBoss", icon: "🔮", title: "All-Seeing Atlas", tier: "legendary", type: "clues", maxLevel: 1, description: "Every stage starts with all of the answer's themes shown", level: g => (bossRewardOwned(g, "umtAllThemes") ? 1 : 0) },
        { id: "secondCup", icon: "☕", title: "Second Cup", tier: "epic", type: "safety", maxLevel: 1, description: "Once a run: +1 guess when a boss or strict stage would end", level: g => (bossRewardOwned(g, "secondCup") ? 1 : 0) }
      ]
    }
  ]);

  // Schools. Every badge belongs to one school (or none); the ids are
  // older names (flint = Speed, prism = Hints, flora = Tiles, parchment =
  // Elimination, gold = Money, brass = Quests, pearl = Restraint);
  // each level of a badge adds its rarity's weight to its school, and a
  // school's points unlock its ranks. The perks themselves live in
  // cuddle-schools.js.
  const TIER_WEIGHT = Object.freeze({ common: 1, rare: 2, epic: 3, legendary: 5 });
  // Each school has its own colour, so badges read as sorted by colour.
  const SCHOOLS = Object.freeze({
    flint: { label: "Speed", color: "#ff5f4f", blurb: "Strong openers and quick solves.",
      ranks: [4, 9, 15], perks: ["Solve by guess 3: +10", "Solve by guess 3: +25", "Solve by guess 3: +60"] },
    prism: { label: "Hints", color: "#58a8ff", blurb: "Learn about the answer before you guess it.",
      ranks: [4, 9, 15], perks: ["A grey vowel at stage start", "After guess 2: a yellow hint", "After guess 3: a green hint"] },
    flora: { label: "Tiles", color: "#46cf86", blurb: "Special tiles in your deck and hand: lucky, idea, wave, Joker, mulligans.",
      ranks: [4, 9, 15], perks: ["+1 lucky tile a stage", "+1 idea tile and +1 mulligan a stage", "Lucky tiles pay double"] },
    parchment: { label: "Elimination", color: "#c9ae84", blurb: "Rule letters out and cull them.",
      ranks: [4, 9, 15], perks: ["Greys +1 point", "1 consonant ruled out at stage start", "Greys +3 points; Cuddle Meter fills 2 sooner"] },
    gold: { label: "Money", color: "#f5cf3a", blurb: "Earn, save and gamble money.",
      ranks: [4, 9, 15], perks: ["+$3 a solve", "+$8 a solve; Rainy Day cap +$10", "+$20 a solve; first reward refresh free"] },
    brass: { label: "Quests", color: "#ef8a34", blurb: "More quests and bigger quest rewards.",
      ranks: [4, 9, 15], perks: ["Quests +10 points", "+1 surprise quest a stage", "Quests +40 points and +$5"] },
    pearl: { label: "Restraint", color: "#e7a2ee", blurb: "Fewer badges and harder play, for bigger rewards.",
      ranks: [3, 6, 9], perks: ["Skipping a reward pays +10 more", "Hard-mode solves +15; Lean Build ignores 3 badges", "+30 a solve while you own 8 badges or fewer"] }
  });
  // Badges that belong to no school.
  const SCHOOLLESS = Object.freeze({ label: "General", color: "#9d97b0", blurb: "General tools that belong to no school." });
  const SCHOOL_ORDER = Object.freeze(Object.keys(SCHOOLS));
  const SCHOOL_MEMBERS = {
    flint: ["storybookStart", "earlySolveBoost", "bigOpener", "momentum", "colourTrade", "boldOpener"],
    prism: ["categorySense", "greenCount", "vowelLamp", "echoFinder", "patternLens", "yellowHint", "alphabet-compass",
      "oracleTiles", "lastLight", "allThemesBoss", "revealGreen"],
    flora: ["luckyClover", "ideaTiles", "waveTiles", "fullCircle", "jokerCache", "jokerCacheLarge", "jokerTiles", "mulliganTiles",
      "treasureMap", "extraMulligans", "mulliganSize", "handSizeBoost", "doubleMulligans", "biggerMulligans"],
    parchment: ["greyscale", "strikeThrough", "cullOne", "cullTwo", "cullRare", "consonantSweep", "freeVowelSweep",
      "coachPossibleAnswers", "coachMeterThreshold", "coachMeterReward"],
    gold: ["pickpocket", "haggler", "wideChoice", "treasureHunter", "rainyDay", "doubleDown", "highRoller", "lastStand"],
    brass: ["questPoints", "questRefreshes", "questReroll", "surprise-assignment", "questCadence", "questPersistReward", "questDoublePick"],
    pearl: ["hardMode", "mulliganValueBoost", "monksVow", "leanBuild"]
  };
  const SCHOOL_OF = {};
  Object.entries(SCHOOL_MEMBERS).forEach(([school, ids]) => ids.forEach(id => { SCHOOL_OF[id] = school; }));

  // A few words per level, for the badge page's hexagons.
  const SHORT_LEVELS = {
    extraMulligans: ["+1 mulligan a stage", "+2 mulligans a stage", "+4 mulligans a stage"],
    questRefreshes: ["+1 quest refresh", "+2 quest refreshes", "+4 quest refreshes"],
    questPoints: ["+10 per quest", "+20 per quest", "+40 per quest"],
    mulliganSize: ["Mulligans swap 4", "Mulligans swap 5", "Mulligans swap all"],
    cullOne: ["1 letter culled", "2 letters culled", "4 letters culled"],
    cullTwo: ["2 letters culled", "3 letters culled", "5 letters culled"],
    categorySense: ["1 theme shown", "2 themes shown", "All themes shown"],
    storybookStart: ["+10 a stage", "+20 a stage", "+40 a stage"],
    wideChoice: ["+1 choice to see", "+2 choices to see", "+2 choices, free refresh"],
    handSizeBoost: ["+1 consonant", "+2 consonants", "+4 consonants"],
    mulliganValueBoost: ["+5 per spare mulligan", "+10 per spare mulligan", "+25 per spare mulligan"],
    earlySolveBoost: ["+5 per spare guess", "+10 per spare guess", "+25 per spare guess"],
    colourTrade: ["Greens +0.5", "Greens +1", "Greens +2"],
    greyscale: ["Greys pay 1", "Greys pay 2", "Greys pay 4"],
    "surprise-assignment": ["+1 quest a stage", "+2 quests a stage", "+4 quests a stage"],
    treasureMap: ["+1 special tile", "+2 special tiles", "+4 special tiles"],
    mulliganTiles: ["Mulligan tiles", "Mulligan tiles x2", "Mulligan tiles x4"],
    jokerTiles: ["Joker tiles", "Joker tiles x2", "Joker tiles x4"],
    oracleTiles: ["Oracle tiles", "Oracle tiles x2", "Oracle tiles x4"],
    rainyDay: ["5% interest", "10% interest", "20% interest"],
    vowelBounty: ["+5 per vowel", "+10 per vowel", "+20 per vowel"],
    treasureHunter: ["Treasure +$20", "Treasure +$30", "Treasure +$50, every 2nd"],
    yellowHint: ["1 letter shown", "1 letter placed"],
    "alphabet-compass": ["1 compass tile", "2 compass tiles", "Every tile"],
    coachMeterThreshold: ["Meter 2 sooner", "Meter 4 sooner", "Meter 6 sooner"],
    coachMeterReward: ["Meter tests a letter", "Meter gives a Joker", "Meter places a letter"],
    momentum: ["+4 per better guess", "+8 per better guess", "+15 per better guess"],
    bigOpener: ["+5 per opener colour", "+10 per opener colour", "+20 per opener colour"],
    lastStand: ["+25 last-guess solve", "+45 last-guess solve", "+100 last-guess solve"],
    pickpocket: ["+$1 per yellow", "+$2 per yellow", "+$4 per yellow"],
    gracePeriod: ["1st late guess free", "2 late guesses free", "2 free, then half"],
    ideaTiles: ["1 idea tile", "2 idea tiles", "3 idea tiles"],
    jokerCache: ["1 Joker tile", "2 Joker tiles", "4 Joker tiles"],
    strikeThrough: ["+0.5 per letter ruled out", "+1 per letter ruled out", "+2 per letter ruled out"],
    highRoller: ["Bet 10", "Bet 20", "Bet 50"],
    hardMode: ["+10 hard-mode solve", "+20 hard-mode solve", "+40 hard-mode solve"],
    waveTiles: ["1 wave tile", "2 wave tiles", "4 wave tiles"],
    luckyClover: ["1 lucky tile, +10", "2 lucky tiles, +20 each", "4 lucky tiles, +40 each"],
    questCadence: ["Quests on 2, 3, 5", "Quests on 1, 2, 3, 5"]
  };

  // "Hard-mode solve: +20 points" after "Hard-mode solve: +10 points" ->
  // "+20 points": a later level in the joined description only repeats what
  // changed (cut at a word boundary, and only when enough is shared).
  function changedPart(first, text) {
    let shared = 0;
    while (shared < first.length && shared < text.length && first[shared] === text[shared]) shared += 1;
    const cut = text.lastIndexOf(" ", shared);
    if (cut < 8) return text;
    const colon = text.lastIndexOf(": ", shared);
    const start = colon >= 0 && colon + 2 <= shared ? colon + 2 : cut + 1;
    const rest = text.slice(start);
    // Only a clean cut: what's left starts with the new number.
    return /^[+−\-$\d]/.test(rest) ? rest : text;
  }

  // A stackable power's description lists every level, and says the third
  // is the big one. The type doubles as the old colour category.
  for (const branch of BRANCHES) {
    for (const node of branch.nodes) {
      node.category = node.type;
      node.school = SCHOOL_OF[node.id] || null;
      if (SHORT_LEVELS[node.id]) node.short = SHORT_LEVELS[node.id];
      if (Array.isArray(node.levels) && node.levels.length) {
        // Keyword style: "+1 mulligan per stage · Lv 2: +2 mulligans per stage · ..."
        // Later levels: the badge's short label ("Bet 20") when it has one,
        // else just the part that changed.
        node.description = node.levels.map((text, index) => (index
          ? `Lv ${index + 1}: ${(Array.isArray(node.short) && node.short[index]) || changedPart(node.levels[0], text)}`
          : text)).join(" · ");
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

  // Each school's points: every level of every badge in it, weighted by
  // the badge's rarity (common 1, rare 2, epic 3, legendary 5).
  function schoolPoints(game) {
    const points = {};
    SCHOOL_ORDER.forEach(id => { points[id] = 0; });
    if (!game) return points;
    for (const branch of BRANCHES) {
      for (const node of branch.nodes) {
        if (!node.school) continue;
        const max = Number.isFinite(node.maxLevel) ? node.maxLevel : 3;
        const level = Math.min(max, Math.floor(nodeLevel(game, node)));
        if (level > 0) points[node.school] += level * (TIER_WEIGHT[node.tier] || 1);
      }
    }
    return points;
  }

  // 0 (none yet) to 3.
  function schoolRank(school, points) {
    const ranks = SCHOOLS[school] ? SCHOOLS[school].ranks : [];
    return ranks.filter(need => points >= need).length;
  }

  window.CuddleSkillTree = Object.freeze({
    SCHOOLS,
    SCHOOLLESS,
    SCHOOL_ORDER,
    TIER_WEIGHT,
    schoolPoints,
    schoolRank,
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
