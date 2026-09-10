// User-requested Cuddle compatibility layer. Loaded after cuddle-rebalance-v5.js.
(function installCuddleUserPatch() {
  "use strict";

  const VERSION = "2026.09.09.1";
  const ROUTE_VERSION = "umt-cuddle-route-2026.09.09";
  const PATCH_MARK = Symbol.for("umt.cuddle.user.patch");
  const ROUND_TYPES = new Set(["normal", "theme", "challenge", "boss", "wordle"]);
  const STAGE_ICON = Object.freeze({
    normal: "stage-normal.svg",
    theme: "stage-theme.svg",
    challenge: "stage-challenge.svg",
    upgrade: "stage-upgrade.svg",
    shop: "stage-shop.svg",
    event: "stage-event.svg",
    boss: "stage-boss.svg",
    final: "stage-final.svg"
  });
  const FALLBACK_ICON = "gift.svg";
  let observer = null;
  let renderFrame = 0;
  let installAttempts = 0;

  function number(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function integer(value, fallback = 0) {
    return Math.trunc(number(value, fallback));
  }

  function slug(value) {
    return String(value || "reward")
      .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase() || "reward";
  }

  function iconUrl(id, fallback = FALLBACK_ICON) {
    const file = id ? `reward-${slug(id)}.svg` : fallback;
    return `cuddle/icons/${file}`;
  }

  function activeGame() {
    const providers = [
      window.CuddleRebalanceV5,
      window.CuddleMoneyMode,
      window.CuddleCoachExpansion,
      window.CuddleCampaign,
      window.CuddleBranchMap
    ];
    for (const provider of providers) {
      try {
        const game = provider && typeof provider.getActiveGame === "function"
          ? provider.getActiveGame()
          : null;
        if (game && game.state) return game;
      } catch (_error) {}
    }
    return null;
  }

  function safeSave(game) {
    try { if (game && typeof game.save === "function") game.save(); }
    catch (error) { console.warn("Cuddle user patch: save failed.", error); }
  }

  function requestRender(game) {
    safeSave(game);
    try {
      window.dispatchEvent(new CustomEvent("cuddle:campaign-update", {
        detail: { runId: game && game.state ? game.state.runId : null }
      }));
    } catch (_error) {}
    queueRender();
  }

  function afterResult(result, onSuccess) {
    if (result && typeof result.then === "function") {
      return result.then(value => onSuccess(value));
    }
    return onSuccess(result);
  }

  function wrapMethod(prototype, name, wrapper) {
    const original = prototype && prototype[name];
    if (typeof original !== "function" || original[PATCH_MARK]) return false;
    const wrapped = function wrappedCuddleUserMethod(...args) {
      return wrapper.call(this, original, args);
    };
    Object.defineProperty(wrapped, PATCH_MARK, { value: true });
    prototype[name] = wrapped;
    return true;
  }

  function getBossPool() {
    const book = window.CuddleQuestBook || {};
    const pool = Array.isArray(book.BOSSES) ? book.BOSSES.filter(item => item && item.id) : [];
    return pool.slice();
  }

  function drawBosses(game, count) {
    const book = window.CuddleQuestBook || {};
    const excluded = new Set(Array.isArray(game?.state?.bossesSeen) ? game.state.bossesSeen : []);
    const selected = [];
    const add = definition => {
      if (!definition || !definition.id || excluded.has(definition.id) || selected.some(item => item.id === definition.id)) return;
      selected.push(definition);
    };
    for (let attempt = 0; attempt < 8 && selected.length < count; attempt += 1) {
      try {
        const choices = typeof book.bossChoices === "function"
          ? book.bossChoices(game.random, [...excluded, ...selected.map(item => item.id)])
          : [];
        (Array.isArray(choices) ? choices : []).forEach(add);
      } catch (_error) {}
    }
    getBossPool().forEach(add);
    // A repository with fewer than three bosses should still produce a valid
    // route. Reusing an actual definition is safer than inventing an id that
    // the engine cannot start.
    while (selected.length < count && selected.length > 0) {
      selected.push({ ...selected[selected.length % selected.length] });
    }
    return selected.slice(0, count);
  }

  function bossNode(definition, gate, row) {
    return {
      row,
      col: 0,
      type: "boss",
      bossId: definition.id,
      bossTitle: definition.title,
      bossIcon: definition.icon,
      bossDescription: definition.description,
      gate,
      next: []
    };
  }

  function routeNode(row, col, type, extra = {}) {
    return { row, col, type, next: [], ...extra };
  }

  function connectRows(rows) {
    for (let rowIndex = 0; rowIndex < rows.length - 1; rowIndex += 1) {
      const from = rows[rowIndex].nodes;
      const to = rows[rowIndex + 1].nodes;
      from.forEach((node, index) => {
        if (to.length === 1) node.next = [0];
        else if (from.length === 1) node.next = to.map((_item, target) => target);
        else node.next = Array.from(new Set([index % to.length, Math.min(to.length - 1, index + 1)]));
      });
    }
    return rows;
  }

  function buildRoute(game) {
    const bosses = drawBosses(game, 3);
    if (!bosses.length) return null;
    const boss1 = bosses[0];
    const boss2 = bosses[1] || bosses[0];
    const boss3 = bosses[2] || bosses[0];
    const rows = [
      { kind: "stops", act: 0, nodes: [routeNode(0, 0, "normal"), routeNode(0, 1, "theme")] },
      { kind: "stops", act: 0, nodes: [routeNode(1, 0, "challenge"), routeNode(1, 1, "normal")] },
      { kind: "stops", act: 0, nodes: [routeNode(2, 0, "upgrade"), routeNode(2, 1, "theme")] },
      { kind: "boss", act: 0, nodes: [bossNode(boss1, "stage-4", 3)] },
      { kind: "stops", act: 1, nodes: [routeNode(4, 0, "shop", { shopSlot: 4 }), routeNode(4, 1, "normal")] },
      { kind: "stops", act: 1, nodes: [routeNode(5, 0, "theme"), routeNode(5, 1, "challenge")] },
      { kind: "stops", act: 1, nodes: [routeNode(6, 0, "event", { eventId: "windfall" }), routeNode(6, 1, "normal")] },
      { kind: "boss", act: 1, nodes: [bossNode(boss2, "stage-8", 7)] },
      { kind: "stops", act: 2, nodes: [routeNode(8, 0, "shop", { shopSlot: 8 }), routeNode(8, 1, "theme")] },
      { kind: "stops", act: 2, nodes: [routeNode(9, 0, "challenge"), routeNode(9, 1, "upgrade")] },
      { kind: "stops", act: 2, nodes: [routeNode(10, 0, "shop", { shopSlot: 11 }), routeNode(10, 1, "normal")] },
      { kind: "boss", act: 2, nodes: [bossNode(boss3, "final", 11)] }
    ];
    connectRows(rows);
    return {
      routeVersion: ROUTE_VERSION,
      rows,
      position: null,
      visited: [],
      roundsPlayed: 0,
      bossPenalty: 0,
      pendingPenalty: null
    };
  }

  function mapHasProgress(map) {
    return Boolean(map && (map.position || (Array.isArray(map.visited) && map.visited.length)));
  }

  function installRoute(game, force = false) {
    if (!game || !game.state) return false;
    const current = game.state.branchMap;
    if (!force && current?.routeVersion === ROUTE_VERSION) return false;
    if (!force && mapHasProgress(current)) return false;
    const route = buildRoute(game);
    if (!route) return false;
    game.state.branchMap = route;
    game.state.status = "branchMap";
    game.state.roundIntroPending = false;
    game.state.upgradeChoices = [];
    game.state.upgradePhase = null;
    game.state.upgradeMilestone = null;
    safeSave(game);
    return true;
  }

  function findRouteNode(game, nodeId) {
    const parts = String(nodeId || "").split(":");
    const row = integer(parts[0], -1);
    const col = integer(parts[1], -1);
    return game?.state?.branchMap?.rows?.[row]?.nodes?.[col] || null;
  }

  function customState(game) {
    const state = game && game.state;
    if (!state) return null;
    if (!state.cuddleRebalanceV5 || typeof state.cuddleRebalanceV5 !== "object") {
      state.cuddleRebalanceV5 = {};
    }
    return state.cuddleRebalanceV5;
  }

  function megaState(game) {
    const state = game && game.state;
    if (!state) return null;
    if (!state.megaState || typeof state.megaState !== "object") state.megaState = {};
    return state.megaState;
  }

  function upgradeLevel(game, id) {
    const state = game?.state || {};
    const custom = customState(game) || {};
    const coach = state.cuddleCoachExpansion || {};
    const candidates = [
      custom.upgrades?.[id],
      custom.upgradeLevels?.[id],
      state.upgrades?.[id],
      state.cuddleCampaign?.upgrades?.[id],
      state.campaign?.upgrades?.[id]
    ];
    if (id === "coachHint") candidates.push(coach.hintsPerRound);
    if (id === "coachMeterThreshold") candidates.push(coach.cuddleThresholdStacks);
    if (id === "coachMeterReward") candidates.push(coach.cuddleRewardTier);
    return Math.max(0, ...candidates.map(value => integer(value, 0)));
  }

  function migrateJokerCache(game) {
    const custom = customState(game);
    const mega = megaState(game);
    if (!custom || !mega) return false;
    const level = upgradeLevel(game, "umtJokerCache");
    const applied = Math.max(0, integer(custom.cuddleUserJokerCachePerRoundLevel, 0));
    const delta = Math.max(0, level - applied);
    if (!delta) return false;
    mega.jokerPerRoundBonus = Math.max(0, integer(mega.jokerPerRoundBonus, 0)) + (delta * 2);
    mega.hasJokerUnlocked = true;
    custom.cuddleUserJokerCachePerRoundLevel = level;
    safeSave(game);
    return true;
  }

  function installGamePatches(Game) {
    const prototype = Game && Game.prototype;
    if (!prototype || prototype.__umtCuddleUserPatchInstalled) return;
    Object.defineProperty(prototype, "__umtCuddleUserPatchInstalled", { value: VERSION });

    wrapMethod(prototype, "startNew", function (original, args) {
      const result = original.apply(this, args);
      return afterResult(result, value => {
        installRoute(this, true);
        migrateJokerCache(this);
        requestRender(this);
        return typeof this.getSnapshot === "function" ? this.getSnapshot() : value;
      });
    });

    wrapMethod(prototype, "enterBranchNode", function (original, args) {
      const node = findRouteNode(this, args[0]);
      if (node && ROUND_TYPES.has(node.type) && this.state?.branchMap) {
        // beginRoundForNode increments this value before copying it to
        // state.round. Seeding it with the zero-based map row makes stages,
        // shops, and bosses line up as 1..12 even when a stage is non-combat.
        this.state.branchMap.roundsPlayed = Math.max(0, integer(node.row, 0));
      }
      return original.apply(this, args);
    });

    wrapMethod(prototype, "chooseUpgrade", function (original, args) {
      const beforeLevel = upgradeLevel(this, "umtJokerCache");
      const result = original.apply(this, args);
      return afterResult(result, value => {
        const afterLevel = upgradeLevel(this, "umtJokerCache");
        if (value?.ok !== false && afterLevel > beforeLevel) migrateJokerCache(this);
        queueRender();
        return value;
      });
    });

    wrapMethod(prototype, "_hydrateState", function (original, args) {
      const result = original.apply(this, args);
      return afterResult(result, value => {
        installRoute(this, false);
        migrateJokerCache(this);
        return value;
      });
    });
  }

  function makeImg(id, className = "umt-cuddle-svg-icon", title = "") {
    const img = document.createElement("img");
    img.className = className;
    img.src = iconUrl(id);
    img.alt = "";
    img.setAttribute("aria-hidden", "true");
    if (title) img.title = title;
    img.addEventListener("error", () => {
      if (!img.src.endsWith(`/${FALLBACK_ICON}`)) img.src = `cuddle/icons/${FALLBACK_ICON}`;
    }, { once: true });
    return img;
  }

  function replaceIconContents(container, id, title = "") {
    if (!container || !id) return;
    const key = String(id);
    if (container.dataset.umtUserIconKey === key && container.querySelector("img")) return;
    container.dataset.umtUserIconKey = key;
    // Prevent v5's inline-SVG pass from immediately restoring its old icon.
    container.dataset.umtIconKey = key;
    container.replaceChildren(makeImg(key, "umt-cuddle-svg-icon", title));
  }

  function definitionForChoice(game, button) {
    const state = game?.state || {};
    if (button.dataset.bossId) {
      const option = (state.bossOffer || []).find(item => String(item?.id) === button.dataset.bossId);
      return { id: button.dataset.bossId, option };
    }
    if (button.dataset.upgradeKey) {
      const option = (state.upgradeChoices || []).find(item => String(item?.key || item?.id) === button.dataset.upgradeKey);
      return { id: String(option?.id || option?.key || button.dataset.upgradeKey), option };
    }
    if (button.dataset.rewardId) {
      const option = (state.questRewardChoices || []).find(item => String(item?.id) === button.dataset.rewardId);
      return { id: button.dataset.rewardId, option };
    }
    return { id: "gift", option: null };
  }

  function enhanceChoiceIcons(game, root) {
    root.querySelectorAll(".cuddle-choice, .cuddle-money-choice").forEach(button => {
      const definition = definitionForChoice(game, button);
      const icon = button.querySelector(":scope > .cuddle-choice-icon, :scope > .cuddle-money-choice-icon");
      replaceIconContents(icon, definition.id, definition.option?.title || definition.id);
      const reward = definition.option?.reward;
      if (reward) {
        const heading = button.querySelector(".cuddle-boss-reward > b, .cuddle-boss-reward > strong");
        if (heading && !heading.querySelector(".umt-inline-reward-file-icon")) {
          const inline = makeImg(reward.id || definition.option.rewardId || "gift", "umt-inline-reward-file-icon");
          heading.prepend(inline);
        }
      }
    });

    const boss = game?.state?.boss;
    root.querySelectorAll(".cuddle-boss-info-popover .cuddle-quest-icon").forEach(icon => {
      replaceIconContents(icon, boss?.id || "stage-boss", boss?.title || "Boss");
    });
    root.querySelectorAll(".cuddle-boss-header-badge").forEach(button => {
      if (!button.querySelector("img")) button.replaceChildren(makeImg(boss?.id || "stage-boss", "umt-cuddle-svg-icon"));
    });

    const activeQuest = game?.state?.activeQuest;
    root.querySelectorAll(".cuddle-quest:not(.cuddle-boss-info-popover) .cuddle-quest-icon").forEach(icon => {
      if (activeQuest?.id) replaceIconContents(icon, activeQuest.id, activeQuest.title || "Quest");
    });

    const notice = game?.state?.bossRewardNotice;
    root.querySelectorAll(".cuddle-v3-toast.is-boss .cuddle-v3-toast-icon").forEach(icon => {
      const id = notice?.rewardId || notice?.id || notice?.bossId || "gift";
      replaceIconContents(icon, id, notice?.title || "Boss reward");
    });
  }

  function routeNodeForElement(game, element) {
    const id = element.getAttribute("data-shop-item-id");
    if (!id || !/^\d+:\d+$/.test(id)) return null;
    return findRouteNode(game, id);
  }

  function enhanceMapIcons(game, root) {
    const namespace = "http://www.w3.org/2000/svg";
    const flatNodes = (game?.state?.branchMap?.rows || []).flatMap(row => row?.nodes || []);
    root.querySelectorAll(".cuddle-branch-map-svg g.cuddle-map-node").forEach((group, index) => {
      // Only currently reachable nodes carry data-shop-item-id in the base
      // renderer. DOM order mirrors route order, so locked/visited nodes can
      // still receive their correct SVG instead of becoming blank circles.
      const node = routeNodeForElement(game, group) || flatNodes[index] || null;
      if (!node) return;
      const final = node.type === "boss" && node.gate === "final";
      const file = final ? STAGE_ICON.final : (STAGE_ICON[node.type] || STAGE_ICON.normal);
      let image = group.querySelector(":scope > image.umt-stage-svg-icon");
      if (!image) {
        image = document.createElementNS(namespace, "image");
        image.setAttribute("class", "umt-stage-svg-icon");
        image.setAttribute("x", "-12");
        image.setAttribute("y", "-12");
        image.setAttribute("width", "24");
        image.setAttribute("height", "24");
        image.setAttribute("preserveAspectRatio", "xMidYMid meet");
        image.setAttribute("aria-hidden", "true");
        const label = group.querySelector(".cuddle-map-node-label");
        if (label) group.insertBefore(image, label);
        else group.appendChild(image);
      }
      const href = `cuddle/icons/${file}`;
      image.setAttribute("href", href);
      image.setAttributeNS("http://www.w3.org/1999/xlink", "href", href);
    });

    const preview = root.querySelector(".cuddle-branch-preview-overlay .cuddle-choice-icon");
    if (preview) {
      const confirm = root.querySelector(".cuddle-branch-preview-overlay [data-shop-item-id]");
      const node = confirm ? routeNodeForElement(game, confirm) : null;
      const id = node?.type === "boss" ? node.bossId : `stage-${node?.type || "normal"}`;
      replaceIconContents(preview, id);
    }
  }

  function shopDefinition(id) {
    const catalogs = [
      window.CuddleCoachExpansion?.shopItems,
      window.CuddleCampaign?.shopItems,
      window.CuddleMoneyMode?.shopItems
    ].filter(Array.isArray);
    for (const catalog of catalogs) {
      const found = catalog.find(item => String(item?.id) === String(id));
      if (found) return found;
    }
    return null;
  }

  function enhanceShop(game, root) {
    if (game?.state?.status !== "shop") return;
    const intro = root.querySelector(".cuddle-shop-intro");
    if (intro && !intro.querySelector(".umt-shopkeeper-wrap")) {
      const wrap = document.createElement("div");
      wrap.className = "umt-shopkeeper-wrap";
      const head = document.createElement("img");
      head.src = "cuddle/icons/shopkeeper.svg";
      head.alt = "The Wandering Paw shopkeeper";
      head.className = "umt-shopkeeper-head";
      const copy = document.createElement("p");
      copy.className = "umt-shopkeeper-copy";
      copy.textContent = "Pick an icon to inspect or buy that supply.";
      wrap.append(head, copy);
      intro.prepend(wrap);
    }

    root.querySelectorAll("[data-shop-item-id]").forEach(control => {
      const id = control.dataset.shopItemId;
      if (!id || /^\d+:\d+$/.test(id)) return;
      const definition = shopDefinition(id);
      const icon = control.querySelector(".cuddle-shop-item-icon, .cuddle-choice-icon, .cuddle-shop-icon");
      replaceIconContents(icon, id, definition?.title || id);
      if (control.tagName === "BUTTON") control.type = "button";
      else {
        control.setAttribute("role", "button");
        if (!control.hasAttribute("tabindex")) control.tabIndex = 0;
      }
    });
  }

  function mergeLoadoutIntoStats(root) {
    const groups = Array.from(root.querySelectorAll(".cuddle-stat-group, .cuddle-detail-group"));
    const stats = groups.find(group => /stats/i.test(group.querySelector("h3")?.textContent || ""));
    const loadout = groups.find(group => /loadout/i.test(group.querySelector("h3")?.textContent || ""));
    if (!stats || !loadout || stats === loadout) return;
    const target = stats.querySelector(".cuddle-detail-badges");
    const source = loadout.querySelector(".cuddle-detail-badges");
    if (target && source) Array.from(source.children).forEach(child => target.appendChild(child));
    loadout.remove();
  }

  function rulesFor(game) {
    try { return game?.getRulesSummary?.() || {}; }
    catch (_error) { return {}; }
  }

  function hintPlan(game) {
    const state = game?.state || {};
    const coach = state.cuddleCoachExpansion || {};
    const custom = customState(game) || {};
    const schedule = custom.hintSchedule;
    const plan = new Map();
    const add = (guess, count = 1) => {
      const key = Math.max(1, integer(guess, 1));
      plan.set(key, (plan.get(key) || 0) + Math.max(0, integer(count, 0)));
    };

    const opening = Math.max(0, Math.min(2, upgradeLevel(game, "umtOpeningInsight")));
    if (opening) add(1, opening);

    const budget = Math.max(0, integer(coach.hintsPerRound, schedule?.budget || 0));
    if (budget) {
      let first;
      let cadence;
      if (schedule?.mode === "v5") {
        cadence = Math.max(2, integer(schedule.cadence, 3));
        first = Math.max(1, integer(schedule.nextHintGuess, 1) - integer(schedule.granted, 0) * cadence);
      } else {
        const difficulty = String(state.megaState?.difficulty || "medium").toLowerCase();
        const config = window.CuddleRebalanceV5?.config?.hints?.[difficulty]
          || window.CuddleRebalanceV5?.config?.hints?.medium
          || { first: 2, cadence: 3 };
        first = Math.max(1, integer(config.first, 2));
        cadence = Math.max(2, integer(config.cadence, 3) - Math.min(2, upgradeLevel(game, "umtQuickStudy")));
      }
      for (let index = 0; index < budget; index += 1) add(first + index * cadence, 1);
    }

    const entries = [...plan.entries()].sort((a, b) => a[0] - b[0]);
    const total = entries.reduce((sum, entry) => sum + entry[1], 0);
    return {
      total,
      detail: entries.length
        ? entries.map(([guess, count]) => `guess ${guess}x${count}`).join(", ")
        : ""
    };
  }

  function addStatBadge(container, label, value, className = "") {
    const span = document.createElement("span");
    span.className = `cuddle-detail-badge umt-user-stat ${className}`.trim();
    const strong = document.createElement("b");
    strong.textContent = `${label}:`;
    span.append(strong, document.createTextNode(` ${value}`));
    container.appendChild(span);
  }

  function enhanceStats(game, root) {
    mergeLoadoutIntoStats(root);
    const groups = Array.from(root.querySelectorAll(".cuddle-stat-group, .cuddle-detail-group"));
    const stats = groups.find(group => /stats/i.test(group.querySelector("h3")?.textContent || ""));
    const badges = stats?.querySelector(".cuddle-detail-badges") || root.querySelector(".cuddle-detail-badges");
    if (!badges) return;

    Array.from(badges.children).forEach(badge => {
      const text = (badge.textContent || "").trim();
      if (/Early solve|Unused guess|Extra guess money|Unused-row money|^Hints\b|^Jokers\b|Cuddle meter max|Cuddle meter reward/i.test(text)) {
        badge.remove();
      }
    });

    const rules = rulesFor(game);
    const green = number(rules.greenPoints, game?.state?.upgrades?.greenPoints || 0);
    const extraGuessRate = number(rules.earlyPoint, game?.state?.upgrades?.earlyPoint || 0);
    const unusedGuess = 5 * green + extraGuessRate;
    const hints = hintPlan(game);
    const mega = megaState(game) || {};
    const coach = game?.state?.cuddleCoachExpansion || {};
    const threshold = typeof window.CuddleCoachExpansion?.meterThreshold === "function"
      ? integer(window.CuddleCoachExpansion.meterThreshold(), 12)
      : Math.max(3, 12 - 3 * integer(coach.cuddleThresholdStacks, 0));
    const rewards = ["Free mulligan", "Joker", "Hint", "Extra row"];
    const meterReward = rewards[Math.max(0, Math.min(3, integer(coach.cuddleRewardTier, 0)))];

    addStatBadge(badges, "Unused guess", `+$${unusedGuess}`);
    addStatBadge(badges, "Extra guess money", `+$${extraGuessRate}`);
    addStatBadge(badges, "Hints", hints.total ? `${hints.total} (${hints.detail})` : "0");
    addStatBadge(badges, "Jokers", String(Math.max(0, integer(mega.jokerPerRoundBonus, 0))));
    addStatBadge(badges, "Cuddle meter max", String(threshold));
    addStatBadge(badges, "Cuddle meter reward", meterReward);
  }

  function enhanceHeaderMoney(game, root) {
    const score = root.querySelector(".cuddle-header-score");
    if (!score) return;
    const state = game?.state || {};
    // During a live round the engine adds provisional earnings to state.score.
    // Subtract the live round bucket so the header only changes once the stage
    // has been cleared and its payout is collected.
    const provisional = state.status === "playing" ? number(state.roundScore, 0) : 0;
    const spendable = Math.max(0, Math.round(number(state.score, 0) - provisional));
    score.textContent = `$${spendable.toLocaleString()}`;
    score.setAttribute("aria-label", `Money ${spendable}`);
    score.classList.add("umt-plain-money-counter");

    const heartText = root.querySelector(".cuddle-heart-chip b, .cuddle-heart-chip strong, .cuddle-heart-chip");
    if (heartText) {
      const size = window.getComputedStyle(heartText).fontSize;
      if (size) score.style.setProperty("--cuddle-header-chip-font-size", size);
    }
  }

  function hideCompletedRowMoney(game, root) {
    const historyLength = Array.isArray(game?.state?.history) ? game.state.history.length : 0;
    const rows = Array.from(root.querySelectorAll(".cuddle-board-row"));
    rows.forEach((row, index) => {
      const score = row.querySelector(":scope > .cuddle-row-score");
      if (!score) return;
      const isInformationalBossBadge = score.classList.contains("is-counts")
        || score.classList.contains("is-boss-active")
        || score.classList.contains("is-boss-inactive");
      score.classList.toggle("umt-earned-row-score", index < historyLength && !isInformationalBossBadge);
    });
  }

  function payoutTotalFromOverlay(root) {
    const strong = root.querySelector(".cuddle-money-payout-total strong");
    if (!strong) return null;
    const match = String(strong.textContent || "").replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
    return match ? Math.max(0, Math.round(number(match[0], 0))) : null;
  }

  function fixCollectButton(root) {
    const collect = root.querySelector("[data-cuddle-money-action='collect-payout'], [data-action='collect-money-payout']");
    const total = payoutTotalFromOverlay(root);
    if (!collect || total === null) return;
    collect.textContent = `Collect $${total.toLocaleString()}`;
    collect.setAttribute("aria-label", `Collect ${total} dollars earned this round`);
  }

  function replaceVisibleFreeLetterText(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(node => {
      const parent = node.parentElement;
      if (!parent || parent.closest("script, style, textarea")) return;
      const next = node.nodeValue
        .replace(/Free letter/g, "Hint")
        .replace(/free letter/g, "hint");
      if (next !== node.nodeValue) node.nodeValue = next;
    });
  }

  function kickHeadStart(game) {
    const state = game?.state || {};
    const custom = customState(game) || {};
    const variant = custom.activeVariant || custom.pendingVariant || null;
    if (state.status !== "playing" || state.roundIntroPending || state.pendingRoundEnd) return;
    if ((state.history || []).length || !variant || variant.kind !== "randomOpener") return;
    const schedule = window.CuddleRebalanceV5?.debug?.scheduleRandomOpener;
    if (typeof schedule !== "function") return;
    // A stale pending token is exactly what the former over-broad modal check
    // leaves behind. Clear it before asking the scheduler to try immediately.
    const token = `${state.runId || "run"}:${state.round || 0}:${state.secret || ""}`;
    if (custom.openerPlayedToken === token) return;
    custom.openerPendingToken = null;
    try { schedule(game); } catch (error) { console.warn("Cuddle Head Start retry failed.", error); }
  }

  function renderNow() {
    renderFrame = 0;
    if (observer) observer.disconnect();
    try {
      const root = document.getElementById("cuddleRoot");
      const game = activeGame();
      if (!root || !game) return;
      installRoute(game, false);
      migrateJokerCache(game);
      enhanceHeaderMoney(game, root);
      enhanceStats(game, root);
      enhanceChoiceIcons(game, root);
      enhanceMapIcons(game, root);
      enhanceShop(game, root);
      hideCompletedRowMoney(game, root);
      fixCollectButton(root);
      replaceVisibleFreeLetterText(root);
      kickHeadStart(game);
    } finally {
      observe();
    }
  }

  function queueRender() {
    if (renderFrame) return;
    renderFrame = window.requestAnimationFrame(renderNow);
  }

  function observe() {
    if (!observer && document.documentElement) observer = new MutationObserver(queueRender);
    if (observer && document.documentElement) observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  function installKeyboardShopActivation() {
    if (document.documentElement.dataset.umtCuddleShopKeyboard === "1") return;
    document.documentElement.dataset.umtCuddleShopKeyboard = "1";
    document.addEventListener("keydown", event => {
      if (event.key !== "Enter" && event.key !== " ") return;
      const control = event.target.closest && event.target.closest("#cuddleRoot [data-shop-item-id][role='button']");
      if (!control || control.tagName === "BUTTON") return;
      event.preventDefault();
      control.click();
    });
  }

  function install() {
    installAttempts += 1;
    const Game = (window.CuddleEngine && window.CuddleEngine.CuddleGame) || window.CuddleGame;
    if (!Game || !Game.prototype) {
      if (installAttempts < 120) window.setTimeout(install, 50);
      return;
    }
    installGamePatches(Game);
    installKeyboardShopActivation();
    observe();
    window.addEventListener("cuddle:campaign-update", queueRender);
    const game = activeGame();
    if (game) {
      installRoute(game, false);
      migrateJokerCache(game);
    }
    window.CuddleUserPatch = Object.freeze({
      version: VERSION,
      refresh: queueRender,
      getActiveGame: activeGame,
      rebuildUnstartedRoute() {
        const current = activeGame();
        if (!current || mapHasProgress(current.state?.branchMap)) return false;
        const changed = installRoute(current, true);
        requestRender(current);
        return changed;
      }
    });
    queueRender();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
})();
