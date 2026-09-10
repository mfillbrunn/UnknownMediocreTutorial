// Cuddle stability and UI patch v2. Loaded after the existing Cuddle modules.
(function installCuddleStabilityV2() {
  "use strict";

  const VERSION = "2026.09.09.2";
  const ROUTE_VERSION = "umt-cuddle-route-2026.09.09.v2";
  const PATCH_MARK = Symbol.for("umt.cuddle.stability.v2");
  const ROUND_TYPES = new Set(["normal", "theme", "challenge", "boss", "wordle"]);
  const FALLBACK_ICON = "gift.svg";
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
  const SHOP_GREETINGS = Object.freeze([
    "Ahoy there, welcome to me shop.",
    "Come in, traveler. Coin spends kindly here.",
    "Fresh supplies for a clever wordsmith.",
    "Have a look. The good stuff goes quickly.",
    "Welcome back. Let us improve those odds.",
    "Paws off nothing; everything here is for sale.",
    "A fine day to turn spare coin into an advantage.",
    "Take your time. The road will still be there."
  ]);

  let installAttempts = 0;
  let inventoryOpen = false;
  let inventoryReturnFocus = null;

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
    catch (error) { console.warn("Cuddle stability patch: save failed.", error); }
  }

  function requestRender(game) {
    safeSave(game);
    try {
      window.dispatchEvent(new CustomEvent("cuddle:campaign-update", {
        detail: { runId: game && game.state ? game.state.runId : null }
      }));
    } catch (_error) {}
  }

  function afterResult(result, onSuccess) {
    if (result && typeof result.then === "function") return result.then(onSuccess);
    return onSuccess(result);
  }

  function wrapMethod(prototype, name, wrapper) {
    const original = prototype && prototype[name];
    if (typeof original !== "function" || original[PATCH_MARK]) return false;
    const wrapped = function wrappedCuddleStabilityMethod(...args) {
      return wrapper.call(this, original, args);
    };
    Object.defineProperty(wrapped, PATCH_MARK, { value: true });
    prototype[name] = wrapped;
    return true;
  }

  function hashText(value) {
    let hash = 2166136261;
    for (const character of String(value || "")) {
      hash ^= character.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function shuffled(items, random = Math.random) {
    const copy = items.slice();
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const target = Math.floor(random() * (index + 1));
      [copy[index], copy[target]] = [copy[target], copy[index]];
    }
    return copy;
  }

  function getBossPool() {
    const book = window.CuddleQuestBook || {};
    const pool = Array.isArray(book.BOSSES) ? book.BOSSES : [];
    return pool.filter(item => item && item.id).map(item => ({ ...item }));
  }

  function getBossById(id) {
    const book = window.CuddleQuestBook || {};
    try {
      const found = typeof book.getBoss === "function" ? book.getBoss(id) : null;
      if (found) return { ...found };
    } catch (_error) {}
    const found = getBossPool().find(item => String(item.id) === String(id));
    return found ? { ...found } : null;
  }

  function drawDistinctBosses(game, count) {
    const book = window.CuddleQuestBook || {};
    const seen = new Set(Array.isArray(game?.state?.bossesSeen) ? game.state.bossesSeen : []);
    const selected = [];
    const add = definition => {
      if (!definition || !definition.id || selected.some(item => item.id === definition.id)) return;
      selected.push({ ...definition });
    };
    for (let attempt = 0; attempt < 12 && selected.length < count; attempt += 1) {
      try {
        const exclusions = [...seen, ...selected.map(item => item.id)];
        const choices = typeof book.bossChoices === "function"
          ? book.bossChoices(game?.random || Math.random, exclusions)
          : [];
        (Array.isArray(choices) ? choices : []).forEach(add);
      } catch (_error) {}
    }
    shuffled(getBossPool(), game?.random || Math.random).forEach(add);
    return selected.slice(0, count);
  }

  function routeNode(row, col, type, extra = {}) {
    return { row, col, type, next: [], ...extra };
  }

  function bossNode(pair, gate, row) {
    const first = pair[0];
    const second = pair[1];
    return {
      row,
      col: 0,
      type: "boss",
      bossId: first?.id || null,
      bossIds: [first?.id, second?.id].filter(Boolean),
      bossTitle: "Choose one of two bosses",
      bossIcon: first?.icon || "💀",
      bossDescription: "Choose which boss to fight. The boss left behind becomes a later disadvantage.",
      gate,
      next: []
    };
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

  function bossPairs(game) {
    const pool = drawDistinctBosses(game, 6);
    if (pool.length < 2) return [];
    const pairs = [];
    for (let index = 0; index < 3; index += 1) {
      const first = pool[(index * 2) % pool.length];
      let second = pool[(index * 2 + 1) % pool.length];
      if (!second || second.id === first.id) second = pool.find(item => item.id !== first.id);
      if (!first || !second) break;
      pairs.push([first, second]);
    }
    return pairs;
  }

  function buildRoute(game) {
    const pairs = bossPairs(game);
    if (pairs.length < 3) return null;
    const rows = [
      { kind: "stops", act: 0, nodes: [routeNode(0, 0, "normal"), routeNode(0, 1, "theme")] },
      { kind: "stops", act: 0, nodes: [routeNode(1, 0, "challenge"), routeNode(1, 1, "normal")] },
      { kind: "stops", act: 0, nodes: [routeNode(2, 0, "upgrade"), routeNode(2, 1, "theme")] },
      { kind: "boss", act: 0, nodes: [bossNode(pairs[0], "before-3", 3)] },
      { kind: "stops", act: 1, nodes: [routeNode(4, 0, "shop", { shopSlot: 4 }), routeNode(4, 1, "normal")] },
      { kind: "stops", act: 1, nodes: [routeNode(5, 0, "theme"), routeNode(5, 1, "challenge")] },
      { kind: "stops", act: 1, nodes: [routeNode(6, 0, "event", { eventId: "windfall" }), routeNode(6, 1, "normal")] },
      { kind: "boss", act: 1, nodes: [bossNode(pairs[1], "before-7", 7)] },
      { kind: "stops", act: 2, nodes: [routeNode(8, 0, "shop", { shopSlot: 8 }), routeNode(8, 1, "theme")] },
      { kind: "stops", act: 2, nodes: [routeNode(9, 0, "challenge"), routeNode(9, 1, "upgrade")] },
      { kind: "stops", act: 2, nodes: [routeNode(10, 0, "shop", { shopSlot: 11 }), routeNode(10, 1, "normal")] },
      { kind: "boss", act: 2, nodes: [bossNode(pairs[2], "final", 11)] }
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

  function repairDuplicatePathOptions(game) {
    const map = game?.state?.branchMap;
    if (!map || !Array.isArray(map.rows)) return false;
    const visited = new Set((map.visited || []).map(entry => `${entry.row}:${entry.col}`));
    const safeTypes = ["normal", "theme", "challenge", "upgrade", "event"];
    let changed = false;
    map.rows.forEach((row, rowIndex) => {
      if (!Array.isArray(row?.nodes) || row.nodes.length < 2 || row.kind === "boss") return;
      const used = new Set();
      row.nodes.forEach((node, col) => {
        const key = `${rowIndex}:${col}`;
        let type = String(node?.type || "normal");
        if (type === "shop" && rowIndex < 4 && !visited.has(key)) {
          const replacement = safeTypes.find(candidate => !used.has(candidate));
          if (replacement) {
            node.type = replacement;
            delete node.shopSlot;
            type = replacement;
            changed = true;
          }
        }
        if (!used.has(type)) {
          used.add(type);
          return;
        }
        if (visited.has(key)) return;
        const replacement = safeTypes.find(candidate => !used.has(candidate)
          && !(candidate === "shop" && rowIndex < 4));
        if (!replacement) return;
        node.type = replacement;
        delete node.shopSlot;
        delete node.eventId;
        if (replacement === "event") node.eventId = "windfall";
        used.add(replacement);
        changed = true;
      });
    });
    if (changed) safeSave(game);
    return changed;
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
    const state = game?.state;
    if (!state) return null;
    if (!state.cuddleRebalanceV5 || typeof state.cuddleRebalanceV5 !== "object") state.cuddleRebalanceV5 = {};
    return state.cuddleRebalanceV5;
  }

  function megaState(game) {
    const state = game?.state;
    if (!state) return null;
    if (!state.megaState || typeof state.megaState !== "object") state.megaState = {};
    return state.megaState;
  }

  function upgradeLevel(game, id) {
    const state = game?.state || {};
    const custom = customState(game) || {};
    const coach = state.cuddleCoachExpansion || {};
    const campaign = state.cuddleCampaign || {};
    const balance = state.cuddleBalance || state.cuddleBalanceRefresh || {};
    const candidates = [
      state.upgrades?.[id],
      state.cuddleBonuses?.[id],
      state.balanceRewardCounts?.[id],
      balance.upgrades?.[id],
      custom.upgrades?.[id],
      custom.upgradeLevels?.[id],
      state.campaign?.upgrades?.[id]
    ];
    if (id === "categorySense") candidates.push(campaign.categorySense);
    if (id === "umtJokerCache") candidates.push(custom.cuddleUserJokerCachePerRoundLevel);
    if (id === "coachHint") candidates.push(coach.hintsPerRound);
    if (id === "coachMeterThreshold") candidates.push(coach.cuddleThresholdStacks);
    if (id === "coachMeterReward") candidates.push(coach.cuddleRewardTier);
    if (id === "removeLetter") candidates.push((state.removedLetters || []).length);
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
    mega.jokerPerRoundBonus = Math.max(0, integer(mega.jokerPerRoundBonus, 0)) + delta * 2;
    mega.hasJokerUnlocked = true;
    custom.cuddleUserJokerCachePerRoundLevel = level;
    safeSave(game);
    return true;
  }

  function choiceIdentity(choice) {
    return String(choice?.id || choice?.key || choice?.title || "").trim();
  }

  function normalizedChoiceIdentity(value) {
    return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  }

  function uniqueUpgradeChoices(game, choices, desiredCount) {
    const requested = Math.max(1, integer(desiredCount, Array.isArray(choices) ? choices.length : 3));
    const output = [];
    const identities = new Set();
    const add = choice => {
      if (!choice) return;
      const keys = [choice.id, choice.key, choice.title]
        .map(normalizedChoiceIdentity)
        .filter(Boolean);
      if (!keys.length || keys.some(key => identities.has(key))) return;
      keys.forEach(key => identities.add(key));
      output.push({ ...choice, key: choice.key || choice.id });
    };
    (Array.isArray(choices) ? choices : []).forEach(add);
    let catalog = [];
    try { catalog = typeof game?._upgradeCatalog === "function" ? game._upgradeCatalog() : []; }
    catch (_error) {}
    shuffled(Array.isArray(catalog) ? catalog : [], game?.random || Math.random).forEach(choice => {
      if (output.length < requested) add(choice);
    });
    return output.slice(0, requested);
  }

  function repairSavedUpgradeChoices(game) {
    const choices = game?.state?.upgradeChoices;
    if (!Array.isArray(choices) || choices.length < 2) return false;
    const repaired = uniqueUpgradeChoices(game, choices, choices.length);
    const before = choices.map(choiceIdentity).join("|");
    const after = repaired.map(choiceIdentity).join("|");
    if (repaired.length === choices.length && before === after) return false;
    game.state.upgradeChoices = repaired;
    safeSave(game);
    return true;
  }

  function rememberUnchosenBoss(game, offer, chosenId) {
    const unchosen = (Array.isArray(offer) ? offer : []).find(option => option && option.id !== chosenId);
    if (!unchosen || !game?.state?.boss) return null;
    const mega = megaState(game);
    game.state.boss.ratchetSourceId = unchosen.id;
    game.state.boss.ratchetSourceTitle = unchosen.title || unchosen.id;
    if (mega) {
      if (unchosen.id === "extraGuessTrial") mega.extraGuessTrialPunishPending = true;
      if (unchosen.id === "questEndurance") mega.questEndurancePunishPending = true;
    }
    safeSave(game);
    return unchosen;
  }

  function commitUnchosenBossPenalty(game, boss) {
    if (!boss?.ratchetSourceId || boss.gate === "final") return false;
    const mega = megaState(game);
    if (!mega) return false;
    if (boss.ratchetSourceId === "extraGuessTrial") {
      mega.extraGuessTrialPunishPending = true;
      return true;
    }
    if (boss.ratchetSourceId === "questEndurance") {
      mega.questEndurancePunishPending = true;
      return true;
    }
    if (!Array.isArray(mega.ratchetDebuffs)) mega.ratchetDebuffs = [];
    const ordinal = Math.max(1, integer(game?.state?.bossesCleared, 0) + 1);
    if (mega.ratchetDebuffs.some(item => integer(item?.guessIndex, -1) === ordinal)) return false;
    const debuff = { bossId: boss.ratchetSourceId, guessIndex: ordinal };
    if (debuff.bossId === "hideFeedback") debuff.hiddenIndex = Math.floor((game?.random || Math.random)() * 5);
    if (debuff.bossId === "hiddenMargins") {
      debuff.hiddenIndices = shuffled([0, 1, 2, 3, 4], game?.random || Math.random).slice(0, 2);
    }
    mega.ratchetDebuffs.push(debuff);
    safeSave(game);
    return true;
  }

  function installGamePatches(Game) {
    const prototype = Game?.prototype;
    if (!prototype || prototype.__umtCuddleStabilityV2Installed) return;
    Object.defineProperty(prototype, "__umtCuddleStabilityV2Installed", { value: VERSION });

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
        this.state.branchMap.roundsPlayed = Math.max(0, integer(node.row, 0));
      }
      return original.apply(this, args);
    });

    wrapMethod(prototype, "chooseBoss", function (original, args) {
      const chosenId = args[0];
      const offer = Array.isArray(this.state?.bossOffer) ? this.state.bossOffer.map(option => ({ ...option })) : [];
      const result = original.apply(this, args);
      return afterResult(result, value => {
        if (value?.ok !== false && this.state?.boss) {
          const unchosen = rememberUnchosenBoss(this, offer, chosenId);
          if (unchosen) {
            const suffix = ` ${unchosen.title || "The unchosen boss"} will become a stacked disadvantage.`;
            if (!String(this.state.lastMessage || "").includes("stacked disadvantage")) {
              this.state.lastMessage = `${this.state.lastMessage || ""}${suffix}`.trim();
            }
          }
        }
        return value;
      });
    });

    wrapMethod(prototype, "_clearBoss", function (original, args) {
      const boss = this.state?.boss ? { ...this.state.boss } : null;
      commitUnchosenBossPenalty(this, boss);
      return original.apply(this, args);
    });

    wrapMethod(prototype, "_generateUpgradeChoices", function (original, args) {
      const generated = original.apply(this, args);
      const desired = Math.max(3, Array.isArray(generated) ? generated.length : 3);
      return uniqueUpgradeChoices(this, generated, desired);
    });

    wrapMethod(prototype, "chooseUpgrade", function (original, args) {
      const beforeLevel = upgradeLevel(this, "umtJokerCache");
      const result = original.apply(this, args);
      return afterResult(result, value => {
        const afterLevel = upgradeLevel(this, "umtJokerCache");
        if (value?.ok !== false && afterLevel > beforeLevel) migrateJokerCache(this);
        return value;
      });
    });

    wrapMethod(prototype, "_hydrateState", function (original, args) {
      const result = original.apply(this, args);
      return afterResult(result, value => {
        installRoute(this, false);
        repairDuplicatePathOptions(this);
        migrateJokerCache(this);
        repairSavedUpgradeChoices(this);
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
      const fallback = `cuddle/icons/${FALLBACK_ICON}`;
      if (!img.src.endsWith(`/${FALLBACK_ICON}`)) img.src = fallback;
    }, { once: true });
    return img;
  }

  function replaceIconContents(container, id, title = "") {
    if (!container || !id) return;
    const key = String(id);
    const existing = container.querySelector(":scope > img.umt-cuddle-svg-icon");
    if (container.dataset.umtStableIconKey === key && existing) return;
    container.dataset.umtIconKey = key;
    container.dataset.umtStableIconKey = key;
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
      if (icon) replaceIconContents(icon, definition.id, definition.option?.title || definition.id);
      const reward = definition.option?.reward;
      if (reward) {
        const heading = button.querySelector(".cuddle-boss-reward > b, .cuddle-boss-reward > strong");
        if (heading && !heading.querySelector(".umt-inline-reward-file-icon")) {
          heading.prepend(makeImg(reward.id || definition.option.rewardId || "gift", "umt-inline-reward-file-icon"));
        }
      }
    });

    const boss = game?.state?.boss;
    root.querySelectorAll(".cuddle-boss-info-popover .cuddle-quest-icon").forEach(icon => {
      replaceIconContents(icon, boss?.id || "stage-boss", boss?.title || "Boss");
    });
    root.querySelectorAll(".cuddle-boss-header-badge").forEach(badge => {
      badge.dataset.umtIconKey = boss?.id || "stage-boss";
      badge.replaceChildren(makeImg(boss?.id || "stage-boss", "umt-cuddle-svg-icon"));
    });

    const activeQuest = game?.state?.activeQuest;
    root.querySelectorAll(".cuddle-quest:not(.cuddle-boss-info-popover) .cuddle-quest-icon").forEach(icon => {
      if (activeQuest?.id) replaceIconContents(icon, activeQuest.id, activeQuest.title || "Quest");
    });

    const notice = game?.state?.bossRewardNotice;
    root.querySelectorAll(".cuddle-v3-toast.is-boss .cuddle-v3-toast-icon").forEach(icon => {
      replaceIconContents(icon, notice?.rewardId || notice?.id || notice?.bossId || "gift", notice?.title || "Boss reward");
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
  }

  function shopDefinition(id) {
    const catalogs = [
      window.CuddleCampaign?.SHOP_ITEMS,
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

  function shopGreeting(game) {
    const state = game?.state || {};
    const slot = state.cuddleCampaign?.activeShopRound || state.round || 0;
    const index = hashText(`${state.runId || "run"}:${slot}`) % SHOP_GREETINGS.length;
    return SHOP_GREETINGS[index];
  }

  function enhanceShop(game, root) {
    if (game?.state?.status !== "shop") return;
    const score = Math.max(0, Math.round(number(game.state.score, 0)));
    const title = root.querySelector(".cuddle-header-title");
    if (title) {
      title.replaceChildren();
      const wallet = document.createElement("span");
      wallet.className = "umt-shop-header-wallet";
      wallet.textContent = `Available $${score.toLocaleString()}`;
      title.appendChild(wallet);
    }

    const intro = root.querySelector(".cuddle-shop-intro");
    if (intro) {
      intro.replaceChildren();
      intro.classList.add("umt-shopkeeper-bar");
      const head = document.createElement("img");
      head.src = "cuddle/icons/shopkeeper.svg";
      head.alt = "The Wandering Paw shopkeeper";
      head.className = "umt-shopkeeper-head";
      const speech = document.createElement("p");
      speech.className = "umt-shopkeeper-speech";
      speech.textContent = shopGreeting(game);
      intro.append(head, speech);
    }

    root.querySelectorAll(".cuddle-shop-inventory").forEach(element => element.remove());
    root.querySelectorAll(".cuddle-shop-item[data-shop-item-id]").forEach(control => {
      const id = control.dataset.shopItemId;
      const definition = shopDefinition(id);
      const icon = control.querySelector(".cuddle-shop-item-icon, .cuddle-choice-icon, .cuddle-shop-icon");
      if (icon) replaceIconContents(icon, id, definition?.title || id);
      const cost = control.querySelector(".cuddle-shop-item-cost");
      if (cost) {
        const match = String(cost.textContent || "").match(/\d[\d,]*/);
        if (match) cost.textContent = `$${match[0]}`;
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
      detail: entries.length ? entries.map(([guess, count]) => `guess ${guess}x${count}`).join(", ") : ""
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
      if (/Early solve|Unused guess|Extra guess money|Unused-row money|^Hints\b|^Jokers\b|Cuddle meter max|Cuddle meter reward/i.test(text)) badge.remove();
    });
    const rules = rulesFor(game);
    const green = number(rules.greenPoints, game?.state?.upgrades?.greenPoints || 0);
    const extraGuessRate = number(rules.earlyPoint, game?.state?.upgrades?.earlyPoint || 0);
    const hints = hintPlan(game);
    const mega = megaState(game) || {};
    const coach = game?.state?.cuddleCoachExpansion || {};
    const threshold = typeof window.CuddleCoachExpansion?.meterThreshold === "function"
      ? integer(window.CuddleCoachExpansion.meterThreshold(), 12)
      : Math.max(3, 12 - 3 * integer(coach.cuddleThresholdStacks, 0));
    const rewards = ["Free mulligan", "Joker", "Hint", "Extra row"];
    const meterReward = rewards[Math.max(0, Math.min(3, integer(coach.cuddleRewardTier, 0)))];
    addStatBadge(badges, "Unused guess", `+$${5 * green + extraGuessRate}`);
    addStatBadge(badges, "Extra guess money", `+$${extraGuessRate}`);
    addStatBadge(badges, "Hints", hints.total ? `${hints.total} (${hints.detail})` : "0");
    addStatBadge(badges, "Jokers", String(Math.max(0, integer(mega.jokerPerRoundBonus, 0))));
    addStatBadge(badges, "Cuddle meter max", String(threshold));
    addStatBadge(badges, "Cuddle meter reward", meterReward);
  }

  function enhanceHeaderMoney(game, root) {
    const state = game?.state || {};
    const roundIsLive = state.status === "playing" && !state.pendingRoundEnd;
    const provisional = roundIsLive ? number(state.roundScore, 0) : 0;
    const amount = roundIsLive
      ? Math.max(0, Math.round(number(state.score, 0) - provisional))
      : Math.max(0, Math.round(number(state.score, 0)));
    root.querySelectorAll(".cuddle-header-score").forEach(score => {
      score.textContent = `$${amount.toLocaleString()}`;
      score.setAttribute("aria-label", `Money ${amount}`);
      score.classList.add("umt-plain-money-counter");
    });
  }

  function hideLiveRowMoney(game, root) {
    const historyLength = Array.isArray(game?.state?.history) ? game.state.history.length : 0;
    Array.from(root.querySelectorAll(".cuddle-board-row")).forEach((row, index) => {
      const score = row.querySelector(":scope > .cuddle-row-score");
      if (!score) return;
      const informational = score.classList.contains("is-counts")
        || score.classList.contains("is-boss-active")
        || score.classList.contains("is-boss-inactive");
      score.classList.toggle("umt-earned-row-score", index < historyLength && !informational);
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

  function enhanceUpgradeLevels(game, root) {
    root.querySelectorAll(".cuddle-choice[data-upgrade-key], .cuddle-money-choice[data-upgrade-key]").forEach(button => {
      const key = button.dataset.upgradeKey;
      const choice = (game.state.upgradeChoices || []).find(item => String(item?.key || item?.id) === key);
      const id = String(choice?.id || choice?.key || key || "");
      const level = upgradeLevel(game, id);
      if (level <= 0 || button.querySelector(".umt-current-level")) return;
      const current = document.createElement("span");
      current.className = "umt-current-level";
      const max = integer(choice?.maxLevel ?? choice?.maxCount ?? choice?.max, 0);
      current.textContent = max > 0 ? `Current level: ${level}/${max}` : `Current level: ${level}`;
      const copy = button.querySelector("small, .cuddle-choice-copy") || button;
      copy.appendChild(current);
    });
  }

  function inventoryEntries(game) {
    const state = game?.state || {};
    const campaign = state.cuddleCampaign || {};
    const inventory = campaign.inventory || {};
    const mega = state.megaState || {};
    return [
      { id: "joker", label: "Joker charges", count: integer(mega.jokerCharges, 0), description: "Click a Joker card during a round to choose its letter." },
      { id: "umtJokerCache", label: "Jokers each round", count: integer(mega.jokerPerRoundBonus, 0), description: "Fresh Jokers added at the start of every round." },
      { id: "extraMulligans", label: "Spare mulligan", count: integer(inventory.extraMulligan, 0), description: "Adds one mulligan to the next eligible round." },
      { id: "mulligan", label: "Mulligan refill", count: integer(inventory.mulliganRefresh, 0), description: "Refills mulligans when used." },
      { id: "extraRow", label: "+1 hand", count: integer(inventory.handSize, 0), description: "Adds one counted hand slot for the next round." },
      { id: "yellowDetector", label: "Amber lens", count: integer(inventory.yellowDetector, 0), description: "Reveals one present letter at the next eligible round." },
      { id: "questReroll", label: "Quest rerolls", count: integer(mega.questRerollCharges, 0), description: "Replaces the current quest when the reroll control is available." }
    ].filter(entry => entry.count > 0);
  }

  function closeInventory() {
    inventoryOpen = false;
    document.querySelectorAll(".umt-inventory-overlay").forEach(element => element.remove());
    if (inventoryReturnFocus && typeof inventoryReturnFocus.focus === "function") inventoryReturnFocus.focus();
    inventoryReturnFocus = null;
  }

  function openInventory(game, trigger) {
    closeInventory();
    inventoryOpen = true;
    inventoryReturnFocus = trigger || null;
    const overlay = document.createElement("div");
    overlay.className = "umt-inventory-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-labelledby", "umtInventoryTitle");
    const panel = document.createElement("section");
    panel.className = "umt-inventory-panel";
    const header = document.createElement("header");
    const titleWrap = document.createElement("div");
    const icon = document.createElement("img");
    icon.src = "cuddle/icons/pouch.svg";
    icon.alt = "";
    icon.setAttribute("aria-hidden", "true");
    const title = document.createElement("h2");
    title.id = "umtInventoryTitle";
    title.textContent = "Pouch";
    titleWrap.append(icon, title);
    const close = document.createElement("button");
    close.type = "button";
    close.className = "umt-inventory-close";
    close.dataset.umtInventoryClose = "1";
    close.setAttribute("aria-label", "Close inventory");
    close.textContent = "×";
    header.append(titleWrap, close);
    const list = document.createElement("div");
    list.className = "umt-inventory-list";
    const entries = inventoryEntries(game);
    if (!entries.length) {
      const empty = document.createElement("p");
      empty.className = "umt-inventory-empty";
      empty.textContent = "No one-use items are stored in the pouch.";
      list.appendChild(empty);
    } else {
      entries.forEach(entry => {
        const article = document.createElement("article");
        article.className = "umt-inventory-item";
        const artwork = makeImg(entry.id, "umt-inventory-item-icon");
        const copy = document.createElement("div");
        const heading = document.createElement("strong");
        heading.textContent = entry.label;
        const description = document.createElement("p");
        description.textContent = entry.description;
        copy.append(heading, description);
        const count = document.createElement("b");
        count.textContent = `×${entry.count}`;
        count.setAttribute("aria-label", `${entry.count} available`);
        article.append(artwork, copy, count);
        list.appendChild(article);
      });
    }
    panel.append(header, list);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);
    close.focus();
  }

  function enhanceInventoryPouch(game, root) {
    const side = root.querySelector(".cuddle-header-side-right");
    if (!side) return;
    let button = side.querySelector("[data-umt-inventory-toggle]");
    if (!button) {
      button = document.createElement("button");
      button.type = "button";
      button.className = "cuddle-icon-btn umt-inventory-pouch";
      button.dataset.umtInventoryToggle = "1";
      button.setAttribute("aria-label", "Open inventory pouch");
      const icon = document.createElement("img");
      icon.src = "cuddle/icons/pouch.svg";
      icon.alt = "";
      icon.setAttribute("aria-hidden", "true");
      button.appendChild(icon);
      side.appendChild(button);
    }
    const count = inventoryEntries(game).reduce((sum, entry) => sum + entry.count, 0);
    button.dataset.itemCount = String(count);
    button.title = count ? `Inventory pouch: ${count} stored` : "Inventory pouch: empty";
  }

  function kickHeadStart(game) {
    const state = game?.state || {};
    const custom = customState(game) || {};
    const variant = custom.activeVariant || custom.pendingVariant || null;
    if (state.status !== "playing" || state.roundIntroPending || state.pendingRoundEnd) return;
    if ((state.history || []).length || !variant || variant.kind !== "randomOpener") return;
    const schedule = window.CuddleRebalanceV5?.debug?.scheduleRandomOpener;
    if (typeof schedule !== "function") return;
    const token = `${state.runId || "run"}:${state.round || 0}:${state.secret || ""}`;
    if (custom.openerPlayedToken === token || custom.openerPendingToken === token) return;
    try { schedule(game); }
    catch (error) { console.warn("Cuddle Head Start retry failed.", error); }
  }

  function enhanceRenderedUi(root, game) {
    if (!root || !game?.state) return;
    installRoute(game, false);
    if (game.state.status === "branchMap") repairDuplicatePathOptions(game);
    migrateJokerCache(game);
    enhanceHeaderMoney(game, root);
    enhanceStats(game, root);
    enhanceChoiceIcons(game, root);
    enhanceMapIcons(game, root);
    enhanceShop(game, root);
    enhanceUpgradeLevels(game, root);
    hideLiveRowMoney(game, root);
    fixCollectButton(root);
    enhanceInventoryPouch(game, root);
    kickHeadStart(game);
  }

  function wrapCampaignExport() {
    const campaign = window.CuddleCampaign;
    if (!campaign || campaign.__umtCuddleStabilityV2) return Boolean(campaign);
    const originalAfterRender = campaign.afterRender;
    const originalHandleUiAction = campaign.handleUiAction;
    window.CuddleCampaign = Object.freeze({
      ...campaign,
      __umtCuddleStabilityV2: VERSION,
      afterRender(root, game, landing) {
        if (typeof originalAfterRender === "function") originalAfterRender(root, game, landing);
        if (!landing) enhanceRenderedUi(root, game);
      },
      handleUiAction(game, action, itemId) {
        if (action === "preview-branch-node") {
          const node = findRouteNode(game, itemId);
          if (node?.type === "shop") {
            return typeof game?.enterBranchNode === "function"
              ? game.enterBranchNode(itemId)
              : { ok: false, error: "The shop path is unavailable." };
          }
        }
        return typeof originalHandleUiAction === "function"
          ? originalHandleUiAction(game, action, itemId)
          : { ok: false, error: "Unknown campaign action." };
      }
    });
    return true;
  }

  function installInteractionHandlers() {
    if (document.documentElement.dataset.umtCuddleStabilityV2Handlers === "1") return;
    document.documentElement.dataset.umtCuddleStabilityV2Handlers = "1";
    document.addEventListener("click", event => {
      const target = event.target instanceof Element ? event.target : null;
      const toggle = target?.closest("[data-umt-inventory-toggle]");
      if (toggle) {
        event.preventDefault();
        event.stopImmediatePropagation();
        const game = activeGame();
        if (game) openInventory(game, toggle);
        return;
      }
      if (target?.closest("[data-umt-inventory-close]") || target?.classList.contains("umt-inventory-overlay")) {
        event.preventDefault();
        closeInventory();
      }
    }, true);
    document.addEventListener("keydown", event => {
      if (event.key === "Escape" && inventoryOpen) {
        event.preventDefault();
        closeInventory();
      }
      if (event.key !== "Enter" && event.key !== " ") return;
      const control = event.target instanceof Element
        ? event.target.closest("#cuddleRoot [data-shop-item-id][role='button']")
        : null;
      if (!control || control.tagName === "BUTTON") return;
      event.preventDefault();
      control.click();
    });
  }

  function install() {
    installAttempts += 1;
    const Game = window.CuddleEngine?.CuddleGame || window.CuddleGame;
    if (!Game?.prototype || !window.CuddleCampaign) {
      if (installAttempts < 120) window.setTimeout(install, 50);
      return;
    }
    installGamePatches(Game);
    installInteractionHandlers();
    wrapCampaignExport();
    const game = activeGame();
    if (game) {
      installRoute(game, false);
      repairDuplicatePathOptions(game);
      migrateJokerCache(game);
      repairSavedUpgradeChoices(game);
      const root = document.getElementById("cuddleRoot");
      if (root) enhanceRenderedUi(root, game);
    }
    window.CuddleStabilityV2 = Object.freeze({
      version: VERSION,
      refresh() {
        const current = activeGame();
        if (current) requestRender(current);
      },
      getActiveGame: activeGame,
      rebuildUnstartedRoute() {
        const current = activeGame();
        if (!current || mapHasProgress(current.state?.branchMap)) return false;
        const changed = installRoute(current, true);
        requestRender(current);
        return changed;
      }
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
})();
