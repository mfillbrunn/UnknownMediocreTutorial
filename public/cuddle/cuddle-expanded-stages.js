/* CUDDLE EXPANDED STAGES v1.2
 * Specific challenge stops, icon legend, choice events, mystery stops,
 * and forced alternating Wordle duels with a Cuddle-card player hand.
 */
(function bootstrapCuddleExpandedStages() {
  "use strict";

  const VERSION = "2026.09.11.2";
  const INSTALL_MARK = Symbol.for("umt.cuddle.expandedStages.v1");
  const MAP_STATUS = "branchMap";
  const ICON_ROOT = "cuddle/icons/";
  const ROUND_TYPES = new Set(["normal", "theme", "challenge", "boss", "wordle"]);
  const VOWEL_SET = new Set(["A", "E", "I", "O", "U"]);
  const CARD_STATUS_ORDER = Object.freeze({ green: 0, yellow: 1, unused: 2, red: 3 });
  const DUEL_TILE_METHODS = Object.freeze([
    "_prepareInitialHand", "getMulliganAllowance", "getMulliganLimit",
    "getCardKnowledgeStatus", "isInfiniteCard", "getCountedHandSize",
    "getHandLimit", "toggleDraft", "removeDraftAt", "backspaceDraft",
    "canSubmit", "mulligan", "_discardCards", "_updateKnowledge",
    "_syncInfiniteCards", "drawToHandLimit"
  ]);
  const COMMON_OPENERS = Object.freeze(["CRANE", "SLATE", "TRACE", "STARE", "ARISE", "RAISE", "LEAST", "AUDIO"]);

  const CHALLENGES = Object.freeze([
    Object.freeze({
      id: "pocketTally",
      title: "Pocket Tally",
      label: "Tally",
      icon: "challenge-pocket-tally.svg",
      description: "For two guesses, feedback shows counts rather than normal tile colors."
    }),
    Object.freeze({
      id: "foggedSlot",
      title: "Fogged Slot",
      label: "Fog",
      icon: "challenge-fogged-slot.svg",
      description: "For two guesses, one feedback position is hidden by fog."
    }),
    Object.freeze({
      id: "blueHaze",
      title: "Blue Haze",
      label: "Haze",
      icon: "challenge-blue-haze.svg",
      description: "For two guesses, feedback is filtered through blue-haze rules."
    }),
    Object.freeze({
      id: "singleLie",
      title: "One Little Lie",
      label: "Lie",
      icon: "challenge-single-lie.svg",
      description: "The first feedback row contains one convincing false tile."
    }),
    Object.freeze({
      id: "lockedOpener",
      title: "Locked Opener",
      label: "Lock",
      icon: "challenge-locked-opener.svg",
      description: "Your opening turn has no mulligan escape."
    }),
    Object.freeze({
      id: "fiveGuessSprint",
      title: "Five-Guess Sprint",
      label: "Sprint",
      icon: "challenge-five-guess-sprint.svg",
      description: "Solve with one fewer guess than a normal round."
    }),
    Object.freeze({
      id: "vowelBudget",
      title: "Vowel Budget",
      label: "Vowels",
      icon: "challenge-vowel-budget.svg",
      description: "The first two guesses may use at most two vowels."
    }),
    Object.freeze({
      id: "cleanLetters",
      title: "Clean Letters",
      label: "Clean",
      icon: "challenge-clean-letters.svg",
      description: "Your opening guess must use five different letters."
    }),
    Object.freeze({
      id: "quickStart",
      title: "Quick Start",
      label: "Clock",
      icon: "challenge-quick-start.svg",
      description: "The first two guesses run on a short clock."
    })
  ]);

  const CHALLENGE_BY_ID = Object.freeze(Object.fromEntries(CHALLENGES.map(item => [item.id, item])));

  const BASE_STAGE_META = Object.freeze({
    normal: Object.freeze({ title: "Wordle", label: "Wordle", icon: "stage-normal.svg", description: "A standard Cuddle Wordle round." }),
    theme: Object.freeze({ title: "Themed Wordle", label: "Theme", icon: "stage-theme.svg", description: "A Wordle that reveals a solution category." }),
    upgrade: Object.freeze({ title: "Waystone", label: "Upgrade", icon: "stage-upgrade.svg", description: "Choose a permanent upgrade." }),
    shop: Object.freeze({ title: "Wandering Paw", label: "Shop", icon: "stage-shop.svg", description: "Spend money on run supplies." }),
    event: Object.freeze({ title: "Choice Event", label: "Event", icon: "stage-event-choice.svg", description: "Choose a safe reward or a stronger bargain with a cost." }),
    boss: Object.freeze({ title: "Boss", label: "Boss", icon: "stage-boss.svg", description: "A boss Wordle with permanent stakes." }),
    duel: Object.freeze({ title: "Word Duel", label: "Duel", icon: "stage-duel.svg", description: "Alternate guesses with an AI. The first side to solve the word wins." }),
    mystery: Object.freeze({ title: "Unknown Stop", label: "?", icon: "stage-mystery.svg", description: "This stop stays hidden until you enter it." })
  });

  const EVENTS = Object.freeze([
    Object.freeze({
      id: "firesideCache",
      title: "Fireside Cache",
      flavor: "A warm tin box sits beneath a quilted bench.",
      options: Object.freeze([
        Object.freeze({ id: "safe", title: "Take the loose coins", summary: "Gain $8 with no downside.", effects: Object.freeze([{ type: "money", amount: 8 }]) }),
        Object.freeze({ id: "bold", title: "Open the sealed compartment", summary: "Gain $24, but the next Wordle starts one guess short.", effects: Object.freeze([{ type: "money", amount: 24 }, { type: "nextPenalty", key: "guess", amount: 1 }]) })
      ])
    }),
    Object.freeze({
      id: "velvetShortcut",
      title: "Velvet Shortcut",
      flavor: "A soft path promises speed now and a bill later.",
      options: Object.freeze([
        Object.freeze({ id: "safe", title: "Follow the marked trail", summary: "Gain $7 with no downside.", effects: Object.freeze([{ type: "money", amount: 7 }]) }),
        Object.freeze({ id: "bold", title: "Cut through the velvet gate", summary: "Gain $25, but the next solved Wordle pays $0.", effects: Object.freeze([{ type: "money", amount: 25 }, { type: "nextPenalty", key: "noMoney", amount: 1 }]) })
      ])
    }),
    Object.freeze({
      id: "lanternLoan",
      title: "Lantern Loan",
      flavor: "A lantern keeper offers light against future pressure.",
      options: Object.freeze([
        Object.freeze({ id: "safe", title: "Borrow a small lantern", summary: "Gain one extra mulligan in the next Wordle.", effects: Object.freeze([{ type: "nextBonus", key: "mulligan", amount: 1 }]) }),
        Object.freeze({ id: "bold", title: "Take the keeper's purse", summary: "Gain $20, but the next boss is one guess tougher.", effects: Object.freeze([{ type: "money", amount: 20 }, { type: "bossPenalty", amount: 1 }]) })
      ])
    }),
    Object.freeze({
      id: "quietForge",
      title: "Quiet Forge",
      flavor: "A tiny forge can shape one permanent advantage.",
      options: Object.freeze([
        Object.freeze({ id: "safe", title: "Sell the spare metal", summary: "Gain $6 with no downside.", effects: Object.freeze([{ type: "money", amount: 6 }]) }),
        Object.freeze({ id: "bold", title: "Forge an upgrade", summary: "Gain a random permanent upgrade, but the next Wordle gives no normal upgrade reward.", effects: Object.freeze([{ type: "upgrade" }, { type: "nextPenalty", key: "rewards", amount: 1 }]) })
      ])
    }),
    Object.freeze({
      id: "starlitToll",
      title: "Starlit Toll",
      flavor: "A moonlit waystone responds to either patience or coin.",
      options: Object.freeze([
        Object.freeze({ id: "safe", title: "Wait for the gate", summary: "Gain one extra guess in the next Wordle.", effects: Object.freeze([{ type: "nextBonus", key: "guess", amount: 1 }]) }),
        Object.freeze({ id: "bold", title: "Pay the starlit toll", summary: "Pay $12 and gain a random permanent upgrade.", requires: Object.freeze({ money: 12 }), effects: Object.freeze([{ type: "money", amount: -12 }, { type: "upgrade" }]) })
      ])
    }),
    Object.freeze({
      id: "travellingTailor",
      title: "Travelling Tailor",
      flavor: "A tailor has letter cards tucked into every pocket.",
      options: Object.freeze([
        Object.freeze({ id: "safe", title: "Accept one sample", summary: "Draw one reward card at the start of the next Wordle.", effects: Object.freeze([{ type: "nextBonus", key: "cards", amount: 1 }]) }),
        Object.freeze({ id: "bold", title: "Take the full bundle", summary: "Draw three reward cards next Wordle, but start it with one fewer mulligan.", effects: Object.freeze([{ type: "nextBonus", key: "cards", amount: 3 }, { type: "nextPenalty", key: "mulligan", amount: 1 }]) })
      ])
    }),
    Object.freeze({
      id: "patchworkBargain",
      title: "Patchwork Bargain",
      flavor: "The seamstress can unpick one old trick to sew in a new one.",
      options: Object.freeze([
        Object.freeze({ id: "safe", title: "Take a spare patch", summary: "Draw one reward card at the start of the next Wordle.", effects: Object.freeze([{ type: "nextBonus", key: "cards", amount: 1 }]) }),
        Object.freeze({ id: "bold", title: "Trade an upgrade", summary: "Give up one reversible upgrade, gain $18, and receive a different random permanent upgrade.", requires: Object.freeze({ upgrade: true }), effects: Object.freeze([{ type: "surrenderUpgrade" }, { type: "money", amount: 18 }, { type: "upgrade" }]) })
      ])
    }),
    Object.freeze({
      id: "bridgeKeeper",
      title: "Bridge Keeper",
      flavor: "The keeper values a sure fee, but values old magic more.",
      options: Object.freeze([
        Object.freeze({ id: "safe", title: "Take the travel stipend", summary: "Gain $9 with no downside.", effects: Object.freeze([{ type: "money", amount: 9 }]) }),
        Object.freeze({ id: "bold", title: "Sell an old technique", summary: "Give up one reversible upgrade and gain $30.", requires: Object.freeze({ upgrade: true }), effects: Object.freeze([{ type: "surrenderUpgrade" }, { type: "money", amount: 30 }]) })
      ])
    }),
    Object.freeze({
      id: "honeyedCompass",
      title: "Honeyed Compass",
      flavor: "The compass can reveal a direction, or two at a price.",
      options: Object.freeze([
        Object.freeze({ id: "safe", title: "Ask for one bearing", summary: "Reveal one opening clue in the next Wordle.", effects: Object.freeze([{ type: "nextBonus", key: "clue", amount: 1 }]) }),
        Object.freeze({ id: "bold", title: "Demand the full route", summary: "Reveal two opening clues next Wordle, but the next boss is one guess tougher.", effects: Object.freeze([{ type: "nextBonus", key: "clue", amount: 2 }, { type: "bossPenalty", amount: 1 }]) })
      ])
    }),
    Object.freeze({
      id: "wrappedParcel",
      title: "Wrapped Parcel",
      flavor: "Nobody remembers who left the parcel here.",
      options: Object.freeze([
        Object.freeze({ id: "open", title: "Open the parcel", summary: "Receive a random helpful reward.", effects: Object.freeze([{ type: "randomMinor" }]) })
      ])
    }),
    Object.freeze({
      id: "mysteryCrate",
      title: "Mystery Crate",
      flavor: "The small drawer is free; the locked drawer asks for coin.",
      options: Object.freeze([
        Object.freeze({ id: "safe", title: "Take the visible coins", summary: "Gain $5 with no downside.", effects: Object.freeze([{ type: "money", amount: 5 }]) }),
        Object.freeze({ id: "bold", title: "Pay for the locked drawer", summary: "Pay $8 for a random major reward.", requires: Object.freeze({ money: 8 }), effects: Object.freeze([{ type: "money", amount: -8 }, { type: "randomMajor" }]) })
      ])
    }),
    Object.freeze({
      id: "moonlitMarket",
      title: "Moonlit Market",
      flavor: "A quiet stall sells certainty and gives samples away.",
      options: Object.freeze([
        Object.freeze({ id: "safe", title: "Take the free sample", summary: "Draw one reward card at the start of the next Wordle.", effects: Object.freeze([{ type: "nextBonus", key: "cards", amount: 1 }]) }),
        Object.freeze({ id: "bold", title: "Buy the hidden pattern", summary: "Pay $15 and gain a random permanent upgrade.", requires: Object.freeze({ money: 15 }), effects: Object.freeze([{ type: "money", amount: -15 }, { type: "upgrade" }]) })
      ])
    })
  ]);
  const EVENT_BY_ID = Object.freeze(Object.fromEntries(EVENTS.map(item => [item.id, item])));

  let installAttempts = 0;
  let legendOpen = false;
  let duelAiTimer = null;
  let scheduledAiToken = null;
  let challengeObserver = null;

  function install() {
    const Engine = window.CuddleEngine;
    const Game = Engine && Engine.CuddleGame;
    const branchExport = window.CuddleBranchMap;
    const campaignExport = window.CuddleCampaign;
    if (!Game || !branchExport || !campaignExport || !window.CuddleMoneyMode) {
      installAttempts += 1;
      if (installAttempts < 80) window.setTimeout(install, 50);
      else console.error("Cuddle Expanded Stages: required Cuddle modules were not available.");
      return;
    }

    const proto = Game.prototype;
    if (proto[INSTALL_MARK]) return;
    Object.defineProperty(proto, INSTALL_MARK, { value: VERSION });

    const originalStartNew = proto.startNew;
    const originalHydrateState = proto._hydrateState;
    const originalEnterBranchNode = proto.enterBranchNode;
    const originalBeginRound = proto._beginRound;
    const originalRenderMapScreen = branchExport.renderMapScreen;
    const originalAfterRender = campaignExport.afterRender;
    const originalHandleUiAction = campaignExport.handleUiAction;

    function safeSave(game) {
      try { if (game && typeof game.save === "function") game.save(); }
      catch (error) { console.warn("Cuddle Expanded Stages: save failed.", error); }
    }

    function requestRender(game) {
      safeSave(game);
      try {
        window.dispatchEvent(new CustomEvent("cuddle:campaign-update", {
          detail: { runId: game && game.state ? game.state.runId : null }
        }));
      } catch (_error) {}
    }

    function escapeHtml(value) {
      return String(value == null ? "" : value).replace(/[&<>"']/g, character => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;"
      })[character]);
    }

    function integer(value, fallback = 0) {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
    }

    function hashText(value) {
      let hash = 2166136261;
      for (const character of String(value || "")) {
        hash ^= character.charCodeAt(0);
        hash = Math.imul(hash, 16777619);
      }
      return hash >>> 0;
    }

    function seededRandom(seedText) {
      let value = hashText(seedText) || 0x6d2b79f5;
      return function nextSeededValue() {
        value += 0x6d2b79f5;
        let output = value;
        output = Math.imul(output ^ (output >>> 15), output | 1);
        output ^= output + Math.imul(output ^ (output >>> 7), output | 61);
        return ((output ^ (output >>> 14)) >>> 0) / 4294967296;
      };
    }

    function randomFor(game) {
      try { return typeof game.random === "function" ? game.random() : Math.random(); }
      catch (_error) { return Math.random(); }
    }

    function shuffled(items, random) {
      const copy = items.slice();
      const rng = typeof random === "function" ? random : Math.random;
      for (let index = copy.length - 1; index > 0; index -= 1) {
        const target = Math.floor(rng() * (index + 1));
        [copy[index], copy[target]] = [copy[target], copy[index]];
      }
      return copy;
    }

    function ensureMap(game) {
      const state = game && game.state;
      if (!state) return null;
      if (!state.branchMap || typeof state.branchMap !== "object") {
        state.branchMap = { rows: [], position: null, visited: [], roundsPlayed: 0, bossPenalty: 0, pendingPenalty: null };
      }
      const map = state.branchMap;
      if (!Array.isArray(map.rows)) map.rows = [];
      if (!Array.isArray(map.visited)) map.visited = [];
      if (!Number.isFinite(Number(map.bossPenalty))) map.bossPenalty = 0;
      return map;
    }

    function mapHasProgress(map) {
      return Boolean(map && (map.position || (Array.isArray(map.visited) && map.visited.length)));
    }

    function nodeAt(map, row, col) {
      return map && map.rows && map.rows[row] && map.rows[row].nodes
        ? map.rows[row].nodes[col] || null
        : null;
    }

    function parseNodeId(nodeId) {
      const parts = String(nodeId || "").split(":");
      return { row: integer(parts[0], -1), col: integer(parts[1], -1) };
    }

    function currentNode(map) {
      return map && map.position ? nodeAt(map, integer(map.position.row, -1), integer(map.position.col, -1)) : null;
    }

    function reachableNodes(map) {
      if (!map || !Array.isArray(map.rows) || !map.rows.length) return [];
      if (!map.position) return (map.rows[0].nodes || []).slice();
      const here = currentNode(map);
      const nextRow = map.rows[integer(map.position.row, -1) + 1];
      if (!here || !nextRow) return [];
      return (here.next || []).map(col => nextRow.nodes[col]).filter(Boolean);
    }

    function isReachable(map, node) {
      return reachableNodes(map).some(candidate => candidate.row === node.row && candidate.col === node.col);
    }

    function visitNode(map, node) {
      map.position = { row: node.row, col: node.col };
      if (!Array.isArray(map.visited)) map.visited = [];
      if (!map.visited.some(entry => entry.row === node.row && entry.col === node.col)) {
        map.visited.push({ row: node.row, col: node.col, type: node.type });
      }
    }

    function reindexRows(map) {
      (map.rows || []).forEach((row, rowIndex) => {
        row.nodes = Array.isArray(row.nodes) ? row.nodes : [];
        row.nodes.forEach((node, col) => {
          node.row = rowIndex;
          node.col = col;
          node.next = Array.isArray(node.next) ? node.next.filter(value => Number.isInteger(value)) : [];
        });
      });
    }

    function challengeDefinition(game, challengeId) {
      const catalog = window.CuddleMoneyMode && Array.isArray(window.CuddleMoneyMode.challenges)
        ? window.CuddleMoneyMode.challenges
        : [];
      return catalog.find(item => item && item.id === challengeId) || null;
    }

    function addDuelRows(game, map, rng) {
      if (map.expandedDuelRowsInserted || mapHasProgress(map) || map.rows.length < 6) return false;
      const originalLength = map.rows.length;
      const count = rng() < 0.5 ? 1 : 2;
      const early = [];
      const late = [];
      for (let insertion = 2; insertion <= originalLength - 2; insertion += 1) {
        if (insertion <= Math.max(3, Math.floor(originalLength * 0.42))) early.push(insertion);
        if (insertion >= Math.min(originalLength - 3, Math.ceil(originalLength * 0.55))) late.push(insertion);
      }
      const chosen = [];
      if (early.length) chosen.push(early[Math.floor(rng() * early.length)]);
      if (count === 2 && late.length) {
        const candidates = late.filter(value => !chosen.includes(value) && Math.abs(value - chosen[0]) >= 2);
        const pool = candidates.length ? candidates : late.filter(value => !chosen.includes(value));
        if (pool.length) chosen.push(pool[Math.floor(rng() * pool.length)]);
      }
      chosen.sort((a, b) => b - a).forEach((insertion, index) => {
        const nextRow = map.rows[insertion];
        const previousRow = map.rows[insertion - 1];
        if (!nextRow || !previousRow) return;
        previousRow.nodes.forEach(node => { node.next = [0]; });
        const duelNumber = chosen.length - index;
        const duelNode = {
          row: insertion,
          col: 0,
          type: "duel",
          duelId: `${game.state.runId || "run"}:duel:${duelNumber}`,
          next: nextRow.nodes.map((_node, col) => col)
        };
        map.rows.splice(insertion, 0, { kind: "duel", act: previousRow.act, nodes: [duelNode] });
      });
      map.expandedDuelRowsInserted = true;
      map.expandedDuelCount = chosen.length;
      return Boolean(chosen.length);
    }

    function decorateChallengeNodes(game, map, rng) {
      const nodes = [];
      map.rows.forEach(row => row.nodes.forEach(node => {
        if (node.type === "challenge" || node.mysteryType === "challenge") nodes.push(node);
      }));
      const ids = shuffled(CHALLENGES.map(item => item.id), rng);
      nodes.forEach((node, index) => {
        if (!CHALLENGE_BY_ID[node.challengeId]) node.challengeId = ids[index % ids.length];
      });
    }

    function decorateEventNodes(map, rng) {
      const nodes = [];
      map.rows.forEach(row => row.nodes.forEach(node => {
        if (node.type === "event" || node.mysteryType === "event") nodes.push(node);
      }));
      const ids = shuffled(EVENTS.map(item => item.id), rng);
      nodes.forEach((node, index) => {
        if (!EVENT_BY_ID[node.expandedEventId]) node.expandedEventId = ids[index % ids.length];
      });
    }

    function addMysteryNode(map, rng) {
      const existing = map.rows.flatMap(row => row.nodes).find(node => node.type === "mystery" || node.mysteryType);
      if (existing) return;
      const positionRow = map.position ? integer(map.position.row, -1) : -1;
      const candidates = [];
      map.rows.forEach((row, rowIndex) => {
        if (rowIndex <= positionRow || rowIndex === 0) return;
        row.nodes.forEach(node => {
          if (["normal", "theme", "challenge", "event", "upgrade"].includes(node.type)) candidates.push(node);
        });
      });
      if (!candidates.length) return;
      const node = candidates[Math.floor(rng() * candidates.length)];
      node.mysteryType = node.type;
      node.mysteryRevealed = false;
      node.type = "mystery";
    }

    function prepareMap(game, allowDuelInsertion = true) {
      const map = ensureMap(game);
      if (!map || !map.rows.length) return map;
      if (!map.expandedBaseRowsRecorded) {
        map.rows.forEach((row, rowIndex) => row.nodes.forEach(node => {
          if (node.expandedBaseRow == null) node.expandedBaseRow = rowIndex;
        }));
        map.expandedBaseRowsRecorded = true;
      }
      const rng = seededRandom(`${game.state.runId || "run"}:expanded-stages`);
      decorateChallengeNodes(game, map, rng);
      decorateEventNodes(map, rng);
      addMysteryNode(map, rng);
      if (allowDuelInsertion && !mapHasProgress(map)) addDuelRows(game, map, rng);
      else if (!map.expandedDuelRowsInserted && mapHasProgress(map)) map.expandedDuelMigrationDeferred = true;
      reindexRows(map);
      map.expandedStagesVersion = VERSION;
      return map;
    }

    function metaForNode(node) {
      if (!node) return BASE_STAGE_META.normal;
      if (node.type === "mystery" && !node.mysteryRevealed) return BASE_STAGE_META.mystery;
      if (node.type === "challenge") return CHALLENGE_BY_ID[node.challengeId] || BASE_STAGE_META.normal;
      if (node.type === "boss") {
        return {
          title: node.bossTitle || "Boss",
          label: node.gate === "final" ? "Final" : "Boss",
          icon: node.gate === "final" ? "stage-final.svg" : "stage-boss.svg",
          description: node.bossDescription || BASE_STAGE_META.boss.description
        };
      }
      return BASE_STAGE_META[node.type] || BASE_STAGE_META.normal;
    }

    function revealMystery(node) {
      if (!node || node.type !== "mystery" || !node.mysteryType) return node;
      node.type = node.mysteryType;
      node.mysteryRevealed = true;
      return node;
    }

    function reversibleUpgrade(game) {
      const upgrades = game && game.state && game.state.upgrades ? game.state.upgrades : {};
      const candidates = [
        { key: "extraMulligans", amount: 1, title: "Second Thoughts" },
        { key: "mulliganSize", amount: 1, title: "Bigger Mulligan" },
        { key: "questRefreshes", amount: 1, title: "Reward Refresh" },
        { key: "questCadence", amount: 1, title: "Quest Cadence" },
        { key: "questPoints", amount: 5, title: "Quest Value" },
        { key: "handSizeBonus", amount: 1, title: "Larger Hand" },
        { key: "earlyRoundPoint", amount: 1, title: "Quick Cuddle" }
      ];
      return candidates.find(candidate => Number(upgrades[candidate.key] || 0) >= candidate.amount) || null;
    }

    function surrenderUpgrade(game, preferred) {
      const candidate = preferred && preferred.key ? preferred : reversibleUpgrade(game);
      if (!candidate) return { ok: false, message: "No reversible upgrade was available." };
      const upgrades = game.state.upgrades || {};
      if (Number(upgrades[candidate.key] || 0) < Number(candidate.amount || 1)) {
        return { ok: false, message: `${candidate.title} is no longer available to surrender.` };
      }
      upgrades[candidate.key] = Math.max(0, Number(upgrades[candidate.key] || 0) - Number(candidate.amount || 1));
      return { ok: true, message: `${candidate.title} was surrendered.` };
    }

    function grantRandomUpgrade(game) {
      if (typeof game._upgradeCatalog !== "function" || typeof game._grantUpgradeChoice !== "function") {
        return { ok: false, message: "No permanent upgrade was available." };
      }
      const catalog = shuffled((game._upgradeCatalog() || []).filter(Boolean), () => randomFor(game));
      for (const choice of catalog) {
        try {
          const result = game._grantUpgradeChoice(choice);
          if (result && result.ok) return { ok: true, message: `${choice.title || "A permanent upgrade"} acquired.` };
        } catch (_error) {}
      }
      return { ok: false, message: "Every permanent upgrade in the pool was already capped." };
    }

    function addNextBonus(map, key, amount) {
      if (!map.expandedPendingBonus || typeof map.expandedPendingBonus !== "object") map.expandedPendingBonus = {};
      map.expandedPendingBonus[key] = Number(map.expandedPendingBonus[key] || 0) + Number(amount || 0);
    }

    function addNextPenalty(map, key, amount) {
      map.pendingPenalty = Object.assign({}, map.pendingPenalty || {});
      if (key === "rewards" || key === "noMoney") map.pendingPenalty[key] = true;
      else map.pendingPenalty[key] = Number(map.pendingPenalty[key] || 0) + Number(amount || 1);
    }

    function randomMinorEffects(game) {
      const pools = [
        [{ type: "money", amount: 10 }],
        [{ type: "nextBonus", key: "guess", amount: 1 }],
        [{ type: "nextBonus", key: "mulligan", amount: 1 }],
        [{ type: "nextBonus", key: "cards", amount: 2 }],
        [{ type: "nextBonus", key: "clue", amount: 1 }]
      ];
      return pools[Math.floor(randomFor(game) * pools.length)];
    }

    function randomMajorEffects(game) {
      const pools = [
        [{ type: "money", amount: 24 }],
        [{ type: "upgrade" }],
        [{ type: "nextBonus", key: "guess", amount: 2 }, { type: "nextBonus", key: "cards", amount: 2 }],
        [{ type: "nextBonus", key: "clue", amount: 2 }],
        [{ type: "money", amount: 12 }, { type: "nextBonus", key: "mulligan", amount: 2 }]
      ];
      return pools[Math.floor(randomFor(game) * pools.length)];
    }

    function applyEffects(game, effects, context) {
      const map = ensureMap(game);
      const messages = [];
      const queue = (effects || []).slice();
      while (queue.length) {
        const effect = queue.shift();
        if (!effect || !effect.type) continue;
        switch (effect.type) {
          case "money": {
            const amount = Number(effect.amount || 0);
            game.state.score = Math.max(0, Number(game.state.score || 0) + amount);
            messages.push(amount >= 0 ? `+$${amount}.` : `Paid $${Math.abs(amount)}.`);
            break;
          }
          case "nextBonus":
            addNextBonus(map, effect.key, effect.amount || 1);
            messages.push(effect.key === "guess"
              ? `The next Wordle gains ${effect.amount || 1} guess.`
              : effect.key === "mulligan"
                ? `The next Wordle gains ${effect.amount || 1} mulligan.`
                : effect.key === "cards"
                  ? `${effect.amount || 1} reward card${Number(effect.amount || 1) === 1 ? "" : "s"} will arrive next Wordle.`
                  : `${effect.amount || 1} opening clue${Number(effect.amount || 1) === 1 ? "" : "s"} banked.`);
            break;
          case "nextPenalty":
            addNextPenalty(map, effect.key, effect.amount || 1);
            messages.push(effect.key === "guess"
              ? "The next Wordle starts one guess short."
              : effect.key === "mulligan"
                ? "The next Wordle starts one mulligan short."
                : effect.key === "rewards"
                  ? "The next Wordle gives no normal upgrade reward."
                  : "The next solved Wordle pays $0.");
            break;
          case "bossPenalty":
            map.bossPenalty = Number(map.bossPenalty || 0) + Number(effect.amount || 1);
            messages.push("The next boss is one guess tougher.");
            break;
          case "upgrade": {
            const result = grantRandomUpgrade(game);
            messages.push(result.message);
            break;
          }
          case "surrenderUpgrade": {
            const result = surrenderUpgrade(game, context && context.sacrificeUpgrade);
            messages.push(result.message);
            break;
          }
          case "randomMinor":
            queue.unshift(...randomMinorEffects(game));
            break;
          case "randomMajor":
            queue.unshift(...randomMajorEffects(game));
            break;
          default:
            break;
        }
      }
      return messages;
    }

    function eventAvailability(game, option, eventState) {
      if (!option || !option.requires) return { ok: true, reason: "" };
      if (Number(option.requires.money || 0) > Number(game.state.score || 0)) {
        return { ok: false, reason: `Needs $${option.requires.money}.` };
      }
      if (option.requires.upgrade && !(eventState && eventState.sacrificeUpgrade)) {
        return { ok: false, reason: "No reversible upgrade is available." };
      }
      return { ok: true, reason: "" };
    }

    function openExpandedEvent(game, node) {
      const map = ensureMap(game);
      visitNode(map, node);
      const definition = EVENT_BY_ID[node.expandedEventId] || EVENTS[0];
      map.expandedEvent = {
        nodeId: `${node.row}:${node.col}`,
        eventId: definition.id,
        sacrificeUpgrade: reversibleUpgrade(game)
      };
      game.state.status = MAP_STATUS;
      game.state.lastMessage = `${definition.title}: choose how much risk to take.`;
      safeSave(game);
      return { ok: true };
    }

    function chooseExpandedEvent(game, optionId) {
      const map = ensureMap(game);
      const eventState = map && map.expandedEvent;
      const definition = eventState && EVENT_BY_ID[eventState.eventId];
      const option = definition && definition.options.find(item => item.id === optionId);
      if (!definition || !option) return { ok: false, error: "That event choice is no longer available." };
      const availability = eventAvailability(game, option, eventState);
      if (!availability.ok) return { ok: false, error: availability.reason };
      const messages = applyEffects(game, option.effects, eventState);
      map.expandedEvent = null;
      game.state.status = MAP_STATUS;
      game.state.lastMessage = `${definition.title} - ${option.title}: ${messages.join(" ")}`;
      safeSave(game);
      return { ok: true, message: game.state.lastMessage };
    }

    function forceSpecificChallenge(game, node) {
      const mode = game.state && game.state.cuddleMoneyMode;
      const definition = node && challengeDefinition(game, node.challengeId);
      if (!mode || !definition || game.state.status !== "playing") return;
      const config = window.CuddleMoneyMode.config || {};
      const difficulty = String(game.state.megaState && game.state.megaState.difficulty || "hard");
      const rewardPerRound = integer(config.rewardPerCompletedRound, 2);
      const difficultyBonuses = config.difficultyRewardBonus || {};
      const reward = Math.max(1,
        integer(definition.baseReward, 8)
        + Math.max(0, integer(game.state.round, 1) - 1) * rewardPerRound
        + integer(difficultyBonuses[difficulty], difficulty === "hard" ? 4 : difficulty === "medium" ? 2 : 0)
      );
      mode.challengeOffer = Object.assign({}, definition, {
        reward,
        offeredRound: game.state.round,
        hiddenIndex: Math.floor(randomFor(game) * 5),
        fakeIndex: Math.floor(randomFor(game) * 5),
        expandedStage: true
      });
      mode.activeChallenge = null;
      mode.noOfferStreak = 0;
      mode.recentChallengeIds = (Array.isArray(mode.recentChallengeIds) ? mode.recentChallengeIds : [])
        .concat(definition.id).slice(-3);
      safeSave(game);
    }

    function clearIncidentalChallenge(game, node) {
      if (!node || node.type === "challenge") return;
      const mode = game.state && game.state.cuddleMoneyMode;
      if (mode && mode.challengeOffer && !mode.challengeOffer.expandedStage) mode.challengeOffer = null;
    }

    function duelSacrifices(game) {
      const upgrade = reversibleUpgrade(game);
      return [
        { id: "pay", title: "Pay $10", description: "Start Easy after paying $10.", enabled: Number(game.state.score || 0) >= 10, upgrade: null },
        { id: "nextGuess", title: "Borrow a guess", description: "Start Easy, but the next normal Wordle begins one guess short.", enabled: true, upgrade: null },
        { id: "boss", title: "Strengthen the boss", description: "Start Easy, but the next boss is one guess tougher.", enabled: true, upgrade: null },
        { id: "upgrade", title: upgrade ? `Give up ${upgrade.title}` : "Give up an upgrade", description: upgrade ? `Surrender one level of ${upgrade.title}.` : "No reversible upgrade is available.", enabled: Boolean(upgrade), upgrade }
      ];
    }

    function cloneForDuel(value, fallback) {
      try { return JSON.parse(JSON.stringify(value)); }
      catch (_error) { return fallback; }
    }

    function assertDuelTileCapabilities(game) {
      const missing = DUEL_TILE_METHODS.filter(name => typeof game?.[name] !== "function");
      if (missing.length) {
        throw new Error(`This Cuddle build is missing Duel tile support: ${missing.join(", ")}.`);
      }
      if (!game.guessSet || typeof game.guessSet.has !== "function") {
        throw new Error("The Cuddle guess dictionary is unavailable.");
      }
    }

    function withDuelTileState(game, duel, callback) {
      if (!game || !duel || !duel.tileState) throw new Error("The Duel tile hand is unavailable.");
      const campaignState = game.state;
      const campaignStorage = game.storage;
      game.state = duel.tileState;
      game.storage = null;
      try {
        return callback(game.state);
      } finally {
        duel.tileState = game.state;
        game.state = campaignState;
        game.storage = campaignStorage;
      }
    }

    function buildDuelTileState(game, duel) {
      const campaign = game.state || {};
      const state = cloneForDuel(campaign, {}) || {};
      // The Duel is a self-contained Cuddle round. Permanent run upgrades and
      // removed letters carry in; normal-round quests, bosses, temporary buffs,
      // route state, and one-use bonuses stay outside it.
      delete state.branchMap;
      state.runId = `${campaign.runId || "run"}:duel:${duel.id || "duel"}`;
      state.serial = 0;
      state.status = "playing";
      state.round = Math.max(1, integer(campaign.round, 1));
      state.roundScore = 0;
      state.secret = duel.secret;
      state.usedSecrets = [duel.secret];
      state.removedLetters = Array.isArray(campaign.removedLetters) ? campaign.removedLetters.slice() : [];
      state.deck = [];
      state.discard = [];
      state.hand = [];
      state.draft = [];
      state.history = [];
      state.guessesUsed = 0;
      state.maxGuesses = Number.MAX_SAFE_INTEGER;
      state.mulligansLeft = 0;
      state.knownAbsent = [];
      state.knownPresent = [];
      state.unknownGlyphs = [];
      state.mysteryGlyphKinds = {};
      state.infiniteGlyphs = [];
      state.revealedPositions = Array(5).fill(null);
      state.activeQuest = null;
      state.activeQuests = [];
      state.questRewardChoices = [];
      state.questRewardRefreshesLeft = 0;
      state.questRewardPicksRemaining = 1;
      state.pendingRoundEnd = null;
      state.boss = null;
      state.bossOffer = [];
      state.upgradeChoices = [];
      state.upgradePhase = null;
      state.upgradeMilestone = null;
      state.deferredRewards = [];
      state.pendingPositionPeek = false;
      state.pendingRewardEcho = false;
      state.suggestedWord = null;
      state.failureReason = null;
      state.lastRoundSummary = null;
      state.buffs = { greyShield: 0, sillyWord: 0 };
      state.upgrades = cloneForDuel(campaign.upgrades || {}, {}) || {};
      state.cuddleBonuses = cloneForDuel(campaign.cuddleBonuses || {}, {}) || {};
      state.cuddleMoneyMode = Object.assign({}, cloneForDuel(campaign.cuddleMoneyMode || {}, {}) || {}, {
        activeChallenge: null,
        challengeOffer: null,
        pendingPayout: null
      });
      state.megaState = Object.assign({}, cloneForDuel(campaign.megaState || {}, {}) || {}, {
        startPicksRemaining: 0,
        suppressAdvance: false,
        extraGuesses: 0,
        ratchetDebuffs: [],
        activeQuests: [],
        pendingExtraQuestRewards: [],
        questPersistsForRound: false,
        handSizePenaltyThisRound: 0,
        extraGuessTrialPunishPending: false,
        questEndurancePunishPending: false,
        ratchetForcedQuestGuessIndex: null,
        presetWords: null,
        // One-use and per-round joker rewards stay with ordinary Wordle stages.
        // The Duel still uses the complete core hand/deck/mulligan mechanics.
        jokerCharges: 0,
        jokerPerRoundBonus: 0
      });
      return state;
    }

    function ensureDuelTileState(game, duel) {
      assertDuelTileCapabilities(game);
      if (duel && duel.tileState && duel.tileState.secret === duel.secret
          && Array.isArray(duel.tileState.hand)
          && Array.isArray(duel.tileState.draft) && Array.isArray(duel.tileState.history)) {
        duel.mulliganMode = Boolean(duel.mulliganMode);
        duel.mulliganSelection = Array.isArray(duel.mulliganSelection) ? duel.mulliganSelection : [];
        duel.tileStateVersion = VERSION;
        return false;
      }
      if (!duel) throw new Error("No Duel is active.");
      duel.tileState = buildDuelTileState(game, duel);
      duel.tileStateVersion = VERSION;
      duel.mulliganMode = false;
      duel.mulliganSelection = [];
      duel.draft = "";
      withDuelTileState(game, duel, state => {
        game._prepareInitialHand();
        state.mulligansLeft = game.getMulliganAllowance();
        // A saved Duel created by the keyboard version may already have visible
        // guesses. Replay only their public feedback into the fresh tile hand;
        // do not invent historical card consumption.
        (duel.history || []).forEach(entry => {
          if (!entry || !entry.word || !Array.isArray(entry.feedback)) return;
          const feedback = entry.feedback.slice();
          state.history.push({
            actor: entry.actor,
            word: entry.word,
            feedback,
            shownFeedback: feedback.slice()
          });
          if (typeof game._updateKnowledge === "function") game._updateKnowledge(entry.word, feedback);
          if (typeof game._syncInfiniteCards === "function") game._syncInfiniteCards();
        });
        state.guessesUsed = state.history.length;
        if (typeof game.drawToHandLimit === "function") game.drawToHandLimit();
        state.lastMessage = "Build your Duel guess from the Cuddle tile hand.";
      });
      return true;
    }


    function normalizeDuelSelection(game, duel, state) {
      const selected = new Set(Array.isArray(duel.mulliganSelection) ? duel.mulliganSelection : []);
      const available = new Set((state.hand || []).filter(card => (
        card && !game.isInfiniteCard(card) && !(state.draft || []).includes(card.id)
      )).map(card => card.id));
      const normalized = [...selected].filter(id => available.has(id));
      duel.mulliganSelection = normalized;
      return new Set(normalized);
    }

    function sourceRank(source) {
      return source === "infinite" ? 0 : source === "reward" ? 1 : 2;
    }

    function cardsForDuelGlyph(game, state, glyph) {
      return (state.hand || []).filter(card => card && card.glyph === glyph)
        .slice()
        .sort((left, right) => sourceRank(left.source) - sourceRank(right.source)
          || String(left.id).localeCompare(String(right.id)));
    }

    function requirePlayerDuel(game) {
      const duel = ensureMap(game).expandedDuel;
      if (!duel || duel.phase !== "playing" || duel.turn !== "player") {
        return { ok: false, error: "It is not your turn." };
      }
      try {
        const migrated = ensureDuelTileState(game, duel);
        if (migrated) safeSave(game);
      } catch (error) {
        return { ok: false, error: error && error.message ? error.message : "The Duel tile hand could not be prepared." };
      }
      return { ok: true, duel };
    }

    function openDuel(game, node) {
      const map = ensureMap(game);
      visitNode(map, node);
      let secret = "";
      try { secret = typeof game._pickSecret === "function" ? game._pickSecret() : ""; }
      catch (_error) { secret = game.secrets[Math.floor(randomFor(game) * game.secrets.length)] || ""; }
      if (!secret) return { ok: false, error: "No Duel secret was available." };
      if (!Array.isArray(game.state.usedSecrets)) game.state.usedSecrets = [];
      game.state.usedSecrets.push(secret);
      map.expandedDuel = {
        id: node.duelId || `${game.state.runId || "run"}:${node.row}:${node.col}`,
        nodeId: `${node.row}:${node.col}`,
        secret,
        phase: "choose",
        difficulty: null,
        turn: null,
        first: null,
        history: [],
        message: "Choose a Duel difficulty.",
        easySacrifices: duelSacrifices(game),
        rewardGranted: false,
        aiMoveNumber: 0,
        tileState: null,
        tileStateVersion: null,
        mulliganMode: false,
        mulliganSelection: []
      };
      game.state.status = MAP_STATUS;
      game.state.lastMessage = "A Word Duel blocks the road.";
      safeSave(game);
      return { ok: true };
    }

    function applyEasySacrifice(game, sacrificeId, duel) {
      const map = ensureMap(game);
      const sacrifice = (duel.easySacrifices || []).find(item => item.id === sacrificeId);
      if (!sacrifice || !sacrifice.enabled) return { ok: false, error: "That Easy-mode sacrifice is unavailable." };
      switch (sacrifice.id) {
        case "pay":
          if (Number(game.state.score || 0) < 10) return { ok: false, error: "Easy mode needs $10 for that option." };
          game.state.score = Math.max(0, Number(game.state.score || 0) - 10);
          return { ok: true, message: "Paid $10." };
        case "nextGuess":
          addNextPenalty(map, "guess", 1);
          return { ok: true, message: "The next normal Wordle will start one guess short." };
        case "boss":
          map.bossPenalty = Number(map.bossPenalty || 0) + 1;
          return { ok: true, message: "The next boss will be one guess tougher." };
        case "upgrade": {
          const result = surrenderUpgrade(game, sacrifice.upgrade);
          return result.ok ? result : { ok: false, error: result.message };
        }
        default:
          return { ok: false, error: "Unknown Easy-mode sacrifice." };
      }
    }

    function startDuel(game, payload) {
      const map = ensureMap(game);
      const duel = map && map.expandedDuel;
      if (!duel || duel.phase !== "choose") return { ok: false, error: "No Duel is waiting for a difficulty choice." };
      const parts = String(payload || "").split(":");
      const difficulty = parts[0];
      if (difficulty !== "easy" && !new Set(["medium", "hard"]).has(difficulty)) {
        return { ok: false, error: "Choose Easy, Medium, or Hard." };
      }
      try {
        assertDuelTileCapabilities(game);
      } catch (error) {
        return { ok: false, error: error && error.message ? error.message : "This Cuddle build cannot run tile Duels." };
      }

      // Difficulty payment and hand setup form one transaction. A setup error
      // must never take money, a future penalty, or a permanent upgrade.
      const campaignSnapshot = cloneForDuel(game.state, null);
      let costMessage = "";
      try {
        if (difficulty === "easy") {
          const paid = applyEasySacrifice(game, parts[1], duel);
          if (!paid.ok) return paid;
          costMessage = paid.message;
        }
        duel.difficulty = difficulty;
        duel.phase = "playing";
        duel.first = randomFor(game) < 0.5 ? "player" : "ai";
        duel.turn = duel.first;
        duel.message = `${duel.first === "player" ? "You" : "The AI"} won the coin toss and ${duel.first === "player" ? "move" : "moves"} first.${costMessage ? ` ${costMessage}` : ""}`;
        ensureDuelTileState(game, duel);
      } catch (error) {
        if (campaignSnapshot) game.state = campaignSnapshot;
        else {
          duel.phase = "choose";
          duel.turn = null;
          duel.first = null;
          duel.tileState = null;
        }
        return { ok: false, error: error && error.message ? error.message : "The Duel tile hand could not be prepared." };
      }
      safeSave(game);
      return { ok: true };
    }

    function feedbackKey(feedback) {
      return (feedback || []).map(value => value === "green" ? "2" : value === "yellow" ? "1" : "0").join("");
    }

    function consistentWithVisibleHistory(candidate, history) {
      return (history || []).every(entry => {
        if (!entry || !entry.word || !Array.isArray(entry.feedback)) return true;
        return feedbackKey(Engine.evaluateFeedback(candidate, entry.word)) === feedbackKey(entry.feedback);
      });
    }

    function unguessedLegalWords(game, duel) {
      const used = new Set((duel.history || []).map(entry => entry.word));
      return Array.from(game.guessSet || []).filter(word => /^[A-Z]{5}$/.test(word) && !used.has(word));
    }

    function visibleCandidates(game, duel) {
      const used = new Set((duel.history || []).map(entry => entry.word));
      return (game.secrets || []).filter(word => /^[A-Z]{5}$/.test(word)
        && !used.has(word)
        && consistentWithVisibleHistory(word, duel.history));
    }

    function evenlySample(items, limit) {
      if (items.length <= limit) return items.slice();
      const output = [];
      const step = items.length / limit;
      for (let index = 0; index < limit; index += 1) output.push(items[Math.floor(index * step)]);
      return output;
    }

    function mediumScore(word, candidates) {
      const positionCounts = Array.from({ length: 5 }, () => Object.create(null));
      const presenceCounts = Object.create(null);
      candidates.forEach(candidate => {
        const seen = new Set();
        candidate.split("").forEach((letter, index) => {
          positionCounts[index][letter] = Number(positionCounts[index][letter] || 0) + 1;
          if (!seen.has(letter)) presenceCounts[letter] = Number(presenceCounts[letter] || 0) + 1;
          seen.add(letter);
        });
      });
      let score = 0;
      const seen = new Set();
      word.split("").forEach((letter, index) => {
        score += Number(positionCounts[index][letter] || 0) * 1.4;
        if (!seen.has(letter)) score += Number(presenceCounts[letter] || 0);
        else score -= candidates.length * 0.18;
        seen.add(letter);
      });
      return score;
    }

    function hardPartitionScore(guess, candidateSample) {
      const buckets = new Map();
      candidateSample.forEach(secretCandidate => {
        const key = feedbackKey(Engine.evaluateFeedback(secretCandidate, guess));
        buckets.set(key, Number(buckets.get(key) || 0) + 1);
      });
      let squareSum = 0;
      let worst = 0;
      buckets.forEach(count => {
        squareSum += count * count;
        worst = Math.max(worst, count);
      });
      return squareSum / Math.max(1, candidateSample.length) + worst * 0.04;
    }

    function chooseAiWord(game, duel) {
      const candidates = visibleCandidates(game, duel);
      const legal = unguessedLegalWords(game, duel);
      const fallback = legal.length ? legal : candidates;
      if (!fallback.length) return null;
      if (candidates.length === 1) return candidates[0];

      if (duel.difficulty === "easy") {
        const pool = candidates.length && randomFor(game) < 0.82 ? candidates : fallback;
        return pool[Math.floor(randomFor(game) * pool.length)] || fallback[0];
      }

      if (duel.difficulty === "hard" && !(duel.history || []).length) {
        const opener = COMMON_OPENERS.find(word => game.guessSet.has(word) && !duel.history.some(entry => entry.word === word));
        if (opener) return opener;
      }

      if (duel.difficulty === "medium") {
        const pool = evenlySample(candidates.length ? candidates : fallback, 550);
        let best = pool[0];
        let bestScore = -Infinity;
        pool.forEach(word => {
          const score = mediumScore(word, evenlySample(candidates.length ? candidates : pool, 600));
          if (score > bestScore) { best = word; bestScore = score; }
        });
        return best;
      }

      const candidateSample = evenlySample(candidates.length ? candidates : fallback, 190);
      let guesses = evenlySample(candidates.length ? candidates : fallback, 260);
      COMMON_OPENERS.forEach(word => {
        if (game.guessSet.has(word) && !duel.history.some(entry => entry.word === word) && !guesses.includes(word)) guesses.push(word);
      });
      let best = guesses[0];
      let bestScore = Infinity;
      guesses.forEach(word => {
        const score = hardPartitionScore(word, candidateSample);
        if (score < bestScore) { best = word; bestScore = score; }
      });
      return best;
    }

    function completeDuelWin(game) {
      const map = ensureMap(game);
      const duel = map.expandedDuel;
      if (!duel || duel.rewardGranted) return;
      const messages = [];
      const reward = duel.difficulty === "hard" ? 38 : duel.difficulty === "medium" ? 18 : 10;
      game.state.score = Number(game.state.score || 0) + reward;
      messages.push(`+$${reward}.`);
      if (duel.difficulty === "hard") {
        const upgrade = grantRandomUpgrade(game);
        messages.push(upgrade.message);
      }
      duel.rewardGranted = true;
      duel.phase = "won";
      duel.turn = null;
      duel.message = `You won the Word Duel. ${messages.join(" ")}`;
      game.state.lastMessage = duel.message;
      safeSave(game);
    }

    function completeDuelLoss(game, winningWord) {
      const duel = ensureMap(game).expandedDuel;
      if (!duel) return;
      duel.phase = "lost";
      duel.turn = null;
      duel.message = `The AI solved ${winningWord}. This run is over.`;
      game.state.lastMessage = duel.message;
      safeSave(game);
    }

    function syncVisibleGuessToDuelHand(game, duel, actor, word, feedback) {
      ensureDuelTileState(game, duel);
      withDuelTileState(game, duel, state => {
        const visible = feedback.slice();
        state.history.push({ actor, word, feedback: visible, shownFeedback: visible.slice() });
        state.guessesUsed = state.history.length;
        if (typeof game._updateKnowledge === "function") game._updateKnowledge(word, visible);
        if (typeof game._syncInfiniteCards === "function") game._syncInfiniteCards();
        if (typeof game.drawToHandLimit === "function") game.drawToHandLimit();
        state.draft = [];
        state.lastMessage = duel.message;
      });
    }

    function recordDuelGuess(game, actor, word) {
      const duel = ensureMap(game).expandedDuel;
      if (!duel || duel.phase !== "playing") return { ok: false, error: "The Duel is not active." };
      const feedback = Engine.evaluateFeedback(duel.secret, word);
      const solved = word === duel.secret;
      const before = {
        turn: duel.turn,
        message: duel.message,
        phase: duel.phase,
        historyLength: duel.history.length,
        mulliganMode: duel.mulliganMode,
        mulliganSelection: Array.isArray(duel.mulliganSelection) ? duel.mulliganSelection.slice() : [],
        tileState: cloneForDuel(duel.tileState, null)
      };
      try {
        if (!solved) {
          duel.turn = actor === "player" ? "ai" : "player";
          duel.message = actor === "player"
            ? "The AI is studying the visible feedback."
            : "Your turn. Build a word from your Cuddle tiles.";
        }
        duel.history.push({ actor, word, feedback: feedback.slice() });
        syncVisibleGuessToDuelHand(game, duel, actor, word, feedback);
        duel.mulliganMode = false;
        duel.mulliganSelection = [];
        if (solved) {
          if (actor === "player") completeDuelWin(game);
          else completeDuelLoss(game, word);
        } else {
          safeSave(game);
        }
      } catch (error) {
        duel.turn = before.turn;
        duel.message = before.message;
        duel.phase = before.phase;
        duel.history.length = before.historyLength;
        duel.mulliganMode = before.mulliganMode;
        duel.mulliganSelection = before.mulliganSelection;
        if (before.tileState) duel.tileState = before.tileState;
        return { ok: false, error: error && error.message ? error.message : "The Duel hand could not learn from that guess." };
      }
      return { ok: true, solved };
    }

    function submitDuelTiles(game) {
      const ready = requirePlayerDuel(game);
      if (!ready.ok) return ready;
      const duel = ready.duel;
      if (duel.mulliganMode) return { ok: false, error: "Finish or cancel the mulligan first." };
      const tileSnapshot = cloneForDuel(duel.tileState, null);
      let word = "";
      let result;
      try {
        result = withDuelTileState(game, duel, state => {
          const validation = game.canSubmit();
          if (!validation.ok) return validation;
          word = validation.word;
          if (!/^[A-Z]{5}$/.test(word)) {
            return { ok: false, error: "Duel guesses must resolve to five ordinary letters." };
          }
          if ((duel.history || []).some(entry => entry.word === word)) {
            return { ok: false, error: `${word} was already played in this Duel.` };
          }
          // Match ordinary Cuddle consumption: a finite card used in a word
          // leaves once, even if that visible card was tapped more than once.
          const draftIds = [...new Set((state.draft || []).filter(Boolean))];
          game._discardCards(draftIds);
          state.draft = [];
          state.hand = (state.hand || []).filter(card => card && card.source !== "extra");
          return { ok: true, word };
        });
      } catch (error) {
        if (tileSnapshot) duel.tileState = tileSnapshot;
        return { ok: false, error: error && error.message ? error.message : "The Duel guess could not be submitted." };
      }
      if (!result || !result.ok) return result || { ok: false, error: "The Duel guess could not be submitted." };
      const recorded = recordDuelGuess(game, "player", word);
      if (!recorded.ok && tileSnapshot) duel.tileState = tileSnapshot;
      return recorded;
    }

    function toggleDuelCard(game, glyph) {
      const ready = requirePlayerDuel(game);
      if (!ready.ok) return ready;
      const duel = ready.duel;
      const normalized = String(glyph || "").toUpperCase();
      if (!/^[A-Z]$/.test(normalized)) return { ok: false, error: "That tile is unavailable." };
      try {
        const result = withDuelTileState(game, duel, state => {
          const cards = cardsForDuelGlyph(game, state, normalized);
          if (!cards.length) return { ok: false, error: `${normalized} is not currently in your Cuddle hand.` };
          if (duel.mulliganMode) {
            const limit = game.getMulliganLimit();
            const selected = normalizeDuelSelection(game, duel, state);
            const eligible = cards.filter(card => !game.isInfiniteCard(card) && !(state.draft || []).includes(card.id));
            const unselected = eligible.filter(card => !selected.has(card.id));
            if (unselected.length && selected.size < limit) selected.add(unselected[0].id);
            else eligible.forEach(card => selected.delete(card.id));
            duel.mulliganSelection = [...selected];
            return { ok: true };
          }
          const card = cards.find(item => game.isInfiniteCard(item)) || cards[0];
          return game.toggleDraft(card.id);
        });
        safeSave(game);
        return result;
      } catch (error) {
        return { ok: false, error: error && error.message ? error.message : "That Cuddle tile could not be selected." };
      }
    }

    function removeDuelDraftTile(game, indexValue) {
      const ready = requirePlayerDuel(game);
      if (!ready.ok) return ready;
      if (ready.duel.mulliganMode) return { ok: false, error: "Cancel the mulligan before editing the word." };
      const index = integer(indexValue, -1);
      try {
        const result = withDuelTileState(game, ready.duel, () => game.removeDraftAt(index));
        safeSave(game);
        return result;
      } catch (error) {
        return { ok: false, error: error && error.message ? error.message : "That draft tile could not be removed." };
      }
    }

    function backspaceDuelDraft(game) {
      const ready = requirePlayerDuel(game);
      if (!ready.ok) return ready;
      if (ready.duel.mulliganMode) return { ok: false, error: "Cancel the mulligan before editing the word." };
      try {
        const result = withDuelTileState(game, ready.duel, () => game.backspaceDraft());
        safeSave(game);
        return result;
      } catch (error) {
        return { ok: false, error: error && error.message ? error.message : "The last draft tile could not be removed." };
      }
    }

    function beginDuelMulligan(game) {
      const ready = requirePlayerDuel(game);
      if (!ready.ok) return ready;
      let mulligansLeft = 0;
      try {
        withDuelTileState(game, ready.duel, state => { mulligansLeft = Number(state.mulligansLeft || 0); });
      } catch (error) {
        return { ok: false, error: error && error.message ? error.message : "The Duel hand is unavailable." };
      }
      if (mulligansLeft <= 0) return { ok: false, error: "No mulligans remain in this Duel." };
      ready.duel.mulliganMode = true;
      ready.duel.mulliganSelection = [];
      ready.duel.message = "Choose finite, undrafted tiles to replace.";
      safeSave(game);
      return { ok: true };
    }

    function cancelDuelMulligan(game) {
      const ready = requirePlayerDuel(game);
      if (!ready.ok) return ready;
      ready.duel.mulliganMode = false;
      ready.duel.mulliganSelection = [];
      ready.duel.message = "Mulligan cancelled. Build your Duel guess from the Cuddle tiles.";
      safeSave(game);
      return { ok: true };
    }

    function confirmDuelMulligan(game) {
      const ready = requirePlayerDuel(game);
      if (!ready.ok) return ready;
      const duel = ready.duel;
      if (!duel.mulliganMode) return { ok: false, error: "No Duel mulligan is being selected." };
      try {
        const result = withDuelTileState(game, duel, state => {
          const selected = normalizeDuelSelection(game, duel, state);
          return game.mulligan([...selected]);
        });
        if (!result || !result.ok) return result || { ok: false, error: "The Duel mulligan failed." };
        duel.mulliganMode = false;
        duel.mulliganSelection = [];
        duel.message = `Mulligan: replaced ${result.replacements} tile${result.replacements === 1 ? "" : "s"}. Build your guess.`;
        safeSave(game);
        return result;
      } catch (error) {
        return { ok: false, error: error && error.message ? error.message : "The Duel mulligan failed." };
      }
    }

    function performAiMove(game) {
      const map = ensureMap(game);
      const duel = map && map.expandedDuel;
      if (!duel || duel.phase !== "playing" || duel.turn !== "ai") return;
      const word = chooseAiWord(game, duel);
      if (!word) {
        duel.phase = "lost";
        duel.turn = null;
        duel.message = "The Duel dictionary ran out of legal AI moves. The run cannot continue safely.";
        safeSave(game);
        requestRender(game);
        return;
      }
      duel.aiMoveNumber = Number(duel.aiMoveNumber || 0) + 1;
      const result = recordDuelGuess(game, "ai", word);
      if (!result.ok) {
        duel.aiMoveNumber = Math.max(0, Number(duel.aiMoveNumber || 1) - 1);
        duel.message = result.error || "The AI move could not be recorded.";
        safeSave(game);
      }
      requestRender(game);
    }

    function scheduleAiMove(game) {
      const duel = game && game.state && game.state.branchMap && game.state.branchMap.expandedDuel;
      if (!duel || duel.phase !== "playing" || duel.turn !== "ai") return;
      const token = `${game.state.runId}:${duel.id}:${duel.history.length}:${duel.aiMoveNumber || 0}`;
      if (scheduledAiToken === token && duelAiTimer) return;
      scheduledAiToken = token;
      if (duelAiTimer) window.clearTimeout(duelAiTimer);
      duelAiTimer = window.setTimeout(() => {
        duelAiTimer = null;
        if (scheduledAiToken !== token) return;
        scheduledAiToken = null;
        const current = game.state && game.state.branchMap && game.state.branchMap.expandedDuel;
        if (!current || current.turn !== "ai" || current.phase !== "playing") return;
        const liveToken = `${game.state.runId}:${current.id}:${current.history.length}:${current.aiMoveNumber || 0}`;
        if (liveToken !== token) return;
        performAiMove(game);
      }, 520);
    }

    function continueAfterDuel(game) {
      const map = ensureMap(game);
      const duel = map && map.expandedDuel;
      if (!duel || duel.phase !== "won") return { ok: false, error: "The Duel has not been won." };
      map.expandedDuel = null;
      game.state.status = MAP_STATUS;
      game.state.lastMessage = duel.message;
      safeSave(game);
      return { ok: true };
    }

    function endRunAfterDuel(game) {
      const map = ensureMap(game);
      const duel = map && map.expandedDuel;
      if (!duel || duel.phase !== "lost") return { ok: false, error: "The Duel has not ended the run." };
      game.state.secret = duel.secret;
      game.state.history = (duel.history || []).map(entry => ({ word: entry.word, feedback: entry.feedback, shownFeedback: entry.feedback }));
      game.state.guessesUsed = duel.history.length;
      game.state.failureReason = "Lost the Word Duel";
      game.state.status = "lost";
      game.state.lastMessage = duel.message;
      safeSave(game);
      return { ok: true };
    }

    function enterOrdinaryNode(game, node, nodeId) {
      const map = ensureMap(game);
      const actualRow = node.row;
      const baseRow = node.expandedBaseRow;
      const needsCompatibilityRow = ROUND_TYPES.has(node.type) && Number.isInteger(baseRow) && baseRow !== actualRow;
      if (needsCompatibilityRow) node.row = baseRow;
      let result;
      try {
        result = originalEnterBranchNode.call(game, nodeId);
      } finally {
        if (needsCompatibilityRow) node.row = actualRow;
      }
      if (result && result.ok && needsCompatibilityRow) {
        if (map.position && map.position.row === baseRow && map.position.col === node.col) map.position.row = actualRow;
        for (let index = map.visited.length - 1; index >= 0; index -= 1) {
          const entry = map.visited[index];
          if (entry && entry.row === baseRow && entry.col === node.col) { entry.row = actualRow; break; }
        }
      }
      if (result && result.ok) {
        if (node.type === "challenge") forceSpecificChallenge(game, node);
        else clearIncidentalChallenge(game, node);
        safeSave(game);
      }
      return result;
    }

    proto.startNew = function startNewWithExpandedStages() {
      const result = originalStartNew.apply(this, arguments);
      prepareMap(this, true);
      safeSave(this);
      return typeof this.getSnapshot === "function" ? this.getSnapshot() : result;
    };

    proto._hydrateState = function hydrateExpandedStages() {
      const result = originalHydrateState.apply(this, arguments);
      prepareMap(this, !mapHasProgress(this.state && this.state.branchMap));
      return result;
    };

    proto._beginRound = function beginRoundWithExpandedBonuses() {
      const result = originalBeginRound.apply(this, arguments);
      const map = ensureMap(this);
      const bonus = map && map.expandedPendingBonus;
      if (!bonus) return result;
      const messages = [];
      if (bonus.guess) {
        this.state.maxGuesses = Number(this.state.maxGuesses || 0) + Number(bonus.guess || 0);
        messages.push(`+${bonus.guess} guess${Number(bonus.guess) === 1 ? "" : "es"}`);
      }
      if (bonus.mulligan) {
        this.state.mulligansLeft = Number(this.state.mulligansLeft || 0) + Number(bonus.mulligan || 0);
        messages.push(`+${bonus.mulligan} mulligan${Number(bonus.mulligan) === 1 ? "" : "s"}`);
      }
      if (bonus.cards && typeof this._drawRewardCards === "function") {
        const drawn = this._drawRewardCards(Number(bonus.cards || 0));
        messages.push(`${drawn.length} reward card${drawn.length === 1 ? "" : "s"}`);
      }
      if (bonus.clue && typeof this._applyOpeningClue === "function") {
        let applied = 0;
        for (let index = 0; index < Number(bonus.clue || 0); index += 1) {
          if (this._applyOpeningClue()) applied += 1;
        }
        messages.push(`${applied} opening clue${applied === 1 ? "" : "s"}`);
      }
      map.expandedPendingBonus = null;
      if (messages.length) this.state.lastMessage = `${this.state.lastMessage || ""} Event bonus: ${messages.join(", ")}.`.trim();
      safeSave(this);
      return result;
    };

    proto.enterBranchNode = function enterBranchNodeWithExpandedStages(nodeId) {
      if (!this.state || this.state.status !== MAP_STATUS) return { ok: false, error: "The map is not open." };
      const map = prepareMap(this, false);
      const parsed = parseNodeId(nodeId);
      let node = nodeAt(map, parsed.row, parsed.col);
      if (!node) return { ok: false, error: "That stop is not on the map." };
      if (!isReachable(map, node)) return { ok: false, error: "No path leads there from here." };
      if (node.type === "mystery") {
        node = revealMystery(node);
        safeSave(this);
      }
      if (node.type === "duel") return openDuel(this, node);
      if (node.type === "event") return openExpandedEvent(this, node);
      return enterOrdinaryNode(this, node, nodeId);
    };

    function stageImage(meta, className = "umt-expanded-icon") {
      return `<img class="${className}" src="${ICON_ROOT}${escapeHtml(meta.icon)}" alt="" aria-hidden="true">`;
    }

    function renderEventScreen(game, map) {
      const eventState = map.expandedEvent;
      const definition = eventState && EVENT_BY_ID[eventState.eventId];
      if (!definition) {
        map.expandedEvent = null;
        safeSave(game);
        return originalRenderMapScreen(game);
      }
      const choices = definition.options.map(option => {
        const available = eventAvailability(game, option, eventState);
        return (
          `<button type="button" class="umt-event-choice${available.ok ? "" : " is-disabled"}" `
          + `data-cuddle-campaign-action="expanded-event-choice" data-shop-item-id="${escapeHtml(option.id)}"${available.ok ? "" : " disabled"}>`
          + `<span class="umt-event-choice-mark">${option.id === "safe" ? "SAFE" : option.id === "bold" ? "BARGAIN" : "RANDOM"}</span>`
          + `<strong>${escapeHtml(option.title)}</strong>`
          + `<small>${escapeHtml(option.summary)}</small>`
          + (available.ok ? "" : `<em>${escapeHtml(available.reason)}</em>`)
          + `</button>`
        );
      }).join("");
      return (
        `<div class="cuddle-shell umt-event-shell">`
        + `<header class="cuddle-header">`
        + `<div class="cuddle-header-side"><button class="cuddle-icon-btn" data-action="run-menu" aria-label="Cuddle menu">&larr;</button></div>`
        + `<div class="cuddle-header-title"><span class="cuddle-eyebrow">CHOICE EVENT</span><div class="cuddle-header-title-line"><h1>${escapeHtml(definition.title)}</h1><span class="cuddle-header-score">$${escapeHtml(game.state.score)}</span></div></div>`
        + `<div class="cuddle-header-side cuddle-header-side-right"></div>`
        + `</header>`
        + `<main class="umt-event-page">`
        + `<div class="umt-event-hero">${stageImage(BASE_STAGE_META.event, "umt-event-hero-icon")}<p>${escapeHtml(definition.flavor)}</p></div>`
        + `<p class="umt-event-instruction">Choose one option. Stronger rewards usually carry a real cost.</p>`
        + `<div class="umt-event-choice-grid">${choices}</div>`
        + `</main></div>`
      );
    }

    function renderDuelHistory(duel) {
      const rows = (duel.history || []).map(entry => (
        `<article class="umt-duel-row is-${escapeHtml(entry.actor)}">`
        + `<div class="umt-duel-actor">${entry.actor === "player" ? "YOU" : "AI"}</div>`
        + `<div class="umt-duel-tiles">${entry.word.split("").map((letter, index) => `<span class="umt-duel-tile is-${escapeHtml(entry.feedback[index] || "grey")}">${escapeHtml(letter)}</span>`).join("")}</div>`
        + `</article>`
      )).join("");
      const thinking = duel.phase === "playing" && duel.turn === "ai"
        ? `<article class="umt-duel-row is-ai is-thinking"><div class="umt-duel-actor">AI</div><div class="umt-duel-thinking">Thinking from visible feedback...</div></article>`
        : "";
      return rows + thinking;
    }

    function renderDuelDraft(game, state, enabled) {
      const cardById = new Map((state.hand || []).map(card => [card.id, card]));
      const tiles = Array.from({ length: 5 }, (_unused, index) => {
        const cardId = (state.draft || [])[index];
        const card = cardId ? cardById.get(cardId) : null;
        const letter = card ? card.glyph : "";
        if (!letter) return `<span class="cuddle-tile is-draft-tile umt-duel-draft-tile" aria-hidden="true"></span>`;
        return `<button type="button" class="cuddle-tile is-draft-tile is-filled umt-duel-draft-tile" data-cuddle-campaign-action="expanded-duel-remove" data-shop-item-id="${index}"${enabled ? "" : " disabled"} aria-label="Remove ${escapeHtml(letter)} from position ${index + 1}">${escapeHtml(letter)}</button>`;
      }).join("");
      return `<div class="umt-duel-draft" aria-label="Current Duel word">${tiles}</div>`;
    }

    function duelHandGroups(game, state) {
      const groups = new Map();
      (state.hand || []).forEach(card => {
        if (!card || !card.glyph) return;
        if (!groups.has(card.glyph)) groups.set(card.glyph, []);
        groups.get(card.glyph).push(card);
      });
      const sortGroups = (left, right) => {
        const leftStatus = game.getCardKnowledgeStatus(left.glyph);
        const rightStatus = game.getCardKnowledgeStatus(right.glyph);
        return (CARD_STATUS_ORDER[leftStatus] ?? 99) - (CARD_STATUS_ORDER[rightStatus] ?? 99)
          || left.glyph.localeCompare(right.glyph);
      };
      const all = [...groups.entries()].map(([glyph, cards]) => ({
        glyph,
        cards: cards.slice().sort((left, right) => sourceRank(left.source) - sourceRank(right.source)
          || String(left.id).localeCompare(String(right.id)))
      }));
      return {
        vowels: all.filter(group => VOWEL_SET.has(group.glyph)).sort(sortGroups),
        consonants: all.filter(group => !VOWEL_SET.has(group.glyph)).sort(sortGroups)
      };
    }

    function renderDuelHandCard(game, duel, state, group, enabled, selected, limit) {
      const status = game.getCardKnowledgeStatus(group.glyph);
      const infinite = group.cards.some(card => game.isInfiniteCard(card));
      const draftedCount = (state.draft || []).filter(id => group.cards.some(card => card.id === id)).length;
      const eligible = group.cards.filter(card => !game.isInfiniteCard(card) && !(state.draft || []).includes(card.id));
      const selectedCount = eligible.filter(card => selected.has(card.id)).length;
      const unselectedCount = eligible.length - selectedCount;
      const draftCount = (state.draft || []).filter(Boolean).length;
      const disabled = !enabled
        || (!duel.mulliganMode && draftCount >= 5)
        || (duel.mulliganMode && (eligible.length === 0
          || (selectedCount === 0 && (unselectedCount === 0 || selected.size >= limit))));
      const revealedPositions = Array.isArray(state.revealedPositions) ? state.revealedPositions : [];
      const positionIndex = status === "green" ? revealedPositions.indexOf(group.glyph) : -1;
      const classes = [
        "cuddle-card",
        `is-card-${status}`,
        infinite ? "is-infinite" : "",
        VOWEL_SET.has(group.glyph) ? "is-vowel" : "",
        draftedCount ? "has-drafted" : "",
        selectedCount ? "is-selected" : "",
        "umt-duel-hand-card"
      ].filter(Boolean).join(" ");
      const badge = infinite
        ? `<span class="cuddle-card-count is-infinite" aria-hidden="true">&infin;</span>`
        : group.cards.length > 1
          ? `<span class="cuddle-card-count" aria-hidden="true">${group.cards.length}</span>`
          : "";
      const position = positionIndex >= 0
        ? `<span class="cuddle-card-position" aria-hidden="true">${positionIndex + 1}</span>`
        : "";
      const modeText = duel.mulliganMode
        ? `${selectedCount} selected; ${eligible.length} finite available; limit ${limit}`
        : `${draftedCount} in the current word; reusable while visible`;
      return (
        `<button type="button" class="${classes}" data-cuddle-campaign-action="expanded-duel-card" data-shop-item-id="${escapeHtml(group.glyph)}"${disabled ? " disabled" : ""} aria-pressed="${draftedCount > 0 || selectedCount > 0 ? "true" : "false"}" aria-label="${escapeHtml(group.glyph)}: ${escapeHtml(modeText)}">`
        + `<span class="cuddle-card-letter">${escapeHtml(group.glyph)}</span>${position}${badge}</button>`
      );
    }

    function renderDuelTileHand(game, duel) {
      try {
        const migrated = ensureDuelTileState(game, duel);
        if (migrated) safeSave(game);
        return withDuelTileState(game, duel, state => {
          const playerTurn = duel.phase === "playing" && duel.turn === "player";
          const selected = normalizeDuelSelection(game, duel, state);
          const limit = game.getMulliganLimit();
          const submit = game.canSubmit();
          const groups = duelHandGroups(game, state);
          const vowels = groups.vowels.map(group => renderDuelHandCard(game, duel, state, group, playerTurn, selected, limit)).join("");
          const consonants = groups.consonants.map(group => renderDuelHandCard(game, duel, state, group, playerTurn, selected, limit)).join("");
          const controls = duel.mulliganMode
            ? `<div class="cuddle-submit-row is-mulligan-mode"><button type="button" class="cuddle-btn cuddle-btn-primary cuddle-mulligan cuddle-mulligan-confirm" data-cuddle-campaign-action="expanded-duel-mulligan-confirm"${playerTurn && selected.size >= 1 && selected.size <= limit ? "" : " disabled"}>Confirm mulligan <span>${selected.size}/${limit} selected</span></button><button type="button" class="cuddle-btn cuddle-backspace" data-cuddle-campaign-action="expanded-duel-mulligan-cancel"${playerTurn ? "" : " disabled"} aria-label="Cancel mulligan" title="Cancel mulligan">&#215;</button></div>`
            : `<div class="cuddle-submit-row"><button type="button" class="cuddle-btn cuddle-mulligan" data-cuddle-campaign-action="expanded-duel-mulligan"${playerTurn && Number(state.mulligansLeft || 0) > 0 ? "" : " disabled"} title="Mulligan up to ${limit} finite tiles">Mulligan <span>${Number(state.mulligansLeft || 0)}</span></button><button type="button" class="cuddle-btn cuddle-btn-primary cuddle-submit" data-cuddle-campaign-action="expanded-duel-submit"${playerTurn && submit.ok ? "" : " disabled"}>Submit word</button><button type="button" class="cuddle-btn cuddle-backspace" data-cuddle-campaign-action="expanded-duel-backspace"${playerTurn && (state.draft || []).some(Boolean) ? "" : " disabled"} aria-label="Remove last tile" title="Remove last tile">&#9003;</button></div>`;
          const removed = Array.isArray(state.removedLetters) && state.removedLetters.length
            ? `<p class="cuddle-excluded-letters">Excluded this run: ${escapeHtml(state.removedLetters.join(", "))}</p>`
            : "";
          return (
            `<section class="cuddle-hand-panel umt-duel-hand-panel" aria-label="Duel Cuddle tile hand">`
            + `<div class="umt-duel-hand-heading"><strong>Your Cuddle tiles</strong><span>${game.getCountedHandSize()}/${game.getHandLimit()} counted consonants - ${Number(state.mulligansLeft || 0)} mulligan${Number(state.mulligansLeft || 0) === 1 ? "" : "s"} left</span></div>`
            + renderDuelDraft(game, state, playerTurn && !duel.mulliganMode)
            + controls
            + `<div class="cuddle-hand"><div class="cuddle-hand-row cuddle-hand-vowels" aria-label="Unlimited vowels">${vowels}</div><div class="cuddle-hand-row cuddle-hand-consonants" aria-label="Consonant hand">${consonants}</div></div>`
            + removed
            + `<p class="umt-duel-hand-note">Build exactly as in Cuddle: tap visible tiles, reuse any visible glyph within the word, mulligan finite consonants, and refill after submission. Yellow and green consonants become unlimited. The AI uses ordinary legal words and is never limited by this hand.</p>`
            + `</section>`
          );
        });
      } catch (error) {
        return `<section class="umt-duel-hand-error" role="alert">${escapeHtml(error && error.message ? error.message : "The Duel tile hand could not be rendered.")}</section>`;
      }
    }

    function renderDuelDifficulty(game, duel) {
      duel.easySacrifices = duelSacrifices(game);
      const easyCosts = duel.easySacrifices.map(item => (
        `<button type="button" class="umt-duel-cost${item.enabled ? "" : " is-disabled"}" data-cuddle-campaign-action="expanded-duel-start" data-shop-item-id="easy:${escapeHtml(item.id)}"${item.enabled ? "" : " disabled"}>`
        + `<strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.description)}</small></button>`
      )).join("");
      return (
        `<section class="umt-duel-difficulty">`
        + `<article class="umt-duel-level is-easy"><span class="umt-duel-level-tag">EASY AI</span><h2>Choose a sacrifice</h2><p>The AI plays less efficiently. Easy is never free.</p><div class="umt-duel-costs">${easyCosts}</div></article>`
        + `<button type="button" class="umt-duel-level is-medium" data-cuddle-campaign-action="expanded-duel-start" data-shop-item-id="medium"><span class="umt-duel-level-tag">MEDIUM AI</span><h2>Standard Duel</h2><p>No cost. Win to gain $18.</p></button>`
        + `<button type="button" class="umt-duel-level is-hard" data-cuddle-campaign-action="expanded-duel-start" data-shop-item-id="hard"><span class="umt-duel-level-tag">HARD AI</span><h2>Expert Duel</h2><p>A stronger solver. Win to gain $38 and a random permanent upgrade.</p></button>`
        + `</section>`
      );
    }

    function renderDuelScreen(game, map) {
      const duel = map.expandedDuel;
      const choosing = duel.phase === "choose";
      const outcome = duel.phase === "won"
        ? `<section class="umt-duel-outcome is-win"><h2>Duel won</h2><p>${escapeHtml(duel.message)}</p><p>The word was <strong>${escapeHtml(duel.secret)}</strong>.</p><button type="button" class="cuddle-btn" data-cuddle-campaign-action="expanded-duel-continue">Continue on the map</button></section>`
        : duel.phase === "lost"
          ? `<section class="umt-duel-outcome is-loss"><h2>Duel lost</h2><p>${escapeHtml(duel.message)}</p><p>The word was <strong>${escapeHtml(duel.secret)}</strong>.</p><button type="button" class="cuddle-btn" data-cuddle-campaign-action="expanded-duel-end">End this run</button></section>`
          : "";
      return (
        `<div class="cuddle-shell umt-duel-shell">`
        + `<header class="cuddle-header">`
        + `<div class="cuddle-header-side"><button class="cuddle-icon-btn" data-action="run-menu" aria-label="Cuddle menu">&larr;</button></div>`
        + `<div class="cuddle-header-title"><span class="cuddle-eyebrow">WORD DUEL</span><div class="cuddle-header-title-line"><h1>First solve wins</h1><span class="cuddle-header-score">$${escapeHtml(game.state.score)}</span></div></div>`
        + `<div class="cuddle-header-side cuddle-header-side-right"></div>`
        + `</header>`
        + `<main class="umt-duel-page">`
        + `<section class="umt-duel-intro">${stageImage(BASE_STAGE_META.duel, "umt-duel-hero-icon")}<div><p>You build each guess from a normal Cuddle tile hand. The AI enters ordinary legal words without hand restrictions.</p><p>Both sides see every feedback row. The AI solver uses only those shared rows and never receives player-only hints or tile knowledge.</p></div></section>`
        + (choosing ? renderDuelDifficulty(game, duel) : "")
        + (!choosing ? `<p class="umt-duel-message" role="status">${escapeHtml(duel.message)}</p><div class="umt-duel-history">${renderDuelHistory(duel)}</div>` : "")
        + (duel.phase === "playing" ? renderDuelTileHand(game, duel) : "")
        + outcome
        + `</main></div>`
      );
    }

    function renderLegend() {
      const standard = ["normal", "theme", "event", "upgrade", "shop", "duel", "mystery", "boss"];
      const standardRows = standard.map(type => {
        const meta = BASE_STAGE_META[type];
        return `<li>${stageImage(meta, "umt-legend-icon")}<span><strong>${escapeHtml(meta.title)}</strong><small>${escapeHtml(meta.description)}</small></span></li>`;
      }).join("");
      const challengeRows = CHALLENGES.map(meta => `<li>${stageImage(meta, "umt-legend-icon")}<span><strong>${escapeHtml(meta.title)}</strong><small>${escapeHtml(meta.description)}</small></span></li>`).join("");
      return (
        `<div class="cuddle-overlay umt-stage-legend-overlay" role="dialog" aria-modal="true" aria-labelledby="umtStageLegendTitle">`
        + `<section class="cuddle-modal umt-stage-legend"><header><div><span class="cuddle-eyebrow">MAP KEY</span><h2 id="umtStageLegendTitle">What every stop means</h2></div><button type="button" class="umt-legend-close" data-cuddle-campaign-action="expanded-help-close" aria-label="Close map key">&times;</button></header>`
        + `<h3>Road stops</h3><ul>${standardRows}</ul><h3>Named challenge stops</h3><ul>${challengeRows}</ul>`
        + `</section></div>`
      );
    }

    function renderMapWithExpandedStages(game) {
      const map = prepareMap(game, false);
      if (map && map.expandedEvent) return renderEventScreen(game, map);
      if (map && map.expandedDuel) return renderDuelScreen(game, map);
      const html = originalRenderMapScreen(game);
      return legendOpen ? html + renderLegend() : html;
    }

    function setSvgImage(group, meta) {
      if (!group || !meta) return;
      const namespace = "http://www.w3.org/2000/svg";
      let image = group.querySelector(":scope > image.umt-stage-svg-icon");
      if (!image) {
        image = document.createElementNS(namespace, "image");
        image.setAttribute("class", "umt-stage-svg-icon");
        image.setAttribute("x", "-13");
        image.setAttribute("y", "-13");
        image.setAttribute("width", "26");
        image.setAttribute("height", "26");
        image.setAttribute("preserveAspectRatio", "xMidYMid meet");
        image.setAttribute("aria-hidden", "true");
        const label = group.querySelector(".cuddle-map-node-label");
        if (label) group.insertBefore(image, label);
        else group.appendChild(image);
      }
      const href = `${ICON_ROOT}${meta.icon}`;
      image.setAttribute("href", href);
      image.setAttributeNS("http://www.w3.org/1999/xlink", "href", href);
      const textIcon = group.querySelector(".cuddle-map-node-icon");
      if (textIcon) textIcon.setAttribute("display", "none");
      const label = group.querySelector(".cuddle-map-node-label");
      if (label) label.textContent = meta.label;
      group.setAttribute("aria-label", meta.title);
    }

    function replaceHtmlIcon(container, meta) {
      if (!container || !meta) return;
      container.replaceChildren();
      const image = document.createElement("img");
      image.className = "umt-expanded-icon";
      image.src = `${ICON_ROOT}${meta.icon}`;
      image.alt = "";
      image.setAttribute("aria-hidden", "true");
      container.appendChild(image);
    }

    function nodeFromElement(game, element) {
      const map = ensureMap(game);
      const id = element && element.getAttribute("data-shop-item-id");
      const parsed = parseNodeId(id);
      return nodeAt(map, parsed.row, parsed.col);
    }

    function decorateMapDom(root, game) {
      if (!root || !game || game.state.status !== MAP_STATUS) return;
      const map = ensureMap(game);
      if (!map || map.expandedEvent || map.expandedDuel) return;
      const flatNodes = map.rows.flatMap(row => row.nodes || []);
      root.querySelectorAll(".cuddle-branch-map-svg g.cuddle-map-node").forEach((group, index) => {
        const node = nodeFromElement(game, group) || flatNodes[index];
        if (node) setSvgImage(group, metaForNode(node));
      });
      root.querySelectorAll(".cuddle-branch-choice").forEach(button => {
        const node = nodeFromElement(game, button);
        if (!node) return;
        const meta = metaForNode(node);
        replaceHtmlIcon(button.querySelector(":scope > .cuddle-choice-icon"), meta);
        const heading = button.querySelector(":scope > strong");
        if (heading) {
          const direction = /\s+\u00b7\s+(left|right|middle)$/i.exec(heading.textContent || "");
          heading.textContent = meta.title + (direction ? ` - ${direction[1]}` : "");
        }
        const description = button.querySelector(":scope > small");
        if (description) description.textContent = meta.description;
      });
      const preview = root.querySelector(".cuddle-branch-preview-overlay");
      if (preview) {
        const confirm = preview.querySelector("[data-cuddle-campaign-action='confirm-branch-node']");
        const node = nodeFromElement(game, confirm);
        if (node) {
          const meta = metaForNode(node);
          replaceHtmlIcon(preview.querySelector(".cuddle-choice-icon"), meta);
          const title = preview.querySelector("h2");
          const description = preview.querySelector("p");
          if (title) title.textContent = meta.title;
          if (description) description.textContent = meta.description;
        }
      }
      const side = root.querySelector(".cuddle-header-side-right");
      if (side && !side.querySelector("[data-cuddle-campaign-action='expanded-help-open']")) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "cuddle-icon-btn umt-stage-help";
        button.dataset.cuddleCampaignAction = "expanded-help-open";
        button.setAttribute("aria-label", "Explain map icons");
        button.title = "Map icon key";
        button.textContent = "?";
        side.prepend(button);
      }
    }

    function decorateChallengeUi(game) {
      const mode = game && game.state && game.state.cuddleMoneyMode;
      const challenge = mode && (mode.challengeOffer || mode.activeChallenge);
      if (!challenge) return;
      const meta = CHALLENGE_BY_ID[challenge.id];
      if (!meta) return;
      const overlay = document.getElementById("cuddleMoneyChallengeOverlay");
      if (overlay) {
        replaceHtmlIcon(overlay.querySelector(".cuddle-money-offer-icon"), meta);
        const kicker = overlay.querySelector(".cuddle-money-kicker");
        if (kicker) kicker.textContent = `${meta.title.toUpperCase()} STAGE`;
        const title = overlay.querySelector("#cuddleMoneyChallengeTitle");
        if (title) title.textContent = meta.title;
      }
      const banner = document.getElementById("cuddleMoneyChallengeBanner");
      if (banner) {
        let image = banner.querySelector(".umt-active-challenge-icon");
        if (!image) {
          image = document.createElement("img");
          image.className = "umt-active-challenge-icon";
          image.alt = "";
          image.setAttribute("aria-hidden", "true");
          banner.prepend(image);
        }
        image.src = `${ICON_ROOT}${meta.icon}`;
      }
    }

    function installChallengeObserver(game) {
      if (challengeObserver || typeof MutationObserver !== "function") return;
      const root = document.getElementById("cuddleRoot");
      if (!root) return;
      challengeObserver = new MutationObserver(() => {
        const active = window.CuddleMoneyMode && window.CuddleMoneyMode.getActiveGame
          ? window.CuddleMoneyMode.getActiveGame()
          : game;
        decorateChallengeUi(active || game);
      });
      challengeObserver.observe(root, { childList: true, subtree: true });
    }

    function handleExpandedAction(game, action, itemId) {
      switch (action) {
        case "expanded-help-open":
          legendOpen = true;
          return { ok: true };
        case "expanded-help-close":
          legendOpen = false;
          return { ok: true };
        case "expanded-event-choice":
          return chooseExpandedEvent(game, itemId);
        case "expanded-duel-start":
          return startDuel(game, itemId);
        case "expanded-duel-card":
          return toggleDuelCard(game, itemId);
        case "expanded-duel-remove":
          return removeDuelDraftTile(game, itemId);
        case "expanded-duel-backspace":
          return backspaceDuelDraft(game);
        case "expanded-duel-submit":
          return submitDuelTiles(game);
        case "expanded-duel-mulligan":
          return beginDuelMulligan(game);
        case "expanded-duel-mulligan-cancel":
          return cancelDuelMulligan(game);
        case "expanded-duel-mulligan-confirm":
          return confirmDuelMulligan(game);
        case "expanded-duel-continue":
          return continueAfterDuel(game);
        case "expanded-duel-end":
          return endRunAfterDuel(game);
        default:
          return null;
      }
    }

    window.CuddleBranchMap = Object.freeze(Object.assign({}, branchExport, {
      version: VERSION,
      renderMapScreen: renderMapWithExpandedStages,
      getActiveGame: branchExport.getActiveGame || (() => window.CuddleMoneyMode && window.CuddleMoneyMode.getActiveGame ? window.CuddleMoneyMode.getActiveGame() : null)
    }));

    window.CuddleCampaign = Object.freeze(Object.assign({}, campaignExport, {
      __umtCuddleExpandedStages: VERSION,
      afterRender(root, game, landing) {
        if (typeof originalAfterRender === "function") originalAfterRender(root, game, landing);
        if (!landing && game && game.state) {
          decorateMapDom(root, game);
          decorateChallengeUi(game);
          installChallengeObserver(game);
          window.requestAnimationFrame(() => decorateChallengeUi(game));
          const duel = game.state.branchMap && game.state.branchMap.expandedDuel;
          if (duel && duel.phase === "playing" && duel.turn === "ai") scheduleAiMove(game);
        }
      },
      handleUiAction(game, action, itemId) {
        const expanded = handleExpandedAction(game, action, itemId);
        if (expanded) return expanded;
        return typeof originalHandleUiAction === "function"
          ? originalHandleUiAction(game, action, itemId)
          : { ok: false, error: "Unknown campaign action." };
      }
    }));


    console.info(`Cuddle Expanded Stages ${VERSION} installed.`);
  }

  install();
}());
