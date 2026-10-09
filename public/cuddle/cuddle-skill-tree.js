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
          levels: ["+1 mulligan every stage", "+2 mulligans every stage", "+4 mulligans every stage"],
          level: g => ledgerCount(g, "extraMulligans") },
        { id: "questRefreshes", icon: "♻️", title: "Reward Refresh", tier: "common", type: "quests", maxLevel: 3,
          levels: ["+1 free refresh on every quest reward screen", "+2 free refreshes on quest reward screens", "+4 free refreshes on quest reward screens"],
          level: g => ledgerCount(g, "questRefreshes") },
        { id: "questPoints", icon: "🏅", title: "Quest Value", tier: "common", type: "quests", maxLevel: 3,
          levels: ["Every completed quest pays +10 points", "Every completed quest pays +20 points", "Every completed quest pays +40 points"],
          level: g => ledgerCount(g, "questPoints") },
        { id: "questReroll", icon: "🔄", title: "Second Guess Quest", tier: "common", type: "quests", maxLevel: 1,
          description: "Once per stage, reroll the current quest for free.", level: g => upgradeCount(g, "questReroll") },
        { id: "mulliganSize", icon: "🃏", title: "Bigger Mulligan", tier: "common", type: "letters", maxLevel: 3,
          levels: ["Each mulligan swaps up to 4 letters", "Each mulligan swaps up to 5 letters", "Each mulligan can swap your whole hand"],
          level: g => ledgerCount(g, "mulliganSize") },
        { id: "cullOne", icon: "✂️", title: "Cull One Letter", tier: "common", type: "letters", maxLevel: 3,
          levels: ["One rare consonant leaves your deck and every future answer", "Two rare consonants gone for good", "Four rare consonants gone for good"],
          level: g => v5Level(g, "umtCullOne") },
        { id: "cullTwo", icon: "✂️", title: "Cull Two Letters", tier: "epic", type: "letters", maxLevel: 3,
          levels: ["Two rare consonants leave your deck and every future answer", "Four rare consonants gone for good", "Seven rare consonants gone for good"],
          level: g => v5Level(g, "umtCullTwo") },
        { id: "categorySense", icon: "🔮", title: "Theme Sense", tier: "rare", type: "clues", maxLevel: 3,
          levels: ["Every stage opens with one of the answer's themes shown", "Every stage opens with two of its themes shown", "Every stage opens with all of its themes shown"],
          level: g => Number(campaignState(g)?.categorySense) || 0 },
        { id: "storybookStart", icon: "📖", title: "Opening Verse", tier: "common", type: "points", maxLevel: 3,
          levels: ["+10 points at the start of every stage", "+20 points at the start of every stage", "+45 points at the start of every stage"],
          level: g => Number(g?.state?.cuddleBonuses?.storybookStart) || 0 },
        { id: "wideChoice", icon: "🌈", title: "Wide Margins", tier: "common", type: "money", maxLevel: 3,
          levels: ["One more card on every reward screen", "Two more cards on every reward screen", "Two more cards, and the first refresh on every reward screen is free"],
          level: g => Number(g?.state?.cuddleBonuses?.wideChoice) || 0 },
        { id: "handSizeBoost", icon: "✋", title: "Bigger Hand", tier: "rare", type: "letters", maxLevel: 3,
          levels: ["Hold 1 more consonant", "Hold 2 more consonants", "Hold 4 more consonants"],
          level: g => Number(g?.state?.balanceRewardCounts?.handSizeBoost) || 0 },
        { id: "mulliganValueBoost", icon: "💱", title: "Mulligan Dividend", tier: "common", type: "points", maxLevel: 3,
          levels: ["Each unused mulligan pays 3 more points when you solve", "Each unused mulligan pays 6 more points", "Each unused mulligan pays 15 more points"],
          level: g => Number(g?.state?.balanceRewardCounts?.mulliganValueBoost) || 0 },
        { id: "earlySolveBoost", icon: "🏁", title: "Early Finish", tier: "common", type: "points", maxLevel: 3,
          levels: ["Each spare guess pays 5 more points", "Each spare guess pays 10 more points", "Each spare guess pays 25 more points"],
          level: g => Number(g?.state?.balanceRewardCounts?.earlySolveBoost) || 0 },
        { id: "colourTrade", icon: "🎨", title: "Colour Surge", tier: "common", type: "points", maxLevel: 3,
          levels: ["Green tiles pay 1 more point", "Green tiles pay 2 more points", "Green tiles pay 4 more points"],
          level: g => Number(g?.state?.balanceRewardCounts?.colourTrade) || 0 },
        { id: "greyscale", icon: "⬛", title: "Greyscale", tier: "common", type: "points", maxLevel: 3,
          levels: ["Grey tiles pay 1 point", "Grey tiles pay 2 points", "Grey tiles pay 4 points, and yellows 1 more"],
          level: g => Number(g?.state?.balanceRewardCounts?.greyscale) || 0 },
        { id: "rewardEcho", icon: "🔁", title: "Reward Echo", tier: "rare", type: "money", maxLevel: 1, description: "The next round reward you pick is applied twice." },
        { id: "greenCount", icon: "🔢", title: "Precise Green", tier: "rare", type: "clues", maxLevel: 1, description: "A green tile also shows how many times that letter appears in the secret." },
        { id: "surprise-assignment", icon: "📜", title: "Surprise Assignment", tier: "rare", type: "quests", maxLevel: 3,
          levels: ["One extra quest at a random turn in every stage", "Two extra quests in every stage", "Four extra quests in every stage"],
          level: g => ledgerCount(g, "surprise-assignment") },
        // More special board tiles (cuddle-points-money.js).
        { id: "treasureMap", icon: "🗺️", title: "Treasure Map", tier: "rare", type: "tiles", maxLevel: 3,
          levels: ["One more special tile on the board every stage", "Two more special tiles every stage", "Four more special tiles every stage"],
          level: g => ledgerCount(g, "treasureMap") },
        // Board tiles beyond money and points each need their unlock.
        { id: "mulliganTiles", icon: "🔄", title: "Mulligan Tiles", tier: "common", type: "tiles", maxLevel: 3,
          levels: ["Special tiles can be Mulligan tiles: a yellow or green on one gives a mulligan", "Mulligan tiles twice as common", "Mulligan tiles four times as common"],
          level: g => ledgerCount(g, "mulliganTiles") },
        { id: "jokerTiles", icon: "🃏", title: "Joker Tiles", tier: "rare", type: "tiles", maxLevel: 3,
          levels: ["Special tiles can be Joker tiles: a yellow or green on one gives a Joker", "Joker tiles twice as common", "Joker tiles four times as common"],
          level: g => ledgerCount(g, "jokerTiles") },
        { id: "oracleTiles", icon: "🔮", title: "Oracle Tiles", tier: "epic", type: "tiles", maxLevel: 3,
          levels: ["Special tiles can be Oracle tiles: a yellow or green on one reveals a letter in its place", "Oracle tiles twice as common", "Oracle tiles four times as common"],
          level: g => ledgerCount(g, "oracleTiles") }
      ]
    },
    {
      id: "economyEngines",
      title: "Economy Engines",
      blurb: "Reward pool that pays out for how you play a round, not just for finishing it.",
      nodes: [
        { id: "rainyDay", icon: "🏦", title: "Rainy Day Fund", tier: "rare", type: "money", maxLevel: 3,
          levels: ["Every stage pays 10% interest on your wallet, up to $25", "Every stage pays 20% interest, up to $50", "Every stage pays 30% interest, up to $120"],
          level: g => v5Level(g, "umtRainyDay") },
        { id: "encore", icon: "🎬", title: "Encore", tier: "rare", type: "points", maxLevel: 1, description: "Every third stage you solve pays a 50-point encore bonus.", level: g => v5Level(g, "umtEncore") },
        { id: "vowelBounty", icon: "🅰️", title: "Vowel Bounty", tier: "common", type: "points", maxLevel: 3,
          levels: ["Every vowel in a word you solve pays 5 points", "Every vowel pays 10 points", "Every vowel pays 25 points"],
          level: g => v5Level(g, "umtVowelBounty") },
        { id: "haggler", icon: "🪙", title: "Haggler", tier: "common", type: "money", maxLevel: 1, description: "Refreshing reward choices costs $0, then $1, $3, $5... instead of $3, $5, $7...", level: g => v5Level(g, "umtHaggler") },
        { id: "doubleDown", icon: "🎲", title: "Double Down", tier: "epic", type: "points", maxLevel: 1, description: "Each stage names a lucky guess, from the 3rd to the 7th. Solve the word on exactly that guess for +50 points, even if that's past your bonus window.", level: g => v5Level(g, "umtDoubleDown") }
      ]
    },
    {
      id: "insightTools",
      title: "Insight",
      blurb: "Clues about the answer before you guess, and a little luck. Effects in cuddle-clues.js.",
      nodes: [
        { id: "vowelLamp", icon: "🏮", title: "Vowel Lamp", tier: "rare", type: "clues", maxLevel: 1, description: "Every stage, boss fights included, tells you how many vowels the answer has.", level: g => v5Level(g, "umtVowelLamp") },
        { id: "echoFinder", icon: "👯", title: "Echo Finder", tier: "common", type: "clues", maxLevel: 1, description: "Every stage, boss fights included, tells you whether the answer uses a letter twice.", level: g => v5Level(g, "umtEchoFinder") },
        { id: "treasureHunter", icon: "💎", title: "Treasure Hunter", tier: "common", type: "money", maxLevel: 3,
          levels: ["About one stage in three hides a treasure word: solve it quickly for +$25", "Treasure words pay +$50", "Treasure words pay +$100 and hide in every other stage"],
          level: g => v5Level(g, "umtTreasureHunter") },
        { id: "patternLens", icon: "🧩", title: "Pattern Lens", tier: "epic", type: "clues", maxLevel: 1, description: "Every stage shows where the answer's vowels and consonants sit, like C V C C V.", level: g => v5Level(g, "umtPatternLens") },
        { id: "mistakeShield", icon: "🛡️", title: "Mistake Shield", tier: "rare", type: "safety", maxLevel: 1, description: "In a boss or a strict stage, the first guess with no green or yellow gives you an extra guess back.", level: g => v5Level(g, "umtMistakeShield") },
        { id: "lastLight", icon: "🕯️", title: "Last Light", tier: "legendary", type: "clues", maxLevel: 1, description: "Every stage opens with the answer's last letter already in place.", level: g => v5Level(g, "umtLastLight") },
        { id: "yellowHint", icon: "🟨", title: "Yellow Guesser Hint", tier: "epic", type: "clues", maxLevel: 2,
          levels: ["Every stage opens with one letter of the answer shown as in the word", "Clear Sight (Legendary): that letter comes in its exact place"],
          level: g => v5Level(g, "umtYellowHint") + v5Level(g, "umtClearSight") }
      ]
    },
    {
      id: "solvingAids",
      title: "Solving Aids",
      blurb: "Jokers and letter tools, offered on every difficulty.",
      nodes: [
        { id: "jokerCache", icon: "🃏", title: "Small Joker Cache", tier: "rare", type: "letters", maxLevel: 1, description: "One extra Joker every stage.", level: g => v5Level(g, "umtJokerCache") },
        { id: "jokerCacheLarge", icon: "🃏", title: "Large Joker Cache", tier: "legendary", type: "letters", maxLevel: 1, description: "Two more Jokers every stage, on top of Small Joker Cache if you have it.", level: g => v5Level(g, "umtJokerCacheLarge") },
        { id: "alphabet-compass", icon: "🧭", title: "Alphabet Compass", tier: "epic", type: "clues", maxLevel: 3,
          levels: ["After every guess, one tile shows whether the answer's letter there comes earlier or later in the alphabet", "Two tiles show it", "Full Alphabet Compass (Legendary): every tile shows it"],
          level: g => (window.CuddleCompass && g?.state ? window.CuddleCompass.copiesOwned(g.state) : 0) },
        { id: "consonantSweep", icon: "🔍", title: "Process of Elimination", tier: "epic", type: "clues", maxLevel: 1, description: "After every guess, boss fights included, one more consonant that isn't in the answer is ruled out and shown: one after your first guess, a second after your second, and so on.", level: g => upgradeCount(g, "consonantSweep") }
      ]
    },
    {
      id: "cuddleCoach",
      title: "Cuddle Coach",
      blurb: "The Cuddle Meter and the Secrets Counter.",
      nodes: [
        { id: "coachPossibleAnswers", icon: "🎧", title: "Secrets Counter", tier: "rare", type: "clues", maxLevel: 1, description: "Always see how many possible answers are left, next to the theme.", level: g => (coachState(g)?.possibleAnswersUnlocked ? 1 : 0) },
        { id: "coachMeterThreshold", icon: "🩶", title: "Softer Cuddle Meter", tier: "common", type: "letters", maxLevel: 3,
          levels: ["The Cuddle Meter fills 2 tiles sooner", "It fills 4 tiles sooner", "It fills 7 tiles sooner"],
          level: g => Number(coachState(g)?.cuddleThresholdStacks) || 0 },
        { id: "coachMeterReward", icon: "🫶", title: "Bigger Cuddle", tier: "rare", type: "letters", maxLevel: 3,
          levels: ["A full Cuddle Meter tests a random consonant instead of giving a mulligan", "A full Cuddle Meter gives a Joker", "A full Cuddle Meter puts a letter in its exact place"],
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
          levels: ["Each guess with more greens than the one before pays +4 points", "Each such guess pays +8 points", "Each such guess pays +20 points"],
          level: g => powerLevel(g, "momentum") },
        { id: "bigOpener", icon: "🎯", title: "Big Opener", tier: "rare", type: "points", maxLevel: 3,
          levels: ["Each green or yellow on your first guess pays +3 points", "Each green or yellow on your first guess pays +5 points", "Each green or yellow on your first guess pays +12 points"],
          level: g => powerLevel(g, "bigOpener") },
        { id: "lastStand", icon: "⚔️", title: "Last Stand", tier: "rare", type: "points", maxLevel: 3,
          levels: ["Solve on the last guess of your window for +25 points", "Solve on the last guess of your window for +45 points", "Solve on the last guess of your window for +100 points"],
          level: g => powerLevel(g, "lastStand") },
        { id: "pickpocket", icon: "💲", title: "Pickpocket", tier: "common", type: "money", maxLevel: 3,
          levels: ["Every yellow tile you reveal pays $1", "Every yellow tile pays $2", "Every yellow tile pays $4"],
          level: g => powerLevel(g, "pickpocket") },
        { id: "gracePeriod", icon: "⌛", title: "Grace Period", tier: "rare", type: "safety", maxLevel: 3,
          levels: ["Your first guess past the guess window costs no points", "Your first two guesses past the window cost nothing", "Your first two late guesses cost nothing, and later ones half"],
          level: g => powerLevel(g, "gracePeriod") },
        { id: "boldOpener", icon: "🪄", title: "Bold Opener", tier: "epic", type: "clues", maxLevel: 1,
          description: "Your first guess in every stage can be any five letters, real word or not.",
          level: g => powerLevel(g, "boldOpener") }
      ]
    },
    {
      id: "synergyCombos",
      title: "Synergy Combos",
      blurb: "Owning both halves of a pair turns the combo on permanently.",
      nodes: [
        { id: "encoreNight", icon: "🎬", title: "Encore Night", tier: "legendary", type: "combo", maxLevel: 1, description: "Encore + Vowel Bounty: every encore also pays 10 points for each vowel in that stage's secret.", requires: ["encore", "vowelBounty"], level: g => (v5Level(g, "umtEncore") > 0 && v5Level(g, "umtVowelBounty") > 0) ? 1 : 0 }
      ]
    },
    {
      id: "bossRewards",
      title: "Boss Rewards",
      blurb: "Permanent rewards for clearing a boss round. No ordinary upgrade is offered afterward.",
      nodes: [
        { id: "cullRare", icon: "✂️", title: "Deep Cull", tier: "legendary", type: "letters", maxLevel: 1, description: "Remove four rare letters from the deck and from every future secret." },
        { id: "doubleMulligans", icon: "🔁", title: "Double Mulligans", tier: "epic", type: "letters", maxLevel: 1, description: "Permanently doubles every mulligan you get: each stage's starting mulligans and every one you gain along the way.", level: g => upgradeCount(g, "doubleMulligans") },
        { id: "biggerMulligans", icon: "🖐️", title: "Full Hand Mulligan", tier: "epic", type: "letters", maxLevel: 1, description: "Every mulligan can now replace up to five cards.", level: g => ledgerCount(g, "biggerMulligans") },
        { id: "freeVowelSweep", icon: "🅰️", title: "Free Vowel Sweep", tier: "legendary", type: "clues", maxLevel: 1, description: "Each stage opens with one random vowel tested for free: you learn whether it's in the answer, not where.", level: g => upgradeCount(g, "freeVowelSweep") },
        { id: "revealGreen", icon: "📍", title: "Position Peek", tier: "common", type: "clues", maxLevel: 1, description: "Your next stage opens with one letter of the answer already in its exact place. One time." },
        { id: "questDoublePick", icon: "✌️", title: "Double Pick", tier: "legendary", type: "quests", maxLevel: 1, description: "Quest reward screens let you choose two options instead of one, for the rest of the run.", level: g => upgradeCount(g, "questDoublePick") },
        { id: "questCadence", icon: "❗", title: "Quest Cadence", tier: "epic", type: "quests", maxLevel: 2,
          levels: ["Quests come every second guess, and one more can be active at a time", "Quests come every guess"],
          level: g => upgradeCount(g, "questCadence") },
        { id: "questPersistReward", icon: "⏳", title: "Lasting Quests", tier: "legendary", type: "quests", maxLevel: 1, description: "A quest you don't complete stays active for the rest of the stage instead of expiring after one guess, boss fights included.", level: g => (g?.state?.megaState?.questPersistsForRound ? 1 : 0) },
        { id: "allThemesBoss", icon: "🔮", title: "All-Seeing Atlas", tier: "legendary", type: "clues", maxLevel: 1, description: "Reveal every available theme at the start of every Wordle.", level: g => (bossRewardOwned(g, "umtAllThemes") ? 1 : 0) },
        { id: "secondCup", icon: "☕", title: "Second Cup", tier: "epic", type: "safety", maxLevel: 1, description: "Once per run, when you would run out of guesses in a boss or strict stage, you get one extra guess.", level: g => (bossRewardOwned(g, "secondCup") ? 1 : 0) }
      ]
    }
  ]);

  // A stackable power's description lists every level, and says the third
  // is the big one. The type doubles as the old colour category.
  function sentence(text) {
    const value = String(text || "").trim();
    return value && !/[.!?]$/.test(value) ? `${value}.` : value;
  }
  for (const branch of BRANCHES) {
    for (const node of branch.nodes) {
      node.category = node.type;
      if (Array.isArray(node.levels) && node.levels.length) {
        node.description = node.levels.length > 1
          ? `${sentence(node.levels[0])} Level 2: ${sentence(node.levels[1]).replace(/^./, c => c.toLowerCase())}`
            + (node.levels[2] ? ` Level 3: ${sentence(node.levels[2]).replace(/^./, c => c.toLowerCase())}` : "")
          : sentence(node.levels[0]);
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
      return sentence(node.levels[index]);
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
