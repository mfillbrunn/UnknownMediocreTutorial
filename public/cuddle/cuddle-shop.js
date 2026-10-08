/* CUDDLE SHOP -- The Wandering Paw
 * Every shop stocks three shelves, all bought with money:
 *   For the road    2 one-time supplies for your next regular stage(s)
 *   For the boss    2 one-time supplies for the next boss
 *   Keeps forever   3 permanent upgrades for the rest of the run
 *   Trade           money for points on the spot: usually +10 points for
 *                   $10, sometimes (the rare deal) +30 points for $20
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
      blurb: "Start your next stage with a Joker card in hand." },
    { id: "roadAmber", icon: "reward-golden-compass.svg", title: "Amber Lens", cost: 12, stages: 1,
      blurb: "Your next stage opens with one letter of the answer revealed (not where it goes)." },
    { id: "roadLanterns", icon: "hint.svg", title: "Twin Lanterns", cost: 24, stages: 2,
      blurb: "Your next two stages each open with one exact letter already in place." },
    { id: "roadMulligans", icon: "mulligan.svg", title: "Spare Mulligans", cost: 14, stages: 2,
      blurb: "+1 mulligan in each of your next two stages." },
    { id: "roadTrove", icon: "reward-coins.svg", title: "Treasure Trove", cost: 15, stages: 2,
      blurb: "Two extra special tiles on the board in each of your next two stages." },
    { id: "roadWhisper", icon: "theme.svg", title: "Theme Whisper", cost: 10, stages: 2,
      blurb: "Your next two stages each reveal one theme of the answer." }
  ]);

  // Boss supplies ride on the Cuddle Coach boss kit (cuddle-coach-
  // expansion.js), which spends them at the start of the next boss.
  const BOSS_ITEMS = Object.freeze([
    { id: "bossCull", kit: "tenLetterCull", icon: "challenge-clean-letters.svg", title: "Ten-Letter Cull", cost: 24,
      blurb: "Ten letters that are not in the boss's answer are removed from play." },
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
      blurb: "The Cuddle Meter fills sooner: 2 fewer tiles, then 4, then 7 at level 3.",
      level: game => Math.max(0, int(coachOf(game).cuddleThresholdStacks)),
      apply: game => { const coach = coachOf(game); coach.cuddleThresholdStacks = Math.min(3, Math.max(0, int(coach.cuddleThresholdStacks)) + 1); } },
    { id: "keepTreasureMap", icon: "reward-green-value.svg", title: "Treasure Map", cost: 36, max: 3, bonus: "treasureMap",
      blurb: "One more special tile appears on the board every stage." },
    { id: "keepMulliganTiles", icon: "reward-quest-reroll.svg", title: "Mulligan Tiles", cost: 30, max: 3, bonus: "mulliganTiles",
      blurb: "Special tiles can hand you a free mulligan when you hit them." },
    { id: "keepJokerTiles", icon: "reward-joker-per-round.svg", title: "Joker Tiles", cost: 42, max: 3, bonus: "jokerTiles",
      blurb: "Special tiles can hand you a Joker when you hit them." },
    { id: "keepOracleTiles", icon: "reward-coach-earlier-hint.svg", title: "Oracle Tiles", cost: 60, max: 3, bonus: "oracleTiles",
      blurb: "Rare special tiles that reveal a letter's exact place when you hit them." }
  ].map(item => (item.bonus
    ? Object.assign(item, {
      level: game => Math.max(0, int(bonuses(game)[item.bonus])),
      apply: game => { const store = bonuses(game); store[item.bonus] = Math.max(0, int(store[item.bonus])) + 1; }
    })
    : item)));

  // One trade per shop, drawn like the rest of the stock: the Point Chest
  // turns up in about one shop in five, the Point Pouch otherwise.
  const TRADE_ITEMS = Object.freeze([
    { id: "tradePoints10", icon: "shop-points-pouch.svg", title: "Point Pouch", cost: 10, points: 10,
      blurb: "+10 points right now, toward the next boss." },
    { id: "tradePoints30", icon: "shop-points-chest.svg", title: "Point Chest", cost: 20, points: 30, rare: true,
      blurb: "+30 points right now, toward the next boss. A rare deal." }
  ]);
  const RARE_TRADE_CHANCE = 0.2;

  const SHELVES = Object.freeze([
    { id: "road", items: ROAD_ITEMS, count: 2, kind: "wordle", title: "For the road",
      note: "One-time supplies for your next regular stages" },
    { id: "boss", items: BOSS_ITEMS, count: 2, kind: "boss", title: "For the boss",
      note: "One-time supplies, spent when the next boss begins" },
    // Stocked from the whole reward pool, not a fixed list (keepStock).
    { id: "keep", items: [], count: 3, kind: "upgrade", title: "Keeps forever",
      note: "Any reward from the run's pool, priced by its rarity" },
    { id: "trade", items: TRADE_ITEMS, count: 1, kind: "shop", title: "Trade",
      note: "Swap money for points on the spot" }
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
  const FINAL_SHOP_PRICE = Object.freeze({ keep: 0.75, road: 1.5, boss: 1.5 });

  function isFinalShop(game) {
    const done = Array.isArray(game.state.bossGatesDone) ? game.state.bossGatesDone : [];
    return done.includes("before-3") && done.includes("before-7");
  }

  function priceOf(game, shelfId, base) {
    const factor = isFinalShop(game) ? FINAL_SHOP_PRICE[shelfId] || 1 : 1;
    return Math.max(1, Math.round((Number(base) || 0) * factor));
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

  function tradeFor(game, key) {
    const random = seeded(`${seedText(game)}:${key}:wandering-paw:trade`);
    return [random() < RARE_TRADE_CHANCE ? "tradePoints30" : "tradePoints10"];
  }

  // Three rewards from the whole pool (any rarity), each with a price
  // rolled inside its rarity's range (cuddle-economy-rarity-v8.js).
  function keepStock(game, key) {
    const economy = window.CuddleEconomyRarityV8;
    if (!economy || typeof economy.shopRewards !== "function") return [];
    return economy.shopRewards(game, 3, `${seedText(game)}:${key}:wandering-paw:keep`);
  }

  function isKeepEntry(entry) {
    return Boolean(entry) && typeof entry === "object" && typeof entry.key === "string";
  }

  function stockFor(game) {
    const shop = shopState(game);
    const key = shopKey(game);
    const saved = shop.stock[key];
    if (saved && Array.isArray(saved.road) && Array.isArray(saved.boss) && Array.isArray(saved.keep)) {
      // A shop stocked before the trade shelf existed gets one added, and
      // one from before the pool-wide keep shelf gets a fresh keep shelf.
      if (!Array.isArray(saved.trade)) saved.trade = tradeFor(game, key);
      if (!saved.keep.every(isKeepEntry)) saved.keep = keepStock(game, key);
      return saved;
    }
    const random = seeded(`${seedText(game)}:${key}:wandering-paw`);
    const stock = {};
    SHELVES.forEach(shelf => {
      if (shelf.id === "trade" || shelf.id === "keep") return;
      stock[shelf.id] = shuffled(shelf.items, random).slice(0, shelf.count).map(item => item.id);
    });
    stock.keep = keepStock(game, key);
    stock.trade = tradeFor(game, key);
    shop.stock[key] = stock;
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
    SHELVES.forEach(shelf => {
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
            title: entry.title,
            description: entry.description,
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

  function buyCuddleShopItem(itemId) {
    if (!this.state || this.state.status !== "shop") return { ok: false, error: "No shop is open." };
    const id = String(itemId || "");
    if (id.startsWith("keep:")) return buyKeepReward(this, id);
    const item = ALL_ITEMS.get(id);
    const shelf = SHELF_OF.get(id);
    const stock = stockFor(this);
    if (!item || !shelf || !(stock[shelf.id] || []).includes(id)) return { ok: false, error: "That isn't on the shelves here." };
    const bought = boughtHere(this);
    if (bought.includes(id)) return { ok: false, error: `${item.title} is sold out here.` };
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
    const icon = String(entry.icon || "");
    if (/\.svg$/i.test(icon)) return `<img src="${ICON_ROOT}${escapeHtml(icon)}" alt="" aria-hidden="true">`;
    const Icons = window.CuddleIcons;
    if (Icons && icon && Icons.hasEmoji(icon)) return `<span class="umt-shop-plate-ico">${Icons.svg(icon)}</span>`;
    return `<span class="umt-shop-plate-ico is-text">${escapeHtml(icon || "✦")}</span>`;
  }

  function durationChip(entry) {
    // A pool reward's chip names its rarity, in that rarity's colour.
    if (entry.shelf === "keep" && entry.tier) return `${entry.tier} · keeps`;
    if (entry.shelf === "trade") return entry.rare ? "Rare deal" : "Right now";
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
    const price = entry.purchased ? "Sold" : entry.maxed ? "Maxed" : entry.affordable ? `$${entry.cost}` : `Need $${entry.cost}`;
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
      + `<span class="umt-shop-price${entry.affordable ? " is-buyable" : ""}">`
      + (entry.affordable ? `<span class="umt-shop-coin" aria-hidden="true">$</span>${entry.cost}` : escapeHtml(price))
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
