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
    tiles: { label: "Squares", color: "#4fd1c5", blurb: "Special squares on the board." },
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
          levels: ["+1 mulligan every stage. (A mulligan swaps letters in your hand.)", "+2 mulligans every stage.", "+4 mulligans every stage."],
          level: g => ledgerCount(g, "extraMulligans") },
        { id: "questRefreshes", icon: "♻️", title: "Reward Refresh", tier: "common", type: "quests", maxLevel: 3,
          levels: ["When a quest pays out, you can swap its reward choices 1 time for free.", "Swap quest reward choices 2 times for free.", "Swap quest reward choices 4 times for free."],
          level: g => ledgerCount(g, "questRefreshes") },
        { id: "questPoints", icon: "🏅", title: "Quest Value", tier: "common", type: "quests", maxLevel: 3,
          levels: ["Every quest you finish gives +10 points.", "Every quest you finish gives +20 points.", "Every quest you finish gives +40 points."],
          level: g => ledgerCount(g, "questPoints") },
        { id: "questReroll", icon: "🔄", title: "Second Guess Quest", tier: "common", type: "quests", maxLevel: 1,
          description: "Once per stage, swap your quest for a new one for free.", level: g => upgradeCount(g, "questReroll") },
        { id: "mulliganSize", icon: "🃏", title: "Bigger Mulligan", tier: "common", type: "letters", maxLevel: 3,
          levels: ["A mulligan can swap up to 4 letters.", "A mulligan can swap up to 5 letters.", "A mulligan can swap your whole hand."],
          level: g => ledgerCount(g, "mulliganSize") },
        { id: "cullOne", icon: "✂️", title: "Cull One Letter", tier: "common", type: "letters", maxLevel: 3,
          levels: ["1 rare letter is gone for good: out of your deck and out of every answer.", "2 rare letters are gone for good.", "4 rare letters are gone for good."],
          level: g => v5Level(g, "umtCullOne") },
        { id: "cullTwo", icon: "✂️", title: "Cull Two Letters", tier: "epic", type: "letters", maxLevel: 3,
          levels: ["2 rare letters are gone for good: out of your deck and out of every answer.", "3 rare letters are gone for good.", "5 rare letters are gone for good."],
          level: g => v5Level(g, "umtCullTwo") },
        { id: "categorySense", icon: "🔮", title: "Theme Sense", tier: "rare", type: "clues", maxLevel: 3,
          levels: ["Each stage starts by telling you 1 theme of the answer (like \"animals\").", "Each stage starts by telling you 2 themes.", "Each stage starts by telling you every theme."],
          level: g => Number(campaignState(g)?.categorySense) || 0 },
        { id: "storybookStart", icon: "📖", title: "Opening Verse", tier: "rare", type: "points", maxLevel: 3,
          levels: ["+10 points at the start of every stage.", "+20 points at the start of every stage.", "+40 points at the start of every stage."],
          level: g => Number(g?.state?.cuddleBonuses?.storybookStart) || 0 },
        { id: "wideChoice", icon: "🌈", title: "Wide Margins", tier: "common", type: "money", maxLevel: 3,
          levels: ["See 1 more reward card to pick from after each stage.", "See 2 more reward cards to pick from.", "See 2 more reward cards, and your first refresh is free."],
          level: g => Number(g?.state?.cuddleBonuses?.wideChoice) || 0 },
        { id: "handSizeBoost", icon: "✋", title: "Bigger Hand", tier: "rare", type: "letters", maxLevel: 3,
          levels: ["Hold 1 more consonant in your hand.", "Hold 2 more consonants in your hand.", "Hold 4 more consonants in your hand."],
          level: g => Number(g?.state?.balanceRewardCounts?.handSizeBoost) || 0 },
        { id: "mulliganValueBoost", icon: "💱", title: "Mulligan Dividend", tier: "common", type: "points", maxLevel: 3,
          levels: ["When you solve, each mulligan you didn't use gives +5 points.", "Each unused mulligan gives +10 points.", "Each unused mulligan gives +25 points."],
          level: g => Number(g?.state?.balanceRewardCounts?.mulliganValueBoost) || 0 },
        { id: "earlySolveBoost", icon: "🏁", title: "Early Finish", tier: "rare", type: "points", maxLevel: 3,
          levels: ["When you solve, each guess you had left gives +5 points.", "Each guess you had left gives +10 points.", "Each guess you had left gives +25 points."],
          level: g => Number(g?.state?.balanceRewardCounts?.earlySolveBoost) || 0 },
        { id: "colourTrade", icon: "🎨", title: "Colour Surge", tier: "common", type: "points", maxLevel: 3,
          levels: ["Each green tile gives +0.5 points more.", "Each green tile gives +1 point more.", "Each green tile gives +2 points more."],
          level: g => Number(g?.state?.balanceRewardCounts?.colourTrade) || 0 },
        { id: "greyscale", icon: "⬛", title: "Greyscale", tier: "common", type: "points", maxLevel: 3,
          levels: ["Each grey tile (a letter not in the word) gives +1 point.", "Each grey tile gives +2 points.", "Each grey tile gives +4 points."],
          level: g => Number(g?.state?.balanceRewardCounts?.greyscale) || 0 },
        { id: "rewardEcho", icon: "🔁", title: "Reward Echo", tier: "rare", type: "money", maxLevel: 1, description: "The next reward you pick counts twice." },
        { id: "greenCount", icon: "🔢", title: "Precise Green", tier: "rare", type: "clues", maxLevel: 1, description: "A green tile also shows how many times its letter is in the answer.",
          level: g => (g?.state?.megaState?.greenCountUnlocked ? 1 : 0) },
        { id: "surprise-assignment", icon: "📜", title: "Surprise Assignment", tier: "rare", type: "quests", maxLevel: 3,
          levels: ["+1 extra quest pops up in every stage.", "+2 extra quests pop up in every stage.", "+4 extra quests pop up in every stage."],
          level: g => ledgerCount(g, "surprise-assignment") },
        // More special board tiles (cuddle-points-money.js).
        { id: "treasureMap", icon: "🗺️", title: "Treasure Map", tier: "rare", type: "tiles", maxLevel: 3,
          levels: ["+1 special square on the board every stage.", "+2 special squares on the board every stage.", "+4 special squares on the board every stage."],
          level: g => ledgerCount(g, "treasureMap") },
        // Board tiles beyond money and points each need their unlock.
        { id: "mulliganTiles", icon: "🔄", title: "Mulligan Squares", tier: "common", type: "tiles", maxLevel: 3,
          levels: ["Some squares on the board become mulligan squares. Get a green or yellow on one: +1 mulligan.", "Mulligan squares show up 2 times as often.", "Mulligan squares show up 4 times as often."],
          level: g => ledgerCount(g, "mulliganTiles") },
        { id: "jokerTiles", icon: "🃏", title: "Joker Squares", tier: "rare", type: "tiles", maxLevel: 3,
          levels: ["Some squares on the board become Joker squares. Get a green or yellow on one: +1 Joker card.", "Joker squares show up 2 times as often.", "Joker squares show up 4 times as often."],
          level: g => ledgerCount(g, "jokerTiles") },
        { id: "oracleTiles", icon: "🔮", title: "Oracle Squares", tier: "epic", type: "tiles", maxLevel: 3,
          levels: ["Some squares on the board become oracle squares. Get a green or yellow on one: a letter is placed for you.", "Oracle squares show up 2 times as often.", "Oracle squares show up 4 times as often."],
          level: g => ledgerCount(g, "oracleTiles") }
      ]
    },
    {
      id: "economyEngines",
      title: "Economy Engines",
      blurb: "Reward pool that pays out for how you play a round, not just for finishing it.",
      nodes: [
        { id: "rainyDay", icon: "🏦", title: "Rainy Day Fund", tier: "rare", type: "money", maxLevel: 3,
          levels: ["After each stage, you earn 5% of your money as interest (up to +$10).", "You earn 10% interest (up to +$20).", "You earn 20% interest (up to +$40)."],
          level: g => v5Level(g, "umtRainyDay") },
        { id: "encore", icon: "🎬", title: "Encore", tier: "common", type: "points", maxLevel: 1, description: "Every 3rd stage you solve gives +50 points.", level: g => v5Level(g, "umtEncore") },
        { id: "vowelBounty", icon: "🅰️", title: "Vowel Bounty", tier: "rare", type: "points", maxLevel: 3,
          levels: ["When you solve, each vowel in the answer gives +5 points.", "Each vowel in the answer gives +10 points.", "Each vowel in the answer gives +20 points."],
          level: g => v5Level(g, "umtVowelBounty") },
        { id: "haggler", icon: "🪙", title: "Haggler", tier: "common", type: "money", maxLevel: 1, description: "Refreshing reward cards costs less: $0, then $1, then $3 (instead of $3, $5, $7).", level: g => v5Level(g, "umtHaggler") },
        { id: "doubleDown", icon: "🎲", title: "Double Down", tier: "rare", type: "points", maxLevel: 1, description: "Each stage picks a lucky guess (3rd to 7th). Solve on exactly that guess: +50 points.", level: g => v5Level(g, "umtDoubleDown") }
      ]
    },
    {
      id: "insightTools",
      title: "Insight",
      blurb: "Clues about the answer before you guess, and a little luck. Effects in cuddle-clues.js.",
      nodes: [
        { id: "vowelLamp", icon: "🏮", title: "Vowel Lamp", tier: "rare", type: "clues", maxLevel: 1, description: "Every stage tells you how many vowels the answer has.", level: g => v5Level(g, "umtVowelLamp") },
        { id: "echoFinder", icon: "👯", title: "Echo Finder", tier: "common", type: "clues", maxLevel: 1, description: "Every stage tells you if the answer uses a letter twice.", level: g => v5Level(g, "umtEchoFinder") },
        { id: "treasureHunter", icon: "💎", title: "Treasure Hunter", tier: "common", type: "money", maxLevel: 3,
          levels: ["About 1 in 3 stages has a treasure word. Solve it quickly: +$20.", "Treasure words give +$30.", "Treasure words give +$50, and every 2nd stage has one."],
          level: g => v5Level(g, "umtTreasureHunter") },
        { id: "patternLens", icon: "🧩", title: "Pattern Lens", tier: "epic", type: "clues", maxLevel: 1, description: "From your 2nd guess, you see which spots are vowels and which are consonants.", level: g => v5Level(g, "umtPatternLens") },
        { id: "mistakeShield", icon: "🛡️", title: "Mistake Shield", tier: "rare", type: "safety", maxLevel: 1, description: "In bosses and strict stages: if your first guess is all grey, you get that guess back.", level: g => v5Level(g, "umtMistakeShield") },
        { id: "lastLight", icon: "🕯️", title: "Last Light", tier: "legendary", type: "clues", maxLevel: 1, description: "After your 2nd guess, the answer's last letter is filled in for you.", level: g => v5Level(g, "umtLastLight") },
        { id: "yellowHint", icon: "🟨", title: "Yellow Guesser Hint", tier: "epic", type: "clues", maxLevel: 2,
          levels: ["After your 1st guess, one letter of the answer turns yellow (it's in the word).", "Now it turns green instead: you see exactly where it goes."],
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
          levels: ["1 Joker card goes in your deck each stage. A Joker card can be any letter.", "2 Joker cards go in your deck each stage.", "4 Joker cards go in your deck each stage."],
          description: "1 Joker card per level in your deck every stage", level: g => v5Level(g, "umtJokerCache") },
        { id: "jokerCacheLarge", icon: "🃏", title: "Large Joker Cache", tier: "legendary", type: "letters", maxLevel: 1, description: "Every stage starts with a Joker card in your hand (a card that can be any letter). It doesn't count toward your hand limit.", level: g => v5Level(g, "umtJokerCacheLarge") },
        { id: "alphabet-compass", icon: "🧭", title: "Alphabet Compass", tier: "epic", type: "clues", maxLevel: 3,
          levels: ["After each guess, 1 tile shows if the answer's letter there comes earlier or later in the ABCs.", "After each guess, 2 tiles show earlier or later.", "After each guess, every tile shows earlier or later."],
          level: g => (window.CuddleCompass && g?.state ? window.CuddleCompass.copiesOwned(g.state) : 0) },
        { id: "consonantSweep", icon: "🔍", title: "Process of Elimination", tier: "epic", type: "clues", maxLevel: 1, description: "After each guess, 1 more consonant is crossed out (it's not in the answer).", level: g => Math.max(upgradeCount(g, "consonantSweep"), upgradeCount(g, "umtConsonantSweep"),
            Number(g?.state?.cuddleRebalanceV5?.upgrades?.umtConsonantSweep) || 0) }
      ]
    },
    {
      id: "cuddleCoach",
      title: "Cuddle Coach",
      blurb: "The Cuddle Meter and the Secrets Counter.",
      nodes: [
        { id: "coachPossibleAnswers", icon: "🎧", title: "Secrets Counter", tier: "rare", type: "clues", maxLevel: 1, description: "Shows how many answers are still possible.", level: g => (coachState(g)?.possibleAnswersUnlocked ? 1 : 0) },
        { id: "coachMeterThreshold", icon: "🩶", title: "Softer Cuddle Meter", tier: "common", type: "letters", maxLevel: 3,
          levels: ["The Cuddle Meter fills up 2 tiles sooner.", "The Cuddle Meter fills up 4 tiles sooner.", "The Cuddle Meter fills up 6 tiles sooner."],
          level: g => Number(coachState(g)?.cuddleThresholdStacks) || 0 },
        { id: "coachMeterReward", icon: "🫶", title: "Bigger Cuddle", tier: "rare", type: "letters", maxLevel: 3,
          levels: ["When the Cuddle Meter is full, it tests a consonant for you.", "When the Cuddle Meter is full, you get +1 Joker card.", "When the Cuddle Meter is full, a letter is placed in its spot."],
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
          levels: ["A guess with more greens than your last one gives +4 points.", "A guess with more greens than your last one gives +8 points.", "A guess with more greens than your last one gives +15 points."],
          level: g => powerLevel(g, "momentum") },
        { id: "bigOpener", icon: "🎯", title: "Big Opener", tier: "rare", type: "points", maxLevel: 3,
          levels: ["Your 1st guess gives +5 points for each green or yellow.", "Your 1st guess gives +10 points for each green or yellow.", "Your 1st guess gives +20 points for each green or yellow."],
          level: g => powerLevel(g, "bigOpener") },
        { id: "lastStand", icon: "⚔️", title: "Last Stand", tier: "rare", type: "points", maxLevel: 3,
          levels: ["Solve on your last on-time guess: +25 points.", "Solve on your last on-time guess: +45 points.", "Solve on your last on-time guess: +100 points."],
          level: g => powerLevel(g, "lastStand") },
        { id: "pickpocket", icon: "💲", title: "Pickpocket", tier: "common", type: "money", maxLevel: 3,
          levels: ["Each yellow tile gives +$2.", "Each yellow tile gives +$4.", "Each yellow tile gives +$8."],
          level: g => powerLevel(g, "pickpocket") },
        { id: "gracePeriod", icon: "⌛", title: "Grace Period", tier: "rare", type: "safety", maxLevel: 3,
          levels: ["Your 1st late guess doesn't cost any points.", "Your first 2 late guesses don't cost any points.", "Your first 2 late guesses are free, and later ones cost half."],
          level: g => powerLevel(g, "gracePeriod") },
        { id: "boldOpener", icon: "🪄", title: "Bold Opener", tier: "epic", type: "clues", maxLevel: 1,
          description: "Your 1st guess can be any 5 letters, even if it isn't a real word.",
          level: g => powerLevel(g, "boldOpener") },
        { id: "ideaTiles", icon: "💡", title: "Idea Cards", tier: "rare", type: "clues", maxLevel: 3,
          levels: ["1 idea card goes in your deck. Mulligan it away to see one letter of the answer.", "2 idea cards go in your deck.", "3 idea cards go in your deck."],
          level: g => powerLevel(g, "ideaTiles") },
        { id: "waveTiles", icon: "🌊", title: "Wave Cards", tier: "common", type: "letters", maxLevel: 3,
          levels: ["1 wave card goes in your deck. When you draw it, all your consonants are swapped for new ones.", "2 wave cards go in your deck.", "4 wave cards go in your deck."],
          level: g => powerLevel(g, "waveTiles") },
        { id: "fullCircle", icon: "♻️", title: "Full Circle", tier: "epic", type: "clues", maxLevel: 1,
          description: "Once a stage, when your deck runs out and starts over, a letter is placed in its spot.",
          level: g => powerLevel(g, "fullCircle") },
        // Minimalist and Eliminator (cuddle-strategies.js).
        { id: "leanBuild", icon: "🧹", title: "Lean Build", tier: "epic", type: "points", maxLevel: 1,
          description: "Each solve gives +20 points (world 1), +40 points (world 2) or +100 points (world 3), minus 5 points for every other badge you have.",
          level: g => powerLevel(g, "leanBuild") },
        { id: "monksVow", icon: "🕯️", title: "Monk's Vow", tier: "rare", type: "money", maxLevel: 1,
          description: "Skipping a reward gives you both: +40 points and +$15.",
          level: g => powerLevel(g, "monksVow") },
        { id: "strikeThrough", icon: "✂️", title: "Strike-Through", tier: "rare", type: "points", maxLevel: 3,
          levels: ["Each consonant that gets crossed out gives +0.5 points.", "Each crossed-out consonant gives +1 point.", "Each crossed-out consonant gives +2 points."],
          level: g => powerLevel(g, "strikeThrough") },
        { id: "highRoller", icon: "🎲", title: "High Roller", tier: "common", type: "points", maxLevel: 3,
          levels: ["Each stage, you bet 10 points. Solve by guess 5 (guess 4 in worlds 2 and 3) to win +10 points. Later, you lose 10 points.", "Each stage, you bet 20 points.", "Each stage, you bet 50 points."],
          level: g => powerLevel(g, "highRoller") },
        { id: "hardMode", icon: "🎯", title: "Hard Mode", tier: "common", type: "points", maxLevel: 3,
          levels: ["Solve in hard mode: +10 points. (Every guess keeps your greens in place and uses your yellows.)", "Solve in hard mode: +20 points.", "Solve in hard mode: +40 points."],
          level: g => powerLevel(g, "hardMode") },
        { id: "combine", icon: "🧩", title: "Combine", tier: "rare", type: "letters", maxLevel: 1,
          description: "Turns one of your playstyle badges into a random badge one rarity higher.",
          level: () => 0 },
        { id: "luckyClover", icon: "🍀", title: "Lucky Clover", tier: "rare", type: "points", maxLevel: 3,
          levels: ["1 lucky card goes in your deck. Have it in your hand when you solve: +10 points (mulligan it: +5 points).", "2 lucky cards: +20 points each when you solve.", "4 lucky cards: +40 points each when you solve."],
          level: g => powerLevel(g, "luckyClover") },
        // cuddle-fish-hook.js
        { id: "fishHook", icon: "🪝", title: "Fish Hook", tier: "rare", type: "letters", maxLevel: 3,
          levels: ["Once a stage, fish a card you've discarded back into your hand. (If your hand is full, you throw one back.)",
            "The letter you fish is tested: if it's in the answer, it turns yellow.",
            "Also, once a stage, the hook bites on its own: a letter of the answer that you discard is hooked back and turns yellow."],
          description: "Fish a card back from your discard pile, once a stage.",
          level: g => powerLevel(g, "fishHook") }
      ]
    },
    {
      id: "synergyCombos",
      title: "Synergy Combos",
      blurb: "Owning both halves of a pair turns the combo on permanently.",
      nodes: [
        { id: "encoreNight", icon: "🎬", title: "Encore Night", tier: "legendary", type: "combo", maxLevel: 1, description: "Each Encore also gives +10 points for every vowel in that answer.", requires: ["encore", "vowelBounty"], level: g => (v5Level(g, "umtEncore") > 0 && v5Level(g, "umtVowelBounty") > 0) ? 1 : 0 }
      ]
    },
    {
      id: "bossRewards",
      title: "Boss Rewards",
      blurb: "Permanent rewards for clearing a boss round. No ordinary upgrade is offered afterward.",
      nodes: [
        { id: "cullRare", icon: "✂️", title: "Deep Cull", tier: "legendary", type: "letters", maxLevel: 1, description: "5 rare letters are gone for good: out of your deck and out of every answer." },
        { id: "doubleMulligans", icon: "🔁", title: "Double Mulligans", tier: "epic", type: "letters", maxLevel: 1, description: "Every mulligan you get is doubled for the rest of the run.", level: g => upgradeCount(g, "doubleMulligans") },
        { id: "biggerMulligans", icon: "🖐️", title: "Full Hand Mulligan", tier: "epic", type: "letters", maxLevel: 1, description: "A mulligan can swap up to 5 of your letters.", level: g => ledgerCount(g, "biggerMulligans") },
        { id: "freeVowelSweep", icon: "🅰️", title: "Free Vowel Sweep", tier: "legendary", type: "clues", maxLevel: 1, description: "Each stage, 1 vowel is tested for free: you learn if it's in the answer.", level: g => upgradeCount(g, "freeVowelSweep") },
        { id: "revealGreen", icon: "📍", title: "Position Peek", tier: "common", type: "clues", maxLevel: 1, description: "Your next stage starts with 1 letter already in its spot (one time only)." },
        { id: "questDoublePick", icon: "✌️", title: "Double Pick", tier: "legendary", type: "quests", maxLevel: 1, description: "When a quest pays out, pick 2 rewards instead of 1.", level: g => upgradeCount(g, "questDoublePick") },
        { id: "questCadence", icon: "❗", title: "Quest Cadence", tier: "epic", type: "quests", maxLevel: 2,
          levels: ["You also get a quest on guess 3 (quests on guesses 2, 3 and 5).", "You also get a quest on guess 1 (quests on guesses 1, 2, 3 and 5)."],
          level: g => upgradeCount(g, "questCadence") },
        { id: "questPersistReward", icon: "⏳", title: "Lasting Quests", tier: "legendary", type: "quests", maxLevel: 1, description: "If you miss a quest, it stays open for the rest of the stage.", level: g => (g?.state?.megaState?.questPersistsForRound ? 1 : 0) },
        { id: "allThemesBoss", icon: "🔮", title: "All-Seeing Atlas", tier: "legendary", type: "clues", maxLevel: 1, description: "Every stage starts by showing all of the answer's themes.", level: g => (bossRewardOwned(g, "umtAllThemes") ? 1 : 0) },
        { id: "secondCup", icon: "☕", title: "Second Cup", tier: "epic", type: "safety", maxLevel: 1, description: "Once per run: +1 extra guess when a boss or strict stage would end.", level: g => (bossRewardOwned(g, "secondCup") ? 1 : 0) }
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
      ranks: [4, 9, 15], perks: ["Solve by guess 3: +10 points", "Solve by guess 3: +1 mulligan next stage", "Solve by guess 3: your next stage starts with 1 letter placed"] },
    prism: { label: "Hints", color: "#58a8ff", blurb: "Learn about the answer before you guess it.",
      ranks: [4, 9, 15], perks: ["Each stage starts with 1 vowel crossed out", "After your 2nd guess, 1 letter turns yellow", "Once per stage, tap a consonant in your hand to test it"] },
    flora: { label: "Cards", color: "#46cf86", blurb: "Special cards in your hand and deck (lucky, idea, wave, Joker), special squares on the board, and mulligans.",
      ranks: [4, 9, 15], perks: ["+1 lucky card every stage", "+1 idea card and +1 mulligan every stage", "Your first mulligan each stage is free, and each stage starts with a Joker card"] },
    parchment: { label: "Elimination", color: "#c9ae84", blurb: "Rule letters out and cull them.",
      ranks: [4, 9, 15], perks: ["Each grey tile gives +1 point", "Each stage starts with 1 consonant crossed out", "After each guess, crossed-out consonants in your hand are swapped for new cards"] },
    gold: { label: "Money", color: "#f5cf3a", blurb: "Earn, save and gamble money.",
      ranks: [4, 9, 15], perks: ["Each solve gives +$3", "Everything in the shop costs 20% less", "After each solve, earn 10% interest on your money (up to +$15)"] },
    brass: { label: "Quests", color: "#ef8a34", blurb: "More quests and bigger quest rewards.",
      ranks: [4, 9, 15], perks: ["Each quest you finish gives +10 points", "Quest reward screens show 1 more choice", "Each quest you finish gives +1 mulligan; finish 2 in a stage for +1 Joker card"] },
    pearl: { label: "Restraint", color: "#e7a2ee", blurb: "Fewer badges and harder play, for bigger rewards.",
      ranks: [3, 6, 9], perks: ["Skipping a reward gives +10 points more", "Solve without using a mulligan: +15 points", "After you skip a reward, the next reward screen is all Epic cards"] }
  });
  // Badges that belong to no school.
  const SCHOOLLESS = Object.freeze({ label: "General", color: "#9d97b0", blurb: "General tools that belong to no school." });
  const SCHOOL_ORDER = Object.freeze(Object.keys(SCHOOLS));
  const SCHOOL_MEMBERS = {
    flint: ["storybookStart", "earlySolveBoost", "bigOpener", "momentum", "colourTrade", "boldOpener"],
    prism: ["categorySense", "greenCount", "vowelLamp", "echoFinder", "patternLens", "yellowHint", "alphabet-compass",
      "oracleTiles", "lastLight", "allThemesBoss", "revealGreen"],
    flora: ["luckyClover", "fishHook", "ideaTiles", "waveTiles", "fullCircle", "jokerCache", "jokerCacheLarge", "jokerTiles", "mulliganTiles",
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
    treasureMap: ["+1 special square", "+2 special squares", "+4 special squares"],
    mulliganTiles: ["Mulligan squares", "Mulligan squares x2", "Mulligan squares x4"],
    jokerTiles: ["Joker squares", "Joker squares x2", "Joker squares x4"],
    oracleTiles: ["Oracle squares", "Oracle squares x2", "Oracle squares x4"],
    rainyDay: ["5% interest", "10% interest", "20% interest"],
    vowelBounty: ["+5 per vowel", "+10 per vowel", "+20 per vowel"],
    treasureHunter: ["Treasure +$20", "Treasure +$30", "Treasure +$50, every 2nd"],
    yellowHint: ["1 letter shown", "1 letter placed"],
    "alphabet-compass": ["1 compass tile", "2 compass tiles", "Every tile"],
    coachMeterThreshold: ["Meter 2 sooner", "Meter 4 sooner", "Meter 6 sooner"],
    coachMeterReward: ["Meter tests a letter", "Meter gives a Joker card", "Meter places a letter"],
    momentum: ["+4 per better guess", "+8 per better guess", "+15 per better guess"],
    bigOpener: ["+5 per opener colour", "+10 per opener colour", "+20 per opener colour"],
    lastStand: ["+25 last-guess solve", "+45 last-guess solve", "+100 last-guess solve"],
    pickpocket: ["+$2 per yellow", "+$4 per yellow", "+$8 per yellow"],
    gracePeriod: ["1st late guess free", "2 late guesses free", "2 free, then half"],
    ideaTiles: ["1 idea card", "2 idea cards", "3 idea cards"],
    jokerCache: ["1 Joker card", "2 Joker cards", "4 Joker cards"],
    strikeThrough: ["+0.5 per letter ruled out", "+1 per letter ruled out", "+2 per letter ruled out"],
    highRoller: ["Bet 10", "Bet 20", "Bet 50"],
    hardMode: ["+10 hard-mode solve", "+20 hard-mode solve", "+40 hard-mode solve"],
    waveTiles: ["1 wave card", "2 wave cards", "4 wave cards"],
    luckyClover: ["1 lucky card, +10", "2 lucky cards, +20 each", "4 lucky cards, +40 each"],
    fishHook: ["Fish 1 discard a stage", "Fished letter tested", "Auto-hooks a right letter"],
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
  const ALIASES = { "idea tiles": "ideaTiles", "wave tiles": "waveTiles", "mulligan tiles": "mulliganTiles",
    "joker tiles": "jokerTiles", "oracle tiles": "oracleTiles", "full alphabet compass": "alphabet-compass", "clear sight": "yellowHint", "color surge": "colourTrade", "grayscale": "greyscale" };
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

  // What picking a reward gives, in its plain words: the text of the level
  // the pick brings you to (offset 1 for an offer you don't hold yet, 0
  // for one you just took). "" for a reward the registry doesn't know.
  function pickText(game, idOrName, offset = 1) {
    const node = resolve(idOrName);
    if (!node) return "";
    if (Array.isArray(node.levels) && node.levels.length) {
      return levelText(node, Math.max(1, nodeLevel(game, node) + offset));
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
    pickText,
    sortByType,
    canonicalId
  });
})();
