/* CUDDLE SHOP -- The Wandering Paw
 * Every shop stocks three shelves, all bought with money:
 *   For the road    2 one-time supplies for your next non-boss stage(s);
 *                   not in the final shop (only the final boss is left)
 *   For the boss    2 one-time supplies for the next boss
 *   Keeps forever   3 permanent upgrades for the rest of the run
 *   Trade           money for points on the spot, in every shop: +10
 *                   points for $10, +50 for $30, +200 for $100
 *   Sell            once per shop, sell one of your badges back for money
 *                   (by its rarity and level). Badges kept as levels
 *                   (state.umtPowers) can be sold; the rest can't.
 *   Mend            only while the run carries a deck burden
 *                   (cuddle-burdens.js): chisel out a dead card, or sort
 *                   out the doubled consonants. Can be bought again while
 *                   there is something left to mend.
 * The stock is drawn per shop from larger pools (seeded by the run, saved
 * the first time the shop opens, so it never reshuffles), and a permanent
 * upgrade you have already maxed is never offered.
 *
 * getCuddleShop/buyCuddleShopItem are handed to cuddle-shop-lockin.js via
 * window.__cuddleShopFinal (see cuddle-stability-v2.js for why the lock is
 * needed); the screen itself replaces CuddleCampaign.renderShop.
 */
(function bootstrapCuddleShop() {
  "use strict";

  const Engine = window.CuddleEngine;
  const Game = Engine && Engine.CuddleGame;
  if (!Game || !window.CuddleCampaign) {
    console.error("Cuddle Shop: the Cuddle engine or campaign was not available.");
    return;
  }
  const proto = Game.prototype;
  const ICON_ROOT = "cuddle/icons/";

  // "For the road" supplies wait for your next REGULAR stages -- the shop
  // sits right before a boss, and boss help has its own shelf.
  const ROAD_ITEMS = Object.freeze([
    { id: "roadJoker", icon: "joker.svg", title: "Pocket Joker", cost: 16, stages: 1,
      blurb: "Start your next non-boss stage with a Joker card in hand." },
    { id: "roadAmber", icon: "reward-golden-compass.svg", title: "Amber Lens", cost: 12, stages: 1,
      blurb: "Your next non-boss stage opens with one letter of the answer revealed (not where it goes)." },
    { id: "roadLanterns", icon: "hint.svg", title: "Twin Lanterns", cost: 24, stages: 2,
      blurb: "Your next two non-boss stages each open with one exact letter already in place." },
    { id: "roadMulligans", icon: "mulligan.svg", title: "Spare Mulligans", cost: 14, stages: 2,
      blurb: "+1 mulligan in each of your next two non-boss stages." },
    { id: "roadTrove", icon: "reward-coins.svg", title: "Treasure Trove", cost: 15, stages: 2,
      blurb: "Two extra special squares on the board in each of your next two non-boss stages." },
    { id: "roadWhisper", icon: "theme.svg", title: "Theme Whisper", cost: 10, stages: 2,
      blurb: "Your next two non-boss stages each reveal one theme of the answer." }
  ]);

  // Boss supplies ride on the Cuddle Coach boss kit (cuddle-coach-
  // expansion.js), which spends them at the start of the next boss.
  const BOSS_ITEMS = Object.freeze([
    // (Its kit keeps the old "tenLetterCull" id so saved runs still hold it.)
    { id: "bossCull", kit: "tenLetterCull", icon: "challenge-clean-letters.svg", title: "Five-Letter Cull", cost: 24,
      blurb: "Five letters that are not in the boss's answer are removed from play." },
    { id: "bossHands", kit: "unlimitedMulligans", icon: "reward-quest-refreshes.svg", title: "Regular Wordle Hands", cost: 28,
      blurb: "Unlimited mulligans for the boss, even against no-mulligan effects." },
    { id: "bossRow", kit: "extraRow", icon: "reward-umt-extra-row.svg", title: "Breathing Room", cost: 30,
      blurb: "The boss gives you one extra guess row." },
    { id: "bossGreen", kit: "openingGreen", icon: "reward-clear-sight.svg", title: "Opening Green", cost: 22,
      blurb: "The boss opens with one exact letter already in place." },
    { id: "bossThemes", kit: "revealThemes", icon: "reward-umt-all-themes.svg", title: "Theme Scroll", cost: 16,
      blurb: "The boss opens with the answer's themes revealed." },
    { id: "bossAutopilot", kit: "autoQuests", icon: "reward-early-solve-boost.svg", title: "Quest Autopilot", cost: 20,
      blurb: "Every boss guess completes its quest." }
  ]);

  function coachOf(game) {
    const state = game.state;
    if (!state.cuddleCoachExpansion || typeof state.cuddleCoachExpansion !== "object") state.cuddleCoachExpansion = {};
    const coach = state.cuddleCoachExpansion;
    if (!coach.inventory || typeof coach.inventory !== "object") coach.inventory = {};
    return coach;
  }

  function bonuses(game) {
    if (!game.state.cuddleBonuses || typeof game.state.cuddleBonuses !== "object") game.state.cuddleBonuses = {};
    return game.state.cuddleBonuses;
  }

  function int(value, fallback = 0) {
    const number = Math.trunc(Number(value));
    return Number.isFinite(number) ? number : fallback;
  }

  const KEEP_ITEMS = Object.freeze([
    { id: "keepSecrets", ledgerId: "coachPossibleAnswers", icon: "reward-coach-possible-answers.svg", title: "Secrets Counter", cost: 44, max: 1,
      blurb: "Always see how many possible answers are left.",
      level: game => (coachOf(game).possibleAnswersUnlocked ? 1 : 0),
      apply: game => { coachOf(game).possibleAnswersUnlocked = true; } },
    { id: "keepHint", ledgerId: "coachHint", icon: "reward-coach-shop-hint.svg", title: "Guesser Hint", cost: 50, max: 4,
      blurb: "One more automatic hint every stage: first a letter that's in the answer, then one in its exact place.",
      level: game => Math.max(0, int(coachOf(game).hintsPerRound)),
      apply: game => { const coach = coachOf(game); coach.hintsPerRound = Math.min(4, Math.max(0, int(coach.hintsPerRound)) + 1); } },
    { id: "keepMeter", ledgerId: "coachMeterThreshold", icon: "reward-cuddle-meter-reward.svg", title: "Softer Cuddle Meter", cost: 56, max: 3,
      blurb: "The Cuddle Meter fills up 2 tiles sooner. Level 2: 4 tiles sooner. Level 3: 6 tiles sooner.",
      level: game => Math.max(0, int(coachOf(game).cuddleThresholdStacks)),
      apply: game => { const coach = coachOf(game); coach.cuddleThresholdStacks = Math.min(3, Math.max(0, int(coach.cuddleThresholdStacks)) + 1); } },
    { id: "keepBonusSquares", icon: "reward-bonus-squares.svg", title: "Money & Point Squares", cost: 30, max: 3, bonus: "bonusSquares",
      blurb: "Money and point squares: a green or yellow on one pays money or points." },
    { id: "keepTreasureMap", icon: "reward-green-value.svg", title: "Treasure Map", cost: 50, max: 3, bonus: "treasureMap",
      blurb: "Squares of every kind turn up more often: x1.5 every stage (x2, then x3)." },
    { id: "keepMulliganTiles", icon: "reward-quest-reroll.svg", title: "Mulligan Squares", cost: 30, max: 3, bonus: "mulliganTiles",
      blurb: "Mulligan squares: a green or yellow on one gives +1 mulligan." },
    { id: "keepJokerTiles", icon: "reward-joker-per-round.svg", title: "Joker Squares", cost: 42, max: 3, bonus: "jokerTiles",
      blurb: "Joker squares: a green or yellow on one gives +1 Joker card." },
    { id: "keepOracleTiles", icon: "reward-coach-earlier-hint.svg", title: "Oracle Squares", cost: 60, max: 3, bonus: "oracleTiles",
      blurb: "Oracle squares: a green or yellow on one places a letter." }
  ].map(item => (item.bonus
    ? Object.assign(item, {
      level: game => Math.max(0, int(bonuses(game)[item.bonus])),
      apply: game => { const store = bonuses(game); store[item.bonus] = Math.max(0, int(store[item.bonus])) + 1; }
    })
    : item)));

  // Every shop trades at three sizes; the bigger the trade, the better
  // the rate.
  const TRADE_ITEMS = Object.freeze([
    { id: "tradePoints10", icon: "shop-points-pouch.svg", title: "Point Pouch", cost: 10, points: 10,
      blurb: "+10 points right now, toward the next boss." },
    { id: "tradePoints50", icon: "shop-points-chest.svg", title: "Point Chest", cost: 30, points: 50,
      blurb: "+50 points right now, toward the next boss." },
    { id: "tradePoints200", icon: "shop-points-vault.svg", title: "Point Vault", cost: 100, points: 200,
      blurb: "+200 points right now, toward the next boss." }
  ]);
  const TRADE_IDS = TRADE_ITEMS.map(item => item.id);

  // Not stocked from a pool: each shows up whenever there's a burden for it.
  const MEND_ITEMS = Object.freeze([
    { id: "mendChisel", icon: "shop-chisel.svg", title: "Stone Chisel", cost: 20,
      blurb: game => {
        const left = burdenOf(game).dead;
        return `Remove 1 dead card from your deck for good (you carry ${left}).`;
      },
      available: game => burdenOf(game).dead > 0,
      apply: game => window.CuddleBurdens.removeDead(game) },
    { id: "mendSorter", icon: "shop-sorter.svg", title: "Letter Sorter", cost: 18,
      blurb: game => `Remove your doubled consonants (${burdenOf(game).doubles.join(", ")}) for good.`,
      available: game => burdenOf(game).doubles.length > 0,
      apply: game => window.CuddleBurdens.removeDoubles(game) }
  ]);
  const MEND_BY_ID = new Map(MEND_ITEMS.map(item => [item.id, item]));

  // What a badge sells for, per level, by rarity.
  const SALE_PER_LEVEL = Object.freeze({ common: 10, rare: 18, epic: 30, legendary: 45 });
  // Badges whose whole effect happened when they were taken: nothing to sell.
  const UNSELLABLE = new Set(["combine", "treasureChest"]);

  function powerLevels(game) {
    const state = game.state;
    if (!state.umtPowers || typeof state.umtPowers !== "object") state.umtPowers = {};
    if (!state.umtPowers.levels || typeof state.umtPowers.levels !== "object") state.umtPowers.levels = {};
    return state.umtPowers.levels;
  }

  // Badges kept by cuddle-rebalance-v5.js whose effect reads their level
  // every time it applies, so selling one simply switches it off. (The
  // letter culls and Joker caches act once when taken, so they stay.)
  const SELLABLE_V5 = Object.freeze({
    encore: "umtEncore", rainyDay: "umtRainyDay", vowelBounty: "umtVowelBounty", haggler: "umtHaggler",
    doubleDown: "umtDoubleDown", vowelLamp: "umtVowelLamp", echoFinder: "umtEchoFinder",
    treasureHunter: "umtTreasureHunter", patternLens: "umtPatternLens", mistakeShield: "umtMistakeShield",
    lastLight: "umtLastLight"
  });

  // Badges you could sell here: playstyle badges kept as levels, and the
  // switch-like ones above.
  function sellableBadges(game) {
    const tree = window.CuddleSkillTree;
    if (!tree || typeof tree.findNode !== "function") return [];
    const levels = powerLevels(game);
    const ids = Object.keys(levels).concat(Object.keys(SELLABLE_V5).filter(id => !(id in levels)));
    return ids.map(id => {
      const node = tree.findNode(id);
      if (!node || UNSELLABLE.has(id) || node.type === "combo") return null;
      let level = 0;
      try { level = Math.max(0, Math.floor(Number(tree.level(game, node)) || 0)); } catch (_error) { level = 0; }
      if (level <= 0) return null;
      const tier = String(node.tier || "common");
      return { id, node, level, tier, value: (SALE_PER_LEVEL[tier] || SALE_PER_LEVEL.common) * level };
    }).filter(Boolean).sort((a, b) => b.value - a.value || String(a.node.title).localeCompare(String(b.node.title)));
  }

  // Takes a badge away for good: its kept level, and the reward-book
  // entries the registry also counts as levels (ledgerCount).
  function removeBadge(game, id) {
    delete powerLevels(game)[id];
    const rebalance = window.CuddleRebalanceV5;
    if (SELLABLE_V5[id] && rebalance && typeof rebalance.clearUpgrade === "function") rebalance.clearUpgrade(game, SELLABLE_V5[id]);
    const history = Array.isArray(game.state.rewardBookHistory) ? game.state.rewardBookHistory : [];
    history.forEach(entry => {
      const umt = SELLABLE_V5[id];
      if (entry && umt && (entry.id === umt || entry.key === umt)) {
        entry.soldId = id;
        entry.id = `${umt}:sold`;
        if (entry.key === umt) entry.key = `${umt}:sold`;
        return;
      }
      if (entry && (entry.id === id || entry.rewardId === id)) {
        entry.soldId = id;
        entry.id = `${id}:sold`;
        if (entry.rewardId === id) entry.rewardId = `${id}:sold`;
      }
    });
  }

  function sellBadge(game, itemId) {
    const id = String(itemId || "").replace(/^sell:/, "");
    const shop = shopState(game);
    const key = shopKey(game);
    if (!shop.sold || typeof shop.sold !== "object") shop.sold = {};
    if (shop.sold[key]) return { ok: false, error: "You've already sold a badge in this shop." };
    const badge = sellableBadges(game).find(item => item.id === id);
    if (!badge) return { ok: false, error: "You can't sell that badge." };
    removeBadge(game, id);
    game.state.cuddleMoney = money(game) + badge.value;
    shop.sold[key] = id;
    lastBought = null;
    game.state.lastMessage = `${badge.node.title} sold for $${badge.value}.`;
    safeSave(game);
    return { ok: true, message: game.state.lastMessage, item: { id: `sell:${id}`, title: badge.node.title } };
  }

  function burdenOf(game) {
    const burdens = window.CuddleBurdens;
    return burdens ? burdens.burden(game) : { dead: 0, doubles: [] };
  }

  const SHELVES = Object.freeze([
    { id: "road", items: ROAD_ITEMS, count: 2, kind: "wordle", title: "For the road",
      note: "One-time supplies for your next non-boss stages (not the boss)" },
    { id: "boss", items: BOSS_ITEMS, count: 2, kind: "boss", title: "For the boss",
      note: "One-time supplies, spent when the next boss begins" },
    // Stocked from the whole reward pool, not a fixed list (keepStock).
    { id: "keep", items: [], count: 3, kind: "upgrade", title: "Keeps forever",
      note: "Any reward from the run's pool, priced by its rarity" },
    { id: "trade", items: TRADE_ITEMS, count: TRADE_ITEMS.length, kind: "shop", title: "Trade",
      note: "Swap money for points on the spot" },
    // Your own badges, one of which can be sold per shop.
    { id: "sell", items: [], count: 0, kind: "shop", title: "Sell a badge",
      note: "Sell one badge per shop, for money by its rarity and level" },
    // Filled from MEND_ITEMS, only while the run carries a deck burden.
    { id: "mend", items: [], count: 0, kind: "shop", title: "Mend your deck",
      note: "Get rid of dead cards and doubled consonants for good" }
  ]);
  const ALL_ITEMS = new Map([].concat(ROAD_ITEMS, BOSS_ITEMS, KEEP_ITEMS, TRADE_ITEMS).map(item => [item.id, item]));
  const SHELF_OF = new Map();
  SHELVES.forEach(shelf => shelf.items.forEach(item => SHELF_OF.set(item.id, shelf)));

  const GREETINGS = Object.freeze([
    "Fresh stock, still warm from the road.",
    "Mind the whiskers. Everything's for sale.",
    "A boss waits up the path. I'd buy something.",
    "Coins in, courage out. That's the trade.",
    "Take your time. The boss isn't going anywhere."
  ]);

  // The last shop, before the final boss: permanent upgrades are cheaper
  // (little run is left to use them), and the one-time supplies cost more
  // (the boss is all that's left to spend them on).
  const FINAL_SHOP_PRICE = Object.freeze({ keep: 0.75, boss: 1.5 });

  function isFinalShop(game) {
    const done = Array.isArray(game.state.bossGatesDone) ? game.state.bossGatesDone : [];
    return done.includes("before-3") && done.includes("before-7");
  }

  function priceOf(game, shelfId, base) {
    const factor = isFinalShop(game) ? FINAL_SHOP_PRICE[shelfId] || 1 : 1;
    // Money rank II: everything is 20% cheaper.
    const schools = window.CuddleSchools;
    const discount = schools && typeof schools.perk === "function" ? Number(schools.perk(game, "shopDiscount")) || 0 : 0;
    return Math.max(1, Math.round((Number(base) || 0) * factor * (1 - discount)));
  }

  let lastBought = null;

  // -- state ------------------------------------------------------------------

  function shopState(game) {
    const state = game.state;
    if (!state.cuddleShopV2 || typeof state.cuddleShopV2 !== "object") state.cuddleShopV2 = {};
    const shop = state.cuddleShopV2;
    if (!shop.stock || typeof shop.stock !== "object") shop.stock = {};
    if (!shop.bought || typeof shop.bought !== "object") shop.bought = {};
    if (!shop.pending || typeof shop.pending !== "object") shop.pending = {};
    shop.tileStages = Math.max(0, int(shop.tileStages));
    return shop;
  }

  function shopKey(game) {
    const campaign = game.state.cuddleCampaign || {};
    if (campaign.activeShopRound != null) return `slot-${campaign.activeShopRound}`;
    return `round-${int(game.state.round, 0)}`;
  }

  function hashText(text) {
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function seeded(text) {
    let value = hashText(text) || 0x6d2b79f5;
    return function next() {
      value = (value + 0x6d2b79f5) >>> 0;
      let output = value;
      output = Math.imul(output ^ (output >>> 15), output | 1);
      output ^= output + Math.imul(output ^ (output >>> 7), output | 61);
      return ((output ^ (output >>> 14)) >>> 0) / 4294967296;
    };
  }

  // The run's seed (cuddle-seed.js), so a shared seed stocks the same shelves.
  function seedText(game) {
    return window.CuddleSeed ? window.CuddleSeed.text(game.state) : String(game.state.runId || "run");
  }

  function shuffled(items, random) {
    const copy = items.slice();
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const target = Math.floor(random() * (index + 1));
      [copy[index], copy[target]] = [copy[target], copy[index]];
    }
    return copy;
  }

  function isMaxed(game, item) {
    return Boolean(item.max) && item.level(game) >= item.max;
  }

  function tradeFor(_game, _key) {
    return TRADE_IDS.slice();
  }

  // Three rewards from the whole pool (any rarity), each with a price
  // rolled inside its rarity's range (cuddle-economy-rarity-v8.js).
  function keepStock(game, key) {
    const economy = window.CuddleEconomyRarityV8;
    if (!economy || typeof economy.shopRewards !== "function") return [];
    return economy.shopRewards(game, 3, `${seedText(game)}:${key}:wandering-paw:keep`);
  }

  function plainText(game, entry) {
    const tree = window.CuddleSkillTree;
    if (!tree || typeof tree.pickText !== "function") return "";
    return tree.pickText(game, entry.key) || tree.pickText(game, entry.title);
  }

  function oneTime(entry) {
    const tree = window.CuddleSkillTree;
    const node = tree && typeof tree.resolve === "function"
      ? tree.resolve(entry.key) || tree.resolve(entry.title) : null;
    return Boolean(node && node.maxLevel === 1);
  }

  function isKeepEntry(entry) {
    return Boolean(entry) && typeof entry === "object" && typeof entry.key === "string";
  }

  function stockFor(game) {
    const shop = shopState(game);
    const key = shopKey(game);
    const saved = shop.stock[key];
    if (saved && Array.isArray(saved.road) && Array.isArray(saved.boss) && Array.isArray(saved.keep)) {
      // A shop stocked before the trade shelf (or its three sizes) existed
      // gets the full shelf, and one from before the pool-wide keep shelf
      // gets a fresh keep shelf.
      if (!Array.isArray(saved.trade) || saved.trade.join("|") !== TRADE_IDS.join("|")) saved.trade = tradeFor(game, key);
      if (!saved.keep.every(isKeepEntry)) {
        saved.keep = keepStock(game, key);
        safeSave(game);
      }
      return saved;
    }
    const random = seeded(`${seedText(game)}:${key}:wandering-paw`);
    const stock = {};
    SHELVES.forEach(shelf => {
      if (shelf.id === "trade" || shelf.id === "keep" || shelf.id === "mend") return;
      // A first run has no special squares (cuddle-first-run.js), so no
      // Treasure Trove.
      const items = window.CuddleFirstRun && window.CuddleFirstRun.noSquares(game)
        ? shelf.items.filter(item => item.id !== "roadTrove") : shelf.items;
      stock[shelf.id] = shuffled(items, random).slice(0, shelf.count).map(item => item.id);
    });
    stock.keep = keepStock(game, key);
    stock.trade = tradeFor(game, key);
    shop.stock[key] = stock;
    // Saved straight away: the keep shelf is drawn from the live reward
    // pool, so a reload (tabbing out on a phone) before the first purchase
    // used to re-draw it and change the shop.
    safeSave(game);
    return stock;
  }

  function boughtHere(game) {
    const shop = shopState(game);
    const key = shopKey(game);
    if (!Array.isArray(shop.bought[key])) shop.bought[key] = [];
    return shop.bought[key];
  }

  function money(game) {
    return Math.max(0, Number(game.state.cuddleMoney) || 0);
  }

  function safeSave(game) {
    try { if (typeof game.save === "function") game.save(); }
    catch (error) { console.warn("Cuddle Shop: save failed.", error); }
  }

  // -- the two locked-in shop methods ----------------------------------------

  // A permanent reward that's maxed out (taken elsewhere since this shop
  // was stocked, or bought here) isn't offered: unsold ones are swapped for
  // a fresh reward the run can still take.
  function refreshMaxedKeep(game, stock, bought) {
    const economy = window.CuddleEconomyRarityV8;
    if (!economy || typeof economy.isMaxed !== "function" || !Array.isArray(stock.keep)) return;
    const maxed = entry => isKeepEntry(entry) && !bought.has(`keep:${entry.key}`) && economy.isMaxed(game, entry.title);
    if (!stock.keep.some(maxed)) return;
    const names = new Set(stock.keep.filter(isKeepEntry).map(entry => entry.title));
    const fresh = (typeof economy.shopRewards === "function"
      ? economy.shopRewards(game, 12, `${seedText(game)}:${shopKey(game)}:wandering-paw:keep:refill`)
      : []).filter(entry => isKeepEntry(entry) && !names.has(entry.title) && !economy.isMaxed(game, entry.title));
    stock.keep = stock.keep.map(entry => {
      if (!maxed(entry)) return entry;
      const swap = fresh.shift();
      return swap || null;
    }).filter(Boolean);
    safeSave(game);
  }

  function getCuddleShop() {
    const stock = stockFor(this);
    refreshMaxedKeep(this, stock, new Set(boughtHere(this)));
    const bought = new Set(boughtHere(this));
    const wallet = money(this);
    const items = [];
    const soldHere = (shopState(this).sold || {})[shopKey(this)] || null;
    SHELVES.forEach(shelf => {
      if (shelf.id === "sell") {
        sellableBadges(this).forEach(badge => {
          items.push({
            id: `sell:${badge.id}`,
            shelf: "sell",
            kind: "shop",
            icon: badge.node.icon,
            tier: badge.tier,
            title: badge.node.title,
            description: badge.level > 1 ? `Level ${badge.level}. Sells for $${badge.value}.` : `Sells for $${badge.value}.`,
            cost: badge.value,
            stages: 0,
            points: 0,
            rare: false,
            level: badge.level,
            max: null,
            maxed: false,
            purchased: false,
            locked: Boolean(soldHere),
            affordable: !soldHere
          });
        });
        if (soldHere) {
          const tree = window.CuddleSkillTree;
          const node = tree && typeof tree.findNode === "function" ? tree.findNode(soldHere) : null;
          items.push({
            id: `sold:${soldHere}`, shelf: "sell", kind: "shop", icon: node ? node.icon : "✦",
            title: node ? node.title : "Badge", description: "Sold in this shop.", cost: 0, stages: 0, points: 0,
            rare: false, level: null, max: null, maxed: false, purchased: true, affordable: false
          });
        }
        return;
      }
      if (shelf.id === "mend") {
        MEND_ITEMS.filter(item => item.available(this)).forEach(item => {
          items.push({
            id: item.id,
            shelf: "mend",
            kind: "shop",
            icon: item.icon,
            title: item.title,
            description: item.blurb(this),
            cost: item.cost,
            stages: 0,
            points: 0,
            rare: false,
            level: null,
            max: null,
            maxed: false,
            purchased: false,
            affordable: wallet >= item.cost
          });
        });
        return;
      }
      if (shelf.id === "keep") {
        (stock.keep || []).filter(isKeepEntry).forEach(entry => {
          const id = `keep:${entry.key}`;
          const cost = priceOf(this, "keep", entry.price);
          const purchased = bought.has(id);
          items.push({
            id,
            shelf: "keep",
            kind: "upgrade",
            icon: entry.icon,
            tier: entry.tier,
            // A one-level power: once bought it's maxed (cuddle-skill-tree.js).
            once: oneTime(entry),
            title: entry.title,
            // The registry's plain wording for the level this buys.
            description: plainText(this, entry) || entry.description,
            cost,
            stages: 0,
            points: 0,
            rare: false,
            level: null,
            max: null,
            maxed: false,
            purchased,
            affordable: !purchased && wallet >= cost
          });
        });
        return;
      }
      // The final shop has no road left after it: only the final boss.
      if (shelf.id === "road" && isFinalShop(this)) return;
      (stock[shelf.id] || []).forEach(id => {
        const item = ALL_ITEMS.get(id);
        if (!item) return;
        const maxed = shelf.id === "keep" && isMaxed(this, item);
        const cost = priceOf(this, shelf.id, item.cost);
        const purchased = bought.has(id);
        items.push({
          id,
          shelf: shelf.id,
          kind: shelf.id === "keep" ? "upgrade" : shelf.id === "boss" ? "boss" : "one-time",
          icon: item.icon,
          title: item.title,
          description: item.blurb,
          cost,
          stages: item.stages || 0,
          points: item.points || 0,
          rare: Boolean(item.rare),
          level: shelf.id === "keep" ? item.level(this) : null,
          max: item.max || null,
          maxed,
          purchased,
          affordable: !purchased && !maxed && wallet >= cost
        });
      });
    });
    const campaign = this.state.cuddleCampaign || {};
    return {
      round: campaign.activeShopRound ?? this.state.round ?? null,
      score: wallet,
      nextTarget: null,
      items,
      inventory: Object.assign({}, campaign.inventory || {}),
      jokerCharges: Math.max(0, int(this.state.megaState && this.state.megaState.jokerCharges))
    };
  }

  function recordUpgrade(game, item) {
    const state = game.state;
    if (!Array.isArray(state.rewardBookHistory)) state.rewardBookHistory = [];
    state.rewardBookHistory.push({
      id: item.ledgerId || item.bonus || item.id,
      icon: "🛒",
      title: item.title,
      description: item.blurb,
      kind: "shop",
      round: int(state.round, 1)
    });
    state.rewardBookHistory = state.rewardBookHistory.slice(-200);
  }

  function buyKeepReward(game, id) {
    const stock = stockFor(game);
    const entry = (stock.keep || []).filter(isKeepEntry).find(item => `keep:${item.key}` === id);
    if (!entry) return { ok: false, error: "That isn't on the shelves here." };
    const bought = boughtHere(game);
    if (bought.includes(id)) return { ok: false, error: `${entry.title} is sold out here.` };
    const cost = priceOf(game, "keep", entry.price);
    if (money(game) < cost) return { ok: false, error: `You need $${cost} for ${entry.title}.` };
    if (typeof game._grantUpgradeChoice !== "function") return { ok: false, error: "That reward can't be bought right now." };
    // The same path a reward-screen pick takes, so every layer applies it.
    const { price, tier, ...choice } = entry;
    const result = game._grantUpgradeChoice(choice);
    if (!result || !result.ok) return { ok: false, error: (result && result.error) || `${entry.title} can't be taken right now.` };
    game.state.cuddleMoney = money(game) - cost;
    bought.push(id);
    lastBought = id;
    game.state.lastMessage = `${entry.title} bought for $${cost}.`;
    safeSave(game);
    return { ok: true, message: game.state.lastMessage, item: { id, title: entry.title } };
  }

  function buyMend(game, item) {
    if (!window.CuddleBurdens || !item.available(game)) return { ok: false, error: "There's nothing in your deck for that to mend." };
    if (money(game) < item.cost) return { ok: false, error: `You need $${item.cost} for ${item.title}.` };
    game.state.cuddleMoney = money(game) - item.cost;
    const note = item.apply(game);
    lastBought = null;
    game.state.lastMessage = `${item.title} for $${item.cost}: ${note}`;
    safeSave(game);
    return { ok: true, message: game.state.lastMessage, item: { id: item.id, title: item.title } };
  }

  function buyCuddleShopItem(itemId) {
    if (!this.state || this.state.status !== "shop") return { ok: false, error: "No shop is open." };
    const id = String(itemId || "");
    if (id.startsWith("keep:")) return buyKeepReward(this, id);
    if (id.startsWith("sell:")) return sellBadge(this, id);
    if (MEND_BY_ID.has(id)) return buyMend(this, MEND_BY_ID.get(id));
    const item = ALL_ITEMS.get(id);
    const shelf = SHELF_OF.get(id);
    const stock = stockFor(this);
    if (!item || !shelf || !(stock[shelf.id] || []).includes(id)) return { ok: false, error: "That isn't on the shelves here." };
    const bought = boughtHere(this);
    if (bought.includes(id)) return { ok: false, error: `${item.title} is sold out here.` };
    if (shelf.id === "road" && isFinalShop(this)) return { ok: false, error: "Only the final boss is left: there are no more non-boss stages." };
    if (shelf.id === "keep" && isMaxed(this, item)) return { ok: false, error: `${item.title} is already maxed.` };
    const cost = priceOf(this, shelf.id, item.cost);
    if (money(this) < cost) return { ok: false, error: `You need $${cost} for ${item.title}.` };

    this.state.cuddleMoney = money(this) - cost;
    bought.push(id);
    const shop = shopState(this);
    if (shelf.id === "road") {
      if (id === "roadTrove") shop.tileStages += item.stages;
      else shop.pending[id] = Math.max(0, int(shop.pending[id])) + item.stages;
    } else if (shelf.id === "boss") {
      const coach = coachOf(this);
      coach.inventory[item.kit] = Math.max(0, int(coach.inventory[item.kit])) + 1;
    } else if (shelf.id === "trade") {
      this.state.score = Math.max(0, Number(this.state.score) || 0) + item.points;
    } else {
      item.apply(this);
      recordUpgrade(this, item);
    }
    lastBought = id;
    this.state.lastMessage = shelf.id === "trade"
      ? `${item.title}: +${item.points} points for $${cost}.`
      : `${item.title} bought for $${cost}.`;
    safeSave(this);
    return { ok: true, message: this.state.lastMessage, item: { id, title: item.title } };
  }

  proto.getCuddleShop = getCuddleShop;
  proto.buyCuddleShopItem = buyCuddleShopItem;
  window.__cuddleShopFinal = Object.freeze({ getShop: getCuddleShop, buyItem: buyCuddleShopItem });

  // -- spending "for the road" supplies ---------------------------------------

  function spendPending(shop, id) {
    if (int(shop.pending[id]) <= 0) return false;
    shop.pending[id] = int(shop.pending[id]) - 1;
    return true;
  }

  function revealOneLetter(game) {
    const state = game.state;
    const known = new Set(state.knownPresent || []);
    const letters = Array.from(new Set(String(state.secret || "").toUpperCase().split("")))
      .filter(letter => /^[A-Z]$/.test(letter) && !known.has(letter));
    if (!letters.length) return "";
    const letter = letters[Math.floor(game.random() * letters.length)];
    state.knownPresent = Array.from(new Set([...(state.knownPresent || []), letter])).sort();
    if (typeof game._syncInfiniteCards === "function") game._syncInfiniteCards();
    if (typeof game.drawToHandLimit === "function") game.drawToHandLimit();
    return `Amber Lens: ${letter} is in the answer.`;
  }

  const originalBeginRound = proto._beginRound;
  proto._beginRound = function beginRoundWithShopSupplies() {
    const shop = this.state ? shopState(this) : null;
    // The Joker is granted as a charge BEFORE the round is dealt, so the
    // hand-building pass puts the card straight into the opening hand.
    const regularAhead = Boolean(shop && !this.state.boss);
    if (regularAhead && spendPending(shop, "roadJoker")) {
      const mega = this.state.megaState && typeof this.state.megaState === "object"
        ? this.state.megaState
        : (this.state.megaState = {});
      mega.jokerCharges = Math.max(0, int(mega.jokerCharges)) + 1;
      mega.hasJokerUnlocked = true;
    }
    const result = originalBeginRound.apply(this, arguments);
    if (!shop || (typeof this.isBossRound === "function" && this.isBossRound())) return result;
    const notes = [];
    if (shop.tileStages > 0) shop.tileStages -= 1;
    // Lanterns first, so Amber Lens then names a letter it didn't place.
    if (spendPending(shop, "roadLanterns") && typeof this._revealPositionPeek === "function") {
      notes.push(`Twin Lanterns: ${this._revealPositionPeek()}`);
    }
    if (spendPending(shop, "roadAmber")) {
      const note = revealOneLetter(this);
      if (note) notes.push(note);
    }
    if (spendPending(shop, "roadMulligans")) {
      const gained = typeof this.mulliganGain === "function" ? this.mulliganGain(1) : 1;
      this.state.mulligansLeft = Math.max(0, int(this.state.mulligansLeft)) + gained;
      notes.push(`Spare Mulligans: +${gained} mulligan${gained === 1 ? "" : "s"} this stage.`);
    }
    if (spendPending(shop, "roadWhisper") && typeof window.CuddleCampaign.queueCategoryReveal === "function") {
      const note = window.CuddleCampaign.queueCategoryReveal(this, 1, "shop");
      notes.push(typeof note === "string" && note ? note : "Theme Whisper revealed a theme.");
    }
    if (notes.length) this.state.lastMessage = `${this.state.lastMessage || ""} ${notes.join(" ")}`.trim();
    return result;
  };

  // -- the screen ------------------------------------------------------------

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, character => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;"
    })[character]);
  }

  // Supplies carry their own drawing; a pool reward uses the shared icon set.
  function plateIcon(entry) {
    // A badge on sale wears the badge's own icon (cuddle-badge-art.js).
    const art = window.CuddleBadgeArt;
    const badgeId = String(entry.rewardId || entry.bonus || "").replace(/:sold$/, "");
    if (art && badgeId && art.has(badgeId)) return art.img(badgeId);
    const icon = String(entry.icon || "");
    if (/\.svg$/i.test(icon)) return `<img src="${ICON_ROOT}${escapeHtml(icon)}" alt="" aria-hidden="true">`;
    const Icons = window.CuddleIcons;
    if (Icons && icon && Icons.hasEmoji(icon)) return `<span class="umt-shop-plate-ico">${Icons.svg(icon)}</span>`;
    return `<span class="umt-shop-plate-ico is-text">${escapeHtml(icon || "✦")}</span>`;
  }

  function durationChip(entry) {
    // A pool reward's chip names its rarity, in that rarity's colour.
    if (entry.shelf === "keep" && entry.tier) return entry.once ? `${entry.tier} · one-time` : entry.tier;
    if (entry.shelf === "sell") return entry.purchased ? "Sold" : entry.tier || "Badge";
    if (entry.shelf === "trade") return "Right now";
    if (entry.shelf === "mend") return "For good";
    if (entry.shelf === "boss") return "Next boss";
    if (entry.shelf === "road") return entry.stages > 1 ? `Next ${entry.stages} stages` : "Next stage";
    if (entry.maxed) return "Maxed";
    return `Lv ${entry.level} → ${entry.level + 1}` + (entry.max ? ` of ${entry.max}` : "");
  }

  function levelPips(entry) {
    if (entry.shelf !== "keep" || !entry.max || entry.max < 2) return "";
    let pips = "";
    for (let index = 0; index < entry.max; index += 1) {
      const state = index < entry.level ? "is-owned" : index === entry.level && !entry.maxed ? "is-next" : "";
      pips += `<i class="${state}"></i>`;
    }
    return `<span class="umt-shop-pips" aria-hidden="true">${pips}</span>`;
  }

  function renderCard(entry) {
    const disabled = entry.purchased || entry.maxed || !entry.affordable;
    const price = entry.shelf === "sell"
      ? (entry.purchased ? "Sold" : entry.locked ? "One sale per shop" : `Sell +$${entry.cost}`)
      : entry.purchased ? "Sold" : entry.maxed ? "Maxed" : entry.affordable ? `$${entry.cost}` : `Need $${entry.cost}`;
    const classes = ["umt-shop-card", `umt-shelf-${entry.shelf}`];
    if (entry.tier) classes.push("cuddle-v8-rarity", `cuddle-v8-${entry.tier}`);
    if (entry.rare) classes.push("is-rare");
    if (entry.purchased) classes.push("is-sold");
    if (!entry.purchased && !entry.affordable) classes.push("is-short");
    if (entry.purchased && entry.id === lastBought) classes.push("is-fresh");
    return (
      `<button type="button" class="${classes.join(" ")}" data-cuddle-campaign-action="buy-shop-item"`
      + ` data-shop-item-id="${escapeHtml(entry.id)}"${disabled ? " disabled" : ""}`
      + ` aria-label="${escapeHtml(`${entry.title}, ${durationChip(entry)}, ${price}`)}">`
      + `<span class="umt-shop-chip">${escapeHtml(durationChip(entry))}</span>`
      + `<span class="umt-shop-plate">${plateIcon(entry)}</span>`
      + `<strong class="umt-shop-name">${escapeHtml(entry.title)}</strong>`
      + levelPips(entry)
      + `<span class="umt-shop-blurb">${escapeHtml(entry.description)}</span>`
      + `<span class="umt-shop-price${entry.affordable ? " is-buyable" : ""}${entry.shelf === "sell" ? " is-sale" : ""}">`
      + (entry.shelf === "sell" ? escapeHtml(price)
        : entry.affordable ? `<span class="umt-shop-coin" aria-hidden="true">$</span>${entry.cost}` : escapeHtml(price))
      + `</span>`
      + (entry.purchased ? `<span class="umt-shop-stamp" aria-hidden="true">Sold</span>` : "")
      + `</button>`
    );
  }

  function bagChips(game) {
    const shop = shopState(game);
    const coach = coachOf(game);
    const chips = [];
    ROAD_ITEMS.forEach(item => {
      const left = item.id === "roadTrove" ? shop.tileStages : int(shop.pending[item.id]);
      if (left > 0) chips.push(`${item.title} · ${left === 1 ? "next stage" : `${left} stages`}`);
    });
    BOSS_ITEMS.forEach(item => {
      const count = int(coach.inventory[item.kit]);
      if (count > 0) chips.push(`${item.title}${count > 1 ? ` ×${count}` : ""} · next boss`);
    });
    return chips;
  }

  // The stall is built from fixed-size layers (sky, awning, lanterns,
  // keeper, counter) so it reads the same on a phone and a wide screen.
  function stallScene(world) {
    return (
      `<div class="umt-shop-scene" aria-hidden="true" style="--sky-top:${world.skyTop};--sky-bottom:${world.skyBottom}">`
      + `<span class="umt-shop-lantern is-left"></span><span class="umt-shop-lantern is-right"></span>`
      + `<img class="umt-shop-keeper" src="${ICON_ROOT}shopkeeper.svg" alt="">`
      + `<span class="umt-shop-counter"></span>`
      + `<span class="umt-shop-awning"></span>`
      + `</div>`
    );
  }

  function finalNote(game, shelfId) {
    if (!isFinalShop(game)) return "";
    const factor = FINAL_SHOP_PRICE[shelfId];
    if (!factor || factor === 1) return "";
    const percent = Math.round(Math.abs(factor - 1) * 100);
    return factor < 1
      ? ` <b class="umt-shop-final-note is-cheaper">Final shop: ${percent}% off</b>`
      : ` <b class="umt-shop-final-note is-dearer">Final shop: +${percent}%</b>`;
  }

  function renderShop(game) {
    const state = game.state;
    const shop = game.getCuddleShop();
    const Worlds = window.CuddleWorlds;
    const world = Worlds ? Worlds.currentWorld(game) : { id: "woods", index: 0, name: "", skyTop: "#1f1a2c", skyBottom: "#120e17", accent: "#f6c956" };
    const greeting = GREETINGS[hashText(`${state.runId || "run"}:${shopKey(game)}`) % GREETINGS.length];
    const shelves = SHELVES.map(shelf => {
      const entries = shop.items.filter(entry => entry.shelf === shelf.id);
      if (!entries.length) return "";
      const icon = Worlds ? Worlds.iconSvg(shelf.kind) : "";
      return (
        `<section class="umt-shop-shelf umt-shelf-${shelf.id}" aria-label="${escapeHtml(shelf.title)}">`
        + `<header><span class="umt-shop-shelf-icon">${icon}</span><div><h2>${escapeHtml(shelf.title)}</h2>`
        + `<p>${escapeHtml(shelf.note)}${finalNote(game, shelf.id)}</p></div></header>`
        + `<div class="umt-shop-row">${entries.map(renderCard).join("")}</div>`
        + `<div class="umt-shop-plank" aria-hidden="true"></div>`
        + `</section>`
      );
    }).join("");
    const bag = bagChips(game);
    lastBought = null;
    return (
      `<div class="cuddle-shell cuddle-shop-shell umt-shop-v2" data-umt-world="${escapeHtml(world.id)}">`
      + `<header class="cuddle-header">`
      + `<div class="cuddle-header-side"><button class="cuddle-icon-btn" data-action="run-menu" aria-label="Cuddle menu">←</button></div>`
      + `<div class="cuddle-header-title"><span class="cuddle-eyebrow">${escapeHtml(world.name ? `World ${world.index + 1} · ${world.name}` : "Between stages")}</span>`
      + `<div class="cuddle-header-title-line"><h1>The Wandering Paw</h1></div></div>`
      + `<div class="cuddle-header-side cuddle-header-side-right"></div>`
      + `</header>`
      + `<main class="umt-shop-page">`
      + `<div class="umt-shop-hero">${stallScene(world)}`
      + `<p class="umt-shop-speech">${escapeHtml(greeting)}</p>`
      + `<div class="umt-shop-wallet" aria-label="You have $${shop.score}"><span class="umt-shop-coin" aria-hidden="true">$</span>`
      + `<strong>${shop.score}</strong></div></div>`
      + shelves
      + `<section class="umt-shop-bag" aria-label="In your bag"><h2>In your bag</h2>`
      + (bag.length
        ? `<ul>${bag.map(text => `<li>${escapeHtml(text)}</li>`).join("")}</ul>`
        : `<p>Nothing yet. Supplies you buy wait here until they're used.</p>`)
      + `</section>`
      // The stall already says it's open; only purchase news is worth a line.
      + (state.lastMessage && !/Wandering Paw is open/i.test(state.lastMessage)
        ? `<p class="umt-shop-message" role="status">${escapeHtml(state.lastMessage)}</p>`
        : "")
      + `<button type="button" class="cuddle-btn cuddle-btn-primary umt-shop-leave" data-cuddle-campaign-action="leave-shop">Back on the road</button>`
      + `</main></div>`
    );
  }

  window.CuddleCampaign = Object.freeze(Object.assign({}, window.CuddleCampaign, { renderShop }));
  window.CuddleShop = Object.freeze({
    shelves: SHELVES.map(shelf => ({ id: shelf.id, title: shelf.title, count: shelf.count, items: shelf.items.map(item => item.id) }))
  });
}());
