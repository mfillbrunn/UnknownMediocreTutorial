/* CUDDLE_BRANCH_MAP v2
 * Add-on loaded after cuddle-engine.js, cuddle-campaign.js, cuddle-ui.js and
 * cuddle-money-mode.js.
 *
 * One map for the whole run, generated at startNew and never regenerated:
 * rows of 1-3 nodes, each node wired by real edges to specific nodes on the
 * next row (never a "pick any of these" list), so where you are standing
 * decides what you can reach next. Paths split left and right, merge back
 * into each other, and all of them funnel into the act's boss row -- two
 * bosses for the mid-run act, and some nodes reach both of them while
 * others only reach one, which is what makes the route worth planning from
 * the first pick. Beating a boss drops you back on the same map for the
 * second act, which ends at the final boss.
 *
 * A node is a Wordle, a themed Wordle, a mini challenge, a shop, a free
 * upgrade, an event (a real reward for a real cost), or a boss. Only the
 * Wordle-ish ones and bosses consume a round, so a route through more shops
 * and upgrades is a shorter, poorer run and a route through more Wordles is
 * a longer, richer one.
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

  var MAP_STATUS = "branchMap";
  // Ephemeral UI state: which node (if any) is showing its preview modal
  // before the player commits to it. Not part of the save -- a fresh page
  // load always starts with no preview open.
  var previewKey = null;
  var TOTAL_ROUNDS = (Engine.THRESHOLDS && Engine.THRESHOLDS.length) || 12;
  var ACT_ROWS = 5;
  var MID_BOSS_GATE = "before-7";
  var FINAL_BOSS_GATE = "final";
  var EVENT_MONEY_COST = 15;
  var EVENT_WINDFALL_AMOUNT = 12;
  // The shop's saved state (activeShopRound, shopPurchases) is keyed by the
  // round numbers cuddle-campaign.js already whitelists, and ensureCampaign
  // wipes anything outside that list -- so each shop node borrows one of
  // those slots as its stock key, which also caps how many shops a run has.
  var SHOP_SLOTS = (window.CuddleCampaign && Array.isArray(window.CuddleCampaign.SHOP_AFTER_ROUNDS)
    ? window.CuddleCampaign.SHOP_AFTER_ROUNDS.slice()
    : [2, 5, 8, 11]);

  // How many cumulative run points are needed before a boss row can be
  // entered at all -- on top of a path actually reaching it. The first
  // boss is the same threshold on every difficulty; the later two scale
  // with difficulty since a harder run also earns points faster.
  var BOSS_GATE_ORDER = ["before-3", "before-7", "final"];
  var BOSS_POINT_REQUIREMENTS = {
    "before-3": { easy: 50, medium: 100, hard: 150 },
    "before-7": { easy: 250, medium: 300, hard: 350 },
    "final": { easy: 550, medium: 600, hard: 650 }
  };

  function difficultyOf(game) {
    var mega = game && game.state && game.state.megaState;
    var value = (mega && mega.difficulty) || (game && game.state && game.state.difficulty) || "hard";
    value = String(value).toLowerCase();
    return value === "easy" || value === "medium" ? value : "hard";
  }

  function bossPointRequirement(game, gate) {
    var tiers = BOSS_POINT_REQUIREMENTS[gate];
    if (!tiers) return 0;
    return tiers[difficultyOf(game)] || tiers.hard;
  }

  // The next boss gate the run hasn't cleared yet, and what it costs --
  // used by the HUD (cuddle-ui.js) to show progress toward it up front,
  // not just once the map already put a boss node in reach.
  function nextBossRequirement(game) {
    var done = (game && game.state && game.state.bossGatesDone) || [];
    var gate = BOSS_GATE_ORDER.find(function (candidate) { return done.indexOf(candidate) === -1; });
    if (!gate) return null;
    // bankedScore(), not raw state.score: raw score counts the live round's
    // guess points before they bank, which put this line ahead of the
    // header's points counter mid-round. Off the map both are the same.
    return {
      gate: gate,
      required: bossPointRequirement(game, gate),
      score: game && typeof game.bankedScore === "function"
        ? game.bankedScore()
        : Number((game && game.state && game.state.score) || 0)
    };
  }

  var NODE_TYPES = {
    normal: { icon: "🟩", title: "Wordle", label: "Wordle", description: "A plain round: solve the Wordle, nothing else in play.", playsRound: true },
    theme: { icon: "🧭", title: "Themed Wordle", label: "Theme", description: "A round that opens with one of the solution's categories already revealed.", playsRound: true },
    challenge: { icon: "⚡", title: "Mini Challenge", label: "Challenge", description: "A round that always offers a challenge: take it for extra money, or wave it off.", playsRound: true },
    shop: { icon: "🛒", title: "The Wandering Paw", label: "Shop", description: "Spend money on one-use supplies. No Wordle here.", playsRound: false },
    upgrade: { icon: "✨", title: "Waystone", label: "Upgrade", description: "Take a free permanent upgrade. No Wordle here.", playsRound: false },
    event: { icon: "❔", title: "Event", label: "Event", description: "A trade: something gained now for something given up.", playsRound: false },
    boss: { icon: "💀", title: "Boss", label: "Boss", description: "A boss round: pass or fail, and its reward is permanent.", playsRound: true }
  };

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
      description: "Pure luck: gain +$" + EVENT_WINDFALL_AMOUNT + " for free.",
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
      description: "Take a free permanent upgrade now, but pay $" + EVENT_MONEY_COST + " for it.",
      grantsUpgrade: true,
      cost: "money"
    },
    {
      id: "borrowedTime",
      icon: "⏳",
      title: "Borrowed Time",
      description: "Take a free permanent upgrade now, but the next round must be solved within the world's guess limit (6, 5 or 4) or the run is lost.",
      grantsUpgrade: true,
      cost: "guess"
    },
    {
      id: "thinMargins",
      icon: "🎴",
      title: "Thin Margins",
      description: "Take a free permanent upgrade now, but the next round starts one mulligan short.",
      grantsUpgrade: true,
      cost: "mulligan"
    },
    {
      id: "blackout",
      icon: "🌑",
      title: "Blackout Bargain",
      description: "Take a free permanent upgrade now, but the next round offers no reward of its own.",
      grantsUpgrade: true,
      cost: "rewards"
    },
    {
      id: "debtRun",
      icon: "📉",
      title: "Debt Run",
      description: "Take a free permanent upgrade now, but the next round's solve is worth 0 points.",
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

  function pickOne(items, game) {
    return items[Math.floor(randomFor(game) * items.length)];
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

  // Wraps a "$5"/"+$5"/"-$1" dollar figure inside already-escaped text in a
  // gold span, so an event's actual payoff reads at a glance instead of
  // blending into the surrounding description. Call AFTER escapeHtml (the
  // "$" it looks for survives escaping unchanged).
  function goldenMoney(escapedHtml) {
    return String(escapedHtml == null ? "" : escapedHtml).replace(
      /[+-]?\$\d[\d,]*/g,
      function wrap(match) { return "<span class=\"cuddle-money-figure\">" + match + "</span>"; }
    );
  }

  function ensureBranchMap(game) {
    var state = game.state;
    if (!state.branchMap || typeof state.branchMap !== "object") {
      state.branchMap = { rows: [], position: null, roundsPlayed: 0, bossPenalty: 0 };
    }
    var branchMap = state.branchMap;
    if (!Array.isArray(branchMap.rows)) branchMap.rows = [];
    if (typeof branchMap.bossPenalty !== "number") branchMap.bossPenalty = 0;
    if (typeof branchMap.roundsPlayed !== "number") branchMap.roundsPlayed = 0;
    return branchMap;
  }

  function hasMap(game) {
    var branchMap = game && game.state && game.state.branchMap;
    return Boolean(branchMap && Array.isArray(branchMap.rows) && branchMap.rows.length);
  }

  // -- map generation ------------------------------------------------------

  // Node mix per act. Wordle-ish stops stay the backbone; the rest are
  // capped so a run can't turn into a row of shops, and the first row is
  // always plain Wordles so nobody opens on a shop they can't afford.
  function buildActRows(game, actIndex, shopSlots) {
    var rows = [];
    var counts = { shop: 0, upgrade: 0, event: 0, special: 0 };
    var previousWidth = 0;
    for (var rowIndex = 0; rowIndex < ACT_ROWS; rowIndex += 1) {
      var width;
      if (rowIndex === 0) width = 2 + (randomFor(game) < 0.35 ? 1 : 0);
      else if (rowIndex === ACT_ROWS - 1) width = 1 + (randomFor(game) < 0.55 ? 1 : 0);
      else width = 1 + Math.floor(randomFor(game) * 3);
      // Never repeat a single-node row back to back: two pinch points in a
      // row is a corridor, not a fork.
      if (width === 1 && previousWidth === 1) width = 2;
      previousWidth = width;

      var nodes = rowTypes(game, actIndex, rowIndex, width, counts, shopSlots).map(function toNode(type, col) {
        return { row: rows.length, col: col, type: type, next: [] };
      });
      rows.push({ kind: "stops", act: actIndex, nodes: nodes });
    }
    return rows;
  }

  // Wordles are the backbone: every row keeps at least one, so no route is
  // ever forced through a shop, and the specials stay rare enough (and
  // capped per act) that the map reads as a road of Wordles with the
  // occasional detour rather than a row of vending machines.
  function rowTypes(game, actIndex, rowIndex, width, counts, shopSlots) {
    /* UMT_CUDDLE_STABILITY_V2_UNIQUE_PATHS */
    var used = Object.create(null);
    var types = [];
    function add(type) {
      if (!type || used[type] || types.length >= width) return false;
      used[type] = true;
      types.push(type);
      if (type === "shop" || type === "upgrade" || type === "event") {
        counts[type] += 1;
        counts.special += 1;
      }
      return true;
    }
    var backbone = shuffled(["normal", "theme", "challenge"], game);
    add(backbone.shift());
    var candidates = backbone.slice();
    if (counts.special < 4) {
      if (actIndex > 0 && counts.shop < Math.min(2, shopSlots.length)) candidates.push("shop");
      if (counts.upgrade < 2) candidates.push("upgrade");
      if (counts.event < 2) candidates.push("event");
    }
    shuffled(candidates, game).forEach(add);
    ["normal", "theme", "challenge", "upgrade", "event"].forEach(add);
    return shuffled(types.slice(0, width), game);
  }

  // Wires every node in `from` to a contiguous, non-decreasing slice of
  // `to`. Non-decreasing is what keeps the edges from crossing each other,
  // and covering 0..n-1 across the row is what guarantees no node is
  // stranded without a way in or a way out. The random widening is where
  // the "this one goes left, that one goes both ways" shape comes from.
  function connectRows(game, from, to) {
    var m = from.nodes.length;
    var n = to.nodes.length;
    var ranges = [];
    var index;
    for (index = 0; index < m; index += 1) {
      var lo = Math.floor((index * n) / m);
      var hi = Math.max(lo, Math.ceil(((index + 1) * n) / m) - 1);
      ranges.push({ lo: lo, hi: hi });
    }
    for (index = 0; index < m; index += 1) {
      if (ranges[index].hi < n - 1 && randomFor(game) < 0.45) ranges[index].hi += 1;
      if (ranges[index].lo > 0 && randomFor(game) < 0.45
          && (index === 0 || ranges[index].lo - 1 >= ranges[index - 1].lo)) {
        ranges[index].lo -= 1;
      }
    }
    for (index = 0; index < m; index += 1) {
      var edges = [];
      for (var target = ranges[index].lo; target <= ranges[index].hi; target += 1) edges.push(target);
      from.nodes[index].next = edges;
    }
  }

  function bossNode(definition, gate, row, col) {
    return {
      row: row,
      col: col,
      type: "boss",
      bossId: definition.id,
      bossTitle: definition.title,
      bossIcon: definition.icon,
      bossDescription: definition.description,
      gate: gate,
      next: []
    };
  }

  function drawBosses(game, count, exclude) {
    var book = window.CuddleQuestBook;
    var drawn = (book && typeof book.bossChoices === "function"
      ? book.bossChoices(game.random, exclude || [])
      : []) || [];
    return drawn.slice(0, count);
  }

  function generateMap(game) {
    var branchMap = ensureBranchMap(game);
    if (branchMap.rows.length) return branchMap;

    var shopSlots = SHOP_SLOTS.slice();
    var rows = buildActRows(game, 0, shopSlots);

    var midBosses = drawBosses(game, 2, game.state.bossesSeen || []);
    var midRow = { kind: "boss", act: 0, nodes: [] };
    midBosses.forEach(function addMidBoss(definition, col) {
      midRow.nodes.push(bossNode(definition, MID_BOSS_GATE, rows.length, col));
    });
    if (!midRow.nodes.length) return branchMap;
    rows.push(midRow);

    buildActRows(game, 1, shopSlots).forEach(function addSecondAct(row) {
      row.nodes.forEach(function reindex(node) { node.row = rows.length; });
      row.act = 1;
      rows.push(row);
    });

    var finalBoss = drawBosses(game, 1, (game.state.bossesSeen || []).concat(
      midBosses.map(function bossId(definition) { return definition.id; })
    ))[0] || midBosses[0];
    rows.push({
      kind: "boss",
      act: 1,
      nodes: [bossNode(finalBoss, FINAL_BOSS_GATE, rows.length, 0)]
    });

    rows.forEach(function fixRowIndex(row, rowIndex) {
      row.nodes.forEach(function fixNode(node, col) {
        node.row = rowIndex;
        node.col = col;
        if (node.type === "event" && !node.eventId) node.eventId = pickOne(EVENTS, game).id;
        if (node.type === "shop" && node.shopSlot == null) {
          node.shopSlot = shopSlots.length ? shopSlots.shift() : null;
          if (node.shopSlot == null) node.type = "upgrade";
        }
      });
    });

    for (var rowIndex = 0; rowIndex < rows.length - 1; rowIndex += 1) {
      connectRows(game, rows[rowIndex], rows[rowIndex + 1]);
    }

    branchMap.rows = rows;
    branchMap.position = null;
    branchMap.visited = [];
    branchMap.roundsPlayed = 0;
    return branchMap;
  }

  // -- position / reachability --------------------------------------------

  function nodeAt(branchMap, row, col) {
    var rowData = branchMap.rows[row];
    return rowData && rowData.nodes[col] ? rowData.nodes[col] : null;
  }

  function currentNode(branchMap) {
    if (!branchMap.position) return null;
    return nodeAt(branchMap, branchMap.position.row, branchMap.position.col);
  }

  function reachableNodes(branchMap) {
    if (!branchMap.rows.length) return [];
    var here = currentNode(branchMap);
    if (!here) return branchMap.rows[0].nodes.slice();
    var nextRow = branchMap.rows[here.row + 1];
    if (!nextRow) return [];
    return (here.next || []).map(function toNode(col) {
      return nextRow.nodes[col];
    }).filter(Boolean);
  }

  function isReachable(branchMap, node) {
    return reachableNodes(branchMap).some(function match(candidate) {
      return candidate.row === node.row && candidate.col === node.col;
    });
  }

  function wasVisited(branchMap, node) {
    return (branchMap.visited || []).some(function match(entry) {
      return entry.row === node.row && entry.col === node.col;
    });
  }

  function returnToMap(game) {
    var branchMap = ensureBranchMap(game);
    var state = game.state;
    if (state.status === "won" || state.status === "lost") return;
    state.lastClearedBossGate = null;
    state.roundIntroPending = false;
    state.upgradeChoices = [];
    state.upgradePhase = null;
    state.upgradeMilestone = null;
    state.status = MAP_STATUS;
    if (!branchMap.rows.length) generateMap(game);
  }

  // -- node effects --------------------------------------------------------

  function applyPendingBossPenalty(game) {
    var branchMap = ensureBranchMap(game);
    var penalty = Number(branchMap.bossPenalty || 0);
    if (penalty && game.state.boss) {
      game.state.boss.turns = Math.max(2, Number(game.state.boss.turns || Engine.MAX_GUESSES || 6) - penalty);
      branchMap.bossPenalty = 0;
    }
  }

  function applyEvent(game, node) {
    var definition = null;
    for (var index = 0; index < EVENTS.length; index += 1) {
      if (EVENTS[index].id === node.eventId) { definition = EVENTS[index]; break; }
    }
    if (!definition) return "";
    var branchMap = ensureBranchMap(game);
    var messages = [];

    if (definition.grantsUpgrade && typeof game._upgradeCatalog === "function" && typeof game._grantUpgradeChoice === "function") {
      // A couple of catalog entries can be maxed out already (Theme Sense's
      // cap, a fully-stacked custom reward) and reject that one id -- walk a
      // shuffled catalog rather than charging the event's cost for nothing.
      var pool = shuffled(game._upgradeCatalog() || [], game);
      for (var pick = 0; pick < pool.length; pick += 1) {
        var applied = game._grantUpgradeChoice(pool[pick]);
        if (applied.ok) {
          messages.push(pool[pick].title + " acquired for free.");
          break;
        }
      }
    }

    switch (definition.cost) {
      case "boss":
        branchMap.bossPenalty = Number(branchMap.bossPenalty || 0) + 1;
        messages.push("The next boss you face will be one guess tougher.");
        break;
      case "money":
        game.state.cuddleMoney = Math.max(0, Number(game.state.cuddleMoney || 0) - EVENT_MONEY_COST);
        messages.push("Paid $" + EVENT_MONEY_COST + ".");
        break;
      case "guess":
        branchMap.pendingPenalty = Object.assign({}, branchMap.pendingPenalty, { guess: 1 });
        messages.push("The next round must be solved within the world's guess limit, or the run is lost.");
        break;
      case "mulligan":
        branchMap.pendingPenalty = Object.assign({}, branchMap.pendingPenalty, { mulligan: 1 });
        messages.push("The next round starts one mulligan short.");
        break;
      case "rewards":
        branchMap.pendingPenalty = Object.assign({}, branchMap.pendingPenalty, { rewards: true });
        messages.push("The next round offers no reward of its own.");
        break;
      case "noMoney":
        branchMap.pendingPenalty = Object.assign({}, branchMap.pendingPenalty, { noMoney: true });
        messages.push("The next round's solve is worth $0.");
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
      messages.push("+$" + EVENT_WINDFALL_AMOUNT + ", free.");
    }

    return definition.title + ": " + messages.join(" ");
  }

  function openShop(game, node) {
    var campaign = window.CuddleCampaign && typeof window.CuddleCampaign.ensureCampaign === "function"
      ? window.CuddleCampaign.ensureCampaign(game)
      : null;
    if (!campaign || node.shopSlot == null) {
      game.state.lastMessage = "The shop was shuttered; the road goes on.";
      returnToMap(game);
      return;
    }
    var slot = Number(node.shopSlot);
    if (campaign.shopsVisited.indexOf(slot) === -1) {
      campaign.shopsVisited.push(slot);
      campaign.shopsVisited.sort(function bySize(a, b) { return a - b; });
    }
    campaign.activeShopRound = slot;
    if (!Array.isArray(campaign.shopPurchases[String(slot)])) campaign.shopPurchases[String(slot)] = [];
    game.state.status = "shop";
    game.state.lastMessage = "The Wandering Paw is open.";
  }

  function openUpgradeStop(game) {
    var choices = typeof game._generateUpgradeChoices === "function" ? game._generateUpgradeChoices() : [];
    if (!choices.length) {
      game.state.lastMessage = "The waystone had nothing left to offer.";
      returnToMap(game);
      return;
    }
    game.state.status = "upgrade";
    game.state.upgradePhase = "round";
    game.state.upgradeMilestone = null;
    game.state.upgradeChoices = choices;
    game.state.lastMessage = "A waystone: take one permanent upgrade.";
  }

  // Bosses go through the real _openBossGate/chooseBoss chain (which retimes
  // a boss from its run stage and sets up hidden indices/quick mode) rather
  // than a hand-built state.boss -- the pool is swapped for this one node's
  // boss just long enough for that call.
  function startBoss(game, node) {
    /* UMT_CUDDLE_STABILITY_V2_TWO_BOSS_OFFER */
    var branchMap = ensureBranchMap(game);
    var book = window.CuddleQuestBook;
    var candidates = [];
    function addCandidate(definition) {
      if (!definition || !definition.id) return;
      if (candidates.some(function sameBoss(item) { return item.id === definition.id; })) return;
      var reward = definition.reward || (book && typeof book.getBossReward === "function"
        ? book.getBossReward(definition.rewardId)
        : null);
      candidates.push(Object.assign({}, definition, { reward: reward || null }));
    }
    var requested = Array.isArray(node.bossIds) ? node.bossIds.slice() : [];
    if (node.bossId != null) requested.unshift(node.bossId);
    requested.forEach(function addRequested(id) {
      var definition = book && typeof book.getBoss === "function" ? book.getBoss(id) : null;
      addCandidate(definition);
    });
    var exclusions = (game.state.bossesSeen || []).concat(candidates.map(function bossId(item) { return item.id; }));
    for (var attempt = 0; attempt < 10 && candidates.length < 2; attempt += 1) {
      drawBosses(game, 2, exclusions).forEach(addCandidate);
      exclusions = (game.state.bossesSeen || []).concat(candidates.map(function bossId(item) { return item.id; }));
    }
    if (book && Array.isArray(book.BOSSES)) shuffled(book.BOSSES, game).forEach(addCandidate);
    candidates = candidates.slice(0, 2);
    if (candidates.length < 2) {
      game.state.lastMessage = "Two distinct bosses could not be prepared.";
      returnToMap(game);
      return;
    }
    branchMap.pendingBossGate = node.gate;
    var stash = window.CuddleQuestBook;
    window.CuddleQuestBook = Object.assign({}, stash, {
      bossChoices: function pairedBossChoices() {
        return candidates.map(function cloneBoss(candidate) { return Object.assign({}, candidate); });
      }
    });
    var opened;
    try {
      opened = game._openBossGate(game.state.round);
    } finally {
      window.CuddleQuestBook = stash;
      branchMap.pendingBossGate = null;
    }
    if (!opened) {
      returnToMap(game);
      return;
    }
    game.state.roundIntroPending = false;
    if (typeof game.save === "function") game.save();
  }

  function beginRoundForNode(game, node) {
    var branchMap = ensureBranchMap(game);
    branchMap.roundsPlayed = Math.min(TOTAL_ROUNDS, Number(branchMap.roundsPlayed || 0) + 1);
    game.state.round = branchMap.roundsPlayed;
    game.state.lastClearedBossGate = null;

    if (node.type === "challenge") {
      // maybeOfferChallenge runs inside _beginRound and is chance-based with
      // a pity counter; parking the counter high forces this round's offer.
      var mode = game.state.cuddleMoneyMode;
      if (mode) mode.noOfferStreak = 999;
    }

    if (node.type === "boss") {
      startBoss(game, node);
      return;
    }

    game._beginRound();
    if (typeof game.dismissRoundIntro === "function" && game.state.roundIntroPending) {
      // The map already IS the between-rounds screen, so the old round-intro
      // card is skipped -- dismissRoundIntro is what seeds the first quest.
      game.dismissRoundIntro();
    }
    if (node.type === "theme" && window.CuddleCampaign
        && typeof window.CuddleCampaign.queueCategoryReveal === "function") {
      window.CuddleCampaign.queueCategoryReveal(game, 1, "branch");
    }
  }

  function enterNode(game, node) {
    var branchMap = ensureBranchMap(game);
    branchMap.position = { row: node.row, col: node.col };
    if (!Array.isArray(branchMap.visited)) branchMap.visited = [];
    branchMap.visited.push({ row: node.row, col: node.col, type: node.type });

    var definition = NODE_TYPES[node.type] || NODE_TYPES.normal;
    if (definition.playsRound) {
      beginRoundForNode(game, node);
      return { ok: true };
    }

    if (node.type === "shop") {
      openShop(game, node);
      return { ok: true };
    }
    if (node.type === "upgrade") {
      openUpgradeStop(game);
      return { ok: true };
    }
    if (node.type === "event") {
      var message = applyEvent(game, node);
      returnToMap(game);
      if (message) game.state.lastMessage = message;
      return { ok: true, message: message };
    }
    returnToMap(game);
    return { ok: true };
  }

  // -- prototype wiring ----------------------------------------------------

  var originalStartNew = proto.startNew;
  proto.startNew = function startNewWithBranchMap() {
    var result = originalStartNew.apply(this, arguments);
    previewKey = null;
    this.state.branchMap = null;
    generateMap(this);
    // startNew already prepared round 1; the map is the first screen now, so
    // that round is re-prepared when the first Wordle node is actually
    // entered and roundsPlayed drives the numbering from there.
    ensureBranchMap(this).roundsPlayed = 0;
    returnToMap(this);
    this.save();
    return typeof this.getSnapshot === "function" ? this.getSnapshot() : result;
  };

  proto._bossGateFor = function bossGateForBranchMap(roundValue) {
    var branchMap = this.state && this.state.branchMap;
    if (branchMap && branchMap.pendingBossGate) return branchMap.pendingBossGate;
    if (!hasMap(this)) {
      var value = Number(roundValue) || 1;
      return value > TOTAL_ROUNDS ? FINAL_BOSS_GATE : null;
    }
    return null;
  };

  var originalAdvanceRound = proto._advanceRound;
  proto._advanceRound = function advanceThroughBranchMap() {
    if (!hasMap(this)) return originalAdvanceRound.apply(this, arguments);
    if (this.state.status === "won" || this.state.status === "lost") return undefined;
    // The base engine's _advanceRound (never reached from here, since the
    // branch map replaces its "next round" logic with returnToMap) is also
    // where the reward-refresh cost normally resets between screens. Reset
    // it here too, or the cost keeps climbing across every reward screen
    // for the whole run instead of starting free again each time.
    this.state.upgradeRefreshesUsed = 0;
    returnToMap(this);
    this.save();
    return undefined;
  };

  var originalLeaveShop = proto.leaveCuddleShop;
  proto.leaveCuddleShop = function leaveShopIntoBranchMap() {
    if (!hasMap(this)) return originalLeaveShop.apply(this, arguments);
    if (this.state.status !== "shop") return { ok: false, error: "No shop is open." };
    var campaign = window.CuddleCampaign && typeof window.CuddleCampaign.ensureCampaign === "function"
      ? window.CuddleCampaign.ensureCampaign(this)
      : null;
    if (campaign) campaign.activeShopRound = null;
    this.state.lastMessage = "The road goes on.";
    returnToMap(this);
    this.save();
    return { ok: true, message: this.state.lastMessage };
  };

  var originalBeginRound = proto._beginRound;
  proto._beginRound = function beginRoundWithBranchPenalty() {
    var result = originalBeginRound.apply(this, arguments);
    var branchMap = ensureBranchMap(this);
    // The map is the between-rounds screen now, so the old round-intro card
    // (which renders the previous linear map) never gets to open, whichever
    // path called _beginRound.
    if (branchMap.rows.length && this.state.roundIntroPending
        && typeof this.dismissRoundIntro === "function") {
      this.dismissRoundIntro();
    }
    var penalty = branchMap.pendingPenalty;
    if (penalty) {
      if (penalty.guess && typeof this._applyStrictGuessLimit === "function") {
        // Must be solved inside the world's guess window (6/5/4) or the run
        // is lost -- this used to hide a row, which on a normal stage (no
        // guess cap) limited nothing.
        this._applyStrictGuessLimit();
      }
      if (penalty.mulligan) {
        this.state.mulligansLeft = Math.max(0, Number(this.state.mulligansLeft || 0) - penalty.mulligan);
      }
      if (penalty.rewards) branchMap.rewardsDisabledRound = this.state.round;
      if (penalty.noMoney) branchMap.noMoneyRound = this.state.round;
      branchMap.pendingPenalty = null;
    }
    return result;
  };

  var originalResolvePendingRoundEnd = proto._resolvePendingRoundEnd;
  proto._resolvePendingRoundEnd = function resolveRoundEndWithBranchPenalty() {
    var branchMap = ensureBranchMap(this);
    var round = this.state.round;
    var noMoneyFlag = Number(branchMap.noMoneyRound) === Number(round);
    var rewardsFlag = Number(branchMap.rewardsDisabledRound) === Number(round);
    // Voids only what the round's guesses earned: a stage-start grant was
    // already shown as banked (bankedScore), so taking it back here would
    // make the header count go backwards.
    var baseline = noMoneyFlag
      ? Number(this.state.score || 0)
        - Math.max(0, Number(this.state.roundScore || 0) - Number(this.state.roundOpeningPoints || 0))
      : null;
    var result = originalResolvePendingRoundEnd.apply(this, arguments);
    if (noMoneyFlag) {
      this.state.score = baseline;
      branchMap.noMoneyRound = null;
    }
    if (rewardsFlag) {
      branchMap.rewardsDisabledRound = null;
      if (this.state.status === "upgrade") {
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

  proto.enterBranchNode = function enterBranchNode(nodeId) {
    if (this.state.status !== MAP_STATUS) return { ok: false, error: "The map is not open." };
    var branchMap = ensureBranchMap(this);
    var parts = String(nodeId || "").split(":");
    var node = nodeAt(branchMap, Number(parts[0]), Number(parts[1]));
    if (!node) return { ok: false, error: "That stop is not on the map." };
    if (!isReachable(branchMap, node)) return { ok: false, error: "No path leads there from here." };
    if (node.type === "boss") {
      var required = bossPointRequirement(this, node.gate);
      var current = Number(this.state.score || 0);
      if (required && current < required) {
        return {
          ok: false,
          error: "You need " + required + " points to challenge this boss (you have " + current + ")."
        };
      }
    }
    var result = enterNode(this, node);
    this.save();
    return result;
  };

  // -- rendering -----------------------------------------------------------

  var ROW_HEIGHT = 68;
  var MAP_WIDTH = 300;
  var NODE_RADIUS = 15;
  var SIDE_MARGIN = 52;
  var TOP_MARGIN = 26;

  function nodeX(count, index) {
    if (count <= 1) return MAP_WIDTH / 2;
    return SIDE_MARGIN + (index * (MAP_WIDTH - SIDE_MARGIN * 2)) / (count - 1);
  }

  // Row 0 (the start) renders at the bottom and each later row climbs
  // higher, so the run reads bottom-to-top like the route it describes.
  function nodeY(rowIndex, rowCount) {
    return TOP_MARGIN + (rowCount - 1 - rowIndex) * ROW_HEIGHT;
  }

  function nodeIcon(node) {
    if (node.type === "boss") return node.bossIcon || NODE_TYPES.boss.icon;
    return (NODE_TYPES[node.type] || NODE_TYPES.normal).icon;
  }

  function nodeLabel(node) {
    if (node.type === "boss") return "Boss";
    return (NODE_TYPES[node.type] || NODE_TYPES.normal).label;
  }

  function nodeTitle(node) {
    if (node.type === "boss") return node.bossTitle || "Boss";
    return (NODE_TYPES[node.type] || NODE_TYPES.normal).title;
  }

  function nodeDescription(game, node) {
    if (node.type === "boss") {
      var base = (node.bossDescription ? node.bossDescription + " " : "")
        + "Pass or fail, and its reward is permanent.";
      var required = bossPointRequirement(game, node.gate);
      var current = Number((game && game.state && game.state.score) || 0);
      if (required && current < required) {
        base += " Locked: reach " + required + " points to challenge it (you have " + current + ").";
      }
      return base;
    }
    if (node.type === "event") {
      for (var index = 0; index < EVENTS.length; index += 1) {
        if (EVENTS[index].id === node.eventId) return EVENTS[index].description;
      }
    }
    return (NODE_TYPES[node.type] || NODE_TYPES.normal).description;
  }

  // -- world map ------------------------------------------------------------
  // The run drawn as a climb through three themed worlds (cuddle-worlds.js):
  // up to three lanes per row, curved trails that weave between them, and
  // one clear icon per kind of stop. Row 0 still sits at the bottom.

  var WORLD_MAP_WIDTH = 360;
  var LANE_X = [76, 180, 284];
  var WORLD_ROW_GAP = 94;
  var WORLD_BOSS_PAD = 24;
  var WORLD_HEAD = 62;
  var STOP_RADIUS = 20;
  var BOSS_RADIUS = 28;

  var VARIANT_CAPTIONS = {
    plain: "Classic",
    themedWordle: "Themed",
    randomOpener: "Head Start",
    luckyStart: "Lucky Start",
    jackpot: "Jackpot",
    doubleOrNothing: "Double or Nothing"
  };

  function worldHash(text) {
    var hash = 2166136261;
    for (var index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function worldRandom(seedText) {
    var value = worldHash(seedText) || 0x6d2b79f5;
    return function next() {
      value = (value + 0x6d2b79f5) >>> 0;
      var output = value;
      output = Math.imul(output ^ (output >>> 15), output | 1);
      output ^= output + Math.imul(output ^ (output >>> 7), output | 61);
      return ((output ^ (output >>> 14)) >>> 0) / 4294967296;
    };
  }

  function stopCaption(node) {
    var kind = window.CuddleWorlds.kindForNode(node);
    if (kind === "final") return "Final Boss";
    if (kind === "boss") return node.gate === "before-7" ? "Boss II" : "Boss I";
    if (kind === "mystery") return "Unknown";
    var variant = node.cuddleVariant;
    if (variant && (kind === "wordle" || kind === "challenge")) {
      if (variant.kind === "mandatoryChallenge") return variant.title || "Challenge";
      if (VARIANT_CAPTIONS[variant.kind]) return VARIANT_CAPTIONS[variant.kind];
    }
    if (node.type === "theme") return "Themed";
    if (kind === "upgrade") return "Waystone";
    return window.CuddleWorlds.KIND_NAMES[kind] || "Wordle";
  }

  function laneX(row, node, col) {
    if (Number.isInteger(node.lane)) return LANE_X[Math.max(0, Math.min(2, node.lane))];
    var count = row.nodes.length;
    if (count <= 1) return LANE_X[1];
    if (count === 2) return col === 0 ? 110 : 250;
    return LANE_X[Math.min(2, col)];
  }

  // Row positions, bottom-up: each world opens with room for its title,
  // bosses get a little extra air, and the result is flipped so row 0 lands
  // at the bottom of the SVG.
  function worldLayout(branchMap) {
    var rows = branchMap.rows;
    var fromBottom = [];
    var worldOf = [];
    var worlds = [];
    var cursor = 20;
    rows.forEach(function place(row, rowIndex) {
      var world = window.CuddleWorlds.worldForRow(branchMap, rowIndex).index;
      worldOf[rowIndex] = world;
      if (rowIndex === 0 || world !== worldOf[rowIndex - 1]) {
        worlds.push({ index: world, start: cursor, firstRow: rowIndex });
        cursor += WORLD_HEAD;
      }
      var boss = row.kind === "boss" || row.nodes.some(function isBoss(node) { return node.type === "boss"; });
      if (boss) cursor += WORLD_BOSS_PAD;
      fromBottom[rowIndex] = cursor + BOSS_RADIUS;
      cursor = fromBottom[rowIndex] + WORLD_ROW_GAP - BOSS_RADIUS;
      if (boss) cursor += WORLD_BOSS_PAD;
      worlds[worlds.length - 1].end = cursor;
    });
    var height = Math.round(fromBottom[rows.length - 1] + 92);
    worlds.forEach(function flip(world, index) {
      world.bottom = index === 0 ? height : height - world.start;
      world.top = index === worlds.length - 1 ? 0 : height - world.end;
      world.titleY = height - world.start - 30;
    });
    return {
      height: height,
      worlds: worlds,
      rowY: function rowY(rowIndex) { return height - fromBottom[rowIndex]; }
    };
  }

  function worldDecor(world, band, random) {
    var parts = [];
    var span = Math.max(1, band.bottom - band.top);
    var count = Math.max(4, Math.round(span / 70));
    for (var index = 0; index < count * 2; index += 1) {
      var left = index % 2 === 0;
      var x = left ? 6 + random() * 38 : WORLD_MAP_WIDTH - 6 - random() * 38;
      var y = band.top + 30 + random() * Math.max(10, span - 50);
      var scale = 0.65 + random() * 0.7;
      if (world.id === "woods") {
        var shade = ["#12382a", "#174632", "#1d5139"][Math.floor(random() * 3)];
        parts.push("<g transform=\"translate(" + x.toFixed(1) + " " + y.toFixed(1) + ") scale(" + scale.toFixed(2) + ")\">"
          + "<rect x=\"-2\" y=\"14\" width=\"4\" height=\"7\" fill=\"#0b2118\"/>"
          + "<path d=\"M0-28-9-10h4l-8 11h5l-9 12h34l-9-12h5l-8-11h4z\" fill=\"" + shade + "\"/></g>");
      } else if (world.id === "caverns") {
        var hue = random() < 0.5 ? "#6f5cf0" : "#46b8e8";
        var tilt = (random() * 40 - 20).toFixed(0);
        parts.push("<g transform=\"translate(" + x.toFixed(1) + " " + y.toFixed(1) + ") scale(" + scale.toFixed(2) + ") rotate(" + tilt + ")\" opacity=\"0.8\">"
          + "<path d=\"M0 0-6-16 0-28 6-16z\" fill=\"" + hue + "\"/><path d=\"M0-28 6-16 0 0z\" fill=\"#fff\" fill-opacity=\".22\"/>"
          + "<path d=\"M-7 2-11-8-8-15-4-7z\" fill=\"" + hue + "\" fill-opacity=\".75\"/></g>");
      } else {
        parts.push("<g transform=\"translate(" + x.toFixed(1) + " " + y.toFixed(1) + ") scale(" + scale.toFixed(2) + ")\">"
          + "<path d=\"M-8 12V-18h-3v-7h4v3h4v-3h6v3h4v-3h4v7h-3v30z\" fill=\"#1f080c\" stroke=\"#5a1a1f\" stroke-width=\"1\"/>"
          + "<rect x=\"-2\" y=\"-10\" width=\"4\" height=\"6\" rx=\"2\" fill=\"#ffb36b\" fill-opacity=\".75\"/></g>");
      }
    }
    // Ambient sparks: fireflies, crystal glints, rising embers.
    var sparkCount = Math.max(5, Math.round(span / 55));
    for (var spark = 0; spark < sparkCount; spark += 1) {
      var sx = 20 + random() * (WORLD_MAP_WIDTH - 40);
      var sy = band.top + 20 + random() * Math.max(10, span - 40);
      var delay = (random() * 4).toFixed(2);
      parts.push("<circle class=\"umt-map-spark umt-map-spark-" + world.id + "\" cx=\"" + sx.toFixed(1) + "\" cy=\"" + sy.toFixed(1)
        + "\" r=\"" + (1 + random() * 1.4).toFixed(2) + "\" style=\"animation-delay:-" + delay + "s\"/>");
    }
    return parts.join("");
  }

  function trailPath(x1, y1, x2, y2) {
    var mid = (y1 + y2) / 2;
    return "M" + x1 + " " + y1 + " C" + x1 + " " + mid + " " + x2 + " " + mid + " " + x2 + " " + y2;
  }

  function pawMarker() {
    return "<g class=\"umt-map-paw\" aria-hidden=\"true\">"
      + "<ellipse cx=\"0\" cy=\"3\" rx=\"6.2\" ry=\"5.2\"/>"
      + "<ellipse cx=\"-6.6\" cy=\"-3.6\" rx=\"2.3\" ry=\"2.9\"/><ellipse cx=\"-2.3\" cy=\"-6.8\" rx=\"2.3\" ry=\"2.9\"/>"
      + "<ellipse cx=\"2.3\" cy=\"-6.8\" rx=\"2.3\" ry=\"2.9\"/><ellipse cx=\"6.6\" cy=\"-3.6\" rx=\"2.3\" ry=\"2.9\"/></g>";
  }

  function renderWorldMapSvg(game, branchMap) {
    var Worlds = window.CuddleWorlds;
    try {
      if (window.CuddleRebalanceV5 && typeof window.CuddleRebalanceV5.assignMapVariants === "function") {
        window.CuddleRebalanceV5.assignMapVariants(game);
      }
    } catch (_error) {}
    var rows = branchMap.rows;
    var layout = worldLayout(branchMap);
    var reachable = reachableNodes(branchMap);
    var here = currentNode(branchMap);
    var hereRow = here ? here.row : -1;
    var seed = String((game && game.state && game.state.runId) || "run");
    var defs = [];
    var bands = [];
    var trails = [];
    var nodes = [];

    function isOpen(node) {
      return reachable.some(function match(candidate) {
        return candidate.row === node.row && candidate.col === node.col;
      });
    }
    function position(rowIndex, col) {
      var row = rows[rowIndex];
      var node = row.nodes[col];
      var jitter = row.nodes.length > 1 ? (worldHash(seed + ":" + rowIndex + ":" + col) % 13) - 6 : 0;
      return { x: laneX(row, node, col) + jitter, y: layout.rowY(rowIndex) };
    }

    layout.worlds.forEach(function drawBand(band, bandIndex) {
      var world = Worlds.world(band.index);
      var gradientId = "umtWorldSky" + bandIndex;
      defs.push("<linearGradient id=\"" + gradientId + "\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\">"
        + "<stop offset=\"0\" stop-color=\"" + world.skyTop + "\"/><stop offset=\"1\" stop-color=\"" + world.skyBottom + "\"/></linearGradient>");
      bands.push("<g class=\"umt-map-world umt-map-world-" + world.id + "\">"
        + "<rect x=\"0\" y=\"" + band.top + "\" width=\"" + WORLD_MAP_WIDTH + "\" height=\"" + (band.bottom - band.top) + "\" fill=\"url(#" + gradientId + ")\"/>"
        + worldDecor(world, band, worldRandom(seed + ":decor:" + world.id))
        + "<g class=\"umt-map-world-title\" transform=\"translate(" + (WORLD_MAP_WIDTH / 2) + " " + band.titleY + ")\">"
        + "<path d=\"M-118 0h58M60 0h58\" stroke=\"" + world.accent + "\" stroke-opacity=\".45\" stroke-width=\"1\"/>"
        + "<text class=\"umt-map-world-eyebrow\" text-anchor=\"middle\" y=\"-8\" fill=\"" + world.accent + "\">WORLD " + (world.index + 1) + "</text>"
        + "<text class=\"umt-map-world-name\" text-anchor=\"middle\" y=\"10\">" + escapeHtml(world.name) + "</text>"
        + "</g></g>");
      if (bandIndex > 0) {
        // Soft seam where one world gives way to the next.
        var seamId = "umtWorldSeam" + bandIndex;
        defs.push("<linearGradient id=\"" + seamId + "\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\">"
          + "<stop offset=\"0\" stop-color=\"#000\" stop-opacity=\"0\"/><stop offset=\".5\" stop-color=\"#000\" stop-opacity=\".45\"/>"
          + "<stop offset=\"1\" stop-color=\"#000\" stop-opacity=\"0\"/></linearGradient>");
        bands.push("<rect x=\"0\" y=\"" + (band.bottom - 36) + "\" width=\"" + WORLD_MAP_WIDTH + "\" height=\"72\" fill=\"url(#" + seamId + ")\"/>");
      }
    });

    rows.forEach(function drawTrails(row, rowIndex) {
      var nextRow = rows[rowIndex + 1];
      if (!nextRow) return;
      var world = Worlds.worldForRow(branchMap, rowIndex + 1);
      row.nodes.forEach(function drawFrom(node, col) {
        var from = position(rowIndex, col);
        (node.next || []).forEach(function drawTo(targetCol) {
          var target = nextRow.nodes[targetCol];
          if (!target) return;
          var to = position(rowIndex + 1, targetCol);
          var live = Boolean(here && here.row === node.row && here.col === node.col && isOpen(target));
          var walked = wasVisited(branchMap, node) && wasVisited(branchMap, target);
          var state = walked ? "walked" : live ? "live" : rowIndex < hereRow ? "past" : "ahead";
          var d = trailPath(from.x, from.y, to.x, to.y);
          trails.push("<path class=\"umt-trail-bed\" d=\"" + d + "\"/>"
            + "<path class=\"umt-trail umt-trail-" + state + "\" d=\"" + d + "\" style=\"--world-accent:" + world.accent + "\"/>");
        });
      });
    });

    // The final boss sits in front of the eclipse.
    rows.forEach(function drawNodes(row, rowIndex) {
      row.nodes.forEach(function drawNode(node, col) {
        var point = position(rowIndex, col);
        var kind = Worlds.kindForNode(node);
        var color = Worlds.KIND_COLORS[kind] || Worlds.KIND_COLORS.wordle;
        var boss = node.type === "boss";
        var radius = boss ? BOSS_RADIUS : STOP_RADIUS;
        var iconSize = boss ? 32 : 24;
        var visited = wasVisited(branchMap, node);
        var isHere = Boolean(here && here.row === node.row && here.col === node.col);
        var open = isOpen(node);
        var state = isHere ? "here" : open ? "open" : visited ? "visited" : rowIndex < hereRow ? "skipped" : "locked";
        var classes = ["cuddle-map-node", "umt-node", "umt-kind-" + kind, "umt-state-" + state,
          boss ? "cuddle-map-node-boss" : "cuddle-map-node-stop",
          isHere ? "cuddle-map-node-here" : open ? "cuddle-map-node-open" : visited ? "cuddle-map-node-visited" : "cuddle-map-node-locked"];
        var world = Worlds.worldForRow(branchMap, rowIndex);
        var caption = stopCaption(node);
        var title = nodeTitle(node);
        var extras = "";
        if (kind === "final") {
          extras += "<circle class=\"umt-eclipse-corona\" r=\"" + (radius + 26) + "\"/>"
            + "<circle class=\"umt-eclipse-ring\" r=\"" + (radius + 14) + "\"/>";
        } else if (boss) {
          extras += "<circle class=\"umt-boss-aura\" r=\"" + (radius + 18) + "\" style=\"--world-glow:" + world.glow + "\"/>";
        }
        if (open) extras += "<circle class=\"umt-node-halo\" r=\"" + (radius + 7) + "\"/>";
        nodes.push(
          "<g class=\"" + classes.join(" ") + "\" transform=\"translate(" + point.x + "," + point.y + ")\" style=\"--kind:" + color + "\""
          + (open
            ? " data-cuddle-campaign-action=\"preview-branch-node\" data-shop-item-id=\"" + node.row + ":" + node.col + "\""
              + " role=\"button\" tabindex=\"0\" aria-label=\"" + escapeHtml(caption + " — " + title) + "\""
            : " data-shop-item-id=\"" + node.row + ":" + node.col + "\" aria-hidden=\"true\"")
          + ">"
          + extras
          + "<circle class=\"umt-node-disc\" r=\"" + radius + "\"/>"
          + "<circle class=\"umt-node-core\" r=\"" + (radius - 4) + "\"/>"
          + "<g class=\"umt-node-icon\" transform=\"translate(" + (-iconSize / 2) + " " + (-iconSize / 2) + ") scale(" + (iconSize / 24) + ")\">"
          + Worlds.iconMarkup(kind) + "</g>"
          + (visited && !isHere
            ? "<g class=\"umt-node-check\" transform=\"translate(" + (radius * 0.72) + " " + (-radius * 0.72) + ")\">"
              + "<circle r=\"6.5\"/><path d=\"M-3 0l2 2.2L3.2-2.4\"/></g>"
            : "")
          + (isHere ? "<g transform=\"translate(0 " + (-radius - 15) + ")\">" + pawMarker() + "</g>" : "")
          + "<text class=\"umt-node-label\" text-anchor=\"middle\" y=\"" + (kind === "final" ? radius + 32 : boss ? radius + 22 : radius + 15) + "\">" + escapeHtml(caption) + "</text>"
          + "</g>"
        );
      });
    });

    return (
      "<div class=\"cuddle-world-map umt-map-v2\" data-cuddle-branch-scroll>"
      + "<svg class=\"umt-world-map-svg\" viewBox=\"0 0 " + WORLD_MAP_WIDTH + " " + layout.height + "\" role=\"img\" aria-label=\"Run map\">"
      + "<defs>" + defs.join("") + "</defs>"
      + bands.join("")
      + "<g class=\"umt-map-trails\">" + trails.join("") + "</g>"
      + "<g class=\"umt-map-nodes\">" + nodes.join("") + "</g>"
      + "</svg></div>"
    );
  }

  function renderMapSvg(game, branchMap) {
    if (window.CuddleWorlds) return renderWorldMapSvg(game, branchMap);
    var rows = branchMap.rows;
    var reachable = reachableNodes(branchMap);
    var here = currentNode(branchMap);
    var height = TOP_MARGIN * 2 + (rows.length - 1) * ROW_HEIGHT + NODE_RADIUS + 16;
    var edges = [];
    var nodes = [];

    function isReachableNode(node) {
      return reachable.some(function match(candidate) {
        return candidate.row === node.row && candidate.col === node.col;
      });
    }

    rows.forEach(function drawEdges(row, rowIndex) {
      var nextRow = rows[rowIndex + 1];
      if (!nextRow) return;
      row.nodes.forEach(function drawFrom(node, col) {
        var fromX = nodeX(row.nodes.length, col);
        var fromY = nodeY(rowIndex, rows.length);
        (node.next || []).forEach(function drawTo(targetCol) {
          var target = nextRow.nodes[targetCol];
          if (!target) return;
          var toX = nodeX(nextRow.nodes.length, targetCol);
          var toY = nodeY(rowIndex + 1, rows.length);
          var live = here && here.row === node.row && here.col === node.col && isReachableNode(target);
          var walked = wasVisited(branchMap, node) && wasVisited(branchMap, target);
          var className = walked ? "cuddle-map-line-walked" : live ? "cuddle-map-line-live" : "cuddle-map-line";
          edges.push(
            "<path class=\"" + className + "\" d=\"M" + fromX + " " + (fromY - NODE_RADIUS)
            + " L " + toX + " " + (toY + NODE_RADIUS) + "\" />"
          );
        });
      });
    });

    rows.forEach(function drawNodes(row, rowIndex) {
      row.nodes.forEach(function drawNode(node, col) {
        var x = nodeX(row.nodes.length, col);
        var y = nodeY(rowIndex, rows.length);
        var visited = wasVisited(branchMap, node);
        var isHere = Boolean(here && here.row === node.row && here.col === node.col);
        var open = isReachableNode(node);
        var classes = ["cuddle-map-node"];
        classes.push(node.type === "boss" ? "cuddle-map-node-boss" : "cuddle-map-node-stop");
        if (isHere) classes.push("cuddle-map-node-here");
        else if (open) classes.push("cuddle-map-node-open");
        else if (visited) classes.push("cuddle-map-node-visited");
        else classes.push("cuddle-map-node-locked");
        nodes.push(
          "<g class=\"" + classes.join(" ") + "\" transform=\"translate(" + x + "," + y + ")\""
          + (open
            ? " data-cuddle-campaign-action=\"preview-branch-node\" data-shop-item-id=\"" + node.row + ":" + node.col + "\""
              + " role=\"button\" tabindex=\"0\" aria-label=\"" + escapeHtml(nodeTitle(node)) + "\""
            : " aria-hidden=\"true\"")
          + ">"
          + "<circle r=\"" + NODE_RADIUS + "\"></circle>"
          + "<text class=\"cuddle-map-node-icon\" text-anchor=\"middle\" dy=\"0.32em\">" + escapeHtml(nodeIcon(node)) + "</text>"
          + "<text class=\"cuddle-map-node-label\" text-anchor=\"middle\" y=\"" + (NODE_RADIUS + 13) + "\">" + escapeHtml(nodeLabel(node)) + "</text>"
          + "</g>"
        );
      });
    });

    return (
      "<div class=\"cuddle-branch-map\" data-cuddle-branch-scroll>"
      + "<svg class=\"cuddle-branch-map-svg\" viewBox=\"0 0 " + MAP_WIDTH + " " + height + "\" role=\"img\" aria-label=\"Run map\">"
      + edges.join("")
      + nodes.join("")
      + "</svg></div>"
    );
  }

  // Resolves the ephemeral preview selection against the live map, clearing
  // it out if the node it pointed at is no longer reachable (stop consumed,
  // a fresh run generated a new map, etc.).
  function previewedNode(game, branchMap) {
    if (!previewKey) return null;
    var parts = previewKey.split(":");
    var node = nodeAt(branchMap, Number(parts[0]), Number(parts[1]));
    if (!node || !isReachable(branchMap, node)) {
      previewKey = null;
      return null;
    }
    return node;
  }

  // The lock meter's own copy of a boss's flavor text, without the
  // "Locked: reach N points..." sentence nodeDescription appends for the
  // plain-text spots (the map's choice-card <small>) -- the meter below
  // already shows that same information visually.
  function bossFlavorText(node) {
    return (node.bossDescription ? node.bossDescription + " " : "") + "Pass or fail, and its reward is permanent.";
  }

  function renderBossLockPanel(game, node, required, current, locked) {
    var pct = required ? Math.max(0, Math.min(100, Math.round((current / required) * 100))) : 100;
    return (
      "<div class=\"cuddle-boss-lock" + (locked ? "" : " cuddle-boss-lock-open") + "\">"
      + "<div class=\"cuddle-boss-lock-icon\" aria-hidden=\"true\">" + (locked ? "🔒" : "🔓") + "</div>"
      + "<div class=\"cuddle-boss-lock-meter\"><div class=\"cuddle-boss-lock-meter-fill\" style=\"width:" + pct + "%\"></div></div>"
      + "<div class=\"cuddle-boss-lock-label\">" + current + " / " + required + " points"
      + (locked ? "" : " — unlocked") + "</div>"
      + "</div>"
    );
  }

  // The preview wears the stop's category colour and the same icon as the
  // map node (cuddle-worlds.js), with a chip naming the kind of stop.
  function previewKindStyle(node) {
    if (!window.CuddleWorlds) return "";
    var kind = window.CuddleWorlds.kindForNode(node);
    return " data-umt-stop-kind=\"" + kind + "\" style=\"--kind:" + window.CuddleWorlds.KIND_COLORS[kind] + "\"";
  }

  function previewIcon(node) {
    if (!window.CuddleWorlds) return "<span class=\"cuddle-choice-icon\">" + escapeHtml(nodeIcon(node)) + "</span>";
    var kind = window.CuddleWorlds.kindForNode(node);
    return "<span class=\"cuddle-choice-icon umt-preview-icon\">" + window.CuddleWorlds.iconSvg(kind) + "</span>"
      + "<span class=\"umt-preview-kind\">" + escapeHtml(window.CuddleWorlds.KIND_NAMES[kind] || "Stop") + "</span>";
  }

  // Money reads gold and points read green everywhere in a stop's
  // briefing, so what a stop pays can be seen at a glance.
  function rewardText(text) {
    return escapeHtml(text)
      .replace(/[+\-]?\$\s?\d[\d,]*/g, function money(match) { return "<b class=\"umt-money\">" + match + "</b>"; })
      .replace(/[+\-]?\d[\d,]*\s?(?:points|point|pts)\b/g, function points(match) { return "<b class=\"umt-points\">" + match + "</b>"; });
  }

  var VARIANT_SUMMARIES = {
    plain: "A standard Wordle, nothing added.",
    themedWordle: "Starts with a theme of the answer revealed.",
    randomOpener: "A random word is played for you as your first guess.",
    luckyStart: "Starts with one letter already in its place.",
    jackpot: "Greens are worth double here.",
    doubleOrNothing: "A gamble on a fast solve."
  };

  // What a stop is, what it pays and what it risks, as separate pieces
  // rather than one paragraph.
  function stopBriefing(game, node) {
    var worlds = window.CuddleWorlds;
    var kind = worlds ? worlds.kindForNode(node) : node.type;
    var expanded = window.CuddleExpandedStages;
    var meta = expanded && typeof expanded.stopMeta === "function" ? expanded.stopMeta(node, game) : null;
    var rebalance = window.CuddleRebalanceV5;
    var variant = rebalance && typeof rebalance.stopVariant === "function" ? rebalance.stopVariant(game, node) : null;
    var brief = { title: nodeTitle(node), summary: "", gets: [], risks: [], options: null };
    var rules = {};
    try { rules = game.getRulesSummary() || {}; } catch (_error) { rules = {}; }
    var limit = typeof game._solveGuessThreshold === "function" ? game._solveGuessThreshold() : 6;
    function stageBase() {
      if (rules.greenPoints != null) {
        brief.gets.push({ type: "points", text: "+" + rules.greenPoints + " pts per green, +" + rules.yellowPoints + " per yellow" });
      }
      brief.gets.push({ type: "money", text: "Money for every useful tile" });
    }

    if (kind === "wordle" || (kind === "challenge" && !variant)) {
      var variantKind = variant ? variant.kind : node.type === "theme" ? "themedWordle" : "plain";
      brief.title = variant && variant.title ? variant.title : meta && meta.title ? meta.title : brief.title;
      brief.summary = VARIANT_SUMMARIES[variantKind] || (meta && meta.description) || "Solve the word to move on.";
      stageBase();
      if (variantKind === "jackpot") {
        brief.gets.unshift({ type: "points", text: "Greens pay double" });
        brief.risks.push("Solve within " + limit + " guesses or the run is lost");
      } else if (variantKind === "doubleOrNothing") {
        brief.gets.unshift({ type: "money", text: "Stage money ×2 if solved by guess 3" });
        brief.risks.push("Take longer and lose half the stage money");
      } else if (variantKind === "luckyStart") {
        brief.gets.unshift({ type: "perk", text: "One letter placed for you" });
      } else if (variantKind === "randomOpener") {
        brief.gets.unshift({ type: "perk", text: "Free opening guess" });
      } else if (variantKind === "themedWordle") {
        var tier = Math.max(1, Math.min(3, Number(node.expandedThemeRevealTier || node.expandedProgressionTier) || 1));
        brief.gets.unshift({ type: "perk", text: tier === 1 ? "Every theme revealed" : tier === 2 ? "All themes but one revealed" : "One theme revealed" });
      }
      if (kind === "challenge" && meta) {
        brief.summary = "A Wordle with a rule against you.";
        brief.risks.push(meta.description);
      }
    } else if (kind === "challenge") {
      brief.title = variant.title;
      brief.summary = "A Wordle with a rule against you. Beat it for a bonus.";
      if (variant.reward > 0) {
        brief.gets.push({ type: "win", text: "On a win: +" + variant.reward + " pts · +$" + variant.reward });
      }
      stageBase();
      brief.risks.push(variant.description);
    } else if (kind === "event") {
      var event = expanded && typeof expanded.eventOptions === "function" ? expanded.eventOptions(node) : null;
      brief.title = meta && meta.title ? meta.title : brief.title;
      brief.summary = event && event.flavor ? event.flavor + " Choose one:" : "Choose one of two deals.";
      brief.options = event ? event.options : null;
      if (!brief.options && meta) brief.summary = meta.description;
    } else if (kind === "upgrade") {
      brief.summary = "A quiet waystone. No Wordle here.";
      brief.gets.push({ type: "perk", text: "Pick 1 of 3 free permanent upgrades" });
    } else if (kind === "duel") {
      brief.summary = meta ? meta.description : "Race an AI to the answer.";
      stageBase();
    } else if (kind === "mystery") {
      brief.title = "Unknown Stop";
      brief.summary = "Hidden until you step onto it. Could be anything on the road.";
    } else if (kind === "boss" || kind === "final") {
      brief.title = kind === "final" ? "Final Boss" : node.gate === "before-7" ? "Boss II" : "Boss I";
      brief.summary = "Choose one of two bosses. The one you leave behind returns later as a burden.";
      brief.gets.push({ type: "perk", text: "A permanent boss reward" });
      brief.risks.push("The boss's power works against you");
    }
    return brief;
  }

  function renderBriefing(brief) {
    var html = "<p class=\"umt-stop-summary\">" + rewardText(brief.summary) + "</p>";
    if (brief.options && brief.options.length) {
      html += "<div class=\"umt-stop-options\">" + brief.options.map(function option(item, index) {
        return "<div class=\"umt-stop-option\"><span class=\"umt-stop-option-tag\">" + (index === 0 ? "Safe" : "Bold") + "</span>"
          + "<strong>" + escapeHtml(item.title) + "</strong><span>" + rewardText(item.summary) + "</span></div>";
      }).join("") + "</div>";
    }
    if (brief.gets.length) {
      html += "<div class=\"umt-stop-block\"><h3>You get</h3><ul class=\"umt-stop-chips\">"
        + brief.gets.map(function chip(item) {
          var mark = item.type === "money" ? "$" : item.type === "points" ? "P" : item.type === "win" ? "★" : "✦";
          return "<li class=\"is-" + item.type + "\"><i aria-hidden=\"true\">" + mark + "</i>" + rewardText(item.text) + "</li>";
        }).join("") + "</ul></div>";
    }
    if (brief.risks.length) {
      html += "<div class=\"umt-stop-block is-risk\"><h3>Watch out</h3><ul class=\"umt-stop-risks\">"
        + brief.risks.map(function risk(text) { return "<li>" + rewardText(text) + "</li>"; }).join("") + "</ul></div>";
    }
    return html;
  }

  function renderPreviewOverlay(game, node) {
    var required = node.type === "boss" ? bossPointRequirement(game, node.gate) : 0;
    var current = Number((game && game.state && game.state.score) || 0);
    var locked = Boolean(required) && current < required;
    var brief = window.CuddleWorlds ? stopBriefing(game, node) : null;
    return (
      "<div class=\"cuddle-overlay cuddle-branch-preview-overlay\">"
      + "<section class=\"cuddle-modal" + (brief ? " umt-stop-preview" : "") + "\"" + previewKindStyle(node) + ">"
      + previewIcon(node)
      + "<h2>" + escapeHtml(brief ? brief.title : nodeTitle(node)) + "</h2>"
      + (brief
        ? renderBriefing(brief)
        : "<p>" + goldenMoney(escapeHtml(node.type === "boss" ? bossFlavorText(node) : nodeDescription(game, node))) + "</p>")
      + (required ? renderBossLockPanel(game, node, required, current, locked) : "")
      + "<div class=\"cuddle-modal-actions\">"
      + "<button type=\"button\" class=\"cuddle-btn cuddle-btn-ghost\" data-cuddle-campaign-action=\"cancel-branch-node-preview\">Back</button>"
      + "<button type=\"button\" class=\"cuddle-btn\"" + (locked ? " disabled" : "")
      + " data-cuddle-campaign-action=\"confirm-branch-node\" data-shop-item-id=\""
      + node.row + ":" + node.col + "\">" + (locked ? "Locked" : "Choose this path") + "</button>"
      + "</div></section></div>"
    );
  }

  function renderMapScreen(game) {
    var state = game.state;
    var branchMap = ensureBranchMap(game);
    if (!branchMap.rows.length) generateMap(game);
    var open = reachableNodes(branchMap);
    var here = currentNode(branchMap);
    var previewing = previewedNode(game, branchMap);
    var heading = here ? "Where to next?" : "Plan your route";
    var intro = here
      ? "You are on the map. Only the stops your current path connects to are open."
      : "The whole run is laid out below. Every path ends at a boss, but no two reach the same stops on the way.";
    return (
      "<div class=\"cuddle-shell cuddle-branch-shell\""
      + (window.CuddleWorlds ? " data-umt-world=\"" + window.CuddleWorlds.currentWorld(game).id + "\"" : "")
      + ">"
      + "<header class=\"cuddle-header\">"
      + "<div class=\"cuddle-header-side\"><button class=\"cuddle-icon-btn\" data-action=\"run-menu\" aria-label=\"Cuddle menu\">←</button></div>"
      + "<div class=\"cuddle-header-title\">"
      + "<span class=\"cuddle-eyebrow\">THE ROAD AHEAD</span>"
      + "<div class=\"cuddle-header-title-line\">"
      + "<h1>" + heading + "</h1>"
      + "<span class=\"cuddle-header-score cuddle-header-points\" aria-label=\"" + escapeHtml(state.score) + " points\">" + escapeHtml(state.score) + "</span>"
      + "<span class=\"cuddle-header-money\" aria-label=\"" + escapeHtml(Number(state.cuddleMoney || 0)) + " money\">$" + escapeHtml(Number(state.cuddleMoney || 0)) + "</span>"
      + "</div></div>"
      + "<div class=\"cuddle-header-side cuddle-header-side-right\"></div>"
      + "</header>"
      + "<main class=\"cuddle-branch-page\">"
      + renderMapSvg(game, branchMap)
      // An event stop resolves without a screen of its own, so what it just
      // did to the run is only ever reported here.
      + (state.lastMessage
        ? "<p class=\"cuddle-branch-message\" role=\"status\">" + goldenMoney(escapeHtml(state.lastMessage)) + "</p>"
        : "")
      + "<p class=\"cuddle-branch-intro\">" + escapeHtml(intro) + "</p>"
      + "<div class=\"cuddle-choice-grid\">"
      + open.map(function renderOption(node, index) {
        // Two open stops of the same type would otherwise read as identical
        // cards, so each card names the fork it belongs to.
        var direction = open.length < 2 ? "" : open.length === 2
          ? (index === 0 ? " · left" : " · right")
          : (index === 0 ? " · left" : index === open.length - 1 ? " · right" : " · middle");
        return (
          "<button class=\"cuddle-choice cuddle-branch-choice\" data-cuddle-campaign-action=\"preview-branch-node\""
          + " data-shop-item-id=\"" + node.row + ":" + node.col + "\">"
          + "<span class=\"cuddle-choice-icon\">" + escapeHtml(nodeIcon(node)) + "</span>"
          + "<strong>" + escapeHtml(nodeTitle(node) + direction) + "</strong>"
          + "<small>" + goldenMoney(escapeHtml(nodeDescription(game, node))) + "</small>"
          + "</button>"
        );
      }).join("")
      + "</div>"
      + "</main></div>"
      + (previewing ? renderPreviewOverlay(game, previewing) : "")
    );
  }

  // cuddle-ui.js calls window.CuddleCampaign.afterRender after every render;
  // wrapping the export (the module reads it fresh each time) is how this
  // module gets a post-render hook of its own to scroll the map to where the
  // player is actually standing.
  var campaignExport = window.CuddleCampaign;
  if (campaignExport) {
    var originalAfterRender = campaignExport.afterRender;
    var originalHandleUiAction = campaignExport.handleUiAction;
    window.CuddleCampaign = Object.freeze(Object.assign({}, campaignExport, {
      afterRender: function afterRenderWithBranchMap(root, game, landing) {
        if (typeof originalAfterRender === "function") originalAfterRender(root, game, landing);
        if (!root || landing || !game || !game.state || game.state.status !== MAP_STATUS) return;
        var scroller = root.querySelector("[data-cuddle-branch-scroll]");
        var marker = root.querySelector(".cuddle-map-node-here") || root.querySelector(".cuddle-map-node-open");
        if (!scroller || !marker || typeof marker.getBoundingClientRect !== "function") return;
        window.requestAnimationFrame(function centerOnPosition() {
          var scrollerBox = scroller.getBoundingClientRect();
          var markerBox = marker.getBoundingClientRect();
          var offset = (markerBox.top + markerBox.height / 2) - (scrollerBox.top + scrollerBox.height / 2);
          scroller.scrollTop = Math.max(0, scroller.scrollTop + offset);
        });
      },
      // Tapping a map node used to commit to it immediately. It now only
      // opens a preview of that stop (ephemeral UI state, not saved) --
      // committing takes an explicit confirm, handled here rather than by
      // the base enter-branch-node dispatch.
      handleUiAction: function handleUiActionWithBranchPreview(game, action, itemId) {
        if (action === "preview-branch-node") {
          if (!game || !game.state || game.state.status !== MAP_STATUS) {
            return { ok: false, error: "The map is not open." };
          }
          var branchMap = ensureBranchMap(game);
          var parts = String(itemId || "").split(":");
          var node = nodeAt(branchMap, Number(parts[0]), Number(parts[1]));
          if (!node || !isReachable(branchMap, node)) {
            return { ok: false, error: "No path leads there from here." };
          }
          previewKey = itemId;
          return { ok: true };
        }
        if (action === "cancel-branch-node-preview") {
          previewKey = null;
          return { ok: true };
        }
        if (action === "confirm-branch-node") {
          previewKey = null;
          return typeof game.enterBranchNode === "function"
            ? game.enterBranchNode(itemId)
            : { ok: false, error: "The run map is unavailable." };
        }
        return typeof originalHandleUiAction === "function"
          ? originalHandleUiAction(game, action, itemId)
          : { ok: false, error: "Unknown campaign action." };
      }
    }));
  }

  // The map node the player is standing on (the stage being played), with
  // its type's display info merged in -- read by the stage-intro banner in
  // cuddle-progression.js. Null before the first stop is entered.
  function currentStageNode(game) {
    var state = game && game.state;
    if (!state || !state.branchMap || !Array.isArray(state.branchMap.rows)) return null;
    var node = currentNode(state.branchMap);
    if (!node) return null;
    var info = NODE_TYPES[node.type] || {};
    return Object.assign({}, node, {
      typeIcon: info.icon || "",
      typeTitle: info.title || "",
      typeDescription: info.description || "",
      totalRows: state.branchMap.rows.length
    });
  }

  window.CuddleBranchMap = Object.freeze({
    STATUS: MAP_STATUS,
    renderMapScreen: renderMapScreen,
    bossPointRequirement: bossPointRequirement,
    nextBossRequirement: nextBossRequirement,
    currentStageNode: currentStageNode
  });
}());
