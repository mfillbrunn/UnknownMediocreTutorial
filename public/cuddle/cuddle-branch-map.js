/* CUDDLE_BRANCH_MAP v1
 * Add-on loaded after cuddle-engine.js, cuddle-campaign.js, cuddle-ui.js and
 * cuddle-money-mode.js. Replaces the old fixed schedule (bosses always at
 * rounds 3/7/10 + final, shops always at rounds 3/6/9/12) with a run-long
 * path generated once at startNew: before most rounds the player is offered
 * 2-3 options (press on / shop / mini challenge / a themed reveal / a
 * two-sided "event"), and the old round-7 boss gate becomes a fork -- walk a
 * known path straight to one previewed boss, or take the Twin Trial and pick
 * between both once you arrive. Rounds 3 and 10 no longer force a boss at
 * all; only round 7 (mid-run) and the final boss (after round 12) still gate
 * the run, so a full run has exactly two boss encounters instead of four.
 */
(function installCuddleBranchMap() {
  "use strict";

  var Engine = window.CuddleEngine;
  if (!Engine || !Engine.CuddleGame) {
    console.error("Cuddle Branch Map: CuddleEngine was not available.");
    return;
  }

  var Game = Engine.CuddleGame;
  var proto = Game.prototype;
  if (proto.__cuddleBranchMapInstalled) return;
  Object.defineProperty(proto, "__cuddleBranchMapInstalled", {
    value: true,
    configurable: false,
    enumerable: false,
    writable: false
  });

  var TOTAL_ROUNDS = (Engine.THRESHOLDS && Engine.THRESHOLDS.length) || 12;
  var MID_BOSS_ROUND = 7;
  var EVENT_MONEY_COST = 15;
  var EVENT_WINDFALL_AMOUNT = 12;
  // Every round that used to auto-trigger a shop (old SHOP_AFTER_ROUNDS + 1)
  // stays shop-eligible, so the shop keeps the exact save/inventory slots it
  // already relies on -- only whether it fires is now a player choice.
  var SHOP_ROUNDS = (window.CuddleCampaign && Array.isArray(window.CuddleCampaign.SHOP_AFTER_ROUNDS)
    ? window.CuddleCampaign.SHOP_AFTER_ROUNDS
    : [2, 5, 8, 11]).map(function addOne(round) { return round + 1; });
  var JUNCTION_ROUNDS = [];
  for (var round = 2; round <= TOTAL_ROUNDS; round += 1) {
    if (round !== MID_BOSS_ROUND) JUNCTION_ROUNDS.push(round);
  }

  var EVENTS = Object.freeze([
    {
      id: "luckyDraw",
      icon: "🍀",
      title: "Lucky Draw",
      description: "Pure luck: draw one fresh reward card for free.",
      luck: "draw"
    },
    {
      id: "windfall",
      icon: "💰",
      title: "Windfall",
      description: "Pure luck: gain " + EVENT_WINDFALL_AMOUNT + " points for free.",
      luck: "money"
    },
    {
      id: "riskyUpgrade",
      icon: "⚔️",
      title: "Risky Upgrade",
      description: "Take a free permanent upgrade now, but the next boss you face gets one guess tougher.",
      grantsUpgrade: true,
      cost: "boss"
    },
    {
      id: "priceOfPower",
      icon: "🪙",
      title: "Price of Power",
      description: "Take a free permanent upgrade now, but pay " + EVENT_MONEY_COST + " points for it.",
      grantsUpgrade: true,
      cost: "money"
    },
    {
      id: "borrowedTime",
      icon: "⏳",
      title: "Borrowed Time",
      description: "Take a free permanent upgrade now, but next round starts one guess short.",
      grantsUpgrade: true,
      cost: "guess"
    },
    {
      id: "thinMargins",
      icon: "🎴",
      title: "Thin Margins",
      description: "Take a free permanent upgrade now, but next round starts one mulligan short.",
      grantsUpgrade: true,
      cost: "mulligan"
    },
    {
      id: "blackout",
      icon: "🌑",
      title: "Blackout Bargain",
      description: "Take a free permanent upgrade now, but next round offers no reward of its own.",
      grantsUpgrade: true,
      cost: "rewards"
    },
    {
      id: "debtRun",
      icon: "📉",
      title: "Debt Run",
      description: "Take a free permanent upgrade now, but next round's solve is worth no points.",
      grantsUpgrade: true,
      cost: "noMoney"
    }
  ]);

  function randomFor(game) {
    try {
      if (game && typeof game.random === "function") return game.random();
    } catch (error) {
      console.warn("Cuddle Branch Map: seeded random failed; using Math.random.", error);
    }
    return Math.random();
  }

  function shuffled(items, game) {
    var copy = items.slice();
    for (var index = copy.length - 1; index > 0; index -= 1) {
      var target = Math.floor(randomFor(game) * (index + 1));
      var temporary = copy[index];
      copy[index] = copy[target];
      copy[target] = temporary;
    }
    return copy;
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function replaceCharacter(character) {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "\"": "&quot;",
        "'": "&#039;"
      }[character];
    });
  }

  function ensureBranchMap(game) {
    var state = game.state;
    if (!state.branchMap || typeof state.branchMap !== "object") {
      state.branchMap = {
        junctions: {},
        resolved: {},
        midBoss: null,
        bossPenalty: 0,
        pendingPenalty: null,
        pendingPenaltyRound: null,
        rewardsDisabledRound: null,
        noMoneyRound: null
      };
    }
    var branchMap = state.branchMap;
    if (!branchMap.junctions || typeof branchMap.junctions !== "object") branchMap.junctions = {};
    if (!branchMap.resolved || typeof branchMap.resolved !== "object") branchMap.resolved = {};
    if (typeof branchMap.bossPenalty !== "number") branchMap.bossPenalty = 0;
    return branchMap;
  }

  function buildJunctionOptions(game, round) {
    var isShop = SHOP_ROUNDS.indexOf(round) !== -1;
    // "Press On" and the shop-or-challenge slot are always both on offer --
    // shop rounds especially need to stay reachable every time, since the
    // shop's own save state (activeShopRound, shopPurchases) is still keyed
    // to these exact round numbers. Only the third slot (a themed event or
    // an early category reveal) is the one that varies run to run.
    var normal = { id: "normal", type: "normal", icon: "🚶", title: "Press On", description: "A plain round: just solve the Wordle, nothing else in play." };
    var stop = isShop
      ? { id: "shop", type: "shop", icon: "🛒", title: "The Wandering Paw", description: "Stop and spend money on one-use supplies instead of an ordinary round." }
      : { id: "challenge", type: "challenge", icon: "⚡", title: "Mini Challenge", description: "Guarantees a challenge offer this round for a shot at extra money." };
    var event = EVENTS[Math.floor(randomFor(game) * EVENTS.length)];
    var eventOption = { id: "event", type: "event", eventId: event.id, icon: event.icon, title: event.title, description: event.description };
    var themeOption = { id: "theme", type: "theme", icon: "🧭", title: "Ask Around", description: "Learn one of the solution's categories before the round begins." };
    var extras = shuffled([eventOption, themeOption], game);
    var picks = randomFor(game) < 0.65 ? extras.slice(0, 1) : [];
    return [normal, stop].concat(picks);
  }

  function buildMidBossJunction(game) {
    var candidates = (window.CuddleQuestBook && window.CuddleQuestBook.bossChoices
      ? window.CuddleQuestBook.bossChoices(game.random, game.state.bossesSeen)
      : []) || [];
    if (candidates.length < 2) return null;
    var first = candidates[0];
    var second = candidates[1];
    return {
      bossCandidates: [first, second],
      options: [
        {
          id: "forced-a",
          type: "bossForced",
          bossId: first.id,
          icon: first.icon,
          title: first.title,
          description: "Preview: " + first.description
        },
        {
          id: "forced-b",
          type: "bossForced",
          bossId: second.id,
          icon: second.icon,
          title: second.title,
          description: "Preview: " + second.description
        },
        {
          id: "choice",
          type: "bossChoice",
          icon: "🎭",
          title: "Twin Trial",
          description: "Arrive blind and choose between " + first.title + " and " + second.title + " once you get there."
        }
      ]
    };
  }

  function generateBranchMap(game) {
    var branchMap = ensureBranchMap(game);
    JUNCTION_ROUNDS.forEach(function buildOne(round) {
      if (!branchMap.junctions[round]) branchMap.junctions[round] = buildJunctionOptions(game, round);
    });
    if (!branchMap.midBoss) branchMap.midBoss = buildMidBossJunction(game);
  }

  function applyPendingBossPenalty(game) {
    var branchMap = ensureBranchMap(game);
    var penalty = Number(branchMap.bossPenalty || 0);
    if (penalty && game.state.boss) {
      game.state.boss.turns = Math.max(2, Number(game.state.boss.turns || Engine.MAX_GUESSES || 6) - penalty);
      branchMap.bossPenalty = 0;
    }
  }

  // Routes through the real _openBossGate/chooseBoss chain instead of
  // hand-building state.boss: those methods (via the V3 mega-layer) retime
  // a boss's turn count from its run stage every time a boss is opened or
  // chosen, on top of the branch penalty applied below. Swapping the boss
  // pool out for exactly the two pre-generated candidates for the length of
  // one call keeps that retiming (and hidden-index/quick-mode setup) intact
  // without duplicating it here.
  function openFixedBossGate(game, candidates) {
    var stash = window.CuddleQuestBook;
    window.CuddleQuestBook = Object.assign({}, stash, {
      bossChoices: function fixedBossChoices() { return candidates.slice(); }
    });
    try {
      return game._openBossGate(MID_BOSS_ROUND);
    } finally {
      window.CuddleQuestBook = stash;
    }
  }

  function applyEvent(game, option, round) {
    var definition = null;
    for (var index = 0; index < EVENTS.length; index += 1) {
      if (EVENTS[index].id === option.eventId) { definition = EVENTS[index]; break; }
    }
    if (!definition) return;
    var branchMap = ensureBranchMap(game);
    var messages = [];

    if (definition.grantsUpgrade && typeof game._upgradeCatalog === "function") {
      var catalog = game._upgradeCatalog() || [];
      if (catalog.length) {
        var choice = catalog[Math.floor(randomFor(game) * catalog.length)];
        var applied = typeof game._applyUpgradeChoice === "function" ? game._applyUpgradeChoice(choice) : { ok: false };
        if (applied.ok) messages.push(choice.title + " acquired for free.");
      }
    }

    switch (definition.cost) {
      case "boss":
        branchMap.bossPenalty = Number(branchMap.bossPenalty || 0) + 1;
        messages.push("The next boss you face will be one guess tougher.");
        break;
      case "money":
        game.state.score = Math.max(0, Number(game.state.score || 0) - EVENT_MONEY_COST);
        messages.push("Paid " + EVENT_MONEY_COST + " points.");
        break;
      case "guess":
        branchMap.pendingPenalty = Object.assign({}, branchMap.pendingPenalty, { guess: 1 });
        branchMap.pendingPenaltyRound = round;
        messages.push("Next round starts one guess short.");
        break;
      case "mulligan":
        branchMap.pendingPenalty = Object.assign({}, branchMap.pendingPenalty, { mulligan: 1 });
        branchMap.pendingPenaltyRound = round;
        messages.push("Next round starts one mulligan short.");
        break;
      case "rewards":
        branchMap.pendingPenalty = Object.assign({}, branchMap.pendingPenalty, { rewards: true });
        branchMap.pendingPenaltyRound = round;
        messages.push("Next round offers no reward of its own.");
        break;
      case "noMoney":
        branchMap.pendingPenalty = Object.assign({}, branchMap.pendingPenalty, { noMoney: true });
        branchMap.pendingPenaltyRound = round;
        messages.push("Next round's solve is worth no points.");
        break;
      default:
        break;
    }

    if (definition.luck === "draw") {
      var drawn = typeof game._drawRewardCards === "function" ? game._drawRewardCards(1) : [];
      messages.push(drawn.length ? "Drew a fresh reward card." : "No fresh cards were available.");
    }
    if (definition.luck === "money") {
      game.state.score = Number(game.state.score || 0) + EVENT_WINDFALL_AMOUNT;
      messages.push("+" + EVENT_WINDFALL_AMOUNT + " points, free.");
    }

    // _beginRound (fired next, via _advanceRound) unconditionally overwrites
    // lastMessage with its own "Round N begins" copy, so this can't just be
    // written to state.lastMessage here -- it would never be seen. Stash it
    // and have the _beginRound wrap below splice it back in afterward.
    ensureBranchMap(game).pendingEventMessage = definition.title + ": " + messages.join(" ");
  }

  function resolveRegularJunction(game, round, option) {
    var branchMap = ensureBranchMap(game);
    branchMap.resolved[round] = option.type;
    var completedRound = round - 1;
    if (option.type !== "shop" && SHOP_ROUNDS.indexOf(round) !== -1 && window.CuddleCampaign) {
      var campaign = window.CuddleCampaign.ensureCampaign(game);
      if (campaign && campaign.shopsVisited.indexOf(completedRound) === -1) {
        campaign.shopsVisited.push(completedRound);
        campaign.shopsVisited.sort(function bySize(a, b) { return a - b; });
      }
    }
    if (option.type === "event") applyEvent(game, option, round);
    if (option.type === "theme" && window.CuddleCampaign && typeof window.CuddleCampaign.queueCategoryReveal === "function") {
      window.CuddleCampaign.queueCategoryReveal(game, 1, "branch");
    }
    if (option.type === "challenge") {
      var mode = game.state.cuddleMoneyMode;
      if (mode) mode.noOfferStreak = 999;
    }
    game._advanceRound();
    game.save();
    return { ok: true, message: game.state.lastMessage || "" };
  }

  function resolveBossApproach(game, optionId) {
    var branchMap = ensureBranchMap(game);
    var midBoss = branchMap.midBoss;
    if (!midBoss) return { ok: false, error: "No boss approach is open." };
    var option = null;
    for (var index = 0; index < midBoss.options.length; index += 1) {
      if (midBoss.options[index].id === optionId) { option = midBoss.options[index]; break; }
    }
    if (!option) return { ok: false, error: "That path is not available." };
    branchMap.resolved[MID_BOSS_ROUND] = option.id;
    game.state.round = MID_BOSS_ROUND;

    var opened = openFixedBossGate(game, midBoss.bossCandidates);
    if (!opened) {
      // The boss pool couldn't fill both slots after all (e.g. bossesSeen
      // changed since the map was generated) -- mirrors _openBossGate's own
      // fallback of just letting the round proceed with no boss at all.
      branchMap.resolved[MID_BOSS_ROUND] = "skip";
      game.state.round = MID_BOSS_ROUND - 1;
      game._advanceRound();
      game.save();
      return { ok: true };
    }

    if (option.type === "bossChoice") {
      game.save();
      return { ok: true };
    }

    var result = game.chooseBoss(option.bossId);
    game.save();
    return result;
  }

  function presentJunction(game, branchMap, round) {
    if (!branchMap.junctions[round]) branchMap.junctions[round] = buildJunctionOptions(game, round);
    game.state.status = "branchJunction";
    game.save();
    return undefined;
  }

  function presentBossApproach(game, branchMap) {
    if (!branchMap.midBoss) branchMap.midBoss = buildMidBossJunction(game);
    game.state.status = "branchJunction";
    game.save();
    return undefined;
  }

  // -- prototype wiring --------------------------------------------------

  var originalStartNew = proto.startNew;
  proto.startNew = function startNewWithBranchMap() {
    var result = originalStartNew.apply(this, arguments);
    generateBranchMap(this);
    this.save();
    return typeof this.getSnapshot === "function" ? this.getSnapshot() : result;
  };

  proto._bossGateFor = function bossGateForBranchMap(roundValue) {
    var value = Number(roundValue) || 1;
    if (value === MID_BOSS_ROUND) return "before-" + MID_BOSS_ROUND;
    if (value > TOTAL_ROUNDS) return "final";
    return null;
  };

  var originalAdvanceRound = proto._advanceRound;
  proto._advanceRound = function advanceThroughBranchMap() {
    var branchMap = ensureBranchMap(this);
    var justClearedGate = this.state.lastClearedBossGate;
    var next = justClearedGate ? this.state.round : this.state.round + 1;
    if (!justClearedGate && next >= 2 && next <= TOTAL_ROUNDS) {
      if (next === MID_BOSS_ROUND && !branchMap.resolved[next]) {
        if (!branchMap.midBoss) branchMap.midBoss = buildMidBossJunction(this);
        // Mirrors _openBossGate's own fallback: if the boss pool can't fill
        // both slots, no gate is offered at all and the round just proceeds
        // -- so once that happens once, fall through the same way forever
        // rather than presenting a junction with no options in it.
        if (branchMap.midBoss) return presentBossApproach(this, branchMap);
        branchMap.resolved[next] = "skip";
      }
      if (next !== MID_BOSS_ROUND && !branchMap.resolved[next]) {
        return presentJunction(this, branchMap, next);
      }
    }
    return originalAdvanceRound.apply(this, arguments);
  };

  var originalBeginRound = proto._beginRound;
  proto._beginRound = function beginRoundWithBranchPenalty() {
    var result = originalBeginRound.apply(this, arguments);
    var branchMap = ensureBranchMap(this);
    if (branchMap.pendingEventMessage) {
      this.state.lastMessage = branchMap.pendingEventMessage
        + (this.state.lastMessage ? " " + this.state.lastMessage : "");
      branchMap.pendingEventMessage = null;
    }
    if (branchMap.pendingPenalty && Number(branchMap.pendingPenaltyRound) === Number(this.state.round)) {
      var penalty = branchMap.pendingPenalty;
      if (penalty.guess) {
        this.state.maxGuesses = Math.max(3, Number(this.state.maxGuesses || Engine.MAX_GUESSES || 6) - penalty.guess);
      }
      if (penalty.mulligan) {
        this.state.mulligansLeft = Math.max(0, Number(this.state.mulligansLeft || 0) - penalty.mulligan);
      }
      if (penalty.rewards) branchMap.rewardsDisabledRound = this.state.round;
      if (penalty.noMoney) branchMap.noMoneyRound = this.state.round;
      branchMap.pendingPenalty = null;
      branchMap.pendingPenaltyRound = null;
    }
    return result;
  };

  var originalResolvePendingRoundEnd = proto._resolvePendingRoundEnd;
  proto._resolvePendingRoundEnd = function resolveRoundEndWithBranchPenalty() {
    var branchMap = ensureBranchMap(this);
    var round = this.state.round;
    var noMoneyFlag = Number(branchMap.noMoneyRound) === Number(round);
    var rewardsFlag = Number(branchMap.rewardsDisabledRound) === Number(round);
    var baseline = noMoneyFlag ? Number(this.state.score || 0) - Number(this.state.roundScore || 0) : null;
    var result = originalResolvePendingRoundEnd.apply(this, arguments);
    if (noMoneyFlag) {
      this.state.score = baseline;
      branchMap.noMoneyRound = null;
    }
    if (rewardsFlag) {
      branchMap.rewardsDisabledRound = null;
      if (this.state.status === "upgrade") {
        this.state.upgradeChoices = [];
        this.state.upgradePhase = null;
        this.state.upgradeMilestone = null;
        this.state.lastMessage = (this.state.lastMessage ? this.state.lastMessage + " " : "") + "No reward this round.";
        this._advanceRound();
      }
    }
    return result;
  };

  var originalChooseBoss = proto.chooseBoss;
  proto.chooseBoss = function chooseBossWithBranchPenalty() {
    var result = originalChooseBoss.apply(this, arguments);
    if (result && result.ok) applyPendingBossPenalty(this);
    return result;
  };

  proto.resolveBranchJunction = function resolveBranchJunction(optionId) {
    if (this.state.status !== "branchJunction") return { ok: false, error: "No junction is open." };
    var round = this.state.round + 1;
    if (round === MID_BOSS_ROUND) return resolveBossApproach(this, optionId);
    var branchMap = ensureBranchMap(this);
    var options = branchMap.junctions[round] || [];
    var option = null;
    for (var index = 0; index < options.length; index += 1) {
      if (options[index].id === optionId) { option = options[index]; break; }
    }
    if (!option) return { ok: false, error: "That path is not available." };
    return resolveRegularJunction(this, round, option);
  };

  // -- rendering -----------------------------------------------------------

  function renderJunction(game) {
    var state = game.state;
    var round = state.round + 1;
    var isBossApproach = round === MID_BOSS_ROUND;
    var branchMap = ensureBranchMap(game);
    var options = isBossApproach
      ? (branchMap.midBoss ? branchMap.midBoss.options : [])
      : (branchMap.junctions[round] || []);
    return (
      "<div class=\"cuddle-shell cuddle-branch-shell\">"
      + "<header class=\"cuddle-header\">"
      + "<div class=\"cuddle-header-side\"><button class=\"cuddle-icon-btn\" data-action=\"run-menu\" aria-label=\"Cuddle menu\">←</button></div>"
      + "<div class=\"cuddle-header-title\">"
      + "<span class=\"cuddle-eyebrow\">" + (isBossApproach ? "APPROACHING THE BOSS" : "THE ROAD AHEAD") + "</span>"
      + "<div class=\"cuddle-header-title-line\">"
      + "<h1>" + (isBossApproach ? "Two paths, one gate" : "Choose your next stop") + "</h1>"
      + "<span class=\"cuddle-header-score\" aria-label=\"Spendable money $" + escapeHtml(state.score) + "\">$" + escapeHtml(state.score) + "</span>"
      + "</div></div>"
      + "<div class=\"cuddle-header-side cuddle-header-side-right\"></div>"
      + "</header>"
      + "<main class=\"cuddle-branch-page\">"
      + "<p class=\"cuddle-branch-intro\">" + (isBossApproach
        ? "Round " + round + " is gated by a boss. Walk a known path straight to one previewed challenger, or take the Twin Trial and pick between both once you arrive."
        : "Round " + round + " is ahead. Pick how you want to reach it.") + "</p>"
      + "<div class=\"cuddle-choice-grid\">"
      + options.map(function renderOption(option) {
        return (
          "<button class=\"cuddle-choice cuddle-branch-choice\" data-cuddle-campaign-action=\"resolve-branch-junction\" data-shop-item-id=\"" + escapeHtml(option.id) + "\">"
          + "<span class=\"cuddle-choice-icon\">" + escapeHtml(option.icon || "❔") + "</span>"
          + "<strong>" + escapeHtml(option.title) + "</strong>"
          + "<small>" + escapeHtml(option.description) + "</small>"
          + "</button>"
        );
      }).join("")
      + "</div>"
      + "</main></div>"
    );
  }

  window.CuddleBranchMap = Object.freeze({
    renderJunction: renderJunction
  });
}());
