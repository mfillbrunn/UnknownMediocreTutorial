// public/cuddle/cuddle-campaign.js
// Server-resolved category clues, continuous campaign map, and money shops.
(function () {
  "use strict";

  const engine = window.CuddleEngine;
  const originalQuestBook = window.CuddleQuestBook;
  if (!engine?.CuddleGame || !originalQuestBook) {
    console.warn("Cuddle campaign extension loaded before the engine or quest book.");
    return;
  }

  const CuddleGame = engine.CuddleGame;
  const CATEGORY_ENDPOINT = "/api/cuddle/category-hint";
  const SHOP_AFTER_ROUNDS = Object.freeze([2, 5, 8, 11]);
  const MAX_CATEGORY_SENSE = 6;
  // Regardless of Theme Sense or a redeemed Category Whisper, every round
  // guarantees at least one category by this guess -- earlier on Easy (more
  // guesses left to use the clue), latest on Hard (least help).
  const GUARANTEED_REVEAL_GUESS = Object.freeze({ easy: 4, medium: 5, hard: 6 });
  const CATEGORY_REWARD = Object.freeze({
    id: "revealCategory",
    icon: "🧭",
    title: "Category Whisper",
    description: "Find out one of the solution word's categories. If one is already known, reveal another."
  });
  const CATEGORY_SENSE_UPGRADE = Object.freeze({
    id: "categorySense",
    key: "categorySense",
    icon: "🔮",
    title: "Theme Sense",
    description: "From now on, reveal one category at the start of every solution. Stacks."
  });
  const SHOP_ITEMS = Object.freeze([
    Object.freeze({
      id: "joker",
      icon: "🃏",
      title: "Pocket Joker",
      cost: 18,
      description: "Gain one Joker charge. It waits in your inventory until used."
    }),
    Object.freeze({
      id: "extraMulligan",
      icon: "🔄",
      title: "Spare Mulligan",
      cost: 10,
      description: "The next eligible round starts with one additional mulligan."
    }),
    Object.freeze({
      id: "mulliganRefresh",
      icon: "♻️",
      title: "Mulligan Refill",
      cost: 18,
      description: "One time, when your mulligans reach zero, refill them to the round allowance."
    }),
    Object.freeze({
      id: "handSize",
      icon: "🎒",
      title: "Roomy Satchel",
      cost: 14,
      description: "The next round has one additional counted hand slot."
    }),
    Object.freeze({
      id: "yellowDetector",
      icon: "🟨",
      title: "Amber Lens",
      cost: 12,
      description: "At the start of the next eligible round, reveal one letter that is in the solution without revealing its position."
    })
  ]);

  // Vertical layout: index 0 (start) sits near the bottom of the SVG,
  // increasing index moves toward smaller y (up the page) -- so scrolling
  // the map is a vertical, mobile-friendly climb instead of a sideways pan.
  const MAP_VIEW_WIDTH = 300;
  const MAP_VIEW_HEIGHT = 1925;
  const MAP_NODES = Object.freeze([
    Object.freeze({ id: "start", kind: "start", label: "Start", short: "★", x: 219, y: 1840, region: 0 }),
    Object.freeze({ id: "round-1", kind: "round", round: 1, label: "Round 1", short: "1", x: 173, y: 1760, region: 0 }),
    Object.freeze({ id: "round-2", kind: "round", round: 2, label: "Round 2", short: "2", x: 215, y: 1675, region: 0 }),
    Object.freeze({ id: "shop-2", kind: "shop", afterRound: 2, label: "Shop", short: "$", x: 147, y: 1593, region: 0 }),
    Object.freeze({ id: "boss-before-3", kind: "boss", gate: "before-3", label: "Boss I", short: "B", x: 93, y: 1507, region: 0 }),
    Object.freeze({ id: "round-3", kind: "round", round: 3, label: "Round 3", short: "3", x: 155, y: 1419, region: 0 }),

    Object.freeze({ id: "round-4", kind: "round", round: 4, label: "Round 4", short: "4", x: 213, y: 1333, region: 1 }),
    Object.freeze({ id: "round-5", kind: "round", round: 5, label: "Round 5", short: "5", x: 151, y: 1245, region: 1 }),
    Object.freeze({ id: "shop-5", kind: "shop", afterRound: 5, label: "Shop", short: "$", x: 89, y: 1157, region: 1 }),
    Object.freeze({ id: "round-6", kind: "round", round: 6, label: "Round 6", short: "6", x: 147, y: 1069, region: 1 }),
    Object.freeze({ id: "boss-before-7", kind: "boss", gate: "before-7", label: "Boss II", short: "B", x: 215, y: 981, region: 1 }),

    Object.freeze({ id: "round-7", kind: "round", round: 7, label: "Round 7", short: "7", x: 163, y: 893, region: 2 }),
    Object.freeze({ id: "round-8", kind: "round", round: 8, label: "Round 8", short: "8", x: 89, y: 805, region: 2 }),
    Object.freeze({ id: "shop-8", kind: "shop", afterRound: 8, label: "Shop", short: "$", x: 143, y: 717, region: 2 }),
    Object.freeze({ id: "round-9", kind: "round", round: 9, label: "Round 9", short: "9", x: 215, y: 629, region: 2 }),
    Object.freeze({ id: "boss-before-10", kind: "boss", gate: "before-10", label: "Boss III", short: "B", x: 155, y: 541, region: 2 }),

    Object.freeze({ id: "round-10", kind: "round", round: 10, label: "Round 10", short: "10", x: 89, y: 453, region: 3 }),
    Object.freeze({ id: "round-11", kind: "round", round: 11, label: "Round 11", short: "11", x: 151, y: 365, region: 3 }),
    Object.freeze({ id: "shop-11", kind: "shop", afterRound: 11, label: "Shop", short: "$", x: 215, y: 277, region: 3 }),
    Object.freeze({ id: "round-12", kind: "round", round: 12, label: "Round 12", short: "12", x: 155, y: 189, region: 3 }),
    Object.freeze({ id: "boss-final", kind: "boss", gate: "final", label: "Final Boss", short: "B", x: 81, y: 101, region: 4 })
  ]);
  const MAP_REGIONS = Object.freeze([
    Object.freeze({ id: "woods", name: "Whispering Woods", subtitle: "Words take root", y: 1375, height: 510 }),
    Object.freeze({ id: "lakes", name: "Misty Lakes", subtitle: "Reflections hide the truth", y: 935, height: 440 }),
    Object.freeze({ id: "caverns", name: "Crystal Caverns", subtitle: "Clues glow in the dark", y: 495, height: 440 }),
    Object.freeze({ id: "isles", name: "Floating Isles", subtitle: "The path rises", y: 145, height: 350 }),
    Object.freeze({ id: "citadel", name: "Eclipse Citadel", subtitle: "The last answer waits", y: 40, height: 105 })
  ]);

  const hintQueues = new WeakMap();
  const automaticTargets = new WeakMap();
  // UI-only, not persisted: whether the round-intro map screen's stats
  // drawer is open, and which round it was opened for (so a fresh round's
  // intro always starts collapsed rather than remembering the last one).
  let mapStatsOpen = false;
  let mapStatsOpenRound = null;

  function clampInteger(value, minimum, maximum) {
    const number = Math.floor(Number(value) || 0);
    return Math.max(minimum, Math.min(maximum, number));
  }

  function uniqueStrings(values) {
    return [...new Set((Array.isArray(values) ? values : []).map(value => String(value || "")).filter(Boolean))];
  }

  function shuffle(items, random = Math.random) {
    const copy = items.slice();
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(random() * (index + 1));
      [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
    }
    return copy;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function freshCampaignState() {
    return {
      version: 1,
      categorySense: 0,
      revealedCategories: [],
      categoryRoundSecret: "",
      categoryPending: false,
      categoryExhausted: false,
      noCategory: false,
      categoryNotice: "",
      guaranteedRevealDone: false,
      shopsVisited: [],
      activeShopRound: null,
      shopPurchases: {},
      inventory: {
        extraMulligan: 0,
        mulliganRefresh: 0,
        handSize: 0,
        yellowDetector: 0
      },
      activeHandBonus: 0,
      lastYellowDetectorLetter: ""
    };
  }

  function ensureCampaign(game) {
    if (!game?.state) return null;
    const defaults = freshCampaignState();
    const source = game.state.cuddleCampaign && typeof game.state.cuddleCampaign === "object"
      ? game.state.cuddleCampaign
      : {};
    const campaign = {
      ...defaults,
      ...source,
      inventory: {
        ...defaults.inventory,
        ...(source.inventory && typeof source.inventory === "object" ? source.inventory : {})
      },
      shopPurchases: source.shopPurchases && typeof source.shopPurchases === "object"
        ? source.shopPurchases
        : {}
    };
    campaign.categorySense = clampInteger(campaign.categorySense, 0, MAX_CATEGORY_SENSE);
    campaign.revealedCategories = (Array.isArray(campaign.revealedCategories) ? campaign.revealedCategories : [])
      .filter(item => item && typeof item === "object" && item.id && item.label)
      .map(item => ({ id: String(item.id), label: String(item.label), group: String(item.group || "other") }));
    campaign.shopsVisited = [...new Set(
      (Array.isArray(campaign.shopsVisited) ? campaign.shopsVisited : [])
        .map(Number)
        .filter(round => SHOP_AFTER_ROUNDS.includes(round))
    )].sort((a, b) => a - b);
    campaign.activeShopRound = SHOP_AFTER_ROUNDS.includes(Number(campaign.activeShopRound))
      ? Number(campaign.activeShopRound)
      : null;
    Object.keys(defaults.inventory).forEach(key => {
      campaign.inventory[key] = Math.max(0, Math.floor(Number(campaign.inventory[key]) || 0));
    });
    campaign.activeHandBonus = Math.max(0, Math.min(1, Math.floor(Number(campaign.activeHandBonus) || 0)));
    campaign.categoryPending = Boolean(campaign.categoryPending);
    campaign.categoryExhausted = Boolean(campaign.categoryExhausted);
    campaign.noCategory = Boolean(campaign.noCategory);
    campaign.guaranteedRevealDone = Boolean(campaign.guaranteedRevealDone);
    game.state.cuddleCampaign = campaign;
    return campaign;
  }

  function ensureMegaState(game) {
    if (!game.state.megaState || typeof game.state.megaState !== "object") {
      game.state.megaState = {};
    }
    return game.state.megaState;
  }

  function resetCategoryStateForSecret(game) {
    const campaign = ensureCampaign(game);
    if (!campaign) return null;
    const secret = String(game.state.secret || "").toUpperCase();
    if (campaign.categoryRoundSecret !== secret) {
      campaign.categoryRoundSecret = secret;
      campaign.revealedCategories = [];
      campaign.categoryPending = false;
      campaign.categoryExhausted = false;
      campaign.noCategory = false;
      campaign.categoryNotice = "";
      campaign.guaranteedRevealDone = false;
      automaticTargets.delete(game);
    }
    return campaign;
  }

  function emitCampaignUpdate(game) {
    try {
      window.dispatchEvent(new CustomEvent("cuddle:campaign-update", {
        detail: { runId: game?.state?.runId || null }
      }));
    } catch {
      // Rendering still updates on the player's next action in older browsers.
    }
  }

  async function performCategoryRequest(game, count, source) {
    const campaign = resetCategoryStateForSecret(game);
    const secret = String(game?.state?.secret || "").toUpperCase();
    const runId = game?.state?.runId;
    if (!campaign || !/^[A-Z]{5}$/.test(secret)) return;
    if (campaign.noCategory || campaign.categoryExhausted) return;

    try {
      const response = await fetch(CATEGORY_ENDPOINT, {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          word: secret,
          knownCategories: campaign.revealedCategories.map(item => item.id),
          count: clampInteger(count, 1, 8)
        })
      });
      if (!response.ok) throw new Error(`Category service returned ${response.status}.`);
      const payload = await response.json();
      if (game?.state?.runId !== runId || String(game?.state?.secret || "").toUpperCase() !== secret) return;
      const liveCampaign = resetCategoryStateForSecret(game);
      const additions = (Array.isArray(payload.categories) ? payload.categories : [])
        .filter(item => item && item.id && item.label)
        .map(item => ({ id: String(item.id), label: String(item.label), group: String(item.group || "other") }));
      const seen = new Set(liveCampaign.revealedCategories.map(item => item.id));
      additions.forEach(item => {
        if (!seen.has(item.id)) {
          liveCampaign.revealedCategories.push(item);
          seen.add(item.id);
        }
      });
      liveCampaign.noCategory = Boolean(payload.noCategory);
      liveCampaign.categoryExhausted = Boolean(payload.exhausted);
      // This message names the revealed category outright (e.g. "Category
      // revealed: Animals."), so it must never reach state.lastMessage --
      // that line renders on the main guessing screen, which would put the
      // theme on screen exactly where it isn't supposed to appear. It's
      // kept only for the between-round map badge, which already gates on
      // the player having engaged the mechanic at all.
      liveCampaign.categoryNotice = String(payload.message || "");
      game.save();
      emitCampaignUpdate(game);
    } catch (error) {
      if (game?.state?.runId !== runId || String(game?.state?.secret || "").toUpperCase() !== secret) return;
      const liveCampaign = resetCategoryStateForSecret(game);
      liveCampaign.categoryNotice = "Category clue unavailable.";
      if (source === "automatic") automaticTargets.delete(game);
      game.save();
      emitCampaignUpdate(game);
      console.warn("Cuddle category hint failed:", error);
    }
  }

  function queueCategoryReveal(game, count = 1, source = "quest") {
    const campaign = resetCategoryStateForSecret(game);
    if (!campaign) return "Category clue unavailable.";
    if (campaign.noCategory) return "No category.";
    if (campaign.categoryExhausted) return "No more categories.";
    campaign.categoryPending = true;
    campaign.categoryNotice = source === "automatic"
      ? "Listening for the solution's theme…"
      : "Listening for another category…";
    const previous = hintQueues.get(game) || Promise.resolve();
    const next = previous
      .catch(() => undefined)
      .then(() => performCategoryRequest(game, count, source));
    hintQueues.set(game, next);
    next.finally(() => {
      if (hintQueues.get(game) !== next) return;
      const liveCampaign = ensureCampaign(game);
      if (liveCampaign) liveCampaign.categoryPending = false;
      game.save();
      emitCampaignUpdate(game);
    });
    return campaign.categoryNotice;
  }

  function ensureAutomaticCategories(game) {
    const campaign = resetCategoryStateForSecret(game);
    if (!campaign || campaign.categorySense <= 0 || campaign.noCategory || campaign.categoryExhausted) return;
    const key = `${game.state.runId}:${game.state.secret}`;
    const marker = automaticTargets.get(game);
    const alreadyRequested = marker?.key === key
      ? Math.max(marker.target, campaign.revealedCategories.length)
      : campaign.revealedCategories.length;
    const target = campaign.categorySense;
    const needed = target - alreadyRequested;
    if (needed <= 0) return;
    automaticTargets.set(game, { key, target });
    queueCategoryReveal(game, needed, "automatic");
  }

  function guaranteedRevealGuess(game) {
    const difficulty = game?.state?.megaState?.difficulty;
    return GUARANTEED_REVEAL_GUESS[difficulty] || GUARANTEED_REVEAL_GUESS.hard;
  }

  // Fires once per round, on top of (not instead of) Theme Sense / Category
  // Whisper -- even a run that has never touched the theme mechanic gets one
  // category by this guess. queueCategoryReveal already no-ops harmlessly if
  // every category is already known or the word has none.
  function ensureGuaranteedCategoryReveal(game) {
    const campaign = resetCategoryStateForSecret(game);
    if (!campaign || campaign.guaranteedRevealDone) return;
    const guessesUsed = Number(game.state?.guessesUsed || 0);
    if (guessesUsed < guaranteedRevealGuess(game) - 1) return;
    campaign.guaranteedRevealDone = true;
    queueCategoryReveal(game, 1, "guaranteed");
  }

  function installQuestReward() {
    const rewards = (Array.isArray(originalQuestBook.REWARDS) ? originalQuestBook.REWARDS : [])
      .filter(item => item?.id !== CATEGORY_REWARD.id)
      .map(item => ({ ...item }));
    rewards.push({ ...CATEGORY_REWARD });
    function getReward(id) {
      if (id === CATEGORY_REWARD.id) return { ...CATEGORY_REWARD };
      return originalQuestBook.getReward?.(id) || null;
    }
    function rewardChoices(count = 3, random = Math.random) {
      const limit = Math.max(0, Math.min(Math.floor(Number(count) || 0), rewards.length));
      return shuffle(rewards, random).slice(0, limit).map(item => ({ ...item }));
    }
    window.CuddleQuestBook = Object.freeze({
      ...originalQuestBook,
      REWARDS: Object.freeze(rewards.map(item => Object.freeze({ ...item }))),
      getReward,
      rewardChoices
    });
  }

  installQuestReward();

  const originalHydrateState = CuddleGame.prototype._hydrateState;
  if (typeof originalHydrateState === "function") {
    CuddleGame.prototype._hydrateState = function hydrateCampaignState() {
      const result = originalHydrateState.call(this);
      ensureCampaign(this);
      resetCategoryStateForSecret(this);
      Promise.resolve().then(() => ensureAutomaticCategories(this));
      return result;
    };
  }

  const originalStartNew = CuddleGame.prototype.startNew;
  CuddleGame.prototype.startNew = function startNewCampaign(...args) {
    const result = originalStartNew.apply(this, args);
    ensureCampaign(this);
    resetCategoryStateForSecret(this);
    Promise.resolve().then(() => ensureAutomaticCategories(this));
    return result;
  };

  const originalGetHandLimit = CuddleGame.prototype.getHandLimit;
  CuddleGame.prototype.getHandLimit = function getCampaignHandLimit() {
    const base = Number(originalGetHandLimit.call(this)) || 1;
    return Math.max(1, base + Number(ensureCampaign(this)?.activeHandBonus || 0));
  };

  function applyYellowDetector(game) {
    const campaign = ensureCampaign(game);
    if (!campaign || campaign.inventory.yellowDetector <= 0) return "";
    const known = new Set(Array.isArray(game.state.knownPresent) ? game.state.knownPresent : []);
    const candidates = uniqueStrings(String(game.state.secret || "").toUpperCase().split(""))
      .filter(letter => /^[A-Z]$/.test(letter) && !known.has(letter));
    if (!candidates.length) return "";
    const letter = candidates[Math.floor(game.random() * candidates.length)];
    campaign.inventory.yellowDetector -= 1;
    campaign.lastYellowDetectorLetter = letter;
    game.state.knownPresent = uniqueStrings([...(game.state.knownPresent || []), letter]).sort();
    game._syncInfiniteCards?.();
    game.drawToHandLimit?.();
    return `Amber Lens: ${letter} is in the solution, but its position remains hidden.`;
  }

  const originalBeginRound = CuddleGame.prototype._beginRound;
  CuddleGame.prototype._beginRound = function beginCampaignRound(...args) {
    const before = ensureCampaign(this);
    const useHandBonus = Boolean(before?.inventory.handSize > 0);
    if (before) before.activeHandBonus = useHandBonus ? 1 : 0;
    const result = originalBeginRound.apply(this, args);
    const campaign = resetCategoryStateForSecret(this);
    if (useHandBonus && campaign.inventory.handSize > 0) campaign.inventory.handSize -= 1;

    const notes = [];
    const mulligansAllowed = this.state.boss?.id !== "noMulligans";
    if (mulligansAllowed && campaign.inventory.extraMulligan > 0) {
      campaign.inventory.extraMulligan -= 1;
      this.state.mulligansLeft = Number(this.state.mulligansLeft || 0) + 1;
      notes.push("Spare Mulligan added one mulligan for this round.");
    }
    if (campaign.inventory.yellowDetector > 0) {
      const detectorMessage = applyYellowDetector(this);
      if (detectorMessage) notes.push(detectorMessage);
    }
    if (notes.length) this.state.lastMessage = `${this.state.lastMessage || ""} ${notes.join(" ")}`.trim();
    ensureAutomaticCategories(this);
    return result;
  };

  const originalSubmitDraft = CuddleGame.prototype.submitDraft;
  CuddleGame.prototype.submitDraft = function submitDraftWithGuaranteedTheme(...args) {
    const result = originalSubmitDraft.apply(this, args);
    if (result?.ok) ensureGuaranteedCategoryReveal(this);
    return result;
  };

  const originalApplyRewardEffect = CuddleGame.prototype._applyRewardEffect;
  CuddleGame.prototype._applyRewardEffect = function applyCampaignReward(rewardId) {
    if (rewardId === CATEGORY_REWARD.id) {
      return queueCategoryReveal(this, 1, "quest");
    }
    return originalApplyRewardEffect.call(this, rewardId);
  };

  const originalUpgradeCatalog = CuddleGame.prototype._upgradeCatalog;
  CuddleGame.prototype._upgradeCatalog = function campaignUpgradeCatalog() {
    const catalogResult = originalUpgradeCatalog.call(this);
    const base = Array.isArray(catalogResult) ? catalogResult.slice() : [];
    const campaign = ensureCampaign(this);
    const specialPhase = this.state?.upgradePhase === "difficultyStart" || this.state?.upgradePhase === "milestone";
    if (!specialPhase && campaign.categorySense < MAX_CATEGORY_SENSE
        && !base.some(choice => choice?.id === CATEGORY_SENSE_UPGRADE.id)) {
      base.push({ ...CATEGORY_SENSE_UPGRADE });
    }
    return base;
  };

  const originalChooseUpgrade = CuddleGame.prototype.chooseUpgrade;
  CuddleGame.prototype.chooseUpgrade = function chooseCampaignUpgrade(choiceKey) {
    const choice = (this.state?.upgradeChoices || []).find(item => item?.key === choiceKey);
    if (choice?.id !== CATEGORY_SENSE_UPGRADE.id) {
      return originalChooseUpgrade.call(this, choiceKey);
    }
    if (this.state.status !== "upgrade") return { ok: false, error: "No upgrade choice is open." };
    if (this.state.upgradePhase === "difficultyStart" || this.state.upgradePhase === "milestone") {
      return { ok: false, error: "Theme Sense is available only between completed rounds." };
    }
    const campaign = ensureCampaign(this);
    campaign.categorySense = clampInteger(campaign.categorySense + 1, 0, MAX_CATEGORY_SENSE);
    this.state.lastMessage = `Theme Sense acquired: future solutions reveal up to ${campaign.categorySense} ${campaign.categorySense === 1 ? "category" : "categories"}.`;
    this.state.upgradeChoices = [];
    this.state.upgradePhase = null;
    this.state.upgradeMilestone = null;
    this._advanceRound();
    this.save();
    return { ok: true, message: this.state.lastMessage };
  };

  const originalAdvanceRound = CuddleGame.prototype._advanceRound;
  CuddleGame.prototype._advanceRound = function advanceThroughCampaignMap(...args) {
    const campaign = ensureCampaign(this);
    const completedRound = Number(this.state?.round || 0);
    const normalRoundComplete = !this.state?.lastClearedBossGate
      && !this.state?.boss
      && Number(this.state?.lastRoundSummary?.round || 0) === completedRound;
    if (normalRoundComplete
        && SHOP_AFTER_ROUNDS.includes(completedRound)
        && !campaign.shopsVisited.includes(completedRound)) {
      campaign.shopsVisited.push(completedRound);
      campaign.shopsVisited.sort((a, b) => a - b);
      campaign.activeShopRound = completedRound;
      campaign.shopPurchases[String(completedRound)] = [];
      this.state.status = "shop";
      this.state.upgradeChoices = [];
      this.state.upgradePhase = null;
      this.state.upgradeMilestone = null;
      this.state.lastMessage = "The Wandering Paw shop has appeared on the road.";
      this.save();
      return undefined;
    }
    return originalAdvanceRound.apply(this, args);
  };

  CuddleGame.prototype.getCuddleShop = function getCuddleShop() {
    const campaign = ensureCampaign(this);
    const shopRound = campaign.activeShopRound;
    const purchased = new Set(campaign.shopPurchases[String(shopRound)] || []);
    return {
      round: shopRound,
      score: Number(this.state?.score || 0),
      nextTarget: this.getTarget(Math.min(engine.THRESHOLDS.length, Number(this.state?.round || 1) + 1)),
      items: SHOP_ITEMS.map(item => ({
        ...item,
        purchased: purchased.has(item.id),
        affordable: Number(this.state?.score || 0) >= item.cost
      })),
      inventory: { ...campaign.inventory },
      jokerCharges: Math.max(0, Number(this.state?.megaState?.jokerCharges || 0))
    };
  };

  CuddleGame.prototype.buyCuddleShopItem = function buyCuddleShopItem(itemId) {
    if (this.state?.status !== "shop") return { ok: false, error: "No shop is open." };
    const campaign = ensureCampaign(this);
    const item = SHOP_ITEMS.find(candidate => candidate.id === itemId);
    if (!item) return { ok: false, error: "That shop item does not exist." };
    const purchaseKey = String(campaign.activeShopRound);
    const purchases = Array.isArray(campaign.shopPurchases[purchaseKey])
      ? campaign.shopPurchases[purchaseKey]
      : [];
    if (purchases.includes(item.id)) return { ok: false, error: "That item is sold out in this shop." };
    if (Number(this.state.score || 0) < item.cost) return { ok: false, error: `You need $${item.cost}.` };

    this.state.score -= item.cost;
    purchases.push(item.id);
    campaign.shopPurchases[purchaseKey] = purchases;
    if (item.id === "joker") {
      const mega = ensureMegaState(this);
      mega.jokerCharges = Number(mega.jokerCharges || 0) + 1;
      mega.hasJokerUnlocked = true;
    } else if (Object.prototype.hasOwnProperty.call(campaign.inventory, item.id)) {
      campaign.inventory[item.id] += 1;
    }
    this.state.lastMessage = `${item.title} purchased for $${item.cost}.`;
    this.save();
    return { ok: true, message: this.state.lastMessage };
  };

  CuddleGame.prototype.leaveCuddleShop = function leaveCuddleShop() {
    if (this.state?.status !== "shop") return { ok: false, error: "No shop is open." };
    const campaign = ensureCampaign(this);
    campaign.activeShopRound = null;
    this.state.status = "advancing";
    originalAdvanceRound.call(this);
    this.save();
    return { ok: true, message: this.state.lastMessage || "The journey continues." };
  };

  const originalMulligan = CuddleGame.prototype.mulligan;
  CuddleGame.prototype.mulligan = function mulliganWithShopRefill(cardIds) {
    const result = originalMulligan.call(this, cardIds);
    if (!result?.ok) return result;
    const campaign = ensureCampaign(this);
    if (Number(this.state.mulligansLeft || 0) <= 0 && campaign.inventory.mulliganRefresh > 0) {
      campaign.inventory.mulliganRefresh -= 1;
      this.state.mulligansLeft = Math.max(1, Number(this.getMulliganAllowance?.() || 1));
      this.state.lastMessage = `Mulligan Refill restored ${this.state.mulligansLeft} mulligan${this.state.mulligansLeft === 1 ? "" : "s"}.`;
      this.save();
      return { ...result, message: this.state.lastMessage };
    }
    return result;
  };

  const originalCurrentModifications = CuddleGame.prototype.getCurrentModifications;
  if (typeof originalCurrentModifications === "function") {
    CuddleGame.prototype.getCurrentModifications = function getCampaignModifications() {
      const originalLines = originalCurrentModifications.call(this);
      const lines = Array.isArray(originalLines) ? originalLines.slice() : [];
      const campaign = ensureCampaign(this);
      if (campaign.categorySense > 0) {
        lines.push(`Theme Sense: reveal up to ${campaign.categorySense} ${campaign.categorySense === 1 ? "category" : "categories"} for every solution`);
      }
      lines.push(`A category is guaranteed to be revealed by guess ${guaranteedRevealGuess(this)} this round`);
      const inventoryCount = Object.values(campaign.inventory).reduce((sum, value) => sum + Number(value || 0), 0)
        + Number(this.state?.megaState?.jokerCharges || 0);
      if (inventoryCount > 0) lines.push(`Shop inventory: ${inventoryCount} one-use item${inventoryCount === 1 ? "" : "s"}`);
      return lines;
    };
  }

  function gateForCurrentBoss(state) {
    return state?.boss?.gate
      || state?.bossOffer?.[0]?.gate
      || (state?.lastClearedBossGate && state.status === "upgrade" ? state.lastClearedBossGate : null);
  }

  function currentMapNode(game) {
    const state = game.state;
    const campaign = ensureCampaign(game);
    if (state.status === "won") return MAP_NODES.find(node => node.id === "boss-final");
    if (state.status === "shop" && campaign.activeShopRound) {
      return MAP_NODES.find(node => node.id === `shop-${campaign.activeShopRound}`);
    }
    const gate = gateForCurrentBoss(state);
    if (gate) return MAP_NODES.find(node => node.gate === gate) || MAP_NODES[0];
    return MAP_NODES.find(node => node.id === `round-${state.round}`) || MAP_NODES[0];
  }

  // Whichever single click actually moves the player past the stage they
  // are currently standing on -- starting the round/boss they're about to
  // play, or leaving a shop they've finished browsing. Every other pause
  // (choosing a reward, choosing a boss) is resolved on its own screen, not
  // by tapping the map, so this returns null there and the map stays
  // read-only.
  function mapAdvanceAction(game) {
    const state = game?.state;
    if (!state) return null;
    if (state.roundIntroPending) return "dismiss-round-intro";
    if (state.status === "shop") return "leave-shop";
    return null;
  }

  function nodeIsCleared(node, game, currentIndex) {
    const state = game.state;
    const campaign = ensureCampaign(game);
    const index = MAP_NODES.indexOf(node);
    if (state.status === "won") return true;
    if (node.kind === "shop") return campaign.shopsVisited.includes(node.afterRound)
      && campaign.activeShopRound !== node.afterRound;
    if (node.kind === "boss") return (state.bossGatesDone || []).includes(node.gate);
    if (node.kind === "round") {
      if (node.round < Number(state.round || 1)) return true;
      const finishedCurrentRound = node.round === Number(state.round || 1)
        && ["upgrade", "shop"].includes(state.status)
        && !state.boss
        && !state.lastClearedBossGate;
      return finishedCurrentRound;
    }
    return index < currentIndex;
  }

  function mapNodeShape(node) {
    if (node.kind === "shop") {
      return `<rect class="cuddle-map-node-shape" x="-15" y="-15" width="30" height="30" rx="5" transform="rotate(45)"></rect>`;
    }
    if (node.kind === "boss") {
      return `<path class="cuddle-map-node-shape" d="M0,-20 17,-10 17,10 0,20 -17,10 -17,-10Z"></path>`;
    }
    return `<circle class="cuddle-map-node-shape" r="16"></circle>`;
  }

  function renderMapDecorations() {
    return `
      <g class="cuddle-map-decor cuddle-map-decor-woods" aria-hidden="true">
        <path d="M237 1853l-48-18 48-18zM225 1807l-40-15 40-15zM71 1475l-48-18 48-18zM89 1433l-36-14 36-14z"></path>
        <circle cx="47" cy="1635" r="20"></circle><circle cx="37" cy="1609" r="13"></circle>
      </g>
      <g class="cuddle-map-decor cuddle-map-decor-lakes" aria-hidden="true">
        <path d="M244 1359q-26-80 0-160t0-160 0-90"></path>
        <path d="M50 1310q-20-18 0-36q-20-18 0-36"></path>
        <circle cx="45" cy="1005" r="23"></circle>
      </g>
      <g class="cuddle-map-decor cuddle-map-decor-caverns" aria-hidden="true">
        <path d="M253 913l-58-16 58-17zM255 875l-40-11 40-12zM53 605l-52-16 52-16zM59 565l-34-11 34-12z"></path>
      </g>
      <g class="cuddle-map-decor cuddle-map-decor-isles" aria-hidden="true">
        <path d="M249 473q-26-38 0-76l14 14v48zM55 313q-28-40 0-80l15 15v50z"></path>
        <path d="M41 415q-18-16 0-32q-18-16 0-32"></path>
      </g>
      <g class="cuddle-map-decor cuddle-map-decor-citadel" aria-hidden="true">
        <path d="M252 139h-92v-18h-34l20-10-20-10h34v-18h92z"></path>
        <circle cx="25" cy="94" r="25"></circle><circle class="cuddle-map-eclipse-cut" cx="19" cy="84" r="25"></circle>
      </g>`;
  }

  function renderCat(node) {
    return `
      <g class="cuddle-map-cat" transform="translate(${node.x} ${node.y - 37})" aria-label="You are here">
        <path class="cuddle-map-cat-tail" d="M-12 8q-24 4-18-13q4-10 13-3"></path>
        <ellipse class="cuddle-map-cat-body" cx="0" cy="7" rx="13" ry="15"></ellipse>
        <circle class="cuddle-map-cat-head" cx="0" cy="-7" r="12"></circle>
        <path class="cuddle-map-cat-ear" d="M-10-14l2-12 7 9M10-14L8-26l-7 9"></path>
        <circle class="cuddle-map-cat-eye" cx="-4" cy="-8" r="1.5"></circle>
        <circle class="cuddle-map-cat-eye" cx="4" cy="-8" r="1.5"></circle>
      </g>`;
  }

  function renderCategoryBadge(campaign) {
    // Show nothing at all -- not even a "hidden" placeholder -- unless the
    // player has actually engaged the theme mechanic this round (Theme
    // Sense, a redeemed Category Whisper, or the guaranteed reveal has
    // fired). A round that hasn't touched categories yet shouldn't
    // advertise that the feature exists.
    const engaged = campaign.categorySense > 0
      || campaign.revealedCategories.length > 0
      || campaign.categoryPending
      || campaign.noCategory
      || campaign.categoryExhausted;
    if (!engaged) return "";
    let content;
    if (campaign.revealedCategories.length) {
      content = campaign.revealedCategories
        .map(item => `<span class="cuddle-category-chip">${escapeHtml(item.label)}</span>`)
        .join("");
    } else if (campaign.noCategory) {
      content = `<span class="cuddle-category-chip is-empty">No category</span>`;
    } else if (campaign.categoryPending) {
      content = `<span class="cuddle-category-chip is-pending">Listening…</span>`;
    } else {
      content = `<span class="cuddle-category-chip is-hidden">Categories hidden</span>`;
    }
    return `
      <div class="cuddle-category-readout" aria-label="Known solution categories">
        <span class="cuddle-category-label">Solution theme</span>
        <div class="cuddle-category-chips">${content}</div>
        ${campaign.categorySense > 0 ? `<span class="cuddle-category-sense">Theme Sense ×${campaign.categorySense}</span>` : ""}
      </div>`;
  }

  function renderMap(game) {
    if (!game?.state) return "";
    const campaign = ensureCampaign(game);
    const current = currentMapNode(game);
    const currentIndex = Math.max(0, MAP_NODES.indexOf(current));
    const region = MAP_REGIONS[current.region] || MAP_REGIONS[0];
    const advanceAction = mapAdvanceAction(game);
    const routeSegments = MAP_NODES.slice(0, -1).map((node, index) => {
      const next = MAP_NODES[index + 1];
      const cleared = index < currentIndex;
      return `<line class="cuddle-map-route-segment ${cleared ? "is-cleared" : ""}" x1="${node.x}" y1="${node.y}" x2="${next.x}" y2="${next.y}"></line>`;
    }).join("");
    const nodes = MAP_NODES.map((node, index) => {
      const isCurrent = index === currentIndex;
      const actionable = isCurrent && Boolean(advanceAction);
      const classes = [
        "cuddle-map-node",
        `is-${node.kind}`,
        isCurrent ? "is-current" : "",
        nodeIsCleared(node, game, currentIndex) ? "is-cleared" : "",
        index > currentIndex ? "is-future" : "",
        actionable ? "is-actionable" : ""
      ].filter(Boolean).join(" ");
      const actionAttrs = actionable
        ? ` data-cuddle-campaign-action="map-advance" role="button" tabindex="0" aria-label="${escapeHtml(node.label)}: tap to continue"`
        : "";
      return `
        <g class="${classes}" transform="translate(${node.x} ${node.y})" data-map-node-id="${escapeHtml(node.id)}"${actionAttrs}>
          <title>${escapeHtml(node.label)}${actionable ? " -- tap to continue" : ""}</title>
          ${mapNodeShape(node)}
          <text class="cuddle-map-node-symbol" text-anchor="middle" dominant-baseline="central">${escapeHtml(node.short)}</text>
          <text class="cuddle-map-node-label" text-anchor="middle" y="31">${escapeHtml(node.label)}</text>
        </g>`;
    }).join("");
    const regionRects = MAP_REGIONS.map(item => `
      <g class="cuddle-map-region is-${escapeHtml(item.id)}">
        <rect x="0" y="${item.y}" width="${MAP_VIEW_WIDTH}" height="${item.height}"></rect>
        <text x="20" y="${item.y + 26}">${escapeHtml(item.name)}</text>
      </g>`).join("");

    return `
      <section class="cuddle-campaign-map-card" aria-label="Continuous Cuddle campaign map">
        <div class="cuddle-campaign-map-heading">
          <div>
            <span class="cuddle-map-kicker">CHAPTER ${current.region + 1}</span>
            <h2>${escapeHtml(region.name)}</h2>
            <p>${escapeHtml(region.subtitle)}</p>
          </div>
          ${renderCategoryBadge(campaign)}
        </div>
        ${advanceAction ? `<p class="cuddle-map-advance-hint">The lit stage is ready -- tap it to continue.</p>` : ""}
        <div class="cuddle-campaign-map-scroll" data-cuddle-map-scroll data-map-current-y="${current.y}">
          <svg class="cuddle-campaign-map-svg" viewBox="0 0 ${MAP_VIEW_WIDTH} ${MAP_VIEW_HEIGHT}" role="img" aria-label="A vertical path climbing through twelve rounds, four shops, and four bosses">
            ${regionRects}
            ${renderMapDecorations()}
            <g class="cuddle-map-route">${routeSegments}</g>
            <g class="cuddle-map-nodes">${nodes}</g>
            ${renderCat(current)}
          </svg>
        </div>
      </section>`;
  }

  // The round-intro stats -- round number, score/target/needed, current
  // modifications, and the explicit Start button -- used to be the whole
  // screen. They're still useful, just not by default: tucked behind a
  // small toggle so the map itself is what the player sees first.
  function renderMapStatsPanel(game) {
    const state = game.state;
    const target = game.getTarget();
    const needed = Math.max(0, target - state.score);
    const totalRounds = engine.THRESHOLDS.length;
    const modifications = typeof game.getCurrentModifications === "function"
      ? game.getCurrentModifications()
      : [];
    const isBoss = typeof game.isBossRound === "function" && game.isBossRound();
    return `
      <section id="cuddleMapStatsPanel" class="cuddle-map-stats-panel ${mapStatsOpen ? "" : "hidden"}" aria-label="Run stats">
        <span class="cuddle-modal-kicker">${isBoss ? "BOSS ROUND" : `ROUND ${state.round} OF ${totalRounds}`}</span>
        <h2>${isBoss ? "Ready for the boss" : `Ready for round ${state.round}`}</h2>
        <p>Solve the fixed secret to clear the round. Money buys supplies but never gates progression.</p>
        <div class="cuddle-round-intro-stats">
          <div><span>Current money</span><strong>$${state.score}</strong></div>
          <div><span>Next target</span><strong>${target}</strong></div>
          <div><span>Still needed</span><strong>${needed}</strong></div>
        </div>
        <div class="cuddle-round-modifications">
          <h3>Current modifications</h3>
          <ul>${modifications.map(line => `<li>${escapeHtml(line)}</li>`).join("")}</ul>
        </div>
        <button class="cuddle-btn cuddle-btn-primary cuddle-round-start" data-action="start-round">Start round ${state.round}</button>
      </section>`;
  }

  function renderMapStatsToggle(game) {
    if (mapStatsOpenRound !== game.state.round) {
      mapStatsOpen = false;
      mapStatsOpenRound = game.state.round;
    }
    return `
      <div class="cuddle-map-toolbar">
        <button class="cuddle-icon-btn cuddle-map-stats-toggle" data-cuddle-campaign-action="toggle-map-stats"
          aria-expanded="${mapStatsOpen ? "true" : "false"}" aria-controls="cuddleMapStatsPanel"
          aria-label="${mapStatsOpen ? "Hide run stats" : "Show run stats"}">
          ${mapStatsOpen ? "✕" : "📊"}
        </button>
      </div>
      ${renderMapStatsPanel(game)}`;
  }

  // Replaces the round-intro overlay outright -- the map IS the screen
  // between rounds now, not a card stacked on top of it. Modeled on
  // renderShop just below (same shell/header shape, same reason the score
  // lives in the header: it's the run's spendable currency, so it belongs
  // somewhere the player sees it without opening anything).
  function renderRoundIntroMap(game) {
    const state = game.state;
    const isBoss = typeof game.isBossRound === "function" && game.isBossRound();
    return `
      <div class="cuddle-shell cuddle-map-shell">
        <header class="cuddle-header">
          <div class="cuddle-header-side">
            <button class="cuddle-icon-btn" data-action="run-menu" aria-label="Cuddle menu">←</button>
          </div>
          <div class="cuddle-header-title">
            <span class="cuddle-eyebrow">BETWEEN ROUNDS</span>
            <div class="cuddle-header-title-line">
              <h1>${isBoss ? "BOSS AHEAD" : `ROUND ${state.round}`}</h1>
              <span class="cuddle-header-score" aria-label="Total money $${state.score}">Money $${state.score}</span>
            </div>
          </div>
          <div class="cuddle-header-side cuddle-header-side-right"></div>
        </header>
        ${renderMap(game)}
        ${renderMapStatsToggle(game)}
      </div>`;
  }

  function inventoryBadges(shop) {
    const entries = [
      ["Joker", shop.jokerCharges],
      ["Spare mulligan", shop.inventory.extraMulligan],
      ["Mulligan refill", shop.inventory.mulliganRefresh],
      ["+1 hand", shop.inventory.handSize],
      ["Amber lens", shop.inventory.yellowDetector]
    ].filter(([, count]) => Number(count) > 0);
    if (!entries.length) return `<span class="cuddle-shop-inventory-empty">No one-use items stored.</span>`;
    return entries.map(([label, count]) => `<span class="cuddle-shop-inventory-chip">${escapeHtml(label)} ×${count}</span>`).join("");
  }

  function renderShop(game) {
    const state = game.state;
    const shop = game.getCuddleShop();
    return `
      <div class="cuddle-shell cuddle-shop-shell">
        <header class="cuddle-header">
          <div class="cuddle-header-side">
            <button class="cuddle-icon-btn" data-action="run-menu" aria-label="Cuddle menu">←</button>
          </div>
          <div class="cuddle-header-title">
            <span class="cuddle-eyebrow">BETWEEN ROUNDS</span>
            <div class="cuddle-header-title-line">
              <h1>THE WANDERING PAW</h1>
              <span class="cuddle-header-score" aria-label="Spendable money $${state.score}">Money $${state.score}</span>
            </div>
          </div>
          <div class="cuddle-header-side cuddle-header-side-right"></div>
        </header>
        ${renderMap(game)}
        <main class="cuddle-shop-page">
          <section class="cuddle-shop-intro">
            <div>
              <span class="cuddle-eyebrow">SHOP AFTER ROUND ${shop.round}</span>
              <h2>Spend money on one-use supplies</h2>
              <p>Money is your spendable run currency. Purchases lower the wallet but never block a solved round. Each item is stocked once at this stop.</p>
            </div>
            <div class="cuddle-shop-wallet"><span>Available</span><strong>$${shop.score}</strong><small>money</small></div>
          </section>
          <div class="cuddle-shop-inventory" aria-label="Stored shop items">
            <strong>Inventory</strong>${inventoryBadges(shop)}
          </div>
          <section class="cuddle-shop-grid" aria-label="Shop items">
            ${shop.items.map(item => {
              const disabled = item.purchased || !item.affordable;
              const status = item.purchased ? "Sold" : item.affordable ? `$${item.cost}` : `Need $${item.cost}`;
              return `
                <button class="cuddle-shop-item ${item.purchased ? "is-purchased" : ""}"
                  data-cuddle-campaign-action="buy-shop-item" data-shop-item-id="${escapeHtml(item.id)}" ${disabled ? "disabled" : ""}>
                  <span class="cuddle-shop-item-icon" aria-hidden="true">${escapeHtml(item.icon)}</span>
                  <span class="cuddle-shop-item-copy"><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.description)}</small></span>
                  <span class="cuddle-shop-item-cost">${escapeHtml(status)}</span>
                </button>`;
            }).join("")}
          </section>
          <p class="cuddle-shop-message" role="status">${escapeHtml(state.lastMessage || "")}</p>
          <button class="cuddle-btn cuddle-btn-primary cuddle-shop-continue" data-cuddle-campaign-action="leave-shop">Continue journey</button>
        </main>
      </div>`;
  }

  // The round-intro screen is fully replaced by renderRoundIntroMap above,
  // and the shop by renderShop below -- both bypass this entirely. What's
  // left for every other checkpoint (a reward pick after clearing a round,
  // or one mid-round after finishing a quest) is the "regular" screen
  // cuddle-ui.js already built, unchanged, PLUS the theme readout: a
  // category revealed via Theme Sense or a redeemed Category Whisper had
  // nowhere left to actually show once the map stopped rendering on every
  // screen, since it's suppressed on the live guessing screen and the
  // round's own category state resets the moment the next secret is drawn.
  // The round-clear/reward screens are the one place still showing THIS
  // round's revealed theme before it's gone.
  function insertMap(runHtml, game) {
    const state = game?.state;
    const html = String(runHtml || "");
    if (!state) return html;
    if (state.status === "upgrade" || state.status === "questReward") {
      const badge = renderCategoryBadge(ensureCampaign(game));
      if (!badge) return html;
      const modalMatch = html.match(/<section class="cuddle-modal[^"]*">/);
      if (!modalMatch) return html;
      const insertAt = modalMatch.index + modalMatch[0].length;
      return html.slice(0, insertAt) + `<div class="cuddle-map-badge-standalone">${badge}</div>` + html.slice(insertAt);
    }
    // Live guessing screen (status "playing", already past roundIntroPending
    // -- that phase is its own full-screen map, dispatched before this ever
    // runs). Two things get stitched onto the top of .cuddle-left-column
    // here, above the boss/quest cards: a known theme (once one has
    // actually been revealed this round -- renderCategoryBadge stays empty
    // otherwise) and, if Money Mode is installed and a mini-challenge is
    // active, its status strip. Money Mode used to patch that strip into
    // the DOM after the fact on every render tick, which the base engine's
    // full-innerHTML re-render (on every guess) wiped out and it recreated
    // from scratch each time -- see activeChallengeBannerMarkup's comment
    // in cuddle-money-mode.js for why that read as the page jumping back to
    // the top. Rendering it here instead makes it part of the same
    // template as the boss/quest cards, so it behaves exactly like them.
    if (state.status === "playing") {
      // The challenge strip already carries its own complete card styling
      // (border, background, grid) -- it goes in as-is. The theme badge
      // reuses the same right-aligned-by-default layout it has inside the
      // map heading, so it gets the standalone wrapper that flips it to
      // left-aligned there (see cuddle.css's .cuddle-map-badge-standalone).
      const challengeBanner = typeof window.CuddleMoneyMode?.renderChallengeBanner === "function"
        ? window.CuddleMoneyMode.renderChallengeBanner(game)
        : "";
      const themeBadge = renderCategoryBadge(ensureCampaign(game));
      const extra = challengeBanner + (themeBadge ? `<div class="cuddle-map-badge-standalone cuddle-play-theme-badge">${themeBadge}</div>` : "");
      if (!extra) return html;
      const marker = '<section class="cuddle-left-column">';
      if (!html.includes(marker)) return html;
      return html.replace(marker, `${marker}${extra}`);
    }
    return html;
  }

  function afterRender(root, game, landing) {
    if (!root || !game?.state || landing) return;
    const scroller = root.querySelector("[data-cuddle-map-scroll]");
    if (!scroller) return;
    const currentY = Number(scroller.dataset.mapCurrentY || 0);
    requestAnimationFrame(() => {
      const proportion = currentY / MAP_VIEW_HEIGHT;
      const target = proportion * scroller.scrollHeight - scroller.clientHeight / 2;
      scroller.scrollTop = Math.max(0, Math.min(scroller.scrollHeight - scroller.clientHeight, target));
    });
  }

  function handleUiAction(game, action, itemId) {
    if (!game) return { ok: false, error: "No Cuddle run is active." };
    if (action === "buy-shop-item") return game.buyCuddleShopItem(itemId);
    if (action === "leave-shop") return game.leaveCuddleShop();
    if (action === "map-advance") {
      const advanceAction = mapAdvanceAction(game);
      if (advanceAction === "dismiss-round-intro") return game.dismissRoundIntro();
      if (advanceAction === "leave-shop") return game.leaveCuddleShop();
      return { ok: false, error: "Nothing to advance to yet." };
    }
    if (action === "toggle-map-stats") {
      mapStatsOpen = !mapStatsOpen;
      return { ok: true };
    }
    return { ok: false, error: "Unknown campaign action." };
  }

  window.CuddleCampaign = Object.freeze({
    CATEGORY_REWARD,
    CATEGORY_SENSE_UPGRADE,
    SHOP_AFTER_ROUNDS,
    SHOP_ITEMS,
    MAP_NODES,
    ensureCampaign,
    queueCategoryReveal,
    renderMap,
    renderShop,
    renderRoundIntroMap,
    insertMap,
    afterRender,
    handleUiAction
  });
}());
