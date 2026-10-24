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
          levels: ["+2 mulligans every stage. (A mulligan swaps letters in your hand.)", "+3 mulligans every stage.", "+4 mulligans every stage."],
          level: g => ledgerCount(g, "extraMulligans") },
        { id: "questRefreshes", icon: "♻️", title: "Reward Refresh", tier: "common", type: "quests", maxLevel: 3,
          levels: ["When a quest pays out, you can swap its reward choices 1 time for free.", "Swap quest reward choices 2 times for free.", "Swap quest reward choices 3 times for free."],
          level: g => ledgerCount(g, "questRefreshes") },
        { id: "questPoints", icon: "🏅", title: "Quest Value", tier: "common", type: "quests", maxLevel: 3,
          levels: ["Every quest you finish gives +10 points.", "Every quest you finish gives +20 points.", "Every quest you finish gives +30 points."],
          level: g => ledgerCount(g, "questPoints") },
        { id: "questReroll", icon: "🔄", title: "Second Guess Quest", tier: "common", type: "quests", maxLevel: 1,
          description: "Once per stage, swap your quest for a new one for free.", level: g => upgradeCount(g, "questReroll") },
        { id: "mulliganSize", icon: "🃏", title: "Bigger Mulligan", tier: "common", type: "letters", maxLevel: 3,
          levels: ["A mulligan can swap up to 4 letters.", "A mulligan can swap up to 5 letters.", "A mulligan can swap your whole hand."],
          level: g => ledgerCount(g, "mulliganSize") },
        // Cull Letters (umtCullTwo) was a copy of this badge; the two are one
        // now, and a save that holds Cull Letters counts it here.
        { id: "cullOne", icon: "✂️", title: "Pruning Shears", tier: "rare", type: "letters", maxLevel: 3,
          levels: ["1 rare letter is gone for good: out of your deck and out of every answer.", "2 rare letters are gone for good.", "4 rare letters are gone for good."],
          level: g => Math.min(3, v5Level(g, "umtCullOne") + v5Level(g, "umtCullTwo")) },
        { id: "categorySense", icon: "🔮", title: "Theme Sense", tier: "rare", type: "clues", maxLevel: 3,
          levels: ["Each stage starts by telling you 1 theme of the answer (like \"animals\").", "Each stage starts by telling you 2 themes.", "Each stage starts by telling you every theme."],
          level: g => Number(campaignState(g)?.categorySense) || 0 },
        { id: "storybookStart", icon: "📖", title: "Opening Verse", tier: "rare", type: "points", maxLevel: 3,
          levels: ["+10 points at the start of every stage.", "+16 points at the start of every stage.", "+30 points at the start of every stage."],
          level: g => Number(g?.state?.cuddleBonuses?.storybookStart) || 0 },
        { id: "wideChoice", icon: "🌈", title: "Wide Margins", tier: "common", type: "money", maxLevel: 3,
          levels: ["See 1 more reward card to pick from after each stage.", "See 2 more reward cards to pick from.", "See 2 more reward cards, and your first refresh is free."],
          level: g => Number(g?.state?.cuddleBonuses?.wideChoice) || 0 },
        { id: "handSizeBoost", icon: "✋", title: "Bigger Hand", tier: "epic", type: "letters", maxLevel: 3,
          levels: ["Hold 1 more consonant in your hand.", "Hold 2 more consonants in your hand.", "Hold 3 more consonants in your hand."],
          level: g => Number(g?.state?.balanceRewardCounts?.handSizeBoost) || 0 },
        { id: "mulliganValueBoost", icon: "💱", title: "Mulligan Dividend", tier: "common", type: "points", maxLevel: 3,
          levels: ["When you solve, each mulligan you didn't use gives 1 more point: 2 instead of 1.", "Each unused mulligan gives 2 more points: 3 in all.", "Each unused mulligan gives 3 more points: 4 in all."],
          level: g => Number(g?.state?.balanceRewardCounts?.mulliganValueBoost) || 0 },
        { id: "earlySolveBoost", icon: "🏁", title: "Early Finish", tier: "rare", type: "points", maxLevel: 3,
          levels: ["When you solve, each guess you had left gives +5 points.", "Each guess you had left gives +10 points.", "Each guess you had left gives +20 points."],
          level: g => Number(g?.state?.balanceRewardCounts?.earlySolveBoost) || 0 },
        { id: "colourTrade", icon: "🎨", title: "Colour Surge", tier: "common", type: "points", maxLevel: 3,
          levels: ["Each green tile gives +0.75 points more.", "Each green tile gives +1.5 points more.", "Each green tile gives +2.25 points more."],
          level: g => Number(g?.state?.balanceRewardCounts?.colourTrade) || 0 },
        { id: "greyscale", icon: "⬛", title: "Greyscale", tier: "common", type: "points", maxLevel: 3,
          levels: ["Each grey tile (a letter not in the word) gives +0.75 points.", "Each grey tile gives +1.5 points.", "Each grey tile gives +2.25 points."],
          level: g => Number(g?.state?.balanceRewardCounts?.greyscale) || 0 },
        { id: "rewardEcho", icon: "🔁", title: "Reward Echo", tier: "rare", type: "money", maxLevel: 1, description: "The next reward you pick counts twice.", level: g => ledgerCount(g, "rewardEcho") },
        { id: "greenCount", icon: "🔢", title: "Precise Green", tier: "rare", type: "clues", maxLevel: 1, description: "A green tile also shows how many times its letter is in the answer.",
          level: g => Math.max(Number(g?.state?.megaState?.greenCountLevel) || 0, g?.state?.megaState?.greenCountUnlocked ? 1 : 0) },
        { id: "surprise-assignment", icon: "📜", title: "Surprise Assignment", tier: "rare", type: "quests", maxLevel: 3,
          levels: ["+1 extra quest pops up in every stage.", "+2 extra quests pop up in every stage.", "+4 extra quests pop up in every stage."],
          level: g => ledgerCount(g, "surprise-assignment") },
        // More special board tiles (cuddle-points-money.js).
        { id: "treasureMap", icon: "🗺️", title: "Treasure Map", tier: "rare", type: "tiles", maxLevel: 3,
          levels: ["+1 special square on the board every stage.", "+2 special squares on the board every stage.", "+4 special squares on the board every stage."],
          level: g => ledgerCount(g, "treasureMap") },
        // Every kind of board square needs its unlock.
        { id: "bonusSquares", icon: "💰", title: "Bonus Squares", tier: "common", type: "tiles", maxLevel: 3,
          levels: ["Money and points squares appear on the board. Get a green or yellow on one: money or points.", "1 more square every stage.", "2 more squares every stage."],
          level: g => ledgerCount(g, "bonusSquares") },
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
          levels: ["After each stage, you earn 5% of your money as interest (up to +$10).", "You earn 8% interest (up to +$16).", "You earn 15% interest (up to +$30)."],
          level: g => v5Level(g, "umtRainyDay") },
        { id: "encore", icon: "🎬", title: "Encore", tier: "common", type: "points", maxLevel: 1, description: "Every 3rd stage you solve gives +30 points.", level: g => v5Level(g, "umtEncore") },
        { id: "vowelBounty", icon: "🅰️", title: "Vowel Bounty", tier: "rare", type: "points", maxLevel: 3,
          levels: ["When you solve, each vowel in the answer gives +4 points.", "Each vowel in the answer gives +6 points.", "Each vowel in the answer gives +10 points."],
          level: g => v5Level(g, "umtVowelBounty") },
        { id: "haggler", icon: "🪙", title: "Haggler", tier: "rare", type: "money", maxLevel: 1, description: "Refreshing reward cards costs less: $0, then $1, then $3 (instead of $3, $5, $7).", level: g => v5Level(g, "umtHaggler") },
        { id: "doubleDown", icon: "🎲", title: "Double Down", tier: "rare", type: "points", maxLevel: 1, description: "Each stage picks a lucky guess (3rd to 7th). Solve on exactly that guess: +50 points.", level: g => v5Level(g, "umtDoubleDown") }
      ]
    },
    {
      id: "insightTools",
      title: "Insight",
      blurb: "Clues about the answer before you guess, and a little luck. Effects in cuddle-clues.js.",
      nodes: [
        { id: "vowelLamp", icon: "🏮", title: "Vowel Lamp", tier: "rare", type: "clues", maxLevel: 1, description: "Every stage tells you how many vowels the answer has.", level: g => v5Level(g, "umtVowelLamp") },
        { id: "echoFinder", icon: "👯", title: "Echo Finder", tier: "rare", type: "clues", maxLevel: 1, description: "Every stage tells you if the answer uses a letter twice.", level: g => v5Level(g, "umtEchoFinder") },
        { id: "treasureHunter", icon: "💎", title: "Treasure Hunter", tier: "common", type: "money", maxLevel: 3,
          levels: ["About 1 in 3 stages has a treasure word. Solve it quickly: +$30.", "Treasure words give +$40.", "Treasure words give +$60, and every 2nd stage has one."],
          level: g => v5Level(g, "umtTreasureHunter") },
        { id: "patternLens", icon: "🧩", title: "Pattern Lens", tier: "epic", type: "clues", maxLevel: 1, description: "From your 2nd guess, you see which spots are vowels and which are consonants.", level: g => v5Level(g, "umtPatternLens") },
        { id: "mistakeShield", icon: "🛡️", title: "Mistake Shield", tier: "rare", type: "safety", maxLevel: 1, description: "In bosses and strict stages: if your first guess is all grey, you get that guess back.", level: g => v5Level(g, "umtMistakeShield") },
        { id: "lastLight", icon: "🕯️", title: "Last Light", tier: "legendary", type: "clues", maxLevel: 1, description: "After your 2nd guess, the answer's last letter is filled in for you.", level: g => v5Level(g, "umtLastLight") },
        { id: "autopilot", icon: "🤖", title: "Autopilot", tier: "legendary", type: "clues", maxLevel: 1,
          description: "Every 2nd guess (the 2nd, 4th, 6th...) is played for you by the AI: the best word your cards can make right now, using everything the board and your hints show.",
          level: g => powerLevel(g, "autopilot") },
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
          levels: ["2 Joker cards go in your deck each stage. A Joker card can be any letter.", "3 Joker cards go in your deck each stage.", "5 Joker cards go in your deck each stage."],
          description: "1 Joker card per level in your deck every stage", level: g => v5Level(g, "umtJokerCache") },
        { id: "jokerLens", icon: "🔎", title: "Joker Lens", tier: "rare", type: "letters", maxLevel: 2,
          levels: ["A Joker in a finished word shows the letter it will become.",
            "When more than one letter works, the Joker slowly cycles through them: submit while the one you want is showing."],
          level: g => powerLevel(g, "jokerLens") },
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
        { id: "coachPossibleAnswers", icon: "🎧", title: "Secrets Counter", tier: "rare", type: "clues", maxLevel: 1, description: "Shows how many answers are still possible.", level: g => Math.max(Number(coachState(g)?.possibleAnswersLevel) || 0, coachState(g)?.possibleAnswersUnlocked ? 1 : 0) },
        { id: "coachMeterThreshold", icon: "🩶", title: "Softer Cuddle Meter", tier: "common", type: "letters", maxLevel: 3,
          levels: ["The Cuddle Meter fills up 2 tiles sooner.", "The Cuddle Meter fills up 4 tiles sooner.", "The Cuddle Meter fills up 6 tiles sooner."],
          level: g => Number(coachState(g)?.cuddleThresholdStacks) || 0 },
        { id: "coachMeterReward", icon: "🫶", title: "Bigger Cuddle", tier: "rare", type: "letters", maxLevel: 3,
          levels: ["When the Cuddle Meter is full, it also tests a consonant for you (on top of its free mulligan).", "A full Cuddle Meter also gives +1 Joker card.", "Once a stage, a full Cuddle Meter also gives a yellow hint: a letter of the answer turns yellow."],
          // The last level is a bigger step: offered as an Epic card.
          levelTiers: { 3: "epic" },
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
          levels: ["A guess with more greens than your last one gives +3 points.", "A guess with more greens than your last one gives +5 points.", "A guess with more greens than your last one gives +9 points."],
          level: g => powerLevel(g, "momentum") },
        { id: "bigOpener", icon: "🎯", title: "Big Opener", tier: "rare", type: "points", maxLevel: 3,
          levels: ["Your 1st guess gives +5 points for each green or yellow.", "Your 1st guess gives +8 points for each green or yellow.", "Your 1st guess gives +15 points for each green or yellow."],
          level: g => powerLevel(g, "bigOpener") },
        { id: "lastStand", icon: "⚔️", title: "Last Stand", tier: "rare", type: "points", maxLevel: 3,
          levels: ["Solve on your last on-time guess: +25 points.", "Solve on your last on-time guess: +40 points.", "Solve on your last on-time guess: +75 points."],
          level: g => powerLevel(g, "lastStand") },
        { id: "pickpocket", icon: "💲", title: "Pickpocket", tier: "common", type: "money", maxLevel: 3,
          levels: ["Each yellow tile gives +$2.", "Each yellow tile gives +$3.", "Each yellow tile gives +$6."],
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
          levels: ["1 wave card goes in your deck. When you draw it, all your consonants are swapped for new ones and you get a mulligan. Dead cards wash away too, and idea cards give their yellow hint.", "2 wave cards go in your deck.", "4 wave cards go in your deck."],
          level: g => powerLevel(g, "waveTiles") },
        { id: "fullCircle", icon: "♻️", title: "Full Circle", tier: "epic", type: "clues", maxLevel: 1,
          description: "Once a stage, when your deck runs out and starts over, a letter is placed in its spot.",
          level: g => powerLevel(g, "fullCircle") },
        // Minimalist and Eliminator (cuddle-strategies.js).
        { id: "leanBuild", icon: "🧹", title: "Lean Build", tier: "epic", type: "points", maxLevel: 1,
          description: "Each solve gives +20 points (world 1), +40 points (world 2) or +100 points (world 3), minus 5 points for every badge you have outside Restraint (Legendaries don't count).",
          level: g => powerLevel(g, "leanBuild") },
        { id: "monksVow", icon: "🕯️", title: "Monk's Vow", tier: "rare", type: "money", maxLevel: 1,
          description: "Skipping a reward gives you both: +40 points and +$15.",
          level: g => powerLevel(g, "monksVow") },
        { id: "strikeThrough", icon: "✂️", title: "Strike-Through", tier: "rare", type: "points", maxLevel: 3,
          levels: ["Each consonant that gets crossed out gives +1 point.", "Each crossed-out consonant gives +2 points.", "Each crossed-out consonant gives +3 points."],
          level: g => powerLevel(g, "strikeThrough") },
        { id: "highRoller", icon: "🎲", title: "High Roller", tier: "common", type: "points", maxLevel: 3,
          levels: ["Each stage, you bet 10 points. Solve by guess 5 (guess 4 in worlds 2 and 3) to win +20 points. Later, you lose 10 points.", "Each stage, you bet 20 points: win +40.", "Each stage, you bet 40 points: win +80."],
          level: g => powerLevel(g, "highRoller") },
        { id: "hardMode", icon: "🎯", title: "Hard Mode", tier: "common", type: "points", maxLevel: 3,
          levels: ["Solve in hard mode: +35 points. (Every guess keeps your greens in place and uses your yellows.)", "Solve in hard mode: +60 points.", "Solve in hard mode: +100 points."],
          level: g => powerLevel(g, "hardMode") },
        { id: "combine", icon: "🧩", title: "Combine", tier: "rare", type: "letters", maxLevel: 1,
          description: "Turns one of your playstyle badges into a random badge one rarity higher.",
          level: () => 0 },
        { id: "luckyClover", icon: "🍀", title: "Lucky Clover", tier: "rare", type: "points", maxLevel: 3,
          levels: ["1 lucky card goes in your deck. Have it in your hand when you solve: +10 points (mulligan it: +2 points).", "2 lucky cards: +14 points each when you solve.", "4 lucky cards: +20 points each when you solve."],
          level: g => powerLevel(g, "luckyClover") },
        // cuddle-fish-hook.js
        { id: "fishHook", icon: "🪝", title: "Fish Hook", tier: "rare", type: "letters", maxLevel: 3,
          levels: ["Once a stage, fish a card you've discarded back into your hand. (If your hand is full, you throw one back.)",
            "The letter you fish is tested: if it's in the answer, it turns yellow.",
            "Also, once a stage, the hook bites on its own: a letter of the answer that you discard is hooked back and turns yellow."],
          description: "Fish a card back from your discard pile, once a stage.",
          level: g => powerLevel(g, "fishHook") },
        // cuddle-new-badges.js
        { id: "cleanSlate", icon: "🧼", title: "Clean Slate", tier: "legendary", type: "letters", maxLevel: 1,
          description: "Skipping a reward also levels up one of your badges at random.",
          level: g => powerLevel(g, "cleanSlate") },
        { id: "ascetic", icon: "🧘", title: "Ascetic", tier: "legendary", type: "points", maxLevel: 1,
          description: "Every stage you solve pays 1.6 times its points while you have 5 badges or fewer outside Restraint, or 1.3 times with 10 or fewer (Legendaries don't count).",
          level: g => powerLevel(g, "ascetic") },
        { id: "questMastery", icon: "📜", title: "Quest Mastery", tier: "legendary", type: "quests", maxLevel: 1,
          description: "Every quest reward is one step bigger: 2 mulligans instead of 1, 3 vowels checked instead of 2, 3 letters ruled out instead of 2, and so on.",
          level: g => powerLevel(g, "questMastery") },
        { id: "overtime", icon: "⏱️", title: "Overtime", tier: "epic", type: "quests", maxLevel: 1,
          description: "Adds the quest reward One More Guess, always on offer: pick it for 1 more guess this stage (a boss fight is a guess longer; on other stages the late-guess cost starts a guess later).",
          level: g => powerLevel(g, "overtime") },
        { id: "questClue", icon: "🔍", title: "Quest Clue", tier: "epic", type: "quests", maxLevel: 2,
          levels: ["Adds Clue to your quest rewards, always on offer: pick it for a yellow hint (a letter in the answer).", "Clue gives a green hint instead: a letter in its exact spot."],
          level: g => powerLevel(g, "questClue") },
        { id: "questChain", icon: "⛓️", title: "Quest Chain", tier: "legendary", type: "quests", maxLevel: 1,
          description: "Each quest you finish puts a new quest (a random one) on your next guess, if it doesn't already have one. Finish that one too and the chain goes on.",
          level: g => powerLevel(g, "questChain") },
        { id: "questSatchel", icon: "🎒", title: "Quest Satchel", tier: "rare", type: "quests", maxLevel: 3,
          levels: ["When a quest comes up, you hold 1 more letter for that guess. Unplayed, it stays in your hand.",
            "When a quest comes up, you get a Joker card instead (a card that can be any letter).",
            "When a quest comes up, you get a Joker and hold 1 more letter."],
          level: g => powerLevel(g, "questSatchel") },
        { id: "questScout", icon: "🔭", title: "Quest Scout", tier: "rare", type: "quests", maxLevel: 2,
          levels: ["When a quest appears, a word from your hand that fulfills it is found (but not shown): 1 of its letters is placed in its spot in your word.",
            "2 of the quest word's letters are placed."],
          level: g => powerLevel(g, "questScout") },
        { id: "blackMarket", icon: "🛒", title: "Black Market", tier: "legendary", type: "money", maxLevel: 1,
          description: "On every reward screen, you can pay $50 for a random badge (on top of your pick).",
          level: g => powerLevel(g, "blackMarket") },
        { id: "treasureChest", icon: "🧰", title: "Treasure Chest", tier: "legendary", type: "money", maxLevel: 1,
          description: "Opens a free Large Pack right away. It has no other power, but it counts toward the Money school.",
          level: g => powerLevel(g, "treasureChest") },
        { id: "insertCoin", icon: "🪙", title: "Insert Coin", tier: "epic", type: "money", maxLevel: 2,
          levels: ["When you run out of guesses in a boss or strict stage, you can pay $100 for 1 more guess.", "An extra guess costs $75."],
          level: g => powerLevel(g, "insertCoin") },
        { id: "goldenLedger", icon: "📒", title: "Golden Ledger", tier: "epic", type: "money", maxLevel: 2,
          levels: ["Your money counts toward the points a boss needs before you can challenge it: every $1 counts as 0.5 points. (It isn't spent.)", "Every $1 counts as 1 point."],
          level: g => powerLevel(g, "goldenLedger") },
        { id: "fastLane", icon: "🏁", title: "Fast Lane", tier: "epic", type: "safety", maxLevel: 3,
          levels: ["Bosses, challenges and curses start a guess later: your 1st guess is clear, and their tricky guesses all still come, just one guess later.",
            "They start 2 guesses later.", "They start 3 guesses later."],
          level: g => powerLevel(g, "fastLane") },
        { id: "goldenOpener", icon: "🌟", title: "Golden Opener", tier: "legendary", type: "clues", maxLevel: 1,
          description: "Every yellow letter in your first guess moves to its spot and turns green (level 2: first 2 guesses; level 3: first 3).",
          level: g => powerLevel(g, "goldenOpener") }
      ]
    },
    {
      id: "bossRewards",
      title: "Boss Rewards",
      blurb: "Permanent rewards for clearing a boss round. No ordinary upgrade is offered afterward.",
      nodes: [
        { id: "cullRare", icon: "✂️", title: "Deep Cull", tier: "legendary", type: "letters", maxLevel: 1, description: "3 rare letters are gone for good: out of your deck and out of every answer.",
          level: g => Math.max(Number(g?.state?.megaState?.deepCulls) || 0, ledgerCount(g, "cullRare"), ledgerCount(g, "legendary:cullRare")) },
        { id: "doubleMulligans", icon: "🔁", title: "Double Mulligans", tier: "epic", type: "letters", maxLevel: 1, description: "Every mulligan you get is doubled for the rest of the run.", level: g => upgradeCount(g, "doubleMulligans") },
        { id: "biggerMulligans", icon: "🖐️", title: "Full Hand Mulligan", tier: "epic", type: "letters", maxLevel: 1, description: "A mulligan can swap up to 5 of your letters.", level: g => ledgerCount(g, "biggerMulligans") },
        { id: "freeVowelSweep", icon: "🅰️", title: "Free Vowel Sweep", tier: "legendary", type: "clues", maxLevel: 1, description: "Each stage, 2 vowels are tested for free: you learn if they're in the answer.", level: g => upgradeCount(g, "freeVowelSweep") },
        { id: "revealGreen", icon: "📍", title: "Position Peek", tier: "common", type: "clues", maxLevel: 1, description: "Your next stage starts with 1 letter already in its spot (one time only)." },
        { id: "questDoublePick", icon: "✌️", title: "Double Pick", tier: "legendary", type: "quests", maxLevel: 1, description: "When a quest pays out, pick 2 rewards instead of 1.", level: g => upgradeCount(g, "questDoublePick") },
        { id: "questCadence", icon: "❗", title: "Quest Cadence", tier: "epic", type: "quests", maxLevel: 2,
          levels: ["You also get a quest on guess 3 (quests on guesses 2, 3 and 5).", "You also get a quest on guess 1 (quests on guesses 1, 2, 3 and 5)."],
          level: g => upgradeCount(g, "questCadence") },
        { id: "questPersistReward", icon: "⏳", title: "Lasting Quests", tier: "epic", type: "quests", maxLevel: 1, description: "A quest you don't finish stays open for the rest of the stage, beside the next quest: up to two at once (tap 1 or 2 to see each).", level: g => (g?.state?.megaState?.questPersistsForRound ? 1 : 0) },
        { id: "allThemesBoss", icon: "🔮", title: "All-Seeing Atlas", tier: "legendary", type: "clues", maxLevel: 1, description: "Every stage starts by showing all of the answer's themes.", level: g => (bossRewardOwned(g, "umtAllThemes") ? 1 : 0) },
        { id: "secondCup", icon: "☕", title: "Second Cup", tier: "epic", type: "safety", maxLevel: 1, description: "Once per run: +1 extra guess when a boss or strict stage would end.", level: g => (bossRewardOwned(g, "secondCup") ? Math.max(1, Number(coachState(g)?.secondCupLevel) || 0) : 0) }
      ]
    }
  ]);

  // Schools. Every badge belongs to one school (or none); the ids are
  // older names (flint = Speed, prism = Hints, flora = Cards, tile =
  // Squares, parchment = Elimination, gold = Money, brass = Quests, pearl =
  // Restraint); a school's mark on its crest is its label's first letter
  // unless it has its own (Squares and Speed would both be S);
  // each level of a badge adds its rarity's weight to its school, and a
  // school's points unlock its ranks. The perks themselves live in
  // cuddle-schools.js.
  const TIER_WEIGHT = Object.freeze({ common: 1, rare: 2, epic: 3, legendary: 5 });
  // Each school has its own colour, so badges read as sorted by colour.
  const SCHOOLS = Object.freeze({
    flint: { label: "Speed", color: "#ff5f4f", blurb: "Strong openers and quick solves.",
      ranks: [4, 9, 15], perks: ["Solve by guess 3: +10 points", "Solve by guess 3: +1 mulligan next stage", "Solve by guess 3: your next stage starts with 1 letter placed"] },
    prism: { label: "Hints", color: "#58a8ff", blurb: "Learn about the answer before you guess it.",
      ranks: [4, 9, 15], perks: ["One tile of your first guess shows an arrow (earlier or later in the alphabet)", "After your 2nd guess, 1 letter turns yellow", "Once per stage, drag a consonant to the Test pad to learn if it's in the answer"] },
    flora: { label: "Cards", color: "#46cf86", blurb: "Special cards in your hand and deck (lucky, idea, wave, Joker) and mulligans.",
      ranks: [4, 9, 15], perks: ["+1 lucky card every stage", "+1 idea card and +1 mulligan every stage", "+2 dead cards every stage, and dead cards turn angel when drawn: tap an angel to send it to heaven for +10 points and a new card"] },
    tile: { label: "Squares", mark: "▦", color: "#9b7bff", blurb: "Special squares on the board, and more from each one.",
      ranks: [4, 9, 15], perks: ["A yellow on a square pays the same as a green", "A yellow or green also sets off the squares to its left and right", "2 devil squares every stage: put a letter that's not in the answer on one, and every consonant left in your hand is tested; the ones not in the answer are thrown out"] },
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
    flint: ["storybookStart", "earlySolveBoost", "bigOpener", "momentum", "colourTrade", "boldOpener", "encore", "vowelBounty", "fastLane", "goldenOpener"],
    prism: ["categorySense", "greenCount", "vowelLamp", "echoFinder", "patternLens", "yellowHint", "alphabet-compass",
      "lastLight", "allThemesBoss", "revealGreen", "autopilot"],
    flora: ["luckyClover", "fishHook", "ideaTiles", "waveTiles", "fullCircle", "jokerCache", "jokerCacheLarge", "jokerLens",
      "extraMulligans", "mulliganSize", "handSizeBoost", "doubleMulligans", "biggerMulligans"],
    tile: ["treasureMap", "bonusSquares", "mulliganTiles", "jokerTiles", "oracleTiles"],
    parchment: ["greyscale", "strikeThrough", "cullOne", "cullRare", "consonantSweep", "freeVowelSweep",
      "coachPossibleAnswers", "coachMeterThreshold", "coachMeterReward"],
    gold: ["pickpocket", "haggler", "wideChoice", "treasureHunter", "rainyDay", "doubleDown", "highRoller", "lastStand",
      "blackMarket", "treasureChest", "insertCoin", "goldenLedger"],
    brass: ["questPoints", "questRefreshes", "questReroll", "surprise-assignment", "questCadence", "questPersistReward", "questDoublePick",
      "questMastery", "overtime", "questChain", "questScout", "questClue", "questSatchel"],
    pearl: ["hardMode", "mulliganValueBoost", "monksVow", "leanBuild", "gracePeriod", "mistakeShield", "cleanSlate", "ascetic"]
  };
  const SCHOOL_OF = {};
  Object.entries(SCHOOL_MEMBERS).forEach(([school, ids]) => ids.forEach(id => { SCHOOL_OF[id] = school; }));

  // A few words per level, for the badge page's hexagons.
  const SHORT_LEVELS = {
    extraMulligans: ["+2 mulligans a stage", "+3 mulligans a stage", "+4 mulligans a stage"],
    questRefreshes: ["+1 quest refresh", "+2 quest refreshes", "+3 quest refreshes"],
    questPoints: ["+10 per quest", "+20 per quest", "+30 per quest"],
    mulliganSize: ["Mulligans swap 4", "Mulligans swap 5", "Mulligans swap all"],
    cullOne: ["1 letter culled", "2 letters culled", "4 letters culled"],
    categorySense: ["1 theme shown", "2 themes shown", "All themes shown"],
    storybookStart: ["+10 a stage", "+16 a stage", "+30 a stage"],
    wideChoice: ["+1 choice to see", "+2 choices to see", "+2 choices, free refresh"],
    handSizeBoost: ["+1 consonant", "+2 consonants", "+3 consonants"],
    mulliganValueBoost: ["+1 per spare mulligan", "+2 per spare mulligan", "+3 per spare mulligan"],
    earlySolveBoost: ["+5 per spare guess", "+10 per spare guess", "+20 per spare guess"],
    colourTrade: ["Greens +0.75", "Greens +1.5", "Greens +2.25"],
    greyscale: ["Greys pay 0.75", "Greys pay 1.5", "Greys pay 2.25"],
    "surprise-assignment": ["+1 quest a stage", "+2 quests a stage", "+4 quests a stage"],
    treasureMap: ["+1 special square", "+2 special squares", "+4 special squares"],
    bonusSquares: ["Money & points squares", "+1 square a stage", "+2 squares a stage"],
    mulliganTiles: ["Mulligan squares", "Mulligan squares x2", "Mulligan squares x4"],
    jokerTiles: ["Joker squares", "Joker squares x2", "Joker squares x4"],
    oracleTiles: ["Oracle squares", "Oracle squares x2", "Oracle squares x4"],
    rainyDay: ["5% interest", "8% interest", "15% interest"],
    vowelBounty: ["+4 per vowel", "+6 per vowel", "+10 per vowel"],
    treasureHunter: ["Treasure +$30", "Treasure +$40", "Treasure +$60, every 2nd"],
    yellowHint: ["1 letter shown", "1 letter placed"],
    "alphabet-compass": ["1 compass tile", "2 compass tiles", "Every tile"],
    coachMeterThreshold: ["Meter 2 sooner", "Meter 4 sooner", "Meter 6 sooner"],
    coachMeterReward: ["Meter + consonant test", "Meter + Joker card", "Meter + yellow hint, once a stage"],
    momentum: ["+3 per better guess", "+5 per better guess", "+9 per better guess"],
    bigOpener: ["+5 per opener colour", "+8 per opener colour", "+15 per opener colour"],
    lastStand: ["+25 last-guess solve", "+40 last-guess solve", "+75 last-guess solve"],
    pickpocket: ["+$2 per yellow", "+$3 per yellow", "+$6 per yellow"],
    gracePeriod: ["1st late guess free", "2 late guesses free", "2 free, then half"],
    ideaTiles: ["1 idea card", "2 idea cards", "3 idea cards"],
    jokerCache: ["2 Joker cards", "3 Joker cards", "5 Joker cards"],
    jokerLens: ["Joker shows its letter", "Joker cycles its letters"],
    strikeThrough: ["+1 per letter ruled out", "+2 per letter ruled out", "+3 per letter ruled out"],
    highRoller: ["Bet 10, win 20", "Bet 20, win 40", "Bet 40, win 80"],
    hardMode: ["+35 hard-mode solve", "+60 hard-mode solve", "+100 hard-mode solve"],
    waveTiles: ["1 wave card", "2 wave cards", "4 wave cards"],
    luckyClover: ["1 lucky card, +10", "2 lucky cards, +14 each", "4 lucky cards, +20 each"],
    fishHook: ["Fish 1 discard a stage", "Fished letter tested", "Auto-hooks a right letter"],
    questCadence: ["Quests on 2, 3, 5", "Quests on 1, 2, 3, 5"],
    questScout: ["1 quest letter placed", "2 quest letters placed"],
    questClue: ["Clue reward: yellow hint", "Clue reward: green hint"],
    questSatchel: ["+1 letter on a quest", "A Joker on a quest", "Joker and +1 letter on a quest"],
    insertCoin: ["Extra guess for $100", "Extra guess for $75"],
    goldenLedger: ["$1 counts as 0.5 points", "$1 counts as 1 point"],
    fastLane: ["Tricky guesses come 1 later", "Tricky guesses come 2 later", "Tricky guesses come 3 later"]
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

  // Badges that used to stop at level 1, now levelled (the level-up
  // reward screens offer them): their top level and what each level does.
  const UPGRADED = {
    encore: [3, ["Every 3rd stage you solve: +25 points", "Every 3rd stage you solve: +40 points", "Every 3rd stage you solve: +55 points"],
      ["+25 every 3rd solve", "+40 every 3rd solve", "+55 every 3rd solve"]],
    doubleDown: [3, ["Solve on the stage's lucky guess (3rd to 7th): +35 points", "Solve on the stage's lucky guess (3rd to 7th): +50 points", "Solve on the stage's lucky guess (3rd to 7th): +75 points"],
      ["Lucky guess +35", "Lucky guess +50", "Lucky guess +75"]],
    haggler: [3, ["Reward refreshes: the 1st is free, then $1, $3, $5", "Reward refreshes: the first 2 are free, then $1, $3, $5", "Reward refreshes: the first 2 are free, then $1 each"],
      ["1 free refresh", "2 free refreshes", "2 free, then $1"]],
    vowelLamp: [2, ["Every stage tells you how many vowels the answer has", "Every stage tells you how many vowels the answer has, and names one"],
      ["Vowel count", "Vowel count + one vowel"]],
    echoFinder: [2, ["Every stage tells you if the answer uses a letter twice", "Every stage tells you if the answer uses a letter twice, and if it's a vowel or a consonant"],
      ["Repeat or not", "Repeat: vowel or consonant"]],
    patternLens: [2, ["From your 2nd guess, you see which spots are vowels and which are consonants", "From the start, you see which spots are vowels and which are consonants"],
      ["Pattern from guess 2", "Pattern from the start"]],
    mistakeShield: [3, ["In bosses and strict stages, an all-grey guess is given back", "On every stage, an all-grey guess is given back", "On every stage, two all-grey guesses are given back"],
      ["Bosses & strict stages", "Every stage", "2 guesses back"]],
    lastLight: [2, ["After your 2nd guess, the answer's last letter is filled in", "After your 1st guess, the answer's last letter is filled in"],
      ["After guess 2", "After guess 1"]],
    jokerCacheLarge: [2, ["Every stage starts with a Joker card in your hand", "Every stage starts with 2 Joker cards in your hand"],
      ["1 Joker in hand", "2 Jokers in hand"]],
    consonantSweep: [2, ["After each guess, 2 more consonants are ruled out", "After each guess, 3 more consonants are ruled out"],
      ["2 a guess", "3 a guess"]],
    boldOpener: [2, ["Your 1st guess can be any 5 letters", "Your first 2 guesses can be any 5 letters"],
      ["1st guess free-form", "First 2 guesses free-form"]],
    fullCircle: [2, ["Once a stage, when your deck starts over, a letter is placed in its spot", "Twice a stage, when your deck starts over, a letter is placed in its spot"],
      ["Once a stage", "Twice a stage"]],
    leanBuild: [3, ["Each solve: +20/+40/+100 by world, -5 for every badge outside Restraint", "Each solve: +20/+40/+100 by world, -4 for every badge outside Restraint", "Each solve: +20/+40/+100 by world, -3 for every badge outside Restraint"],
      ["-5 per badge", "-4 per badge", "-3 per badge"]],
    monksVow: [3, ["Skipping a reward pays both its points and its money", "Skipping a reward pays both, x1.25", "Skipping a reward pays both, x1.5"],
      ["Both", "Both x1.25", "Both x1.5"]],
    cleanSlate: [2, ["Skipping a reward levels up 1 of your badges", "Skipping a reward levels up 2 of your badges"],
      ["1 badge up", "2 badges up"]],
    ascetic: [2, ["Solves pay x1.6 with 5 badges or fewer outside Restraint, x1.3 with 10 or fewer", "Solves pay x1.6 with 6 badges or fewer outside Restraint, x1.3 with 12 or fewer"],
      ["x1.6 to 5, x1.3 to 10", "x1.6 to 6, x1.3 to 12"]],
    blackMarket: [3, ["On every reward screen, a random badge for $50", "On every reward screen, a random badge for $45", "On every reward screen, a random badge for $40"],
      ["$50 badge", "$45 badge", "$40 badge"]],
    treasureChest: [3, ["Opens a free Large Pack", "Opens another free Large Pack", "Opens a third free Large Pack"],
      ["1 pack", "2 packs", "3 packs"]],
    goldenOpener: [3, ["Yellow letters in your first guess move to their spots", "Yellow letters in your first 2 guesses move to their spots", "Yellow letters in your first 3 guesses move to their spots"],
      ["Guess 1", "Guesses 1 and 2", "Guesses 1 to 3"]],
    questReroll: [3, ["Once a stage, swap your quest for a new one for free", "Twice a stage, swap your quest for a new one for free", "3 times a stage, swap your quest for a new one for free"],
      ["1 free swap", "2 free swaps", "3 free swaps"]],
    greenCount: [2, ["A green tile shows how many times its letter is in the answer", "Green and yellow tiles show how many times their letter is in the answer"],
      ["Greens show counts", "Yellows too"]],
    coachPossibleAnswers: [2, ["Shows how many answers are still possible", "Shows how many answers are still possible, and lists them once 5 or fewer are left"],
      ["Count", "Count + list at 5"]],
    cullRare: [2, ["3 rare letters are gone for good", "2 more rare letters are gone for good"],
      ["3 letters gone", "5 letters gone"]],
    freeVowelSweep: [2, ["Each stage, 2 vowels are tested for free", "Each stage, 3 vowels are tested for free"],
      ["2 vowels", "3 vowels"]],
    secondCup: [2, ["Once a run: +1 guess when a boss or strict stage would end", "Twice a run: +1 guess when a boss or strict stage would end"],
      ["Once a run", "Twice a run"]],
    rewardEcho: [3, ["The next reward you pick counts twice", "Another reward you pick counts twice", "A third reward you pick counts twice"],
      ["1 echo", "2 echoes", "3 echoes"]]
  };
  for (const branch of BRANCHES) {
    for (const node of branch.nodes) {
      const upgrade = UPGRADED[node.id];
      if (!upgrade) continue;
      node.maxLevel = upgrade[0];
      node.levels = upgrade[1];
      SHORT_LEVELS[node.id] = upgrade[2];
    }
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
