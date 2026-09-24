/* CUDDLE SHOP -- The Wandering Paw
 * Every shop stocks three shelves, all bought with money:
 *   For the road    2 one-time supplies for your next regular stage(s)
 *   For the boss    2 one-time supplies for the next boss
 *   Keeps forever   3 permanent upgrades for the rest of the run
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
      blurb: "One more exact-position hint to spend in every eligible stage.",
      level: game => Math.max(0, int(coachOf(game).hintsPerRound)),
      apply: game => { const coach = coachOf(game); coach.hintsPerRound = Math.min(4, Math.max(0, int(coach.hintsPerRound)) + 1); } },
    { id: "keepMeter", ledgerId: "coachMeterThreshold", icon: "reward-cuddle-meter-reward.svg", title: "Softer Cuddle Meter", cost: 56, max: 3,
      blurb: "The Cuddle Meter fills one step sooner.",
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

  const SHELVES = Object.freeze([
    { id: "road", items: ROAD_ITEMS, count: 2, kind: "wordle", title: "For the road",
      note: "One-time supplies for your next regular stages" },
    { id: "boss", items: BOSS_ITEMS, count: 2, kind: "boss", title: "For the boss",
      note: "One-time supplies, spent when the next boss begins" },
    { id: "keep", items: KEEP_ITEMS, count: 3, kind: "upgrade", title: "Keeps forever",
      note: "Permanent upgrades for the rest of this run" }
  ]);
  const ALL_ITEMS = new Map([].concat(ROAD_ITEMS, BOSS_ITEMS, KEEP_ITEMS).map(item => [item.id, item]));
  const SHELF_OF = new Map();
  SHELVES.forEach(shelf => shelf.items.forEach(item => SHELF_OF.set(item.id, shelf)));

  const GREETINGS = Object.freeze([
    "Fresh stock, still warm from the road.",
    "Mind the whiskers. Everything's for sale.",
    "A boss waits up the path. I'd buy something.",
    "Coins in, courage out. That's the trade.",
    "Take your time. The boss isn't going anywhere."
  ]);

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

  function stockFor(game) {
    const shop = shopState(game);
    const key = shopKey(game);
    const saved = shop.stock[key];
    if (saved && Array.isArray(saved.road) && Array.isArray(saved.boss) && Array.isArray(saved.keep)) return saved;
    const random = seeded(`${game.state.runId || "run"}:${key}:wandering-paw`);
    const stock = {};
    SHELVES.forEach(shelf => {
      const eligible = shelf.items.filter(item => !(shelf.id === "keep" && isMaxed(game, item)));
      stock[shelf.id] = shuffled(eligible, random).slice(0, shelf.count).map(item => item.id);
    });
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

  function getCuddleShop() {
    const stock = stockFor(this);
    const bought = new Set(boughtHere(this));
    const wallet = money(this);
    const items = [];
    SHELVES.forEach(shelf => {
      (stock[shelf.id] || []).forEach(id => {
        const item = ALL_ITEMS.get(id);
        if (!item) return;
        const maxed = shelf.id === "keep" && isMaxed(this, item);
        const purchased = bought.has(id);
        items.push({
          id,
          shelf: shelf.id,
          kind: shelf.id === "keep" ? "upgrade" : shelf.id === "boss" ? "boss" : "one-time",
          icon: item.icon,
          title: item.title,
          description: item.blurb,
          cost: item.cost,
          stages: item.stages || 0,
          level: shelf.id === "keep" ? item.level(this) : null,
          max: item.max || null,
          maxed,
          purchased,
          affordable: !purchased && !maxed && wallet >= item.cost
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

  function buyCuddleShopItem(itemId) {
    if (!this.state || this.state.status !== "shop") return { ok: false, error: "No shop is open." };
    const id = String(itemId || "");
    const item = ALL_ITEMS.get(id);
    const shelf = SHELF_OF.get(id);
    const stock = stockFor(this);
    if (!item || !shelf || !(stock[shelf.id] || []).includes(id)) return { ok: false, error: "That isn't on the shelves here." };
    const bought = boughtHere(this);
    if (bought.includes(id)) return { ok: false, error: `${item.title} is sold out here.` };
    if (shelf.id === "keep" && isMaxed(this, item)) return { ok: false, error: `${item.title} is already maxed.` };
    if (money(this) < item.cost) return { ok: false, error: `You need $${item.cost} for ${item.title}.` };

    this.state.cuddleMoney = money(this) - item.cost;
    bought.push(id);
    const shop = shopState(this);
    if (shelf.id === "road") {
      if (id === "roadTrove") shop.tileStages += item.stages;
      else shop.pending[id] = Math.max(0, int(shop.pending[id])) + item.stages;
    } else if (shelf.id === "boss") {
      const coach = coachOf(this);
      coach.inventory[item.kit] = Math.max(0, int(coach.inventory[item.kit])) + 1;
    } else {
      item.apply(this);
      recordUpgrade(this, item);
    }
    lastBought = id;
    this.state.lastMessage = `${item.title} bought for $${item.cost}.`;
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
      this.state.mulligansLeft = Math.max(0, int(this.state.mulligansLeft)) + 1;
      notes.push("Spare Mulligans: +1 mulligan this stage.");
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

  function durationChip(entry) {
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
    if (entry.purchased) classes.push("is-sold");
    if (!entry.purchased && !entry.affordable) classes.push("is-short");
    if (entry.purchased && entry.id === lastBought) classes.push("is-fresh");
    return (
      `<button type="button" class="${classes.join(" ")}" data-cuddle-campaign-action="buy-shop-item"`
      + ` data-shop-item-id="${escapeHtml(entry.id)}"${disabled ? " disabled" : ""}`
      + ` aria-label="${escapeHtml(`${entry.title}, ${durationChip(entry)}, ${price}`)}">`
      + `<span class="umt-shop-chip">${escapeHtml(durationChip(entry))}</span>`
      + `<span class="umt-shop-plate"><img src="${ICON_ROOT}${escapeHtml(entry.icon)}" alt="" aria-hidden="true"></span>`
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
        + `<p>${escapeHtml(shelf.note)}</p></div></header>`
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
