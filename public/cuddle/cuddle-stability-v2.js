// Cuddle stability and UI patch v2. Loaded after the existing Cuddle modules.
(function installCuddleStabilityV2() {
  "use strict";

  const VERSION = "2026.09.09.2";
  const ROUTE_VERSION = "umt-cuddle-route-2026.09.24.lanes";
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

  function routeRandom(game) {
    let value = hashText(`${game?.state?.runId || "run"}:route-lanes`) || 0x6d2b79f5;
    return function nextRouteValue() {
      value = (value + 0x6d2b79f5) >>> 0;
      let output = value;
      output = Math.imul(output ^ (output >>> 15), output | 1);
      output ^= output + Math.imul(output ^ (output >>> 7), output | 61);
      return ((output ^ (output >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Which of the three lanes (left 0, middle 1, right 2) a row occupies.
  // Most rows use all three; about a third drop one, and which one varies,
  // so the road narrows and shifts instead of running in straight columns.
  function rowLanes(random) {
    if (random() < 0.66) return [0, 1, 2];
    const options = [[0, 2], [0, 1], [1, 2]];
    return options[Math.floor(random() * options.length)];
  }

  // Links each stop to its neighbours in the next row (same lane or one
  // over), then prunes at random so the lanes weave and cross rather than
  // run side by side. Every stop keeps at least one way in and one way out,
  // so all of them stay reachable and none is a dead end.
  function connectLanes(rows, random) {
    for (let rowIndex = 0; rowIndex < rows.length - 1; rowIndex += 1) {
      const from = rows[rowIndex].nodes;
      const to = rows[rowIndex + 1].nodes;
      if (to.length === 1) { from.forEach(node => { node.next = [0]; }); continue; }
      if (from.length === 1) { from[0].next = to.map((_node, index) => index); continue; }
      const laneOf = node => (Number.isInteger(node.lane) ? node.lane : 1);
      const edges = from.map(node => to
        .map((target, index) => ({ index, gap: Math.abs(laneOf(target) - laneOf(node)) }))
        .filter(item => item.gap <= 1)
        .map(item => item.index));
      // A stop with no neighbour in range (left lane into a row that only
      // has the right lane) takes the nearest one instead.
      from.forEach((node, index) => {
        if (edges[index].length) return;
        let best = 0;
        to.forEach((target, targetIndex) => {
          if (Math.abs(laneOf(target) - laneOf(node)) < Math.abs(laneOf(to[best]) - laneOf(node))) best = targetIndex;
        });
        edges[index].push(best);
      });
      to.forEach((target, targetIndex) => {
        if (edges.some(list => list.includes(targetIndex))) return;
        let best = 0;
        from.forEach((node, index) => {
          if (Math.abs(laneOf(target) - laneOf(node)) < Math.abs(laneOf(target) - laneOf(from[best]))) best = index;
        });
        edges[best].push(targetIndex);
      });
      const incoming = targetIndex => edges.filter(list => list.includes(targetIndex)).length;
      from.forEach((_node, index) => {
        const list = edges[index];
        while (list.length > 2 || (list.length > 1 && random() < 0.38)) {
          const removable = list.filter(targetIndex => incoming(targetIndex) > 1);
          if (!removable.length) break;
          list.splice(list.indexOf(removable[Math.floor(random() * removable.length)]), 1);
        }
        list.sort((a, b) => a - b);
      });
      from.forEach((node, index) => { node.next = edges[index]; });
    }
    return rows;
  }

  // Every world's three "stops" rows before its boss offer only wordle-type
  // nodes (normal/theme/challenge) -- whichever lane the player takes, that
  // guarantees at least 3 played wordles before the boss. Non-wordle
  // utility stops (shop/upgrade/event) live in one dedicated row of their
  // own per world instead, so that guarantee holds regardless of path.
  function buildRoute(game) {
    const pairs = bossPairs(game);
    if (pairs.length < 3) return null;
    const random = routeRandom(game);
    const rows = [];
    const gates = ["before-3", "before-7", "final"];
    const utilityPools = [
      ["upgrade", "event", "normal"],
      ["shop", "event", "upgrade"],
      ["shop", "upgrade", "event"]
    ];
    const shopSlots = [0, 4, 8];
    for (let world = 0; world < 3; world += 1) {
      for (let step = 0; step < 3; step += 1) {
        const lanes = rowLanes(random);
        const types = shuffled(["normal", "theme", "challenge"], random).slice(0, lanes.length);
        const rowIndex = rows.length;
        rows.push({
          kind: "stops",
          act: world,
          nodes: lanes.map((lane, col) => routeNode(rowIndex, col, types[col], { lane }))
        });
      }
      const lanes = rowLanes(random);
      const pool = utilityPools[world];
      // Worlds two and three always keep their shop in the row.
      const fixed = world > 0 ? [pool[0]] : [];
      const rest = shuffled(pool.filter(type => !fixed.includes(type)), random);
      const types = shuffled(fixed.concat(rest).slice(0, lanes.length), random);
      const rowIndex = rows.length;
      rows.push({
        kind: "stops",
        act: world,
        nodes: lanes.map((lane, col) => {
          const extra = { lane };
          if (types[col] === "shop") extra.shopSlot = shopSlots[world];
          if (types[col] === "event") extra.eventId = "windfall";
          return routeNode(rowIndex, col, types[col], extra);
        })
      });
      rows.push({ kind: "boss", act: world, nodes: [bossNode(pairs[world], gates[world], rows.length)] });
    }
    connectLanes(rows, random);
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
        // Wordle stops share a type but differ by variant (Lucky Start,
        // Jackpot, a named challenge...), which is what tells them apart --
        // retyping one here only fought the variant layer's own typing.
        if (["normal", "theme", "challenge"].includes(type)) return;
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
    game.state.boss.ratchetSourceId = unchosen.id;
    game.state.boss.ratchetSourceTitle = unchosen.title || unchosen.id;
    safeSave(game);
    return unchosen;
  }

  // Random guess slot(s) for a newly-created ratchet debuff, drawn from
  // 1..poolMax and never reusing a slot an existing debuff already claims.
  function pickRatchetGuessIndices(game, mega, count, poolMax) {
    const used = new Set((mega.ratchetDebuffs || []).map(item => integer(item?.guessIndex, 0)));
    const pool = [];
    for (let index = 1; index <= poolMax; index += 1) {
      if (!used.has(index)) pool.push(index);
    }
    return shuffled(pool, game?.random || Math.random).slice(0, count);
  }

  // The declined boss's effect is permanent from here on -- every future
  // round, not just the next one -- and which guess(es) it haunts is
  // random: the first boss's decline claims one random guess among the
  // first three of every future round, the second boss's decline claims
  // two among the first four (never reusing a slot the first boss's
  // decline already claimed). No ratchet is ever created for the final
  // boss -- no round follows it. mega.ratchetOrdinalsApplied guards
  // against double-applying the same boss stage's penalty (guessIndex is
  // no longer 1:1 with the ordinal, so it can't double as that guard by
  // itself the way it used to).
  function commitUnchosenBossPenalty(game, boss) {
    if (!boss?.ratchetSourceId || boss.gate === "final") return false;
    const mega = megaState(game);
    if (!mega) return false;
    if (!Array.isArray(mega.ratchetDebuffs)) mega.ratchetDebuffs = [];
    if (!Array.isArray(mega.ratchetOrdinalsApplied)) mega.ratchetOrdinalsApplied = [];
    const ordinal = Math.max(1, integer(game?.state?.bossesCleared, 0) + 1);
    if (mega.ratchetOrdinalsApplied.includes(ordinal)) return false;
    mega.ratchetOrdinalsApplied.push(ordinal);
    const bossId = boss.ratchetSourceId;
    const slotCount = ordinal >= 2 ? 2 : 1;
    const poolMax = ordinal >= 2 ? 4 : 3;
    const guessIndices = pickRatchetGuessIndices(game, mega, slotCount, poolMax);
    guessIndices.forEach(guessIndex => {
      const debuff = { bossId, guessIndex };
      if (bossId === "hideFeedback") debuff.hiddenIndex = Math.floor((game?.random || Math.random)() * 5);
      if (bossId === "hiddenMargins") {
        debuff.hiddenIndices = shuffled([0, 1, 2, 3, 4], game?.random || Math.random).slice(0, 2);
      }
      mega.ratchetDebuffs.push(debuff);
    });
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
      if (group.closest(".umt-map-v2")) return;
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
      window.CuddleRebalanceV5?.shopItems,
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
    // The Wandering Paw (cuddle-shop.js) draws its own wallet and keeper.
    if (root.querySelector(".umt-shop-v2")) return;
    // The shop spends Money, not Points -- enhanceHeaderMoney (called
    // right before this on every render) already keeps both header spans
    // current, .cuddle-header-score (Points) and .cuddle-header-money
    // (Money), so there's nothing left for the shop screen itself to
    // override there. Only the shop's own "Available $X" wallet line
    // below is specific to this screen.
    const money = Math.max(0, Math.round(number(game.state.cuddleMoney, 0)));

    const title = root.querySelector(".cuddle-header-title");
    if (title && !title.querySelector(".umt-shop-header-wallet")) {
      const wallet = document.createElement("span");
      wallet.className = "umt-shop-header-wallet";
      wallet.textContent = `Available $${money.toLocaleString()}`;
      title.appendChild(wallet);
    } else if (title) {
      const wallet = title.querySelector(".umt-shop-header-wallet");
      const next = `Available $${money.toLocaleString()}`;
      if (wallet && wallet.textContent !== next) wallet.textContent = next;
    }

    const intro = root.querySelector(".cuddle-shop-intro");
    if (intro && !intro.querySelector(".umt-shopkeeper-head")) {
      intro.classList.add("umt-shopkeeper-bar");
      const head = document.createElement("img");
      head.src = "cuddle/icons/shopkeeper.svg";
      head.alt = "The Wandering Paw shopkeeper";
      head.className = "umt-shopkeeper-head";
      const speech = document.createElement("p");
      speech.className = "umt-shopkeeper-speech";
      speech.textContent = shopGreeting(game);
      intro.replaceChildren(head, speech);
    } else if (intro) {
      const speech = intro.querySelector(".umt-shopkeeper-speech");
      const greeting = shopGreeting(game);
      if (speech && speech.textContent !== greeting) speech.textContent = greeting;
    }

    root.querySelectorAll(".cuddle-shop-inventory").forEach(element => {
      element.hidden = true;
    });

    root.querySelectorAll(".cuddle-shop-item[data-shop-item-id]").forEach(control => {
      const id = control.dataset.shopItemId;
      const definition = shopDefinition(id);
      const signature = `${id}:${definition?.title || ""}:${control.textContent || ""}`;
      if (control.dataset.umtShopDecorated === signature) return;
      control.dataset.umtShopDecorated = signature;
      const icon = control.querySelector(".cuddle-shop-item-icon, .cuddle-choice-icon, .cuddle-shop-icon");
      if (icon) replaceIconContents(icon, id, definition?.title || id);
      const cost = control.querySelector(".cuddle-shop-item-cost");
      if (cost) {
        const current = String(cost.textContent || "").trim();
        const match = current.match(/\d[\d,]*/);
        if (match && !/^Sold/i.test(current)) {
          cost.textContent = /^Need/i.test(current) ? `Need $${match[0]}` : `$${match[0]}`;
        }
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
      : (() => {
        const difficulty = String(
          game?.state?.megaState?.difficulty
          || game?.state?.difficulty
          || game?.state?.mode?.difficulty
          || game?.state?.settings?.difficulty
          || "medium"
        ).toLowerCase();
        const base = /easy|casual/.test(difficulty)
          ? 10
          : /hard|expert|difficult/.test(difficulty)
            ? 15
            : 12;
        return Math.max(7, base - integer(coach.cuddleThresholdStacks, 0));
      })();
    const rewards = ["Free mulligan", "Joker", "Hint"];
    const meterReward = rewards[Math.max(0, Math.min(2, integer(coach.cuddleRewardTier, 0)))];
    // Points, not money -- the unused-guess/mulligan bonuses below pay into
    // state.score (see cuddle-engine.js's submitDraft), same as every
    // other in-round scoring rule these stat badges describe.
    addStatBadge(badges, "Unused guess", `+${5 * green + extraGuessRate} pts`);
    addStatBadge(badges, "Extra guess points", `+${extraGuessRate}`);
    addStatBadge(badges, "Hints", hints.total ? `${hints.total} (${hints.detail})` : "0");
    addStatBadge(badges, "Jokers", String(Math.max(0, integer(mega.jokerPerRoundBonus, 0))));
    addStatBadge(badges, "Cuddle meter max", String(threshold));
    addStatBadge(badges, "Cuddle meter reward", meterReward);
  }

  function enhanceHeaderMoney(game, root) {
    const state = game?.state || {};
    const roundIsLive = state.status === "playing" && !state.pendingRoundEnd;
    const provisional = roundIsLive ? number(state.roundScore, 0) : 0;
    // Points: this run's ordinary score, still not shown mid-round as
    // "already banked" until the round actually resolves (see the
    // pendingRoundEnd guard above) -- the header shouldn't count a guess
    // that could still be undone by a mulligan.
    // bankedScore() is the same figure the "Next boss" line reads, so the
    // two can't drift apart; it also counts a stage-start grant (Opening
    // Verse) straight away instead of holding it back with the guesses.
    const amount = typeof game.bankedScore === "function"
      ? Math.round(game.bankedScore())
      : roundIsLive
        ? Math.max(0, Math.round(number(state.score, 0) - provisional))
        : Math.max(0, Math.round(number(state.score, 0)));
    root.querySelectorAll(".cuddle-header-score").forEach(score => {
      score.textContent = amount.toLocaleString();
      score.setAttribute("aria-label", `${amount} points`);
      score.classList.add("umt-plain-points-counter");
    });
    // Money: unlike Points, never provisional -- it's only ever granted on
    // a clean stage/challenge clear (see cuddle-points-money.js), never
    // mid-round, so there's nothing to hold back here.
    const money = Math.max(0, Math.round(number(state.cuddleMoney, 0)));
    root.querySelectorAll(".cuddle-header-money").forEach(el => {
      el.textContent = `$${money.toLocaleString()}`;
      el.setAttribute("aria-label", `${money} money`);
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
    collect.textContent = "Collect";
    collect.setAttribute("aria-label", `Collect ${total} dollars earned this round`);
  }

  // The card's own "Lv 2 → 3" chip already states the level, so the old
  // "Current level" pill this used to append is gone -- only stale copies
  // from a previous render are cleaned up.
  function enhanceUpgradeLevels(game, root) {
    root.querySelectorAll(".umt-current-level").forEach(element => element.remove());
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
    root.__umtCuddleStabilityGame = game;
    if (root.__umtCuddleStabilityFrame) return;

    const schedule = typeof window.requestAnimationFrame === "function"
      ? window.requestAnimationFrame.bind(window)
      : callback => window.setTimeout(callback, 0);

    root.__umtCuddleStabilityFrame = schedule(() => {
      root.__umtCuddleStabilityFrame = 0;
      const liveGame = root.__umtCuddleStabilityGame;
      if (!root.isConnected || !liveGame?.state) return;

      installRoute(liveGame, false);
      if (liveGame.state.status === "branchMap") repairDuplicatePathOptions(liveGame);
      migrateJokerCache(liveGame);

      if (root.querySelector(".cuddle-header-score")) enhanceHeaderMoney(liveGame, root);
      if (root.querySelector(".cuddle-stat-group, .cuddle-detail-group")) enhanceStats(liveGame, root);
      if (root.querySelector(".cuddle-choice, .cuddle-money-choice")) {
        enhanceChoiceIcons(liveGame, root);
        enhanceUpgradeLevels(liveGame, root);
      }
      if (root.querySelector(".cuddle-map-shell, .cuddle-branch-map")) enhanceMapIcons(liveGame, root);
      if (liveGame.state.status === "shop") enhanceShop(liveGame, root);
      if (root.querySelector(".cuddle-board-row")) hideLiveRowMoney(liveGame, root);
      if (root.querySelector("[data-cuddle-money-action='collect-payout'], [data-action='collect-money-payout']")) {
        fixCollectButton(root);
      }
      if (liveGame.state.status === "playing" && !(liveGame.state.history || []).length) kickHeadStart(liveGame);
    });
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
    }, true);
    document.addEventListener("keydown", event => {
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

/* UMT_CUDDLE_FIXPACK_20260912: START */
(function installUmtCuddleFixpack() {
  "use strict";

  const VERSION = "2026.09.12-r2";
  const Engine = window.CuddleEngine;
  const Game = Engine && Engine.CuddleGame;
  if (!Game || !Game.prototype) {
    console.error("Cuddle fix pack: CuddleEngine was not available.");
    return;
  }

  const SHOP_ITEMS = Object.freeze([
    Object.freeze({ id: "joker", icon: "🃏", title: "Pocket Joker", cost: 18, kind: "one-time", description: "Gain one Joker charge for this run." }),
    Object.freeze({ id: "yellowDetector", icon: "🟨", title: "Amber Lens", cost: 12, kind: "one-time", description: "Reveal one solution letter at the start of the next eligible round." }),
    Object.freeze({ id: "coachBossTenLetterCull", icon: "✂️", title: "Ten-Letter Cull", cost: 24, kind: "boss", description: "Save a ten-letter cull for the next boss." }),
    Object.freeze({ id: "coachBossUnlimitedMulligans", icon: "♾️", title: "Regular Wordle Hands", cost: 28, kind: "boss", description: "Save unlimited mulligans for the next boss." }),
    Object.freeze({ id: "coachShopPossibleAnswers", icon: "🎧", title: "Secrets Counter", cost: 44, kind: "upgrade", rarity: "bronze", description: "Unlock the exact Secrets Remaining counter for this run." }),
    Object.freeze({ id: "coachShopHint", icon: "💡", title: "Guesser Hint", cost: 50, kind: "upgrade", rarity: "silver", description: "Add one exact-position hint to every eligible round, up to four." }),
    Object.freeze({ id: "coachShopMeterThreshold", icon: "🩶", title: "Softer Cuddle Meter", cost: 56, kind: "upgrade", rarity: "gold", description: "Reduce the Cuddle Meter requirement by one for this run, up to three times." })
  ]);
  const SHOP_BY_ID = new Map(SHOP_ITEMS.map(item => [item.id, item]));
  const UPGRADE_MAX = Object.freeze({
    coachShopPossibleAnswers: 1,
    coachShopHint: 4,
    coachShopMeterThreshold: 3
  });

  let activeGame = null;
  const scheduledRoots = new WeakMap();
  const openingJobs = new WeakMap();
  const lastBurstSequence = new WeakMap();

  function numeric(value, fallback = 0) {
    const result = Number(value);
    return Number.isFinite(result) ? result : fallback;
  }

  function integer(value, fallback = 0) {
    return Math.trunc(numeric(value, fallback));
  }

  function currentGame() {
    if (activeGame && activeGame.state) return activeGame;
    const candidates = [
      window.CuddleUI && typeof window.CuddleUI.getActiveGame === "function" ? window.CuddleUI.getActiveGame() : null,
      window.CuddleStabilityV2 && typeof window.CuddleStabilityV2.getActiveGame === "function" ? window.CuddleStabilityV2.getActiveGame() : null,
      window.CuddleRebalanceV5?.debug && typeof window.CuddleRebalanceV5.debug.getActiveGame === "function" ? window.CuddleRebalanceV5.debug.getActiveGame() : null,
      window.cuddleGame,
      window.activeCuddleGame,
      window.CuddleGame && window.CuddleGame.state ? window.CuddleGame : null
    ];
    if (Array.isArray(window.__cuddleV8Contexts)) {
      for (let index = window.__cuddleV8Contexts.length - 1; index >= 0; index -= 1) {
        const entry = window.__cuddleV8Contexts[index];
        candidates.push(entry?.game || entry);
      }
    }
    const found = candidates.find(candidate => candidate && candidate.state);
    if (found) activeGame = found;
    return found || null;
  }

  function ensureCampaignState(game) {
    const state = game.state || (game.state = {});
    const campaign = state.cuddleCampaign && typeof state.cuddleCampaign === "object"
      ? state.cuddleCampaign
      : (state.cuddleCampaign = {});
    campaign.shopPurchases = campaign.shopPurchases && typeof campaign.shopPurchases === "object"
      ? campaign.shopPurchases
      : {};
    campaign.inventory = Object.assign({
      extraMulligan: 0,
      mulliganRefresh: 0,
      handSize: 0,
      yellowDetector: 0
    }, campaign.inventory || {});
    return campaign;
  }

  function ensureCoachState(game) {
    const state = game.state || (game.state = {});
    const coach = state.cuddleCoachExpansion && typeof state.cuddleCoachExpansion === "object"
      ? state.cuddleCoachExpansion
      : (state.cuddleCoachExpansion = {});
    coach.shopPurchases = coach.shopPurchases && typeof coach.shopPurchases === "object"
      ? coach.shopPurchases
      : {};
    coach.inventory = Object.assign({
      tenLetterCull: 0,
      unlimitedMulligans: 0
    }, coach.inventory || {});
    coach.hintsPerRound = Math.max(0, integer(coach.hintsPerRound, 0));
    coach.cuddleThresholdStacks = Math.max(0, integer(coach.cuddleThresholdStacks, 0));
    coach.possibleAnswersUnlocked = Boolean(coach.possibleAnswersUnlocked);
    return coach;
  }

  function shopKey(game, campaign) {
    const value = campaign.activeShopRound ?? game.state?.round ?? "shop";
    return String(value);
  }

  function listFor(object, key) {
    const current = object[key];
    if (Array.isArray(current)) return current;
    object[key] = [];
    return object[key];
  }

  function upgradeLevel(itemId, coach, game) {
    if (itemId === "coachShopPossibleAnswers") return coach.possibleAnswersUnlocked ? 1 : 0;
    if (itemId === "coachShopHint") return Math.max(0, integer(coach.hintsPerRound, 0));
    if (itemId === "coachShopMeterThreshold") return Math.max(0, integer(coach.cuddleThresholdStacks, 0));
    return 0;
  }

  function itemIsMaxed(item, coach, game) {
    const maximum = UPGRADE_MAX[item.id];
    return maximum ? upgradeLevel(item.id, coach, game) >= maximum : false;
  }

  function safeSave(game) {
    try {
      if (game && typeof game.save === "function") game.save();
    } catch (error) {
      console.warn("Cuddle fix pack: save failed.", error);
    }
  }

  function requestRender(game) {
    try {
      window.dispatchEvent(new CustomEvent("cuddle:campaign-update", {
        detail: { runId: game?.state?.runId || null }
      }));
    } catch (error) {
      console.warn("Cuddle fix pack: render request failed.", error);
    }
  }

  function installShopMethods() {
    const proto = Game.prototype;
    if (proto.__umtCuddleFixpackShop === VERSION) return;

    proto.getCuddleShop = function getFixedCuddleShop() {
      activeGame = this;
      const campaign = ensureCampaignState(this);
      const coach = ensureCoachState(this);
      const key = shopKey(this, campaign);
      const purchased = new Set([
        ...listFor(campaign.shopPurchases, key),
        ...listFor(coach.shopPurchases, key)
      ]);
      // The shop spends Money, not Points -- the returned field is still
      // called "score" for callers that already expect it (renderShop's
      // ${shop.score} in cuddle-campaign.js, labelled "money" there).
      const score = Math.max(0, numeric(this.state?.cuddleMoney, 0));
      return {
        round: campaign.activeShopRound ?? this.state?.round ?? null,
        score,
        nextTarget: null,
        items: SHOP_ITEMS.map(item => ({
          ...item,
          purchased: purchased.has(item.id) || itemIsMaxed(item, coach, this),
          affordable: score >= item.cost && !itemIsMaxed(item, coach, this)
        })),
        inventory: { ...campaign.inventory },
        jokerCharges: Math.max(0, integer(this.state?.megaState?.jokerCharges, 0))
      };
    };

    proto.buyCuddleShopItem = function buyFixedCuddleShopItem(itemId) {
      activeGame = this;
      if (this.state?.status !== "shop") return { ok: false, error: "No shop is open." };
      const item = SHOP_BY_ID.get(String(itemId || ""));
      if (!item) return { ok: false, error: "That shop item does not exist." };

      const campaign = ensureCampaignState(this);
      const coach = ensureCoachState(this);
      const key = shopKey(this, campaign);
      const campaignPurchases = listFor(campaign.shopPurchases, key);
      const coachPurchases = listFor(coach.shopPurchases, key);
      if (campaignPurchases.includes(item.id) || coachPurchases.includes(item.id)) {
        return { ok: false, error: "That item is sold out in this shop." };
      }
      if (itemIsMaxed(item, coach, this)) return { ok: false, error: `${item.title} is already maxed.` };

      const balance = numeric(this.state.cuddleMoney, 0);
      if (balance < item.cost) return { ok: false, error: `You need $${item.cost}.` };

      const snapshot = {
        score: balance,
        campaignPurchases: campaignPurchases.slice(),
        coachPurchases: coachPurchases.slice(),
        jokerCharges: numeric(this.state?.megaState?.jokerCharges, 0),
        hasJokerUnlocked: Boolean(this.state?.megaState?.hasJokerUnlocked),
        yellowDetector: integer(campaign.inventory.yellowDetector, 0),
        tenLetterCull: integer(coach.inventory.tenLetterCull, 0),
        unlimitedMulligans: integer(coach.inventory.unlimitedMulligans, 0),
        possibleAnswersUnlocked: Boolean(coach.possibleAnswersUnlocked),
        hintsPerRound: integer(coach.hintsPerRound, 0),
        cuddleThresholdStacks: integer(coach.cuddleThresholdStacks, 0)
      };

      try {
        this.state.cuddleMoney = balance - item.cost;
        campaignPurchases.push(item.id);
        coachPurchases.push(item.id);

        if (item.id === "joker") {
          const mega = this.state.megaState && typeof this.state.megaState === "object"
            ? this.state.megaState
            : (this.state.megaState = {});
          mega.jokerCharges = Math.max(0, integer(mega.jokerCharges, 0)) + 1;
          mega.hasJokerUnlocked = true;
        } else if (item.id === "yellowDetector") {
          campaign.inventory.yellowDetector = Math.max(0, integer(campaign.inventory.yellowDetector, 0)) + 1;
        } else if (item.id === "coachBossTenLetterCull") {
          coach.inventory.tenLetterCull = Math.max(0, integer(coach.inventory.tenLetterCull, 0)) + 1;
        } else if (item.id === "coachBossUnlimitedMulligans") {
          coach.inventory.unlimitedMulligans = Math.max(0, integer(coach.inventory.unlimitedMulligans, 0)) + 1;
        } else if (item.id === "coachShopPossibleAnswers") {
          coach.possibleAnswersUnlocked = true;
        } else if (item.id === "coachShopHint") {
          coach.hintsPerRound = Math.min(4, Math.max(0, integer(coach.hintsPerRound, 0)) + 1);
        } else if (item.id === "coachShopMeterThreshold") {
          coach.cuddleThresholdStacks = Math.min(3, Math.max(0, integer(coach.cuddleThresholdStacks, 0)) + 1);
        }

        this.state.lastMessage = `${item.title} purchased for $${item.cost}.`;
        safeSave(this);
        return { ok: true, message: this.state.lastMessage, item: { ...item } };
      } catch (error) {
        this.state.cuddleMoney = snapshot.score;
        campaign.shopPurchases[key] = snapshot.campaignPurchases;
        coach.shopPurchases[key] = snapshot.coachPurchases;
        if (this.state.megaState) {
          this.state.megaState.jokerCharges = snapshot.jokerCharges;
          this.state.megaState.hasJokerUnlocked = snapshot.hasJokerUnlocked;
        }
        campaign.inventory.yellowDetector = snapshot.yellowDetector;
        coach.inventory.tenLetterCull = snapshot.tenLetterCull;
        coach.inventory.unlimitedMulligans = snapshot.unlimitedMulligans;
        coach.possibleAnswersUnlocked = snapshot.possibleAnswersUnlocked;
        coach.hintsPerRound = snapshot.hintsPerRound;
        coach.cuddleThresholdStacks = snapshot.cuddleThresholdStacks;
        console.error("Cuddle fix pack: purchase rolled back.", error);
        return { ok: false, error: "The purchase could not be completed." };
      }
    };

    Object.defineProperty(proto, "__umtCuddleFixpackShop", {
      value: VERSION,
      configurable: true
    });

    // Handed to cuddle-shop-lockin.js (loaded last, after the deferred
    // cuddle-economy-rarity-v8.js) so it can put these exact, never-wrapped
    // functions back on the prototype once everything else has had its
    // turn -- see that file for why: economy-rarity-v8.js's generic
    // method-instrumentation pass re-wraps proto.getCuddleShop and
    // proto.buyCuddleShopItem for its own reward-theming bookkeeping,
    // among many other methods, and its shop-shaped-array heuristic
    // (isShopArray/transformShopCatalog) then rewrites and pads out
    // whatever items() this shop returns with an entirely separate
    // "pouch" reward economy of its own -- so a caller reading
    // game.getCuddleShop() no longer sees the plain 8-item catalog this
    // function actually builds. Keeping a direct reference to the
    // pristine functions (rather than trying to make them un-wrappable,
    // or reversing whatever the wrapper did) is what makes it possible to
    // restore exactly this catalog and exactly this purchase logic
    // afterward, regardless of what runs in between.
    window.__cuddleShopFinal = Object.freeze({
      getShop: proto.getCuddleShop,
      buyItem: proto.buyCuddleShopItem
    });
  }

  function installShopClickHandler() {
    if (document.documentElement.dataset.umtCuddleFixpackShopClick === VERSION) return;
    document.documentElement.dataset.umtCuddleFixpackShopClick = VERSION;
    document.addEventListener("click", event => {
      const target = event.target instanceof Element ? event.target : null;
      const button = target?.closest('[data-cuddle-campaign-action="buy-shop-item"][data-shop-item-id]');
      if (!button || button.disabled) return;
      const game = currentGame();
      if (!game || typeof game.buyCuddleShopItem !== "function") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const result = game.buyCuddleShopItem(button.dataset.shopItemId);
      if (!result?.ok && result?.error) game.state.lastMessage = result.error;
      safeSave(game);
      requestRender(game);
    }, true);
  }

  // (removed) installBlueChallengeFix used to re-blue the WHOLE row after the
  // engine had already handled a Blue Haze challenge, as a backstop for the
  // effect not landing at all. The money-mode challenge layer now hands every
  // feedback effect straight to the engine, which blues only the tiles in the
  // guess's marked span -- so this override did nothing but undo that and put
  // the full-row version back.

  function randomOpenerState(game) {
    const state = game?.state || {};
    return state.cuddleRebalanceV5 || state.cuddleRebalance || state.cuddleV5 || {};
  }

  function scheduleOpeningWord(game) {
    if (!game?.state) return;
    const state = game.state;
    const token = `${state.runId || "run"}:${state.round || 0}:${state.secret || ""}`;
    const existing = openingJobs.get(game);
    if (existing === token) return;
    openingJobs.set(game, token);
    let attempts = 0;
    const initialHistory = Array.isArray(state.history) ? state.history.length : 0;

    const attempt = () => {
      if (!game.state || openingJobs.get(game) !== token) return;
      const live = game.state;
      const history = Array.isArray(live.history) ? live.history : [];
      if (history.length > initialHistory) {
        openingJobs.delete(game);
        safeSave(game);
        requestRender(game);
        return;
      }
      if (live.status !== "playing" || live.roundIntroPending || live.pendingRoundEnd) {
        openingJobs.delete(game);
        return;
      }

      const custom = randomOpenerState(game);
      const variant = custom.activeVariant || custom.pendingVariant || null;
      if (variant && variant.kind === "randomOpener") {
        const scheduler = window.CuddleRebalanceV5?.debug?.scheduleRandomOpener;
        const played = custom.openerPlayedToken === token;
        const pending = custom.openerPendingToken === token;
        if (!played && !pending && typeof scheduler === "function") {
          try { scheduler(game); }
          catch (error) { console.warn("Cuddle fix pack: opening word retry failed.", error); }
        }
      }

      attempts += 1;
      if (attempts < 18) window.setTimeout(attempt, 20);
      else openingJobs.delete(game);
    };

    window.setTimeout(attempt, 0);
  }

  function installOpeningWordFix() {
    const proto = Game.prototype;
    if (proto.__umtCuddleFixpackOpening === VERSION || typeof proto._beginRound !== "function") return;
    const original = proto._beginRound;
    proto._beginRound = function beginRoundWithOpeningWord() {
      const result = original.apply(this, arguments);
      activeGame = this;
      scheduleOpeningWord(this);
      return result;
    };
    Object.defineProperty(proto, "__umtCuddleFixpackOpening", { value: VERSION, configurable: true });
  }

  // The round-end cash-out screen is entirely a Points readout (a
  // challenge's own Money reward is called out separately -- see
  // cuddle-money-mode.js's cuddle-money-payout-challenge line, which this
  // function leaves alone), so its own local figures format as points.
  function formatDelta(value) {
    const amount = Math.round(numeric(value, 0));
    if (amount > 0) return `+${amount.toLocaleString()}`;
    if (amount < 0) return `-${Math.abs(amount).toLocaleString()}`;
    return "0";
  }

  function pendingPayout(game) {
    return game?.state?.cuddleMoneyMode?.pendingPayout || null;
  }

  function payoutTotal(payload, overlay) {
    if (payload && Number.isFinite(Number(payload.total))) return Math.round(Number(payload.total));
    const source = overlay.querySelector(".cuddle-money-payout-total strong, [data-payout-total], .cuddle-money-round-total");
    const match = String(source?.textContent || "").replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
    return match ? Math.round(numeric(match[0], 0)) : 0;
  }

  function enhanceCashout(game, root) {
    const scope = root || document;
    const overlay = scope.querySelector?.("#cuddleMoneyPayoutOverlay, .cuddle-money-payout-overlay")
      || document.querySelector("#cuddleMoneyPayoutOverlay, .cuddle-money-payout-overlay");
    if (!overlay) return;
    const modal = overlay.querySelector(".cuddle-money-modal, .cuddle-money-payout-modal") || overlay;
    const payload = pendingPayout(game);
    const total = payoutTotal(payload, overlay);

    let collect = overlay.querySelector("[data-cuddle-money-action='collect-payout'], [data-action='collect-money-payout'], [data-action='collect-payout']");
    if (!collect) {
      collect = Array.from(overlay.querySelectorAll("button")).find(button => /^\s*collect\b/i.test(button.textContent || "")) || null;
    }
    if (collect) {
      collect.textContent = "Collect";
      collect.setAttribute("aria-label", `Collect ${Math.max(0, total)} points earned this round`);
      let top = modal.querySelector(":scope > .umt-cashout-top");
      if (!top) {
        top = document.createElement("div");
        top.className = "umt-cashout-top";
        const heading = modal.querySelector("h1, h2, .cuddle-money-kicker");
        if (heading?.nextSibling) modal.insertBefore(top, heading.nextSibling);
        else modal.prepend(top);
      }
      if (collect.parentElement !== top) top.appendChild(collect);
      let roundTotal = top.querySelector(".umt-round-total");
      if (!roundTotal) {
        roundTotal = document.createElement("div");
        roundTotal.className = "umt-round-total";
        top.appendChild(roundTotal);
      }
      roundTotal.innerHTML = `<span>Round total</span><strong>${formatDelta(total)}</strong>`;
    }

    const walletSelectors = [
      ".cuddle-money-payout-bank",
      ".cuddle-money-bank",
      ".cuddle-money-wallet",
      ".cuddle-money-payout-wallet",
      ".cuddle-money-bank-counter",
      "[data-cuddle-money-bank]"
    ];
    overlay.querySelectorAll(walletSelectors.join(",")).forEach(element => {
      if (!element.closest(".umt-round-total")) element.hidden = true;
    });
    overlay.querySelectorAll(".cuddle-money-payout-total").forEach(element => {
      if (!element.closest(".umt-round-total")) {
        element.hidden = true;
        element.classList.add("umt-source-total");
      }
    });

    const rows = Array.isArray(payload?.rows) ? payload.rows : null;
    const allocated = rows
      ? rows.reduce((sum, row) => sum + Math.round(numeric(row?.amount, 0)), 0)
      : 0;
    const stageBonus = Number.isFinite(Number(payload?.stageBonus))
      ? Math.round(Number(payload.stageBonus))
      : rows
        ? Math.round(total - allocated)
        : 0;
    const rowsContainer = overlay.querySelector(".cuddle-money-payout-rows, .cuddle-money-payout-list")
      || overlay.querySelector(".cuddle-money-payout-row")?.parentElement;
    // cuddle-rebalance-v5.js trims this to the current round inside
    // reconcileRoundBonuses, so by the time the payout screen shows it
    // holds only this round's stage-level bonuses (unused mulligans/Jokers,
    // Reserve Dividend, a mini-challenge clear, etc.) -- itemized, instead
    // of the one opaque "stage bonus" figure a save from an older build
    // would leave us to fall back to. None of them are also folded into a
    // guess row, so rows plus this box add up to the round total exactly.
    const itemizedLines = Array.isArray(game?.state?.cuddleRebalanceV5?.lastPayoutLines)
      ? game.state.cuddleRebalanceV5.lastPayoutLines
          .map(line => ({ label: String(line?.label || ""), amount: Math.round(numeric(line?.amount, 0)) }))
          .filter(line => line.label && line.amount)
      : [];
    const bonusLines = itemizedLines.length
      ? itemizedLines
      : (stageBonus ? [{ label: "Other stage rewards", amount: stageBonus }] : []);
    // A sibling section AFTER the whole rows list (not another child
    // appended inside it), so it reads as its own area instead of one more
    // counting row blended into the animated list above it.
    let bonus = overlay.querySelector(".umt-stage-bonus-section");
    if (!bonusLines.length) {
      bonus?.remove();
    } else if (rowsContainer?.parentElement) {
      if (!bonus) {
        bonus = document.createElement("div");
        bonus.className = "umt-stage-bonus-section";
        rowsContainer.insertAdjacentElement("afterend", bonus);
      }
      const signature = bonusLines.map(line => `${line.label}:${line.amount}`).join("|");
      if (bonus.dataset.umtSignature !== signature) {
        bonus.dataset.umtSignature = signature;
        bonus.innerHTML = `<div class="umt-stage-bonus-title">Stage bonus</div>`
          + bonusLines.map(line => `<div class="umt-stage-bonus-line"><span>${line.label}</span><strong>${formatDelta(line.amount)}</strong></div>`).join("");
      }
    }
  }

  function removeMeterPopup(game, root) {
    if (game?.state?.coachMeterNotice) game.state.coachMeterNotice = null;
    const selectors = [
      ".cuddle-coach-meter-notice",
      ".cuddle-meter-notice",
      "[data-cuddle-meter-notice]",
      ".cuddle-v3-toast.is-meter"
    ];
    root.querySelectorAll(selectors.join(",")).forEach(element => element.remove());
    root.querySelectorAll("[role='dialog'], [role='alert'], .cuddle-toast, .cuddle-v3-toast").forEach(element => {
      const text = String(element.textContent || "");
      if (/Cuddle Meter\s+(?:full|filled)/i.test(text) && !element.closest(".cuddle-heart-badge")) element.remove();
    });
  }

  function animateMeter(game, root) {
    removeMeterPopup(game, root);
    const coach = game?.state?.cuddleCoachExpansion || {};
    const burst = game?.state?.cuddleMeterBurst || coach.lastMeterReward;
    const sequence = Math.max(0, integer(burst?.seq, 0));
    if (!sequence || lastBurstSequence.get(game) === sequence) return;
    const badge = root.querySelector(".cuddle-heart-badge");
    if (!badge) return;
    lastBurstSequence.set(game, sequence);
    game.state.cuddleMeterBurst = null;
    badge.querySelectorAll(".umt-cuddle-spark").forEach(element => element.remove());
    for (let index = 0; index < 8; index += 1) {
      const spark = document.createElement("i");
      spark.className = "umt-cuddle-spark";
      spark.style.setProperty("--i", String(index));
      spark.setAttribute("aria-hidden", "true");
      badge.appendChild(spark);
    }
    badge.classList.remove("is-bursting");
    void badge.offsetWidth;
    badge.classList.add("is-bursting");
    window.setTimeout(() => {
      badge.classList.remove("is-bursting");
      badge.querySelectorAll(".umt-cuddle-spark").forEach(element => element.remove());
    }, 900);
  }

  function decorateShop(root) {
    const grid = root.querySelector(".cuddle-shop-grid");
    if (!grid) return;
    const cards = Array.from(grid.querySelectorAll(":scope > .cuddle-shop-item[data-shop-item-id]"));
    if (!cards.length) return;
    const signature = cards.map(card => card.dataset.shopItemId).join("|");
    if (grid.dataset.umtFixpackShopSignature === signature) return;
    grid.dataset.umtFixpackShopSignature = signature;
    grid.querySelectorAll(":scope > .umt-shop-section-label").forEach(element => element.remove());

    let previousKind = "";
    cards.forEach(card => {
      const item = SHOP_BY_ID.get(card.dataset.shopItemId);
      if (!item) return;
      card.dataset.shopKind = item.kind;
      if (item.rarity) card.dataset.rarity = item.rarity;
      if (item.kind !== previousKind) {
        previousKind = item.kind;
        const heading = document.createElement("h3");
        heading.className = `umt-shop-section-label is-${item.kind}`;
        heading.textContent = item.kind === "one-time" ? "One-time items" : item.kind === "boss" ? "Boss items" : "Upgrades";
        grid.insertBefore(heading, card);
      }
      const copy = card.querySelector(".cuddle-shop-item-copy") || card;
      copy.querySelectorAll(".umt-upgrade-rarity").forEach(element => element.remove());
      if (item.kind === "upgrade" && item.rarity) {
        const badge = document.createElement("span");
        badge.className = `umt-upgrade-rarity is-${item.rarity}`;
        badge.textContent = item.rarity[0].toUpperCase() + item.rarity.slice(1);
        const title = copy.querySelector("strong, b");
        if (title?.nextSibling) copy.insertBefore(badge, title.nextSibling);
        else copy.prepend(badge);
      }
    });
  }

  function enhance(root, game) {
    if (!root || !game?.state) return;
    activeGame = game;
    animateMeter(game, root);
    enhanceCashout(game, root);
    if (game.state.status === "shop") decorateShop(root);
    scheduleOpeningWord(game);
  }

  function scheduleEnhance(root, game) {
    if (!root || !game?.state) return;
    activeGame = game;
    const previous = scheduledRoots.get(root);
    if (previous) {
      previous.game = game;
      return;
    }
    const entry = { game };
    scheduledRoots.set(root, entry);
    window.requestAnimationFrame(() => {
      scheduledRoots.delete(root);
      enhance(root, entry.game);
    });
  }

  function wrapCampaignExport() {
    const campaign = window.CuddleCampaign;
    if (!campaign) return false;
    if (campaign.__umtCuddleFixpack === VERSION) return true;
    const originalAfterRender = campaign.afterRender;
    window.CuddleCampaign = Object.freeze({
      ...campaign,
      SHOP_ITEMS,
      shopItems: SHOP_ITEMS,
      __umtCuddleFixpack: VERSION,
      afterRender(root, game, landing) {
        if (typeof originalAfterRender === "function") originalAfterRender(root, game, landing);
        if (!landing) scheduleEnhance(root, game);
      }
    });
    return true;
  }

  function install() {
    installShopMethods();
    installShopClickHandler();
    installOpeningWordFix();
    wrapCampaignExport();
    const game = currentGame();
    const root = document.getElementById("cuddleRoot");
    if (game && root) scheduleEnhance(root, game);
  }

  install();
  let installAttempts = 0;
  const retryInstall = () => {
    installAttempts += 1;
    install();
    if (installAttempts < 12 && (!window.CuddleCampaign || window.CuddleCampaign.__umtCuddleFixpack !== VERSION)) {
      window.setTimeout(retryInstall, 50);
    }
  };
  window.setTimeout(retryInstall, 0);

  window.UMTCuddleFixpack = Object.freeze({
    version: VERSION,
    shopItems: SHOP_ITEMS,
    enhance(root = document.getElementById("cuddleRoot"), game = currentGame()) {
      if (root && game) scheduleEnhance(root, game);
    }
  });
})();
/* UMT_CUDDLE_FIXPACK_20260912: END */

/* UMT_CUDDLE_MAP_DESKTOP_FIT_20260912: START */
(function installUmtCuddleMapDesktopFit() {
  "use strict";

  const VERSION = "2026.09.12-r1";
  const FLAG = "__umtCuddleMapDesktopFitVersion";
  const SHELL_SELECTOR = "#cuddleRoot .cuddle-map-shell, #cuddleScreen .cuddle-map-shell";
  const HEIGHT_PROPERTY = "--umt-cuddle-map-available-height";

  if (window[FLAG] === VERSION) return;
  window[FLAG] = VERSION;

  let animationFrame = 0;
  let mutationObserver = null;

  function visibleViewportHeight() {
    const visualViewport = window.visualViewport;
    const measured = visualViewport && Number.isFinite(visualViewport.height)
      ? visualViewport.height
      : window.innerHeight;
    return Math.max(1, Math.floor(measured || document.documentElement.clientHeight || 320));
  }

  function fitShell(shell) {
    if (!(shell instanceof HTMLElement)) return;

    const rect = shell.getBoundingClientRect();
    if (rect.width <= 0 && rect.height <= 0) return;

    /*
     * The shell can begin beneath the game's own header. Subtract its actual
     * viewport position so the shell ends exactly at the bottom edge instead
     * of adding a second full viewport and leaving blank space below.
     */
    const viewportTop = window.visualViewport
      ? Math.max(0, Math.round(window.visualViewport.offsetTop || 0))
      : 0;
    const top = Math.max(viewportTop, Math.round(rect.top));
    const available = Math.max(1, viewportTop + visibleViewportHeight() - top);
    const nextValue = `${available}px`;

    if (shell.style.getPropertyValue(HEIGHT_PROPERTY) !== nextValue) {
      shell.style.setProperty(HEIGHT_PROPERTY, nextValue);
    }
    if (!shell.classList.contains("umt-cuddle-map-viewport-fit")) {
      shell.classList.add("umt-cuddle-map-viewport-fit");
    }
  }

  function fitAllMaps() {
    animationFrame = 0;
    document.querySelectorAll(SHELL_SELECTOR).forEach(fitShell);
  }

  function scheduleFit() {
    if (animationFrame) return;
    const schedule = typeof window.requestAnimationFrame === "function"
      ? window.requestAnimationFrame.bind(window)
      : callback => window.setTimeout(callback, 0);
    animationFrame = schedule(fitAllMaps);
  }

  function start() {
    scheduleFit();

    /* Cuddle replaces whole views. Refit only when a mutation adds or removes
       a map shell (or an ancestor containing one), not after every game update. */
    if (document.body && typeof MutationObserver === "function") {
      mutationObserver = new MutationObserver(records => {
        const touchesMap = records.some(record => {
          const changedNodes = [...record.addedNodes, ...record.removedNodes];
          return changedNodes.some(node => {
            if (!(node instanceof Element)) return false;
            return node.matches(SHELL_SELECTOR) || Boolean(node.querySelector(SHELL_SELECTOR));
          });
        });
        if (touchesMap) scheduleFit();
      });
      mutationObserver.observe(document.body, { childList: true, subtree: true });
    }

    window.addEventListener("resize", scheduleFit, { passive: true });
    window.addEventListener("orientationchange", scheduleFit, { passive: true });
    window.addEventListener("pageshow", scheduleFit, { passive: true });

    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", scheduleFit, { passive: true });
      window.visualViewport.addEventListener("scroll", scheduleFit, { passive: true });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
/* UMT_CUDDLE_MAP_DESKTOP_FIT_20260912: END */
