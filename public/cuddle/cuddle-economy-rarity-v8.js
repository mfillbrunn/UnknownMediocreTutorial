(() => {
  "use strict";

  const VERSION = "8.0.1";
  const PATCHED = Symbol.for("cuddle.economy.rarity.v8.patched");
  const CATALOG_PATCHED = Symbol.for("cuddle.economy.rarity.v8.catalog");
  const APPLY_PATCHED = Symbol.for("cuddle.economy.rarity.v8.apply");
  const MONEY_PATTERN = /(?:money|cash|coins?|wallet|balance)/i;
  const CONSONANTS = "BCDFGHJKLMNPQRSTVWXYZ".split("");
  const VOWELS = new Set("AEIOU".split(""));
  const TIERS = Object.freeze({ COMMON: "common", RARE: "rare", LEGENDARY: "legendary" });
  const DEFAULT_WEIGHTS = Object.freeze({ common: 57, rare: 35, legendary: 8 });
  const BOOSTED_WEIGHTS = Object.freeze({ common: 35, rare: 50, legendary: 15 });
  const SHOP_WEIGHTS = Object.freeze({ common: 50, rare: 35, legendary: 15 });
  const PRICE_RANGES = Object.freeze({
    common: [25, 40],
    rare: [50, 75],
    legendary: [100, 150]
  });
  const CHALLENGE_RANGES = Object.freeze({
    1: [10, 20],
    2: [20, 40],
    3: [30, 60]
  });

  const REMOVED_REWARDS = new Set([
    "quest ink",
    "opening insight",
    "quick study",
    "reserve dividend"
  ]);

  const ORDINARY_TIER_BY_NAME = new Map([
    ["second thoughts", TIERS.COMMON],
    ["reward refresh", TIERS.COMMON],
    ["quest value", TIERS.COMMON],
    ["second guess quest", TIERS.COMMON],
    ["bigger mulligan", TIERS.COMMON],
    ["cull one letter", TIERS.COMMON],
    ["opening verse", TIERS.COMMON],
    ["wide margins", TIERS.COMMON],
    ["mulligan dividend", TIERS.COMMON],
    ["early finish", TIERS.COMMON],
    ["colour surge", TIERS.COMMON],
    ["color surge", TIERS.COMMON],
    ["greyscale", TIERS.COMMON],
    ["grayscale", TIERS.COMMON],
    ["softer cuddle meter", TIERS.COMMON],

    ["cull two letters", TIERS.RARE],
    ["grey matters", TIERS.RARE],
    ["gray matters", TIERS.RARE],
    ["bigger hand", TIERS.RARE],
    ["reward echo", TIERS.RARE],
    ["precise green", TIERS.RARE],
    ["wild card", TIERS.RARE],
    ["theme sense", TIERS.RARE],
    ["remaining setter box", TIERS.RARE],
    ["yellow guesser hint", TIERS.RARE],
    ["bigger cuddle", TIERS.RARE],
    ["surprise assignment", TIERS.RARE],

    ["green guesser hint", TIERS.LEGENDARY],
    ["candidate notebook", TIERS.LEGENDARY],
    ["joker cache", TIERS.LEGENDARY]
  ]);

  const LEGENDARY_BOSS_NAMES = new Set([
    "deep cull",
    "double mulligans",
    "free vowel sweep",
    "quest head start",
    "double pick",
    "overtime",
    "lasting quests",
    "golden compass",
    "second cup",
    "all seeing atlas",
    "false letter scout"
  ]);

  const KNOWN_ORDINARY_NAMES = new Set([
    "second thoughts", "reward refresh", "quest value", "second guess quest",
    "bigger mulligan", "cull x & y", "cull one letter", "cull two letters",
    "opening verse", "quest ink", "wide margins", "grey matters", "gray matters",
    "bigger hand", "mulligan dividend", "early finish", "colour surge", "color surge",
    "greyscale", "grayscale", "reward echo", "precise green", "wild card",
    "theme sense", "remaining setter box", "guesser hint", "yellow guesser hint",
    "green guesser hint", "softer cuddle meter", "bigger cuddle", "opening insight",
    "quick study", "candidate notebook", "joker cache", "reserve dividend",
    "surprise assignment"
  ]);

  const KNOWN_BOSS_NAMES = new Set([
    "deep cull", "double mulligans", "full hand mulligan", "richer colours",
    "richer colors", "free vowel sweep", "quest head start", "position peek",
    "false letter scout", "margin note", "boss field notes", "double pick",
    "quest cadence", "overtime", "lasting quests", "backup plan", "golden compass",
    "second cup", "golden thread", "hand resonance", "clear sight",
    "rarity lens", "all seeing atlas"
  ]);

  const QUEST_REWARD_NAMES = new Set([
    "guided letter", "extra mulligan", "letter count", "silly word",
    "extra letters", "joker", "category whisper"
  ]);

  const SHOP_BASE_NAMES = new Set([
    "amber lens", "pocket joker", "ten letter cull", "five letter cull",
    "regular wordle hands", "boss mulligan kit", "permanent secrets counter",
    "permanent guesser hint"
  ]);

  const catalog = {
    ordinary: new Map(),
    boss: new Map(),
    quest: new Map(),
    originalApply: new Map(),
    shopTemplate: null
  };

  const patchedObjects = new WeakSet();
  const seenContexts = new WeakSet();
  const contextList = new Set();
  const adjustedPayoutNodes = new WeakSet();
  const challengeNoticeNodes = new WeakSet();
  let scanTimer = null;
  let tickTimer = null;
  let observer = null;

  function norm(value) {
    return String(value == null ? "" : value)
      .toLowerCase()
      .replace(/[’']/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  function getName(obj) {
    if (!obj || typeof obj !== "object") return "";
    return String(obj.name ?? obj.title ?? obj.label ?? obj.displayName ?? "");
  }

  function getId(obj) {
    if (!obj || typeof obj !== "object") return "";
    return String(obj.id ?? obj.key ?? obj.rewardId ?? obj.slug ?? getName(obj));
  }

  function setName(obj, value) {
    if (!obj || typeof obj !== "object") return;
    if ("name" in obj || !("title" in obj)) obj.name = value;
    if ("title" in obj) obj.title = value;
    if ("label" in obj && /reward|upgrade|cull|hint|quest/i.test(String(obj.label))) obj.label = value;
  }

  function setDescription(obj, value) {
    if (!obj || typeof obj !== "object") return;
    let wrote = false;
    for (const key of ["description", "desc", "details", "body", "text", "subtitle"]) {
      if (key in obj) {
        obj[key] = value;
        wrote = true;
      }
    }
    if (!wrote) obj.description = value;
  }

  function setId(obj, value) {
    if (!obj || typeof obj !== "object") return;
    if ("id" in obj || !("key" in obj)) obj.id = value;
    if ("key" in obj && typeof obj.key === "string") obj.key = value;
    if ("rewardId" in obj) obj.rewardId = value;
    if ("slug" in obj) obj.slug = value;
  }

  function cloneDefinition(def) {
    const clone = { ...def };
    for (const key of Object.keys(def || {})) {
      const value = def[key];
      if (Array.isArray(value)) clone[key] = value.slice();
      else if (value && typeof value === "object" && !(value instanceof Element)) clone[key] = { ...value };
    }
    return clone;
  }

  function hashString(input) {
    let hash = 2166136261;
    const text = String(input ?? "");
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function seededUnit(seed) {
    let x = (hashString(seed) || 1) >>> 0;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 4294967296;
  }

  function randomInt(min, max, seed = null) {
    const unit = seed == null ? Math.random() : seededUnit(seed);
    return min + Math.floor(unit * (max - min + 1));
  }

  function weightedTier(weights, availableTiers = [TIERS.COMMON, TIERS.RARE, TIERS.LEGENDARY], seed = null) {
    const allowed = availableTiers.filter((tier) => (weights[tier] ?? 0) > 0);
    if (!allowed.length) return TIERS.COMMON;
    const total = allowed.reduce((sum, tier) => sum + Number(weights[tier] || 0), 0);
    let roll = (seed == null ? Math.random() : seededUnit(seed)) * total;
    for (const tier of allowed) {
      roll -= Number(weights[tier] || 0);
      if (roll <= 0) return tier;
    }
    return allowed[allowed.length - 1];
  }

  function shuffle(items, seed = null) {
    const out = items.slice();
    let state = seed == null ? null : hashString(seed);
    const next = () => {
      if (state == null) return Math.random();
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      return (state >>> 0) / 4294967296;
    };
    for (let i = out.length - 1; i > 0; i -= 1) {
      const j = Math.floor(next() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  function isObject(value) {
    return Boolean(value) && typeof value === "object";
  }

  function safeOwnEntries(value) {
    if (!isObject(value)) return [];
    try {
      return Object.entries(value);
    } catch (_) {
      return [];
    }
  }

  function shallowObjects(root, maxDepth = 2) {
    const out = [];
    const queue = [{ value: root, depth: 0 }];
    const seen = new WeakSet();
    while (queue.length) {
      const { value, depth } = queue.shift();
      if (!isObject(value) || seen.has(value)) continue;
      seen.add(value);
      out.push(value);
      if (depth >= maxDepth) continue;
      for (const [, child] of safeOwnEntries(value)) {
        if (isObject(child) && !(child instanceof Node) && !(child instanceof Window)) {
          queue.push({ value: child, depth: depth + 1 });
        }
      }
    }
    return out;
  }

  function stateScore(value) {
    if (!isObject(value)) return -1;
    let score = 0;
    const keys = Object.keys(value).map(norm);
    for (const key of keys) {
      if (/money|mulligan|guess|hand|deck|upgrade|reward|quest|difficulty|secret|answer|stage|round|map/.test(key)) score += 1;
    }
    if (keys.some((key) => /money|cash|balance/.test(key))) score += 2;
    if (keys.some((key) => /mulligan/.test(key))) score += 2;
    if (keys.some((key) => /guess|history/.test(key))) score += 2;
    return score;
  }

  function findState(context, args = []) {
    const roots = [context, ...(Array.isArray(args) ? args : [])].filter(isObject);
    const candidates = [];
    for (const root of roots) {
      for (const object of shallowObjects(root, 2)) {
        candidates.push([stateScore(object), object]);
      }
    }
    candidates.sort((a, b) => b[0] - a[0]);
    return candidates.length && candidates[0][0] >= 3 ? candidates[0][1] : (isObject(context) ? context : null);
  }

  function runKey(state) {
    if (!state) return "default";
    const values = [
      state.runId, state.seed, state.runSeed, state.campaignId, state.startedAt,
      state.createdAt, state.id
    ].filter((value) => value != null && value !== "");
    return values.length ? String(values[0]) : "default";
  }

  function customState(state) {
    if (!isObject(state)) return null;
    if (!Object.prototype.hasOwnProperty.call(state, "__cuddleEconomyV8")) {
      let restored = null;
      try {
        restored = JSON.parse(localStorage.getItem(`cuddle-economy-v8:${runKey(state)}`) || "null");
      } catch (_) {
        restored = null;
      }
      Object.defineProperty(state, "__cuddleEconomyV8", {
        value: restored && typeof restored === "object" ? restored : {},
        writable: true,
        enumerable: true,
        configurable: true
      });
    }
    const data = state.__cuddleEconomyV8;
    data.version = VERSION;
    data.upgrades ||= {};
    data.pouch ||= {};
    data.stage ||= {};
    data.flags ||= {};
    data.shop ||= {};
    return data;
  }

  function saveCustom(state) {
    if (!isObject(state) || !state.__cuddleEconomyV8) return;
    try {
      localStorage.setItem(`cuddle-economy-v8:${runKey(state)}`, JSON.stringify(state.__cuddleEconomyV8));
    } catch (_) {
      // A full or disabled localStorage must not interrupt gameplay.
    }
  }

  function findNumberSlots(root, predicate, maxDepth = 3) {
    const found = [];
    const queue = [{ value: root, depth: 0 }];
    const seen = new WeakSet();
    while (queue.length) {
      const { value, depth } = queue.shift();
      if (!isObject(value) || seen.has(value)) continue;
      seen.add(value);
      for (const [key, child] of safeOwnEntries(value)) {
        if (typeof child === "number" && Number.isFinite(child) && predicate(norm(key), child, value)) {
          found.push({ owner: value, key, value: child });
        }
        if (depth < maxDepth && isObject(child) && !(child instanceof Node)) {
          queue.push({ value: child, depth: depth + 1 });
        }
      }
    }
    return found;
  }

  function firstNumber(root, predicates, fallback = 0) {
    for (const predicate of predicates) {
      const slots = findNumberSlots(root, (key, value) => predicate(key, value), 3);
      if (slots.length) return slots[0].value;
    }
    return fallback;
  }

  function setMatchingNumbers(root, predicate, valueOrFn, maxDepth = 3) {
    let changed = 0;
    for (const slot of findNumberSlots(root, predicate, maxDepth)) {
      const next = typeof valueOrFn === "function" ? valueOrFn(slot.value, slot.key, slot.owner) : valueOrFn;
      if (Number.isFinite(next) && slot.owner[slot.key] !== next) {
        try {
          slot.owner[slot.key] = next;
          changed += 1;
        } catch (_) {
          // Ignore read-only configuration objects.
        }
      }
    }
    return changed;
  }

  function findArray(root, keyPattern, maxDepth = 3) {
    const queue = [{ value: root, depth: 0 }];
    const seen = new WeakSet();
    while (queue.length) {
      const { value, depth } = queue.shift();
      if (!isObject(value) || seen.has(value)) continue;
      seen.add(value);
      for (const [key, child] of safeOwnEntries(value)) {
        if (Array.isArray(child) && keyPattern.test(norm(key))) return child;
        if (depth < maxDepth && isObject(child) && !(child instanceof Node)) {
          queue.push({ value: child, depth: depth + 1 });
        }
      }
    }
    return null;
  }

  function moneySlot(state) {
    const slots = findNumberSlots(state, (key) => MONEY_PATTERN.test(key), 3)
      .filter((slot) => !/reward|value|bonus|cost|price|earned|totalearned/.test(norm(slot.key)));
    return slots[0] || null;
  }

  function addMoney(state, amount) {
    if (!Number.isFinite(amount) || amount === 0) return false;
    const slot = moneySlot(state);
    if (slot) {
      slot.owner[slot.key] = Math.max(0, Number(slot.owner[slot.key] || 0) + amount);
      dispatch("cuddle:money-changed", { amount, total: slot.owner[slot.key], source: "economy-v8" });
      return true;
    }
    return false;
  }

  function spendMoney(state, amount) {
    const slot = moneySlot(state);
    if (!slot || slot.owner[slot.key] < amount) return false;
    slot.owner[slot.key] -= amount;
    dispatch("cuddle:money-changed", { amount: -amount, total: slot.owner[slot.key], source: "economy-v8" });
    return true;
  }

  function dispatch(name, detail = {}) {
    try {
      window.dispatchEvent(new CustomEvent(name, { detail }));
      document.dispatchEvent(new CustomEvent(name, { detail }));
    } catch (_) {
      // CustomEvent may be unavailable in very early startup.
    }
  }

  function callCandidateMethod(context, patterns, args = []) {
    const roots = [context, ...shallowObjects(context, 2)].filter(isObject);
    const tested = new Set();
    for (const root of roots) {
      const proto = Object.getPrototypeOf(root);
      for (const holder of [root, proto].filter(Boolean)) {
        let names = [];
        try { names = Object.getOwnPropertyNames(holder); } catch (_) { names = []; }
        for (const name of names) {
          if (tested.has(`${name}:${holder.constructor?.name || ""}`)) continue;
          tested.add(`${name}:${holder.constructor?.name || ""}`);
          if (!patterns.some((pattern) => pattern.test(norm(name)))) continue;
          let fn;
          try { fn = root[name]; } catch (_) { fn = null; }
          if (typeof fn !== "function") continue;
          try {
            return { called: true, value: fn.apply(root, args), name };
          } catch (_) {
            // Continue to a compatible method signature.
          }
        }
      }
    }
    return { called: false, value: undefined, name: "" };
  }

  function currentDifficulty(state) {
    const values = [];
    for (const object of shallowObjects(state, 2)) {
      for (const [key, value] of safeOwnEntries(object)) {
        if (/difficulty|mode/.test(norm(key)) && typeof value === "string") values.push(norm(value));
      }
    }
    const text = values.join(" ");
    if (/easy/.test(text)) return "easy";
    if (/hard/.test(text)) return "hard";
    return "medium";
  }

  function currentNode(state) {
    const likelyKeys = ["currentNode", "activeNode", "selectedNode", "stageNode", "currentStage", "encounter"];
    for (const object of shallowObjects(state, 2)) {
      for (const key of likelyKeys) {
        if (isObject(object[key])) return object[key];
      }
    }
    return null;
  }

  function nodeType(node) {
    if (!node) return "";
    return norm(node.type ?? node.stageType ?? node.kind ?? node.nodeType ?? node.mode ?? node.name ?? node.title);
  }

  function isBossNode(node) {
    return /boss|final/.test(nodeType(node));
  }

  function isDuelNode(node) {
    return /duel|race/.test(nodeType(node));
  }

  function isChallengeNode(node) {
    return /challenge|tally|fog|haze|lie|lock|sprint|vowel|clean|quick/.test(nodeType(node));
  }

  function isWordStage(node) {
    const type = nodeType(node);
    if (!type) return true;
    return !/event|shop|upgrade|mystery|duel|boss|map/.test(type);
  }

  function guessHistory(state) {
    const arrays = [];
    for (const object of shallowObjects(state, 3)) {
      for (const [key, value] of safeOwnEntries(object)) {
        if (Array.isArray(value) && /guess|history|submitted|rows/.test(norm(key))) arrays.push(value);
      }
    }
    arrays.sort((a, b) => b.length - a.length);
    return arrays.find((array) => array.every((item) => typeof item === "string" || isObject(item))) || [];
  }

  function guessCount(state) {
    const history = guessHistory(state);
    if (history.length) return history.length;
    return firstNumber(state, [
      (key) => /guesscount|guessesmade|turncount|turnindex/.test(key),
      (key) => /currentguess|currentturn/.test(key)
    ], 0);
  }

  function maxRows(state) {
    return firstNumber(state, [
      (key) => /maxguesses|guesslimit|totalrows|rowlimit|allowedguesses/.test(key),
      (key) => /guesses|rows/.test(key)
    ], 6);
  }

  function remainingMulligans(state) {
    return firstNumber(state, [
      (key) => /remainingmulligan|mulligansleft|currentmulligan/.test(key),
      (key) => /^mulligans?$/.test(key)
    ], 0);
  }

  function stageIdentity(state) {
    const node = currentNode(state);
    const pieces = [
      node?.id, node?.key, node?.row, node?.column, node?.index,
      state.stageId, state.roundId, state.currentStageIndex, state.currentRound,
      state.stageNumber, state.roundNumber
    ].filter((value) => value != null && value !== "");
    return pieces.length ? pieces.join(":") : `${runKey(state)}:${nodeType(node)}:${answerWord(state)}:${maxRows(state)}`;
  }

  function routeRows(state) {
    const candidates = [];
    for (const object of shallowObjects(state, 4)) {
      for (const [key, value] of safeOwnEntries(object)) {
        if (!Array.isArray(value) || value.length < 2) continue;
        if (!/map|route|rows|path|nodes|layout/.test(norm(key))) continue;
        if (value.every((row) => Array.isArray(row))) candidates.push(value);
        else if (value.every((item) => isObject(item)) && value.some((item) => "row" in item || "type" in item)) {
          const groups = new Map();
          for (const item of value) {
            const row = Number(item.row ?? item.rowIndex ?? 0);
            if (!groups.has(row)) groups.set(row, []);
            groups.get(row).push(item);
          }
          candidates.push([...groups.keys()].sort((a, b) => a - b).map((key2) => groups.get(key2)));
        }
      }
    }
    candidates.sort((a, b) => b.length - a.length);
    return candidates[0] || null;
  }

  function worldForNode(rows, targetRow) {
    let bosses = 0;
    for (let index = 0; index < targetRow; index += 1) {
      const row = rows[index] || [];
      if (row.some((node) => isBossNode(node))) bosses += 1;
    }
    return Math.max(1, Math.min(3, bosses + 1));
  }

  function challengeReward(node, world, rowIndex = 0, columnIndex = 0, state = null) {
    const [min, max] = CHALLENGE_RANGES[world] || CHALLENGE_RANGES[1];
    const seed = `${runKey(state)}:${rowIndex}:${columnIndex}:${getId(node)}:${getName(node)}:challenge`;
    return randomInt(min, max, seed);
  }

  function setNodeType(node, type) {
    if (!isObject(node)) return;
    const labels = {
      normal: { name: "Wordle", description: "Solve one standard stage.", icon: "stage-classic-v6.svg" },
      themed: { name: "Themed Wordle", description: "Solve one stage with world-based theme information.", icon: "stage-theme.svg" },
      challenge: { name: "Challenge Wordle", description: "Solve one stage with a challenge modifier.", icon: "challenge-pocket-tally.svg" }
    };
    const aliases = {
      normal: "normal",
      classic: "normal",
      wordle: "normal",
      theme: "themed",
      themed: "themed",
      challenge: "challenge"
    };
    const canonical = aliases[type] || type;
    for (const key of ["type", "stageType", "kind", "nodeType", "mode"]) {
      if (key in node) node[key] = canonical;
    }
    if (!("type" in node)) node.type = canonical;
    const label = labels[canonical];
    if (label) {
      if ("name" in node) node.name = label.name;
      if ("title" in node) node.title = label.name;
      if ("label" in node) node.label = label.name;
      if ("description" in node) node.description = label.description;
      if ("desc" in node) node.desc = label.description;
      for (const key of ["icon", "iconPath", "iconSrc"]) {
        if (key in node) node[key] = `cuddle/icons/${label.icon}`;
      }
    }
  }

  function canonicalOpeningType(node) {
    const type = nodeType(node);
    if (/theme|book/.test(type)) return "themed";
    if (/challenge|tally|fog|haze|lie|lock|sprint|vowel|clean|quick/.test(type)) return "challenge";
    if (/event/.test(type)) return "event";
    if (/normal|classic|wordle/.test(type)) return "normal";
    return type;
  }

  function patchRoute(state) {
    const rows = routeRows(state);
    if (!rows) return;

    // Opening row: exactly two distinct choices from normal, themed, and challenge.
    const openingIndex = rows.findIndex((row) => Array.isArray(row) && row.length >= 2 && !row.some(isBossNode));
    if (openingIndex >= 0) {
      const row = rows[openingIndex];
      const used = new Set();
      const permitted = ["normal", "themed", "challenge"];
      for (let column = 0; column < Math.min(2, row.length); column += 1) {
        let type = canonicalOpeningType(row[column]);
        if (!permitted.includes(type) || used.has(type)) {
          type = permitted.find((candidate) => !used.has(candidate)) || "normal";
          setNodeType(row[column], type);
        }
        used.add(type);
      }
      if (row.length > 2 && !row.some((node) => node?.completed || node?.visited || node?.entered)) {
        row.splice(2);
      }
    }

    // World-based challenge payouts and one consistent themed icon.
    rows.forEach((row, rowIndex) => {
      row.forEach((node, columnIndex) => {
        if (!isObject(node)) return;
        const type = nodeType(node);
        if (/theme|book/.test(type)) {
          for (const key of ["icon", "iconPath", "iconSrc"]) {
            if (key in node) node[key] = "cuddle/icons/stage-theme.svg";
          }
        }
        if (!isChallengeNode(node)) return;
        const world = worldForNode(rows, rowIndex);
        const amount = challengeReward(node, world, rowIndex, columnIndex, state);
        node.world = world;
        node.challengeWorld = world;
        for (const key of ["reward", "cashReward", "moneyReward", "bonusMoney", "challengeReward", "payout"]) {
          if (key in node || key === "challengeReward") node[key] = amount;
        }
        for (const key of ["description", "desc", "details", "subtitle"]) {
          if (typeof node[key] === "string") {
            let text = node[key]
              .replace(/world\s*[123]/ig, `World ${world}`)
              .replace(/\+?\$\s*\d+/g, `+$${amount}`);
            if (!/\$\s*\d+/.test(text)) text += ` Win for +$${amount}.`;
            node[key] = text;
          }
        }
      });
    });
  }

  function rememberOriginal(def) {
    const key = norm(getName(def));
    if (!key || catalog.originalApply.has(key)) return;
    for (const prop of ["apply", "activate", "onSelect", "onChoose", "onClaim", "grant", "effect"]) {
      if (typeof def[prop] === "function") {
        catalog.originalApply.set(key, { prop, fn: def[prop] });
        return;
      }
    }
  }

  function contextFromApply(thisArg, args) {
    const direct = [thisArg, ...args].find((item) => isObject(item) && stateScore(item) >= 3);
    if (direct) return direct;
    return contextList.values().next().value || thisArg;
  }

  function addUpgradeStack(state, key, amount = 1) {
    const data = customState(state);
    if (!data) return 0;
    data.upgrades[key] = Math.max(0, Number(data.upgrades[key] || 0) + amount);
    saveCustom(state);
    return data.upgrades[key];
  }

  function upgradeStack(state, key) {
    const data = customState(state);
    return Number(data?.upgrades?.[key] || 0);
  }

  function hasNamedUpgrade(state, names) {
    const wanted = names.map(norm);
    const data = customState(state);
    if (wanted.some((name) => Number(data?.upgrades?.[name] || 0) > 0)) return true;
    for (const object of shallowObjects(state, 3)) {
      for (const [key, value] of safeOwnEntries(object)) {
        if (!/upgrade|reward|relic|power/.test(norm(key))) continue;
        const texts = Array.isArray(value) ? value : [value];
        for (const item of texts) {
          const text = norm(isObject(item) ? `${getName(item)} ${getId(item)}` : item);
          if (wanted.some((name) => text.includes(name))) return true;
        }
      }
    }
    return false;
  }

  function setMaxStack(def, value) {
    for (const key of ["max", "maxStacks", "stackLimit", "limit", "maxLevel", "levels"]) {
      if (key in def || key === "maxStacks") def[key] = value;
    }
  }

  function setTier(def, tier) {
    def.rarity = tier;
    def.tier = tier;
    def.rewardTier = tier;
    def.__cuddleV8Tier = tier;
  }

  function currentHandSize(state) {
    return firstNumber(state, [
      (key) => /handsize|maxhand|tilelimit/.test(key)
    ], 5);
  }

  function currentMulliganSize(state) {
    return firstNumber(state, [
      (key) => /mulligan.*(?:size|count|tiles)|tiles.*mulligan/.test(key)
    ], 3);
  }

  function setMulliganSize(state, value) {
    const changed = setMatchingNumbers(state, (key) => /mulligan.*(?:size|count|tiles)|tiles.*mulligan/.test(key), value, 3);
    const data = customState(state);
    if (data) data.flags.mulliganSize = value;
    return changed;
  }

  function addHandSize(state, amount, temporary = false) {
    const slots = findNumberSlots(state, (key) => /handsize|maxhand|tilelimit/.test(key), 3);
    for (const slot of slots) slot.owner[slot.key] = Math.max(1, slot.owner[slot.key] + amount);
    const data = customState(state);
    if (data && !temporary) data.flags.permanentHandBonus = Number(data.flags.permanentHandBonus || 0) + amount;
    return slots.length > 0;
  }

  function addMulligans(state, amount) {
    const slots = findNumberSlots(state, (key) => /remainingmulligan|mulligansleft|^mulligans?$|currentmulligan/.test(key), 3);
    for (const slot of slots) slot.owner[slot.key] = Math.max(0, slot.owner[slot.key] + amount);
    dispatch("cuddle:mulligans-changed", { amount, source: "economy-v8" });
    return slots.length > 0;
  }

  function addMaxMulligans(state, amount) {
    const slots = findNumberSlots(state, (key) => /maxmulligan|mulliganlimit|basemulligan|mulligansper/.test(key), 3);
    for (const slot of slots) slot.owner[slot.key] = Math.max(0, slot.owner[slot.key] + amount);
    addMulligans(state, amount);
    const data = customState(state);
    if (data) data.flags.permanentMulliganBonus = Number(data.flags.permanentMulliganBonus || 0) + amount;
    return true;
  }

  function addJokers(state, amount) {
    const slots = findNumberSlots(state, (key) => /joker/.test(key) && !/value|price|cost/.test(key), 3);
    if (slots.length) {
      slots[0].owner[slots[0].key] = Math.max(0, slots[0].owner[slots[0].key] + amount);
      dispatch("cuddle:jokers-changed", { amount, source: "economy-v8" });
      return true;
    }
    const data = customState(state);
    if (data) data.stage.pendingJokers = Number(data.stage.pendingJokers || 0) + amount;
    return false;
  }

  function addRows(state, amount) {
    const slots = findNumberSlots(state, (key) => /maxguesses|guesslimit|totalrows|rowlimit|allowedguesses/.test(key), 3);
    for (const slot of slots) slot.owner[slot.key] = Math.max(1, slot.owner[slot.key] + amount);
    dispatch("cuddle:rows-changed", { amount, source: "economy-v8" });
    return slots.length > 0;
  }

  function answerWord(state) {
    for (const object of shallowObjects(state, 3)) {
      for (const [key, value] of safeOwnEntries(object)) {
        if (/secret|answer|solution|targetword/.test(norm(key)) && typeof value === "string" && /^[a-z]{5}$/i.test(value)) {
          return value.toUpperCase();
        }
      }
    }
    return "";
  }

  function knownLetters(state) {
    const known = new Set();
    const arrays = [];
    for (const object of shallowObjects(state, 3)) {
      for (const [key, value] of safeOwnEntries(object)) {
        if (/known|learned|infinite|unlocked/.test(norm(key)) && Array.isArray(value)) arrays.push(value);
      }
    }
    for (const array of arrays) {
      for (const item of array) {
        const letter = String(isObject(item) ? item.letter ?? item.value ?? "" : item).toUpperCase();
        if (/^[A-Z]$/.test(letter)) known.add(letter);
      }
    }
    for (const vowel of VOWELS) known.add(vowel);
    return known;
  }

  function handLetters(state) {
    const arrays = [];
    for (const object of shallowObjects(state, 3)) {
      for (const [key, value] of safeOwnEntries(object)) {
        if (/hand|rack|tiles/.test(norm(key)) && Array.isArray(value)) arrays.push(value);
      }
    }
    const best = arrays.sort((a, b) => b.length - a.length)[0] || [];
    return best.map((item) => String(isObject(item) ? item.letter ?? item.value ?? item.char ?? "" : item).toUpperCase())
      .filter((letter) => /^[A-Z]$/.test(letter));
  }

  function canBuildWithHand(word, state) {
    const infinite = knownLetters(state);
    const finite = handLetters(state).slice();
    for (const letter of String(word || "").toUpperCase()) {
      if (infinite.has(letter)) continue;
      const index = finite.indexOf(letter);
      if (index < 0) return false;
      finite.splice(index, 1);
    }
    return true;
  }

  function markKeyboardLetter(letter, status = "absent") {
    const upper = String(letter || "").toUpperCase();
    if (!/^[A-Z]$/.test(upper)) return;
    const selectors = [
      `[data-key="${upper}"]`, `[data-letter="${upper}"]`,
      `[data-key="${upper.toLowerCase()}"]`, `[data-letter="${upper.toLowerCase()}"]`
    ];
    for (const element of document.querySelectorAll(selectors.join(","))) {
      element.classList.add(status, `is-${status}`, `cuddle-${status}`);
      element.dataset.status = status;
    }
  }

  function grantYellowHint(state, context) {
    const result = callCandidateMethod(context, [
      /grant.*yellow/, /reveal.*present/, /present.*hint/, /yellow.*hint/, /margin.*note/, /amber.*lens/
    ]);
    if (result.called) return true;
    const answer = answerWord(state);
    if (!answer) return false;
    const historyText = JSON.stringify(guessHistory(state)).toUpperCase();
    const candidates = [...new Set(answer)].filter((letter) => !historyText.includes(letter));
    const letter = candidates[0] || answer[0];
    markKeyboardLetter(letter, "present");
    const data = customState(state);
    data.stage.yellowHints ||= [];
    if (!data.stage.yellowHints.includes(letter)) data.stage.yellowHints.push(letter);
    dispatch("cuddle:hint", { color: "yellow", letter, source: "economy-v8" });
    return true;
  }

  function grantGreenHint(state, context) {
    const result = callCandidateMethod(context, [
      /grant.*green/, /reveal.*exact/, /exact.*hint/, /green.*hint/, /position.*hint/, /position.*peek/
    ]);
    if (result.called) return true;
    const answer = answerWord(state);
    if (!answer) return false;
    const index = randomInt(0, answer.length - 1, `${stageIdentity(state)}:green:${guessCount(state)}`);
    const letter = answer[index];
    const data = customState(state);
    data.stage.greenHints ||= [];
    if (!data.stage.greenHints.some((item) => item.index === index)) data.stage.greenHints.push({ index, letter });
    markKeyboardLetter(letter, "correct");
    dispatch("cuddle:hint", { color: "green", letter, index, source: "economy-v8" });
    return true;
  }

  function markOneIncorrectLetter(state) {
    const answer = answerWord(state);
    if (!answer) return false;
    const data = customState(state);
    data.stage.falseLetters ||= [];
    const used = new Set(data.stage.falseLetters);
    const candidates = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").filter((letter) => !answer.includes(letter) && !used.has(letter));
    if (!candidates.length) return false;
    const letter = candidates[randomInt(0, candidates.length - 1, `${stageIdentity(state)}:${guessCount(state)}:false`)];
    data.stage.falseLetters.push(letter);
    markKeyboardLetter(letter, "absent");
    dispatch("cuddle:false-letter", { letter, source: "economy-v8" });
    return true;
  }

  function temporaryCullSlots(state) {
    const slots = [];
    for (const object of shallowObjects(state, 3)) {
      for (const [key, value] of safeOwnEntries(object)) {
        if (!/temporary|disabled|blocked|unavailable|removed|culled|excluded|banned/.test(norm(key))) continue;
        if (Array.isArray(value) || value instanceof Set) slots.push({ owner: object, key, value });
      }
    }
    return slots;
  }

  function restoreTemporaryCulls(state) {
    const data = customState(state);
    const record = data?.stage?.temporaryCullRecord;
    if (!record || !Array.isArray(record.letters)) return;
    for (const slot of temporaryCullSlots(state)) {
      if (Array.isArray(slot.value)) {
        for (const letter of record.letters) {
          let index;
          while ((index = slot.value.indexOf(letter)) >= 0) slot.value.splice(index, 1);
        }
      } else if (slot.value instanceof Set) {
        for (const letter of record.letters) slot.value.delete(letter);
      }
    }
  }

  function cullLetters(state, context, count, temporaryStages = 0) {
    const answer = answerWord(state);
    const existing = new Set();
    const data = customState(state);
    data.flags.culledLetters ||= [];
    for (const letter of data.flags.culledLetters) existing.add(letter);
    const candidates = CONSONANTS.filter((letter) => !existing.has(letter) && !answer.includes(letter));
    const selected = shuffle(candidates, `${stageIdentity(state)}:cull:${count}:${data.flags.culledLetters.length}`).slice(0, count);
    if (!selected.length) return [];

    let method = { called: false };
    if (temporaryStages <= 0) {
      method = callCandidateMethod(context, [
        /cull.*letter/, /remove.*letter/, /apply.*cull/, /exclude.*letter/
      ], [selected]);
    }
    if (!method.called) {
      const slots = temporaryStages > 0 ? temporaryCullSlots(state) : shallowObjects(state, 3).flatMap((object) =>
        safeOwnEntries(object)
          .filter(([key, value]) => /culled|removed|excluded|banned/.test(norm(key)) && (Array.isArray(value) || value instanceof Set))
          .map(([key, value]) => ({ owner: object, key, value }))
      );
      for (const slot of slots) {
        if (Array.isArray(slot.value)) {
          for (const letter of selected) if (!slot.value.includes(letter)) slot.value.push(letter);
        } else if (slot.value instanceof Set) {
          for (const letter of selected) slot.value.add(letter);
        }
      }
    }
    if (temporaryStages > 0) {
      data.stage.temporaryCullRecord = { letters: selected, stagesLeft: temporaryStages };
    } else {
      for (const letter of selected) if (!data.flags.culledLetters.includes(letter)) data.flags.culledLetters.push(letter);
    }
    dispatch("cuddle:letters-culled", { letters: selected, source: "economy-v8" });
    saveCustom(state);
    return selected;
  }

  function addQuest(state, context) {
    const result = callCandidateMethod(context, [
      /add.*quest/, /generate.*quest/, /assign.*quest/, /create.*quest/, /start.*quest/, /deal.*quest/
    ]);
    if (result.called) return true;
    const data = customState(state);
    data.stage.pendingExtraQuests = Number(data.stage.pendingExtraQuests || 0) + 1;
    dispatch("cuddle:extra-quest", { source: "economy-v8" });
    return false;
  }

  function revealAllThemes(state, context) {
    const result = callCandidateMethod(context, [
      /reveal.*all.*theme/, /all.*categor/, /reveal.*categor/, /load.*categor/
    ], [{ all: true }]);
    const data = customState(state);
    data.stage.allThemesRevealed = true;
    dispatch("cuddle:themes-all", { source: "economy-v8" });
    return result.called;
  }

  function currentCandidateWords(state, context) {
    const result = callCandidateMethod(context, [
      /active.*words/, /feasible.*words/, /candidate.*words/, /possible.*words/
    ]);
    if (result.called && Array.isArray(result.value)) return result.value.filter((word) => /^[a-z]{5}$/i.test(String(word)));
    for (const object of shallowObjects(state, 3)) {
      for (const [key, value] of safeOwnEntries(object)) {
        if (/candidate|feasible|possible|activewords/.test(norm(key)) && Array.isArray(value)) {
          const words = value.filter((word) => /^[a-z]{5}$/i.test(String(word)));
          if (words.length) return words;
        }
      }
    }
    return [];
  }

  function showMessage(text) {
    const event = new CustomEvent("cuddle:toast", { detail: { message: text, source: "economy-v8" } });
    document.dispatchEvent(event);
    const toast = document.createElement("div");
    toast.className = "cuddle-v8-toast";
    toast.textContent = text;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add("is-visible"));
    setTimeout(() => {
      toast.classList.remove("is-visible");
      setTimeout(() => toast.remove(), 300);
    }, 2600);
  }

  function applyGuidedWord(state, context) {
    const words = currentCandidateWords(state, context);
    const feasible = words.filter((word) => canBuildWithHand(word, state));
    const word = feasible[0] || words[0];
    if (word) {
      showMessage(`Guided word: ${String(word).toUpperCase()}`);
      dispatch("cuddle:guided-word", { word: String(word).toUpperCase(), source: "economy-v8" });
      return true;
    }
    showMessage("No feasible guided word is currently available.");
    return false;
  }

  function applyCustomEffect(effectId, state, context, original, thisArg, args) {
    const data = customState(state);
    const callOriginal = () => typeof original === "function" ? original.apply(thisArg, args) : undefined;

    switch (effectId) {
      case "quest-reroll-stage": {
        const value = callOriginal();
        addUpgradeStack(state, "quest-reroll-stage", 1);
        data.upgrades["quest-reroll-stage"] = Math.min(1, data.upgrades["quest-reroll-stage"]);
        return value;
      }
      case "bigger-mulligan": {
        const before = currentMulliganSize(state);
        const value = callOriginal();
        const target = Math.min(currentHandSize(state), Math.max(before + 1, currentMulliganSize(state)));
        setMulliganSize(state, target);
        addUpgradeStack(state, "bigger-mulligan", 1);
        return value;
      }
      case "cull-one":
        cullLetters(state, context, 1);
        addUpgradeStack(state, "cull-one", 1);
        return true;
      case "cull-two":
        cullLetters(state, context, 2);
        addUpgradeStack(state, "cull-two", 1);
        return true;
      case "colour-surge": {
        const beforeYellow = firstNumber(state, [(key) => /yellow.*(?:value|money|cash)|(?:value|money|cash).*yellow/.test(key)], 0);
        const beforeGreen = firstNumber(state, [(key) => /green.*(?:value|money|cash)|(?:value|money|cash).*green/.test(key)], 0);
        const value = callOriginal();
        setMatchingNumbers(state, (key) => /yellow.*(?:value|money|cash)|(?:value|money|cash).*yellow/.test(key), beforeYellow + 2, 3);
        setMatchingNumbers(state, (key) => /green.*(?:value|money|cash)|(?:value|money|cash).*green/.test(key), beforeGreen + 2, 3);
        addUpgradeStack(state, "colour-surge", 1);
        return value;
      }
      case "grey-matters": {
        const beforeYellow = firstNumber(state, [(key) => /yellow.*(?:value|money|cash)|(?:value|money|cash).*yellow/.test(key)], 0);
        const beforeGreen = firstNumber(state, [(key) => /green.*(?:value|money|cash)|(?:value|money|cash).*green/.test(key)], 0);
        const value = callOriginal();
        setMatchingNumbers(state, (key) => /yellow.*(?:value|money|cash)|(?:value|money|cash).*yellow/.test(key), beforeYellow, 3);
        setMatchingNumbers(state, (key) => /green.*(?:value|money|cash)|(?:value|money|cash).*green/.test(key), beforeGreen, 3);
        addUpgradeStack(state, "grey-matters", 1);
        return value;
      }
      case "soft-meter": {
        const value = callOriginal();
        addUpgradeStack(state, "soft-meter", 1);
        return value;
      }
      case "yellow-hint":
        addUpgradeStack(state, "yellow-hint", 1);
        return true;
      case "green-hint":
        addUpgradeStack(state, "green-hint", 1);
        return true;
      case "random-quest":
        addUpgradeStack(state, "random-quest", 1);
        return true;
      case "wild-card":
        addUpgradeStack(state, "wild-card", 1);
        return callOriginal();
      case "joker-cache":
        addUpgradeStack(state, "joker-cache", 1);
        return callOriginal();
      case "full-hand-mulligan":
        addHandSize(state, 1);
        setMulliganSize(state, currentHandSize(state));
        addUpgradeStack(state, "full-hand-mulligan", 1);
        return true;
      case "richer-colours":
        setMatchingNumbers(state, (key) => /yellow.*(?:value|money|cash)|(?:value|money|cash).*yellow/.test(key), (value) => value + 3, 3);
        setMatchingNumbers(state, (key) => /green.*(?:value|money|cash)|(?:value|money|cash).*green/.test(key), (value) => value + 3, 3);
        addUpgradeStack(state, "richer-colours", 1);
        return true;
      case "false-letter":
        addUpgradeStack(state, "false-letter", 1);
        return true;
      case "boss-field-notes":
        addUpgradeStack(state, "boss-field-notes", 1);
        return true;
      case "double-quests":
        addUpgradeStack(state, "double-quests", 1);
        return true;
      case "backup-plan":
        addMaxMulligans(state, 1);
        addUpgradeStack(state, "backup-plan", 1);
        return true;
      case "hand-resonance":
        addUpgradeStack(state, "hand-resonance", 1);
        return true;
      case "rarity-lens":
        addUpgradeStack(state, "rarity-lens", 1);
        return true;
      case "guided-word":
        return applyGuidedWord(state, context);
      case "letter-count-two": {
        const patchedArgs = args.map((value) => typeof value === "number" && value === 3 ? 2 : value);
        if (typeof original === "function") return original.apply(thisArg, patchedArgs);
        data.stage.letterCountCount = 2;
        return true;
      }
      default:
        return callOriginal();
    }
  }

  function replaceHandlers(def, effectId) {
    if (!isObject(def)) return;
    rememberOriginal(def);
    if (def[APPLY_PATCHED] === effectId) return;
    const keys = ["apply", "activate", "onSelect", "onChoose", "onClaim", "grant", "effect"];
    let replaced = false;
    for (const key of keys) {
      if (typeof def[key] !== "function") continue;
      const original = def[key];
      def[key] = function cuddleEconomyV8Effect(...args) {
        const context = contextFromApply(this, args);
        const state = findState(context, args);
        if (!state) return original.apply(this, args);
        const result = applyCustomEffect(effectId, state, context, original, this, args);
        const data = customState(state);
        if (def.__cuddleV8Tier && Number(data?.flags?.doubleNextReward || 0) > 0) {
          data.flags.doubleNextReward -= 1;
          applyCustomEffect(effectId, state, context, original, this, args);
          showMessage(`${getName(def)} applied twice.`);
          saveCustom(state);
        }
        return result;
      };
      replaced = true;
    }
    if (!replaced) {
      def.apply = function cuddleEconomyV8Effect(...args) {
        const context = contextFromApply(this, args);
        const state = findState(context, args);
        return state ? applyCustomEffect(effectId, state, context, null, this, args) : undefined;
      };
    }
    def.__cuddleV8Effect = effectId;
    def[APPLY_PATCHED] = effectId;
  }

  function transformOrdinaryDefinition(def) {
    if (!isObject(def)) return [];
    const name = norm(getName(def));
    if (REMOVED_REWARDS.has(name)) return [];
    rememberOriginal(def);

    if (name === "cull x y" || name === "cull x and y" || name === "cull two letters") {
      const rare = def;
      setName(rare, "Cull Two Letters");
      setId(rare, "cull-two-letters");
      setDescription(rare, "Permanently remove two eligible consonants from the deck and future secrets.");
      setTier(rare, TIERS.RARE);
      replaceHandlers(rare, "cull-two");

      const common = cloneDefinition(def);
      setName(common, "Cull One Letter");
      setId(common, "cull-one-letter");
      setDescription(common, "Permanently remove one eligible consonant from the deck and future secrets.");
      setTier(common, TIERS.COMMON);
      replaceHandlers(common, "cull-one");
      return [common, rare];
    }

    if (name === "guesser hint" || name === "yellow guesser hint") {
      const yellow = def;
      setName(yellow, "Yellow Guesser Hint");
      setId(yellow, "yellow-guesser-hint");
      setDescription(yellow, "At the start of every eligible stage, reveal one answer letter without its position.");
      setTier(yellow, TIERS.RARE);
      setMaxStack(yellow, 4);
      replaceHandlers(yellow, "yellow-hint");

      const green = cloneDefinition(def);
      setName(green, "Green Guesser Hint");
      setId(green, "green-guesser-hint");
      setDescription(green, "At the start of every eligible stage, reveal one answer letter in its exact position.");
      setTier(green, TIERS.LEGENDARY);
      setMaxStack(green, 4);
      replaceHandlers(green, "green-hint");
      return [yellow, green];
    }

    if (name === "second guess quest") {
      setDescription(def, "Once per stage, reroll the current quest for free. The reroll resets when a new stage begins.");
      setMaxStack(def, 1);
      replaceHandlers(def, "quest-reroll-stage");
    } else if (name === "bigger mulligan") {
      setDescription(def, "Each mulligan may replace one additional tile, up to the current hand size.");
      setMaxStack(def, 99);
      replaceHandlers(def, "bigger-mulligan");
    } else if (name === "colour surge" || name === "color surge") {
      setDescription(def, "Yellow and green tiles gain +$2. Grey tiles still lose $1.");
      replaceHandlers(def, "colour-surge");
    } else if (name === "grey matters" || name === "gray matters") {
      setDescription(def, "Grey tiles gain +$1. Yellow and green values are unchanged.");
      replaceHandlers(def, "grey-matters");
    } else if (name === "wild card") {
      setDescription(def, "Begin every stage with one Joker in the active pouch.");
      replaceHandlers(def, "wild-card");
    } else if (name === "softer cuddle meter") {
      setDescription(def, "Reduce the Cuddle Meter requirement by 2 grey tiles.");
      setMaxStack(def, 6);
      replaceHandlers(def, "soft-meter");
    } else if (name === "bigger cuddle") {
      setDescription(def, "Advance the reward received when the Cuddle Meter fills: mulligan, Joker, yellow hint, green hint, then extra row.");
      setMaxStack(def, 4);
    } else if (name === "joker cache") {
      setDescription(def, "Begin every stage with two additional Jokers.");
      replaceHandlers(def, "joker-cache");
    }

    const updatedName = norm(getName(def));
    const tier = ORDINARY_TIER_BY_NAME.get(updatedName);
    if (tier) setTier(def, tier);
    return [def];
  }

  function makeRandomQuestReward(template) {
    const def = cloneDefinition(template || {});
    setName(def, "Surprise Assignment");
    setId(def, "surprise-assignment");
    setDescription(def, "Add one extra quest at a random turn in every stage. Stackable; each copy schedules another quest.");
    setTier(def, TIERS.RARE);
    setMaxStack(def, 99);
    replaceHandlers(def, "random-quest");
    return def;
  }

  function transformOrdinaryCatalog(items) {
    const out = [];
    let template = null;
    for (const original of items) {
      if (!isObject(original)) continue;
      template ||= original;
      const transformed = transformOrdinaryDefinition(original);
      for (const def of transformed) {
        const key = norm(getName(def));
        if (!key || out.some((existing) => norm(getName(existing)) === key)) continue;
        out.push(def);
      }
    }
    if (!out.some((def) => norm(getName(def)) === "surprise assignment")) {
      out.push(makeRandomQuestReward(template));
    }
    for (const def of out) catalog.ordinary.set(norm(getName(def)), def);
    return out;
  }

  function transformBossDefinition(def) {
    if (!isObject(def)) return def;
    let name = norm(getName(def));
    rememberOriginal(def);
    def.__cuddleV8Boss = true;

    if (name === "full hand mulligan") {
      setDescription(def, "Every mulligan may replace the full current hand, and permanent hand size increases by 1.");
      replaceHandlers(def, "full-hand-mulligan");
    } else if (name === "richer colours" || name === "richer colors") {
      setDescription(def, "Yellow and green tiles each gain +$3.");
      replaceHandlers(def, "richer-colours");
    } else if (name === "position peek") {
      setName(def, "False-Letter Scout");
      setId(def, "false-letter-scout");
      setDescription(def, "After every turn in a stage, mark one untested letter that is not in the answer as incorrect.");
      setTier(def, TIERS.LEGENDARY);
      replaceHandlers(def, "false-letter");
      name = "false letter scout";
    } else if (name === "margin note") {
      setName(def, "Boss Field Notes");
      setId(def, "boss-field-notes");
      setDescription(def, "At the start of every future boss, reveal one green position and one additional yellow letter.");
      replaceHandlers(def, "boss-field-notes");
      name = "boss field notes";
    } else if (name === "quest cadence") {
      setName(def, "Double Quests");
      setId(def, "double-quests");
      setDescription(def, "Whenever quests are active, maintain two concurrent quests instead of one.");
      replaceHandlers(def, "double-quests");
      name = "double quests";
    } else if (name === "backup plan") {
      setDescription(def, "Starting with the stage after this boss, increase maximum mulligans by 1 in every stage.");
      replaceHandlers(def, "backup-plan");
    } else if (name === "golden thread") {
      setName(def, "Hand Resonance");
      setId(def, "hand-resonance");
      setDescription(def, "When the answer can be made from the current hand and reusable letters, the tile keyboard gently wiggles without identifying any letter.");
      replaceHandlers(def, "hand-resonance");
      name = "hand resonance";
    } else if (name === "clear sight") {
      setName(def, "Rarity Lens");
      setId(def, "rarity-lens");
      setDescription(def, "Future reward rolls use 35% common, 50% rare, and 15% legendary odds.");
      replaceHandlers(def, "rarity-lens");
      name = "rarity lens";
    }

    if (LEGENDARY_BOSS_NAMES.has(name)) setTier(def, TIERS.LEGENDARY);
    catalog.boss.set(norm(getName(def)), def);
    return def;
  }

  function transformBossCatalog(items) {
    return items.map(transformBossDefinition);
  }

  function transformQuestDefinition(def) {
    if (!isObject(def)) return def;
    const name = norm(getName(def));
    if (name === "guided letter") {
      setDescription(def, "Show a feasible word that can be made with currently usable letters and unused consonants.");
      replaceHandlers(def, "guided-word");
    } else if (name === "letter count") {
      setDescription(def, "Reveal how many times two selected consonants occur in the answer.");
      for (const key of ["count", "letterCount", "selectionCount", "choices"]) {
        if (key in def && typeof def[key] === "number") def[key] = 2;
      }
      replaceHandlers(def, "letter-count-two");
    }
    catalog.quest.set(name, def);
    return def;
  }

  function transformQuestCatalog(items) {
    return items.map(transformQuestDefinition);
  }

  function rewardAvailable(def, context, state) {
    if (!isObject(def)) return false;
    for (const key of ["available", "isAvailable", "eligible", "condition", "canApply", "shouldOffer"]) {
      if (typeof def[key] !== "function") continue;
      try {
        if (!def[key].call(context, state, context)) return false;
      } catch (_) {
        // A condition with an unknown signature should not make the reward disappear.
      }
    }
    const name = norm(getName(def));
    if (name === "bigger mulligan" && currentMulliganSize(state) >= currentHandSize(state)) return false;
    return !REMOVED_REWARDS.has(name);
  }

  function allOrdinaryCandidates(context, state) {
    const ordinary = [...catalog.ordinary.values()];
    for (const def of catalog.boss.values()) {
      if (def.__cuddleV8Tier === TIERS.LEGENDARY || LEGENDARY_BOSS_NAMES.has(norm(getName(def)))) ordinary.push(def);
    }
    const unique = new Map();
    for (const def of ordinary) {
      if (!rewardAvailable(def, context, state)) continue;
      unique.set(norm(getName(def)), def);
    }
    return [...unique.values()];
  }

  function chooseSameTier(count, context, state, seed = null) {
    const pool = allOrdinaryCandidates(context, state);
    const grouped = {
      common: pool.filter((def) => def.__cuddleV8Tier === TIERS.COMMON),
      rare: pool.filter((def) => def.__cuddleV8Tier === TIERS.RARE),
      legendary: pool.filter((def) => def.__cuddleV8Tier === TIERS.LEGENDARY)
    };
    const enough = Object.keys(grouped).filter((tier) => grouped[tier].length >= count);
    const available = enough.length ? enough : Object.keys(grouped).filter((tier) => grouped[tier].length > 0);
    const weights = hasNamedUpgrade(state, ["rarity lens"]) || upgradeStack(state, "rarity-lens") > 0
      ? BOOSTED_WEIGHTS
      : DEFAULT_WEIGHTS;
    const tier = weightedTier(weights, available, seed);
    const selected = shuffle(grouped[tier] || [], seed == null ? null : `${seed}:shuffle`).slice(0, count);
    selected.forEach((def) => { def.__cuddleV8OfferTier = tier; });
    return selected;
  }

  function isRewardArray(items) {
    if (!Array.isArray(items) || items.length < 1) return false;
    return items.filter(isObject).some((item) => KNOWN_ORDINARY_NAMES.has(norm(getName(item))) || item.__cuddleV8Tier);
  }

  function isBossArray(items) {
    if (!Array.isArray(items) || items.length < 1) return false;
    return items.filter(isObject).some((item) => KNOWN_BOSS_NAMES.has(norm(getName(item))) || item.__cuddleV8Boss);
  }

  function isQuestArray(items) {
    if (!Array.isArray(items) || items.length < 1) return false;
    return items.filter(isObject).some((item) => QUEST_REWARD_NAMES.has(norm(getName(item))));
  }

  function isShopArray(items) {
    if (!Array.isArray(items) || items.length < 1) return false;
    return items.filter(isObject).some((item) => SHOP_BASE_NAMES.has(norm(getName(item))) || item.__cuddleV8ShopAction);
  }

  function sourceNameCount(source, names) {
    const text = norm(source);
    let count = 0;
    for (const name of names) if (text.includes(name)) count += 1;
    return count;
  }

  function postProcessArray(items, meta) {
    if (!Array.isArray(items)) return items;
    const { context, source, name } = meta;
    const state = findState(context, []);

    if (isShopArray(items) || sourceNameCount(source, SHOP_BASE_NAMES) >= 2) {
      return transformShopCatalog(items, context, state);
    }
    if (isQuestArray(items) || sourceNameCount(source, QUEST_REWARD_NAMES) >= 3) {
      return transformQuestCatalog(items);
    }
    const ordinaryCatalogLike = sourceNameCount(source, KNOWN_ORDINARY_NAMES) >= 4 || items.length >= 10 && isRewardArray(items);
    if (ordinaryCatalogLike) return transformOrdinaryCatalog(items);

    const bossCatalogLike = sourceNameCount(source, KNOWN_BOSS_NAMES) >= 4 || items.length >= 8 && isBossArray(items);
    if (bossCatalogLike) return transformBossCatalog(items);

    if (isRewardArray(items) && items.length >= 2 && items.length <= 8 && state) {
      const selected = chooseSameTier(items.length, context, state, `${stageIdentity(state)}:${name}:${Date.now()}`);
      return selected.length === items.length ? selected : items;
    }
    return items;
  }

  function postProcessValue(value, meta, depth = 0) {
    if (depth > 2) return value;
    if (Array.isArray(value)) return postProcessArray(value, meta);
    if (!isObject(value) || value instanceof Node) return value;

    const copy = value;
    for (const key of ["choices", "options", "rewards", "items", "offers", "pool", "catalog", "upgrades"]) {
      if (Array.isArray(copy[key])) copy[key] = postProcessArray(copy[key], meta);
    }

    // Update challenge previews and payout objects.
    const text = norm(`${getName(copy)} ${copy.type ?? ""} ${copy.kind ?? ""}`);
    if (/challenge/.test(text)) {
      const state = findState(meta.context, []);
      const node = currentNode(state);
      const world = Number(node?.challengeWorld || node?.world || 1);
      const amount = Number(node?.challengeReward || node?.cashReward || 0);
      if (amount > 0) {
        for (const key of ["reward", "cashReward", "moneyReward", "bonusMoney", "challengeReward", "payout"]) {
          if (key in copy && typeof copy[key] === "number") copy[key] = amount;
        }
        for (const key of ["description", "desc", "details", "subtitle"]) {
          if (typeof copy[key] === "string") copy[key] = copy[key].replace(/\+?\$\s*\d+/g, `+$${amount}`).replace(/world\s*[123]/ig, `World ${world}`);
        }
      }
    }
    return copy;
  }

  function activeRarityClass(name) {
    const key = norm(name);
    const def = catalog.ordinary.get(key) || catalog.boss.get(key);
    return def?.__cuddleV8Tier || "";
  }

  function priceForTier(tier, seed) {
    const range = PRICE_RANGES[tier] || PRICE_RANGES.common;
    return randomInt(range[0], range[1], seed);
  }

  function shopPriceKey(item) {
    for (const key of ["price", "cost", "amount", "value"]) {
      if (key in item && typeof item[key] === "number") return key;
    }
    return "price";
  }

  function setShopPrice(item, price) {
    const key = shopPriceKey(item);
    item[key] = price;
    item.price = price;
    item.cost = price;
  }

  function installShopHandlers(item, action) {
    item.__cuddleV8ShopAction = action;
    const handler = function cuddleV8ShopPurchase(...args) {
      const context = contextFromApply(this, args);
      const state = findState(context, args);
      if (!state) return false;
      const price = Number(item.price ?? item.cost ?? 0);
      if (!spendMoney(state, price)) {
        showMessage(`You need $${price}.`);
        return false;
      }
      applyShopAction(state, context, action);
      dispatch("cuddle:shop-purchase", { item: getName(item), price, source: "economy-v8" });
      saveCustom(state);
      return true;
    };
    let assigned = false;
    for (const key of ["buy", "purchase", "apply", "activate", "onPurchase", "effect", "onBuy"]) {
      if (key in item || key === "purchase") {
        item[key] = handler;
        assigned = true;
      }
    }
    if (!assigned) item.purchase = handler;
  }

  function makeShopItem(template, id, name, description, price, action) {
    const item = cloneDefinition(template || {});
    setId(item, id);
    setName(item, name);
    setDescription(item, description);
    setShopPrice(item, price);
    installShopHandlers(item, action);
    return item;
  }

  function queuePouch(state, key, amount = 1) {
    const data = customState(state);
    data.pouch[key] = Number(data.pouch[key] || 0) + amount;
    saveCustom(state);
    renderPouchButton();
  }

  function applyShopAction(state, context, action) {
    const data = customState(state);
    switch (action.type) {
      case "pouch":
        queuePouch(state, action.key, Number(action.amount || 1));
        break;
      case "permanent":
        applyDefinition(action.definition, context, state);
        break;
      default:
        data.flags[action.type] = Number(data.flags[action.type] || 0) + Number(action.amount || 1);
        saveCustom(state);
        break;
    }
  }

  function applyDefinition(def, context, state) {
    if (!isObject(def)) return false;
    for (const key of ["apply", "activate", "onSelect", "onChoose", "onClaim", "grant", "effect"]) {
      if (typeof def[key] === "function") {
        try {
          def[key].call(context, state, context);
          return true;
        } catch (_) {
          try { def[key].call(context); return true; } catch (_) { /* continue */ }
        }
      }
    }
    return false;
  }

  function permanentShopItems(template, context, state, count = 3) {
    const pool = allOrdinaryCandidates(context, state);
    const grouped = {
      common: pool.filter((def) => def.__cuddleV8Tier === TIERS.COMMON),
      rare: pool.filter((def) => def.__cuddleV8Tier === TIERS.RARE),
      legendary: pool.filter((def) => def.__cuddleV8Tier === TIERS.LEGENDARY)
    };
    const selected = [];
    const seedBase = `${runKey(state)}:${stageIdentity(state)}:shop:${customState(state)?.shop?.visit || 0}`;
    for (let index = 0; index < count; index += 1) {
      const availableTiers = Object.keys(grouped).filter((tier) => grouped[tier].length > 0);
      const tier = weightedTier(SHOP_WEIGHTS, availableTiers, `${seedBase}:tier:${index}`);
      const choices = shuffle(grouped[tier], `${seedBase}:choice:${index}`);
      const def = choices.find((candidate) => !selected.some((existing) => existing.definition === candidate));
      if (!def) continue;
      const price = priceForTier(tier, `${seedBase}:price:${index}:${getId(def)}`);
      const item = makeShopItem(
        template,
        `permanent-${getId(def)}`,
        getName(def),
        `${def.description ?? def.desc ?? "Permanent Cuddle upgrade."} [${tier.toUpperCase()}]`,
        price,
        { type: "permanent", definition: def }
      );
      item.rarity = tier;
      item.__cuddleV8Permanent = true;
      selected.push({ item, definition: def });
    }
    return selected.map((entry) => entry.item);
  }

  function transformShopCatalog(items, context, state) {
    if (!state) return items;
    const data = customState(state);
    data.shop.visit = Number(data.shop.visit || 0) + 1;
    const source = [];
    let template = catalog.shopTemplate || items.find(isObject) || {};
    catalog.shopTemplate = template;

    for (const original of items) {
      if (!isObject(original)) continue;
      const item = original;
      const name = norm(getName(item));
      if (name === "permanent secrets counter" || name === "permanent guesser hint") continue;
      if (name === "pocket joker") {
        setDescription(item, "Place one Pocket Joker in the pouch. Activate it during a stage when you choose.");
        installShopHandlers(item, { type: "pouch", key: "pocketJoker", amount: 1 });
      } else if (name === "ten letter cull" || name === "ten-letter cull") {
        setName(item, "Five-Letter Cull");
        setDescription(item, "Place a token in the pouch. Activate it to remove five non-answer letters in the next boss.");
        installShopHandlers(item, { type: "pouch", key: "bossCullFive", amount: 1 });
      } else if (name === "regular wordle hands") {
        setName(item, "Boss Mulligan Kit");
        setDescription(item, "Place a token in the pouch. Activate it to gain +3 mulligans in the next boss.");
        installShopHandlers(item, { type: "pouch", key: "bossMulligansThree", amount: 1 });
      }
      source.push(item);
    }

    const consumables = [
      makeShopItem(template, "theme-atlas-token", "Theme Atlas", "Pouch item: reveal every available theme in the next stage.", 20, { type: "pouch", key: "allThemesNext", amount: 1 }),
      makeShopItem(template, "spare-row-token", "Spare Row", "Pouch item: add one extra row in the next stage.", 22, { type: "pouch", key: "extraRowNext", amount: 1 }),
      makeShopItem(template, "two-stage-cull", "Twin-Stage Cull", "Pouch item: remove three non-answer letters in each of the next two normal stages.", 26, { type: "pouch", key: "cullThreeTwoStages", amount: 1 }),
      makeShopItem(template, "echo-voucher", "Echo Voucher", "Pouch item: apply the next permanent reward twice in total.", 30, { type: "pouch", key: "doubleNextReward", amount: 1 }),
      makeShopItem(template, "borrowed-pocket", "Borrowed Pocket", "Pouch item: gain +1 hand size in each of the next two normal stages.", 24, { type: "pouch", key: "handPlusOneTwoStages", amount: 1 }),
      makeShopItem(template, "boss-mulligan-token", "Boss Mulligan Token", "Pouch item: gain +2 mulligans in the next boss.", 18, { type: "pouch", key: "bossMulligansTwo", amount: 1 }),
      makeShopItem(template, "boss-sweep-token", "Boss Letter Sweep", "Pouch item: remove three non-answer letters in the next boss.", 20, { type: "pouch", key: "bossCullThree", amount: 1 }),
      makeShopItem(template, "stage-mulligan-token", "Stage Mulligan Coupon", "Pouch item: gain +1 mulligan in the next normal stage.", 12, { type: "pouch", key: "stageMulliganOne", amount: 1 }),
      makeShopItem(template, "yellow-lantern-token", "Yellow Lantern", "Pouch item: gain one yellow hint in the next stage.", 14, { type: "pouch", key: "yellowHintNext", amount: 1 }),
      makeShopItem(template, "joker-token", "Joker Token", "Pouch item: gain one Joker in the current or next stage.", 16, { type: "pouch", key: "pocketJoker", amount: 1 })
    ];

    const seed = `${runKey(state)}:${stageIdentity(state)}:consumables`;
    source.push(...shuffle(consumables, seed).slice(0, 4));
    source.push(...permanentShopItems(template, context, state, 3));
    saveCustom(state);
    return source;
  }

  function activatePouchItem(state, context, key) {
    const data = customState(state);
    if (!data?.pouch || Number(data.pouch[key] || 0) <= 0) return false;
    const consume = () => {
      data.pouch[key] -= 1;
      if (data.pouch[key] <= 0) delete data.pouch[key];
      saveCustom(state);
      renderPouchButton();
    };

    switch (key) {
      case "pocketJoker": addJokers(state, 1); consume(); return true;
      case "allThemesNext": data.flags.allThemesNext = Number(data.flags.allThemesNext || 0) + 1; consume(); return true;
      case "extraRowNext": data.flags.extraRowNext = Number(data.flags.extraRowNext || 0) + 1; consume(); return true;
      case "cullThreeTwoStages": data.flags.cullThreeStagesLeft = Number(data.flags.cullThreeStagesLeft || 0) + 2; consume(); return true;
      case "doubleNextReward": data.flags.doubleNextReward = Number(data.flags.doubleNextReward || 0) + 1; consume(); return true;
      case "handPlusOneTwoStages": data.flags.handPlusOneStagesLeft = Number(data.flags.handPlusOneStagesLeft || 0) + 2; consume(); return true;
      case "bossMulligansThree": data.flags.bossMulligansThree = Number(data.flags.bossMulligansThree || 0) + 1; consume(); return true;
      case "bossMulligansTwo": data.flags.bossMulligansTwo = Number(data.flags.bossMulligansTwo || 0) + 1; consume(); return true;
      case "bossCullFive": data.flags.bossCullFive = Number(data.flags.bossCullFive || 0) + 1; consume(); return true;
      case "bossCullThree": data.flags.bossCullThree = Number(data.flags.bossCullThree || 0) + 1; consume(); return true;
      case "stageMulliganOne": data.flags.stageMulliganOne = Number(data.flags.stageMulliganOne || 0) + 1; consume(); return true;
      case "yellowHintNext": data.flags.yellowHintNext = Number(data.flags.yellowHintNext || 0) + 1; consume(); return true;
      default: return false;
    }
  }

  function pouchLabels() {
    return {
      pocketJoker: "Pocket Joker",
      allThemesNext: "Theme Atlas",
      extraRowNext: "Spare Row",
      cullThreeTwoStages: "Twin-Stage Cull",
      doubleNextReward: "Echo Voucher",
      handPlusOneTwoStages: "Borrowed Pocket",
      bossMulligansThree: "Boss Mulligan Kit",
      bossMulligansTwo: "Boss Mulligan Token",
      bossCullFive: "Five-Letter Cull",
      bossCullThree: "Boss Letter Sweep",
      stageMulliganOne: "Stage Mulligan Coupon",
      yellowHintNext: "Yellow Lantern"
    };
  }

  function activeState() {
    let best = null;
    let score = -1;
    for (const context of contextList) {
      const state = findState(context, []);
      const next = stateScore(state);
      if (next > score) {
        best = state;
        score = next;
      }
    }
    return best;
  }

  function renderPouchButton() {
    const state = activeState();
    const data = state ? customState(state) : null;
    const count = data ? Object.values(data.pouch || {}).reduce((sum, value) => sum + Number(value || 0), 0) : 0;
    let button = document.getElementById("cuddle-v8-pouch-button");
    if (!count) {
      button?.remove();
      document.getElementById("cuddle-v8-pouch-dialog")?.remove();
      return;
    }
    if (!button) {
      button = document.createElement("button");
      button.id = "cuddle-v8-pouch-button";
      button.className = "cuddle-v8-pouch-button";
      button.type = "button";
      button.addEventListener("click", openPouchDialog);
      document.body.appendChild(button);
    }
    button.innerHTML = `<span aria-hidden="true">◈</span><span>Pouch</span><b>${count}</b>`;
    button.setAttribute("aria-label", `Open Cuddle pouch, ${count} item${count === 1 ? "" : "s"}`);
  }

  function openPouchDialog() {
    const state = activeState();
    if (!state) return;
    const data = customState(state);
    document.getElementById("cuddle-v8-pouch-dialog")?.remove();
    const overlay = document.createElement("div");
    overlay.id = "cuddle-v8-pouch-dialog";
    overlay.className = "cuddle-v8-pouch-overlay";
    const dialog = document.createElement("section");
    dialog.className = "cuddle-v8-pouch-dialog";
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-label", "Cuddle pouch");
    const labels = pouchLabels();
    const entries = Object.entries(data.pouch || {}).filter(([, value]) => Number(value) > 0);
    dialog.innerHTML = `
      <header><h2>Cuddle Pouch</h2><button type="button" class="cuddle-v8-close" aria-label="Close">×</button></header>
      <p>Activate an item now. Stage-targeted items are queued for the next eligible stage.</p>
      <div class="cuddle-v8-pouch-list"></div>`;
    const list = dialog.querySelector(".cuddle-v8-pouch-list");
    for (const [key, value] of entries) {
      const row = document.createElement("div");
      row.className = "cuddle-v8-pouch-item";
      row.innerHTML = `<span>${labels[key] || key}</span><b>×${value}</b><button type="button">Activate</button>`;
      row.querySelector("button").addEventListener("click", () => {
        const context = [...contextList][0] || state;
        if (activatePouchItem(state, context, key)) {
          overlay.remove();
          showMessage(`${labels[key] || key} activated.`);
        }
      });
      list.appendChild(row);
    }
    const close = () => overlay.remove();
    dialog.querySelector(".cuddle-v8-close").addEventListener("click", close);
    overlay.addEventListener("click", (event) => { if (event.target === overlay) close(); });
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
  }

  function transformQuietForge(value) {
    if (!isObject(value)) return;
    const title = norm(getName(value));
    if (title !== "quiet forge") return;
    const choices = value.choices ?? value.options ?? value.actions;
    if (!Array.isArray(choices)) return;
    const strong = choices.find((choice) => /upgrade/.test(norm(`${getName(choice)} ${choice.description ?? choice.desc ?? ""}`)));
    if (!strong || strong.__cuddleV8QuietForge) return;
    setDescription(strong, String(strong.description ?? strong.desc ?? "Receive upgrades.").replace(/(?:one|a)\s+random\s+(?:permanent\s+)?upgrade/i, "two random permanent upgrades"));
    for (const key of ["apply", "activate", "onSelect", "onChoose", "effect"]) {
      if (typeof strong[key] !== "function") continue;
      const original = strong[key];
      strong[key] = function cuddleV8QuietForge(...args) {
        const result = original.apply(this, args);
        const context = contextFromApply(this, args);
        const state = findState(context, args);
        const choices2 = state ? chooseSameTier(1, context, state, `${stageIdentity(state)}:quiet-forge`) : [];
        if (choices2[0]) applyDefinition(choices2[0], context, state);
        return result;
      };
    }
    strong.__cuddleV8QuietForge = true;
  }

  function processNestedEvents(value, depth = 0) {
    if (depth > 4 || !isObject(value)) return;
    if (Array.isArray(value)) {
      value.forEach((item) => processNestedEvents(item, depth + 1));
      return;
    }
    transformQuietForge(value);
    for (const child of Object.values(value)) {
      if (isObject(child) && !(child instanceof Node)) processNestedEvents(child, depth + 1);
    }
  }

  function shouldPatchObjectName(name) {
    return /cuddle|quest|reward|shop|campaign|coach|branch|money|wordle|game|engine|stage|map/i.test(String(name));
  }

  function patchMethod(holder, receiver, name, label) {
    if (!holder || name === "constructor") return;
    const descriptor = Object.getOwnPropertyDescriptor(holder, name);
    if (!descriptor || typeof descriptor.value !== "function") return;
    const original = descriptor.value;
    if (original[PATCHED]) return;
    const source = Function.prototype.toString.call(original);
    const sourceNorm = norm(source);

    // Disable legacy repeating automatic-hint schedulers. Exact one-time hints are
    // administered by the stage watcher below.
    const isLegacyAutoHint = /hint/.test(norm(name)) && /every|interval|schedule|automatic|auto/.test(sourceNorm + " " + norm(name)) && /easy|medium|hard|guess/.test(sourceNorm);

    // Replace the old four-step Cuddle Meter reward resolver with five steps.
    const isMeterResolver = /cuddle/.test(sourceNorm + " " + norm(label)) && /meter/.test(sourceNorm + " " + norm(name)) &&
      ["mulligan", "joker", "hint", "row"].filter((word) => sourceNorm.includes(word)).length >= 3;

    const wrapped = function cuddleEconomyV8Wrapped(...args) {
      const context = this || receiver;
      if (isObject(context)) {
        contextList.add(context);
        if (!seenContexts.has(context)) seenContexts.add(context);
      }
      const state = findState(context, args);

      const isLegacyHintGrant = isLegacyAutoHint && /grant|give|reveal|apply|trigger|award/.test(norm(name));
      if (isLegacyHintGrant && state) return undefined;
      if (isMeterResolver && state) {
        const level = Math.max(0, Math.min(4, upgradeStack(state, "bigger-cuddle") || firstNumber(state, [(key) => /biggercuddle|meterrewardlevel|cuddletier/.test(key)], 0)));
        return grantMeterReward(state, context, level);
      }

      let result;
      try {
        result = original.apply(context, args);
      } catch (error) {
        throw error;
      }
      const meta = { context, source, name, label, args };
      if (isLegacyAutoHint && state && isObject(result)) {
        for (const object of shallowObjects(result, 2)) {
          for (const [key, value] of safeOwnEntries(object)) {
            if (typeof value === "number" && /every|interval|frequency|repeat/.test(norm(key))) object[key] = 0;
          }
        }
      }
      if (result && typeof result.then === "function") {
        return result.then((resolved) => {
          const processed = postProcessValue(resolved, meta);
          processNestedEvents(processed);
          return processed;
        });
      }
      const processed = postProcessValue(result, meta);
      processNestedEvents(processed);
      return processed;
    };
    Object.defineProperty(wrapped, PATCHED, { value: true });
    Object.defineProperty(wrapped, "name", { value: original.name || name, configurable: true });
    try {
      Object.defineProperty(holder, name, { ...descriptor, value: wrapped });
    } catch (_) {
      try { receiver[name] = wrapped; } catch (_) { /* read-only */ }
    }
  }

  function patchObject(object, label = "") {
    if (!isObject(object) && typeof object !== "function") return;
    if (patchedObjects.has(object)) return;
    patchedObjects.add(object);
    if (isObject(object)) contextList.add(object);

    const holders = [];
    if (typeof object === "function" && object.prototype) holders.push([object.prototype, object.prototype]);
    if (isObject(object)) {
      holders.push([object, object]);
      const proto = Object.getPrototypeOf(object);
      if (proto && proto !== Object.prototype) holders.push([proto, object]);
    }
    for (const [holder, receiver] of holders) {
      let names = [];
      try { names = Object.getOwnPropertyNames(holder); } catch (_) { names = []; }
      for (const name of names) patchMethod(holder, receiver, name, label);
    }
  }

  function scanGlobals() {
    const candidates = [];
    for (const registered of window.__cuddleV8Contexts || []) {
      if (isObject(registered) || typeof registered === "function") candidates.push([registered, "registered-context"]);
    }
    let keys = [];
    try { keys = Object.getOwnPropertyNames(window); } catch (_) { keys = []; }
    for (const key of keys) {
      if (!shouldPatchObjectName(key)) continue;
      let value;
      try { value = window[key]; } catch (_) { continue; }
      if (isObject(value) || typeof value === "function") candidates.push([value, key]);
    }
    for (const [value, key] of candidates) {
      patchObject(value, key);
      if (isObject(value)) {
        for (const [childKey, child] of safeOwnEntries(value)) {
          if (shouldPatchObjectName(childKey) && (isObject(child) || typeof child === "function")) patchObject(child, `${key}.${childKey}`);
        }
      }
    }
  }

  function grantMeterReward(state, context, level) {
    switch (level) {
      case 0: addMulligans(state, 1); showMessage("Cuddle Meter: +1 mulligan"); return true;
      case 1: addJokers(state, 1); showMessage("Cuddle Meter: +1 Joker"); return true;
      case 2: grantYellowHint(state, context); showMessage("Cuddle Meter: yellow hint"); return true;
      case 3: grantGreenHint(state, context); showMessage("Cuddle Meter: green hint"); return true;
      default: addRows(state, 1); showMessage("Cuddle Meter: +1 row"); return true;
    }
  }

  function meterThreshold(state) {
    const base = currentDifficulty(state) === "easy" ? 10 : currentDifficulty(state) === "hard" ? 15 : 12;
    return Math.max(1, base - 2 * upgradeStack(state, "soft-meter"));
  }

  function patchBaseConfig(state) {
    const threshold = meterThreshold(state);
    const data = customState(state);
    setMatchingNumbers(state, (key) => /cuddle.*(?:threshold|target|required)|meter.*(?:threshold|target|required)/.test(key), threshold, 4);

    const rowSlots = findNumberSlots(state, (key) => /unused.*row.*(?:base|value|cash|money|reward)|(?:base|value).*unused.*row/.test(key), 4);
    if (rowSlots.length) {
      data.flags.rowBaseFieldFound = true;
      for (const slot of rowSlots) slot.owner[slot.key] = 3;
    }
    const mulliganSlots = findNumberSlots(state, (key) => /unused.*mulligan.*(?:base|value|cash|money|reward)|(?:base|value).*unused.*mulligan/.test(key), 4);
    if (mulliganSlots.length) {
      data.flags.mulliganBaseFieldFound = true;
      for (const slot of mulliganSlots) slot.owner[slot.key] = 2;
    }

    // Repeating intervals are disabled. The watcher gives one yellow hint at turn
    // 1 on Easy, turn 2 on Medium, and no automatic hint on Hard.
    setMatchingNumbers(state, (key) => /(?:auto|automatic).*hint.*(?:interval|every|frequency)|hint.*(?:interval|every|frequency)/.test(key), 0, 4);
  }

  function setQuestRerollsForStage(state) {
    const count = Math.min(1, upgradeStack(state, "quest-reroll-stage"));
    if (!count) return;
    let changed = setMatchingNumbers(state, (key) => /quest.*(?:reroll|replace|refresh).*(?:charge|count|left)|(?:reroll|replace).*quest/.test(key), count, 4);
    if (!changed) customState(state).stage.questRerolls = count;
  }

  function ensureTwoConcurrentQuests(state, context) {
    if (!upgradeStack(state, "double-quests")) return;
    setMatchingNumbers(state, (key) => /quest.*(?:slot|concurrent|active|max)|(?:slot|concurrent).*quest/.test(key), (value) => Math.max(2, value), 4);
    const quests = findArray(state, /activequests|quests|currentquests/, 4);
    if (quests && quests.length === 1) addQuest(state, context);
  }

  function stageStart(state, context, id) {
    const data = customState(state);
    if (Number(data.stage?.temporaryHandBonus || 0) > 0) {
      addHandSize(state, -Number(data.stage.temporaryHandBonus || 0), true);
    }
    restoreTemporaryCulls(state);
    const node = currentNode(state);
    const difficulty = currentDifficulty(state);
    data.stage = {
      id,
      guessCount: guessCount(state),
      hintGiven: false,
      falseLetters: [],
      randomQuestTurns: [],
      triggeredQuestTurns: [],
      payoutAdjusted: false,
      startMoney: moneySlot(state)?.value ?? 0,
      startRows: maxRows(state),
      startMulligans: remainingMulligans(state),
      yellowHints: [],
      greenHints: []
    };

    const randomQuestStacks = upgradeStack(state, "random-quest");
    for (let index = 0; index < randomQuestStacks; index += 1) {
      data.stage.randomQuestTurns.push(randomInt(1, Math.max(1, maxRows(state) - 1), `${id}:random-quest:${index}`));
    }

    setQuestRerollsForStage(state);
    ensureTwoConcurrentQuests(state, context);

    if (upgradeStack(state, "yellow-hint") > 0 && isWordStage(node) && !isBossNode(node)) grantYellowHint(state, context);
    if (upgradeStack(state, "green-hint") > 0 && isWordStage(node) && !isBossNode(node)) grantGreenHint(state, context);

    if (isBossNode(node) && upgradeStack(state, "boss-field-notes") > 0) {
      grantGreenHint(state, context);
      grantYellowHint(state, context);
    }

    if (data.flags.allThemesNext > 0 && isWordStage(node)) {
      revealAllThemes(state, context);
      data.flags.allThemesNext -= 1;
    }
    if (data.flags.extraRowNext > 0 && isWordStage(node)) {
      addRows(state, 1);
      data.flags.extraRowNext -= 1;
    }
    if (data.flags.yellowHintNext > 0 && isWordStage(node)) {
      grantYellowHint(state, context);
      data.flags.yellowHintNext -= 1;
    }
    if (data.flags.stageMulliganOne > 0 && isWordStage(node) && !isBossNode(node)) {
      addMulligans(state, 1);
      data.flags.stageMulliganOne -= 1;
    }
    if (data.flags.cullThreeStagesLeft > 0 && isWordStage(node) && !isBossNode(node)) {
      cullLetters(state, context, 3, 1);
      data.flags.cullThreeStagesLeft -= 1;
    }
    if (data.flags.handPlusOneStagesLeft > 0 && isWordStage(node) && !isBossNode(node)) {
      addHandSize(state, 1, true);
      data.stage.temporaryHandBonus = 1;
      data.flags.handPlusOneStagesLeft -= 1;
    }
    if (isBossNode(node)) {
      if (data.flags.bossMulligansThree > 0) { addMulligans(state, 3); data.flags.bossMulligansThree -= 1; }
      if (data.flags.bossMulligansTwo > 0) { addMulligans(state, 2); data.flags.bossMulligansTwo -= 1; }
      if (data.flags.bossCullFive > 0) { cullLetters(state, context, 5, 1); data.flags.bossCullFive -= 1; }
      if (data.flags.bossCullThree > 0) { cullLetters(state, context, 3, 1); data.flags.bossCullThree -= 1; }
    }

    data.stage.freeYellowTurn = difficulty === "easy" ? 1 : difficulty === "medium" ? 2 : null;
    saveCustom(state);
  }

  function stageTurn(state, context, count) {
    const data = customState(state);
    if (!data?.stage) return;
    const target = data.stage.freeYellowTurn;
    if (target != null && !data.stage.hintGiven && count >= target) {
      grantYellowHint(state, context);
      data.stage.hintGiven = true;
    }
    if (upgradeStack(state, "false-letter") > 0 && count > data.stage.guessCount) {
      for (let index = data.stage.guessCount; index < count; index += 1) markOneIncorrectLetter(state);
    }
    for (const turn of data.stage.randomQuestTurns || []) {
      const key = String(turn);
      if (count >= turn && !data.stage.triggeredQuestTurns.includes(key)) {
        addQuest(state, context);
        data.stage.triggeredQuestTurns.push(key);
      }
    }
    data.stage.guessCount = count;
    ensureTwoConcurrentQuests(state, context);
    saveCustom(state);
  }

  function wiggleIfReady(state) {
    if (!upgradeStack(state, "hand-resonance")) return;
    const answer = answerWord(state);
    if (!answer || !canBuildWithHand(answer, state)) return;
    const data = customState(state);
    const signature = `${stageIdentity(state)}:${handLetters(state).join("")}`;
    if (data.stage.lastWiggle === signature) return;
    data.stage.lastWiggle = signature;
    const elements = document.querySelectorAll(".cuddle-hand, .cuddle-tile-hand, .tile-rack, .cuddle-keyboard, [data-cuddle-hand]");
    elements.forEach((element) => {
      element.classList.remove("cuddle-v8-hand-wiggle");
      void element.offsetWidth;
      element.classList.add("cuddle-v8-hand-wiggle");
      setTimeout(() => element.classList.remove("cuddle-v8-hand-wiggle"), 900);
    });
  }

  function isSolved(state) {
    const node = currentNode(state);
    for (const object of shallowObjects(state, 3)) {
      for (const [key, value] of safeOwnEntries(object)) {
        const normalized = norm(key);
        if (/solved|won|victory|completed/.test(normalized) && value === true) return true;
        if (/status|result|phase/.test(normalized) && typeof value === "string" && /won|solved|complete|victory/.test(norm(value))) return true;
      }
    }
    return Boolean(node?.completed && isWordStage(node));
  }

  function fallbackPayoutAdjustment(state) {
    const data = customState(state);
    if (!data?.stage || data.stage.payoutAdjusted || !isSolved(state)) return;
    const node = currentNode(state);
    if (!isWordStage(node) || isBossNode(node) || isDuelNode(node)) return;
    const used = Math.max(1, guessCount(state));
    const rows = Math.max(0, Number(data.stage.startRows || maxRows(state)) - used);
    const mulligans = Math.max(0, remainingMulligans(state));
    const rowDelta = data.flags.rowBaseFieldFound ? 0 : -7 * rows;
    const mulliganDelta = data.flags.mulliganBaseFieldFound ? 0 : -1 * mulligans;
    const delta = rowDelta + mulliganDelta;
    if (delta !== 0) addMoney(state, delta);
    data.stage.payoutAdjusted = true;
    data.stage.payoutDelta = delta;
    saveCustom(state);
  }

  function tickContext(context) {
    const state = findState(context, []);
    if (!state || stateScore(state) < 3) return;
    contextList.add(context);
    const data = customState(state);
    patchBaseConfig(state);
    patchRoute(state);

    const id = stageIdentity(state);
    if (data.stage?.id !== id) stageStart(state, context, id);
    const count = guessCount(state);
    if (count !== data.stage.guessCount) stageTurn(state, context, count);
    wiggleIfReady(state);
    fallbackPayoutAdjustment(state);
    renderPouchButton();
  }

  function tick() {
    for (const context of [...contextList]) {
      try { tickContext(context); } catch (error) { console.debug("[Cuddle Economy v8] tick skipped", error); }
    }
  }

  function decorateRewardCards(root = document) {
    const elements = root.querySelectorAll?.(".reward-card, .upgrade-card, .reward-option, .cuddle-reward, [data-reward-id], [data-upgrade-id]") || [];
    for (const element of elements) {
      const tier = activeRarityClass(element.textContent || "");
      if (!tier) continue;
      element.classList.add("cuddle-v8-rarity", `cuddle-v8-${tier}`);
      if (!element.querySelector(":scope > .cuddle-v8-rarity-badge")) {
        const badge = document.createElement("span");
        badge.className = "cuddle-v8-rarity-badge";
        badge.textContent = tier;
        element.prepend(badge);
      }
    }
  }

  function adjustPayoutText(root = document) {
    const state = activeState();
    if (!state) return;
    const data = customState(state);
    const elements = root.querySelectorAll?.(".reward-breakdown *, .round-summary *, .stage-summary *, .payout-breakdown *, .modal *, [class*='summary'] *") || [];
    for (const element of elements) {
      if (adjustedPayoutNodes.has(element) || element.children.length) continue;
      const text = element.textContent || "";
      if (!/unused/i.test(text) || !/\$/.test(text)) continue;
      let countMatch = text.match(/(?:x|×)\s*(\d+)/i) || text.match(/(\d+)\s+unused/i);
      const count = countMatch ? Number(countMatch[1]) : 1;
      if (/row|guess/i.test(text)) {
        const hasUnitRate = /(?:x|×)\s*\$\s*\d+/i.test(text);
        element.textContent = text.replace(/\$\s*(\d+)/, (_, amount) => `$${Math.max(0, Number(amount) - (hasUnitRate ? 7 : 7 * count))}`);
        adjustedPayoutNodes.add(element);
      } else if (/mulligan/i.test(text)) {
        const hasUnitRate = /(?:x|×)\s*\$\s*\d+/i.test(text);
        element.textContent = text.replace(/\$\s*(\d+)/, (_, amount) => `$${Math.max(0, Number(amount) - (hasUnitRate ? 1 : count))}`);
        adjustedPayoutNodes.add(element);
      }
    }
    if (data?.stage) saveCustom(state);
  }

  function adjustChallengeNotice(root = document) {
    const state = activeState();
    if (!state) return;
    const node = currentNode(state);
    if (!isChallengeNode(node)) return;
    const desired = Number(node?.challengeReward || node?.cashReward || node?.reward || 0);
    if (!desired) return;
    const elements = root.querySelectorAll?.(".toast, .notification, .modal *, .stage-result *, [class*='reward']") || [];
    for (const element of elements) {
      if (challengeNoticeNodes.has(element) || element.children.length) continue;
      const text = element.textContent || "";
      const match = text.match(/challenge[^$]*\+?\$(\d+)|\+?\$(\d+)[^a-z]*challenge/i);
      if (!match) continue;
      const old = Number(match[1] || match[2] || 0);
      if (old === desired) { challengeNoticeNodes.add(element); continue; }
      element.textContent = text.replace(/\+?\$\s*\d+/, `+$${desired}`);
      addMoney(state, desired - old);
      challengeNoticeNodes.add(element);
    }
  }

  function onMutations(records) {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (!(node instanceof Element)) continue;
        decorateRewardCards(node);
        adjustPayoutText(node);
        adjustChallengeNotice(node);
      }
    }
    decorateRewardCards(document);
    adjustPayoutText(document);
    adjustChallengeNotice(document);
  }

  function installObserver() {
    if (observer || !document.documentElement) return;
    observer = new MutationObserver(onMutations);
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  function install() {
    if (window.CuddleEconomyRarityV8?.version === VERSION) return;
    window.CuddleEconomyRarityV8 = {
      version: VERSION,
      tiers: TIERS,
      defaultWeights: DEFAULT_WEIGHTS,
      boostedWeights: BOOSTED_WEIGHTS,
      shopWeights: SHOP_WEIGHTS,
      priceRanges: PRICE_RANGES,
      challengeRanges: CHALLENGE_RANGES,
      scan: scanGlobals,
      tick,
      grantMeterReward,
      openPouch: openPouchDialog
    };
    scanGlobals();
    installObserver();
    scanTimer = window.setInterval(scanGlobals, 1000);
    tickTimer = window.setInterval(tick, 250);
    window.addEventListener("beforeunload", () => {
      for (const context of contextList) {
        const state = findState(context, []);
        if (state) saveCustom(state);
      }
    });
    console.info(`[Cuddle Economy/Rarity v${VERSION}] installed`);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install, { once: true });
  } else {
    install();
  }
})();
