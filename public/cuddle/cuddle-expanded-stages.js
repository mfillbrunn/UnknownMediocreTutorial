/* CUDDLE EXPANDED STAGES v1.3
 * Progression-scaled challenge stops, graded themes, icon legend, choice
 * events, mystery stops, and forced Duels with a Cuddle-card player hand.
 */
(function bootstrapCuddleExpandedStages() {
  "use strict";

  const VERSION = "2026.09.11.3";
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
  // "event" is deliberately excluded: row 0 sits inside every world's
  // guaranteed-wordle opening rows, so both randomized options here need to
  // actually play a round.
  const OPENING_STAGE_TYPES = Object.freeze(["theme", "normal", "challenge"]);

  const CHALLENGES = Object.freeze([
    Object.freeze({
      id: "pocketTally",
      title: "Pocket Tally",
      label: "Tally",
      icon: "challenge-pocket-tally.svg",
      description: "Opening feedback shows counts rather than normal tile colors."
    }),
    Object.freeze({
      id: "foggedSlot",
      title: "Fogged Slot",
      label: "Fog",
      icon: "challenge-fogged-slot.svg",
      description: "One position in each affected feedback row is hidden by fog."
    }),
    Object.freeze({
      id: "blueHaze",
      title: "Blue Haze",
      label: "Haze",
      icon: "challenge-blue-haze.svg",
      description: "Affected feedback is filtered through blue-haze rules."
    }),
    Object.freeze({
      id: "singleLie",
      title: "One Little Lie",
      label: "Lie",
      icon: "challenge-single-lie.svg",
      description: "Each affected feedback row contains one convincing false tile."
    }),
    Object.freeze({
      id: "lockedOpener",
      title: "Locked Opener",
      label: "Lock",
      icon: "challenge-locked-opener.svg",
      description: "Mulligans are locked during the affected opening guesses."
    }),
    Object.freeze({
      id: "fiveGuessSprint",
      title: "Guess Sprint",
      label: "Sprint",
      icon: "challenge-five-guess-sprint.svg",
      description: "Solve within the world's guess limit (6, 5 or 4) or the run is lost."
    }),
    Object.freeze({
      id: "vowelBudget",
      title: "Vowel Budget",
      label: "Vowels",
      icon: "challenge-vowel-budget.svg",
      description: "Affected opening guesses may use at most two vowels."
    }),
    Object.freeze({
      id: "cleanLetters",
      title: "Clean Letters",
      label: "Clean",
      icon: "challenge-clean-letters.svg",
      description: "Affected opening guesses must use five different letters."
    }),
    Object.freeze({
      id: "quickStart",
      title: "Quick Start",
      label: "Clock",
      icon: "challenge-quick-start.svg",
      description: "Affected opening guesses run on a short clock."
    })
  ]);

  const CHALLENGE_BY_ID = Object.freeze(Object.fromEntries(CHALLENGES.map(item => [item.id, item])));

  const BASE_STAGE_META = Object.freeze({
    normal: Object.freeze({ title: "Wordle", label: "Wordle", icon: "stage-normal.svg", description: "A standard Cuddle Wordle round." }),
    theme: Object.freeze({ title: "Themed Wordle", label: "Theme", icon: "stage-theme.svg", description: "Theme reveals scale by act: all, all but one, then one." }),
    upgrade: Object.freeze({ title: "Free Upgrade", label: "Upgrade", icon: "stage-upgrade.svg", description: "Choose a permanent upgrade." }),
    shop: Object.freeze({ title: "Wandering Paw", label: "Shop", icon: "stage-shop.svg", description: "Spend money on run supplies." }),
    event: Object.freeze({ title: "Mystery Event", label: "Event", icon: "stage-event-choice.svg", description: "Something happens on the road here. You only find out what when you arrive." }),
    boss: Object.freeze({ title: "Boss", label: "Boss", icon: "stage-boss.svg", description: "A boss Wordle with permanent stakes." }),
    duel: Object.freeze({ title: "Word Duel", label: "Duel", icon: "stage-duel.svg", description: "Alternate guesses with an AI that also builds its words from a hand of letters. The first side to solve the word wins; if the AI does, the run ends." }),
    mystery: Object.freeze({ title: "Unknown Stop", label: "?", icon: "stage-mystery.svg", description: "This stop stays hidden until you enter it." })
  });

  // Road events. Money written $[n] grows with the world (x1, x1.5, x2 --
  // see scaledMoney), so a world-three event still matters. Option ids:
  // "safe" (no downside), "bold" (a bargain with a real cost), "gamble"
  // (a coin flip, odds shown).
  const opt = (id, title, summary, effects, requires) => Object.freeze(Object.assign(
    { id, title, summary, effects: Object.freeze(effects) },
    requires ? { requires: Object.freeze(requires) } : {}
  ));
  const EVENTS = Object.freeze([
    Object.freeze({
      id: "firesideCache",
      title: "Fireside Cache",
      flavor: "A warm tin box sits beneath a quilted bench.",
      options: Object.freeze([
        opt("safe", "Take the loose coins", "Gain $[15].", [{ type: "money", amount: 15 }]),
        opt("bold", "Open the sealed compartment", "Gain $[45], but the next Wordle must be solved within the world's guess limit (6, 5 or 4) or the run ends.", [{ type: "money", amount: 45 }, { type: "nextPenalty", key: "guess", amount: 1 }])
      ])
    }),
    Object.freeze({
      id: "velvetShortcut",
      title: "Velvet Shortcut",
      flavor: "A soft path promises speed now and a bill later.",
      options: Object.freeze([
        opt("safe", "Follow the marked trail", "Gain $[10] and one opening clue in the next Wordle.", [{ type: "money", amount: 10 }, { type: "nextBonus", key: "clue", amount: 1 }]),
        opt("bold", "Cut through the velvet gate", "Gain a random **Rare** upgrade, but the next Wordle pays $0 and gives no upgrade reward.", [{ type: "upgradeTier", tier: "rare" }, { type: "nextPenalty", key: "noMoney", amount: 1 }, { type: "nextPenalty", key: "rewards", amount: 1 }])
      ])
    }),
    Object.freeze({
      id: "lanternLoan",
      title: "Lantern Loan",
      flavor: "A lantern keeper offers light against future pressure.",
      options: Object.freeze([
        opt("safe", "Borrow a small lantern", "Two extra mulligans in the next Wordle.", [{ type: "nextBonus", key: "mulligan", amount: 2 }]),
        opt("bold", "Take the keeper's purse", "Gain $[50], but the next boss is one guess tougher.", [{ type: "money", amount: 50 }, { type: "bossPenalty", amount: 1 }])
      ])
    }),
    Object.freeze({
      id: "quietForge",
      title: "Quiet Forge",
      flavor: "A tiny forge can shape one permanent advantage.",
      options: Object.freeze([
        opt("safe", "Sell the spare metal", "Gain $[14].", [{ type: "money", amount: 14 }]),
        opt("bold", "Work the forge all night", "Choose one of three **Rare** upgrades, but the next Wordle gives no upgrade reward.", [{ type: "nextPenalty", key: "rewards", amount: 1 }, { type: "pickTier", tier: "rare" }])
      ])
    }),
    Object.freeze({
      id: "travellingTailor",
      title: "Travelling Tailor",
      flavor: "A tailor has letter cards tucked into every pocket.",
      options: Object.freeze([
        opt("safe", "Accept a sample", "Gain $[8] and two reward cards at the start of the next Wordle.", [{ type: "money", amount: 8 }, { type: "nextBonus", key: "cards", amount: 2 }]),
        opt("bold", "Commission a suit", "Pay $[30] and choose one of three **Epic** upgrades.", [{ type: "money", amount: -30 }, { type: "pickTier", tier: "epic" }], { money: 30 })
      ])
    }),
    Object.freeze({
      id: "patchworkBargain",
      title: "Patchwork Bargain",
      flavor: "The seamstress can unpick one old trick to sew in a new one.",
      options: Object.freeze([
        opt("safe", "Take a spare patch", "Gain $[10] and one opening clue in the next Wordle.", [{ type: "money", amount: 10 }, { type: "nextBonus", key: "clue", amount: 1 }]),
        opt("bold", "Trade an upgrade", "Give up one upgrade (see below) for a random **Epic** upgrade.", [{ type: "surrenderUpgrade" }, { type: "upgradeTier", tier: "epic" }], { upgrade: true })
      ])
    }),
    Object.freeze({
      id: "bridgeKeeper",
      title: "Bridge Keeper",
      flavor: "The keeper values a sure fee, but values old magic more.",
      options: Object.freeze([
        opt("safe", "Take the travel stipend", "Gain $[16].", [{ type: "money", amount: 16 }]),
        opt("bold", "Sell an old technique", "Give up one upgrade (see below) and gain $[65].", [{ type: "surrenderUpgrade" }, { type: "money", amount: 65 }], { upgrade: true })
      ])
    }),
    Object.freeze({
      id: "honeyedCompass",
      title: "Honeyed Compass",
      flavor: "The compass can reveal a direction, or every direction at a price.",
      options: Object.freeze([
        opt("safe", "Ask for a bearing", "Two opening clues in the next Wordle.", [{ type: "nextBonus", key: "clue", amount: 2 }]),
        opt("bold", "Demand the full route", "Four opening clues in the next Wordle, but the next boss is one guess tougher.", [{ type: "nextBonus", key: "clue", amount: 4 }, { type: "bossPenalty", amount: 1 }])
      ])
    }),
    Object.freeze({
      id: "wrappedParcel",
      title: "Wrapped Parcel",
      flavor: "Nobody remembers who left the parcel here. Something inside is ticking.",
      options: Object.freeze([
        opt("safe", "Shake out the loose coins", "Gain $[12].", [{ type: "money", amount: 12 }]),
        opt("gamble", "Tear it open", "70%: a random **Rare** upgrade. 30%: it snaps shut and you lose $[20].", [{ type: "gamble", chance: 0.7, win: [{ type: "upgradeTier", tier: "rare" }], lose: [{ type: "money", amount: -20 }] }])
      ])
    }),
    Object.freeze({
      id: "mysteryCrate",
      title: "Mystery Crate",
      flavor: "The small drawer is free; the locked drawer asks for coin.",
      options: Object.freeze([
        opt("safe", "Take the visible coins", "Gain $[10].", [{ type: "money", amount: 10 }]),
        opt("bold", "Pay for the locked drawer", "Pay $[25] for a major prize: an **Epic** upgrade, a **Rare** upgrade and $[20], $[60], or (rarely) a **Legendary** upgrade.", [{ type: "money", amount: -25 }, { type: "randomMajor" }], { money: 25 })
      ])
    }),
    Object.freeze({
      id: "moonlitMarket",
      title: "Moonlit Market",
      flavor: "A quiet stall sells certainty and gives samples away.",
      options: Object.freeze([
        opt("safe", "Take the free samples", "Two reward cards at the start of the next Wordle and one extra mulligan.", [{ type: "nextBonus", key: "cards", amount: 2 }, { type: "nextBonus", key: "mulligan", amount: 1 }]),
        opt("bold", "Buy from the back room", "Pay $[20] and choose one of three **Rare** upgrades.", [{ type: "money", amount: -20 }, { type: "pickTier", tier: "rare" }], { money: 20 })
      ])
    }),
    Object.freeze({
      id: "cursedIdol",
      title: "Cursed Idol",
      flavor: "A golden idol hums on a mossy plinth. It wants to come with you.",
      options: Object.freeze([
        opt("safe", "Pry off a gem", "Gain $[18].", [{ type: "money", amount: 18 }]),
        opt("bold", "Take the idol", "Gain a random **Legendary** upgrade, but a curse hides feedback on one guess of every stage for the rest of the run.", [{ type: "upgradeTier", tier: "legendary" }, { type: "curse" }])
      ])
    }),
    Object.freeze({
      id: "gamblersDen",
      title: "Gambler's Den",
      flavor: "Dice clatter behind a curtain. The house always smiles.",
      options: Object.freeze([
        opt("gamble", "A friendly bet", "Stake $[15]. 50%: win $[45] back.", [{ type: "money", amount: -15 }, { type: "gamble", chance: 0.5, win: [{ type: "money", amount: 45 }], lose: [] }], { money: 15 }),
        opt("risk", "Bet it all on red", "Stake $[35]. 50%: an **Epic** upgrade and $[50] back. Lose, and the next Wordle must be solved within the guess limit.", [{ type: "money", amount: -35 }, { type: "gamble", chance: 0.5, win: [{ type: "upgradeTier", tier: "epic" }, { type: "money", amount: 50 }], lose: [{ type: "nextPenalty", key: "guess", amount: 1 }] }], { money: 35 })
      ])
    }),
    Object.freeze({
      id: "bloodMoonAltar",
      title: "Blood Moon Altar",
      flavor: "The altar takes what you've earned and gives back something stranger.",
      options: Object.freeze([
        opt("safe", "Leave an offering of coins", "Pay $[10] for two extra mulligans and one opening clue in the next Wordle.", [{ type: "money", amount: -10 }, { type: "nextBonus", key: "mulligan", amount: 2 }, { type: "nextBonus", key: "clue", amount: 1 }], { money: 10 }),
        opt("bold", "Offer your points", "Lose [60] points and choose one of three **Epic** upgrades.", [{ type: "points", amount: -60 }, { type: "pickTier", tier: "epic" }])
      ])
    }),
    Object.freeze({
      id: "wanderingScholar",
      title: "Wandering Scholar",
      flavor: "A scholar offers to cross a few letters off the list for good.",
      options: Object.freeze([
        opt("safe", "Listen to a lecture", "Two opening clues in the next Wordle.", [{ type: "nextBonus", key: "clue", amount: 2 }]),
        opt("bold", "Study through the night", "Two rare letters leave the deck and every future answer for good, but the next Wordle must be solved within the guess limit.", [{ type: "upgradeId", id: "umtCullTwo" }, { type: "nextPenalty", key: "guess", amount: 1 }])
      ])
    })
  ]);
  const EVENT_BY_ID = Object.freeze(Object.fromEntries(EVENTS.map(item => [item.id, item])));

  let installAttempts = 0;
  let legendOpen = false;
  let duelAiTimer = null;
  let scheduledAiToken = null;
  // The AI's guess being typed into its row, letter by letter, before it
  // is scored ({ token, word, typed }). Kept out of the save on purpose.
  let aiTyping = null;
  // When the player's turn last began, so the turn box flashes once per
  // turn instead of on every re-render.
  let turnFlash = { key: "", at: 0 };
  const AI_TYPE_STEP_MS = 170;
  // The Duel's rival, one per AI difficulty: introduced like a boss, and
  // its face stands in for the AI on the turn box and the result.
  const RIVALS = Object.freeze({
    easy: { name: "Pip", title: "Pip the Apprentice", line: "Still learning the letters, but eager to beat you.", robe: "#3aa76d", eyes: "#d8ffe6" },
    medium: { name: "Vex", title: "Vex the Wordsmith", line: "Quick, careful, and hungry for your answer.", robe: "#7c5cc4", eyes: "#f1e6ff" },
    hard: { name: "Grimm", title: "Grimm the Grandmaster", line: "Has never lost a Duel. Not yet.", robe: "#b8323b", eyes: "#ffd7d9" }
  });
  let rivalIntroOpen = false;
  let duelWinFx = { id: "", at: 0 };
  const DUEL_WIN_FX_MS = 3200;

  function rivalOf(duel) {
    return RIVALS[duel && duel.difficulty] || RIVALS.medium;
  }

  // A hooded rival holding a letter tile, eyes glowing out of the hood.
  function rivalSvg(rival) {
    return `<svg class="umt-rival" viewBox="0 0 24 24" aria-hidden="true">`
      + `<path d="M12 2.3c-4.7 0-7.6 3.7-7.6 8.4V22h15.2V10.7c0-4.7-2.9-8.4-7.6-8.4z" fill="${rival.robe}"/>`
      + `<path d="M12 2.3c-4.7 0-7.6 3.7-7.6 8.4V22h2.2V11c0-3.8 2.1-6.9 5.4-7.6z" fill="#000" opacity=".18"/>`
      + `<path d="M12 5.6c-3.1 0-5 2.5-5 5.5 0 3.1 2.1 5.4 5 5.4s5-2.3 5-5.4c0-3-1.9-5.5-5-5.5z" fill="#140f1f"/>`
      + `<circle class="umt-rival-eye" cx="9.9" cy="11.2" r="1.15" fill="${rival.eyes}"/>`
      + `<circle class="umt-rival-eye" cx="14.1" cy="11.2" r="1.15" fill="${rival.eyes}"/>`
      + `<rect x="8.4" y="16.6" width="7.2" height="5.4" rx="1.3" fill="#f6c956" stroke="#140f1f" stroke-width=".7"/>`
      + `<text x="12" y="20.7" text-anchor="middle" font-family="system-ui,sans-serif" font-size="4.4" font-weight="900" fill="#140f1f">?</text>`
      + `</svg>`;
  }
  const TURN_FLASH_MS = 1500;
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
    const originalCanSubmit = proto.canSubmit;
    const originalMulligan = proto.mulligan;
    const originalSubmitDraft = proto.submitDraft;
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

    function goldenMoney(escapedHtml) {
      return String(escapedHtml == null ? "" : escapedHtml).replace(
        /[+-]?\$\s?\d[\d,]*/g,
        match => `<span class="cuddle-money-figure">${match}</span>`
      );
    }

    function richText(value) {
      return goldenMoney(escapeHtml(value));
    }

    // Event money and points grow with the world: x1, x1.5, x2.
    const EVENT_WORLD_SCALE = Object.freeze([1, 1.5, 2]);
    function eventScale(game) {
      const cleared = game && game.state && Array.isArray(game.state.bossGatesDone) ? game.state.bossGatesDone.length : 0;
      return EVENT_WORLD_SCALE[Math.max(0, Math.min(EVENT_WORLD_SCALE.length - 1, cleared))];
    }
    function scaledMoney(game, amount) {
      const value = Number(amount) || 0;
      return Math.sign(value) * Math.round(Math.abs(value) * eventScale(game));
    }

    // An event's text: "$[n]" and "[n]" become the world-scaled figure, and
    // **Rare** / **Epic** / **Legendary** are tinted with their tier.
    function plainEventText(game, value) {
      return String(value || "")
        .replace(/\$\[(\d+)\]/g, (_match, amount) => `$${scaledMoney(game, Number(amount))}`)
        .replace(/\[(\d+)\]/g, (_match, amount) => String(scaledMoney(game, Number(amount))));
    }

    function eventText(game, value) {
      const text = plainEventText(game, value);
      return richText(text).replace(/\*\*(Common|Rare|Epic|Legendary)\*\*/g,
        (_match, tier) => `<b class="umt-event-tier is-${tier.toLowerCase()}">${tier}</b>`);
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

    function rowHasBoss(row) {
      return Boolean(row && (row.kind === "boss"
        || (Array.isArray(row.nodes) && row.nodes.some(node => node && node.type === "boss"))));
    }

    function progressionTier(map, nodeOrRow) {
      const rowIndex = typeof nodeOrRow === "number"
        ? integer(nodeOrRow, 0)
        : integer(nodeOrRow && nodeOrRow.row, 0);
      let bossesBefore = 0;
      for (let index = 0; index < rowIndex; index += 1) {
        if (rowHasBoss(map && map.rows ? map.rows[index] : null)) bossesBefore += 1;
      }
      return Math.max(1, Math.min(3, bossesBefore + 1));
    }

    function challengeDescription(challengeId, turns) {
      const count = Math.max(1, Math.min(3, integer(turns, 1)));
      const guessWord = count === 1 ? "guess" : "guesses";
      const descriptions = {
        pocketTally: `For the first ${count} ${guessWord}, the marked tiles show only their green and yellow counts, not which is which. The rest of the row reports normally.`,
        foggedSlot: `One marked feedback position is hidden on each of the first ${count} ${guessWord}.`,
        blueHaze: `For the first ${count} ${guessWord}, a green or yellow on the marked tiles appears blue instead.`,
        singleLie: `The marked tiles in each of the first ${count} feedback ${count === 1 ? "row lie" : "rows lie"} about their colour.`,
        lockedOpener: `Mulligans are locked until ${count === 1 ? "the first guess is" : `the first ${count} guesses are`} submitted.`,
        fiveGuessSprint: "Solve this Wordle within the world's guess limit -- 6 guesses in world one, 5 in world two, 4 in world three -- or the run is lost.",
        vowelBudget: `Each of the first ${count} ${guessWord} may contain at most two vowels.`,
        cleanLetters: `Each of the first ${count} ${guessWord} must use five different letters.`,
        quickStart: `Each of the first ${count} ${guessWord} has a 50-second clock.`
      };
      return descriptions[challengeId] || `This challenge affects the first ${count} ${guessWord}.`;
    }

    function themeDescription(tier) {
      const value = Math.max(1, Math.min(3, integer(tier, 1)));
      if (value === 1) return "Reveals every available solution theme when the round begins.";
      if (value === 2) return "Reveals every available solution theme except one when the round begins.";
      return "Reveals one solution theme when the round begins.";
    }

    function clearOpeningNodeFields(node) {
      [
        "challengeId", "expandedEventId", "mysteryType", "mysteryRevealed",
        "duelId", "gate", "bossTitle", "bossDescription", "expandedChallengeReward",
        "expandedChallengeTurns", "expandedThemeRevealTier", "expandedProgressionTier"
      ].forEach(key => { delete node[key]; });
    }

    function connectOpeningRow(row, nextRow) {
      const nextCount = nextRow && Array.isArray(nextRow.nodes) ? nextRow.nodes.length : 0;
      if (!row || !Array.isArray(row.nodes) || !nextCount) return;
      if (nextCount === 1) {
        row.nodes.forEach(node => { node.next = [0]; });
        return;
      }
      if (nextCount === 2) {
        row.nodes[0].next = [0];
        row.nodes[1].next = [1];
        return;
      }
      const middleLeft = Math.max(0, Math.floor((nextCount - 1) / 2));
      const middleRight = Math.min(nextCount - 1, Math.ceil((nextCount - 1) / 2));
      row.nodes[0].next = Array.from({ length: middleRight + 1 }, (_unused, index) => index);
      row.nodes[1].next = Array.from({ length: nextCount - middleLeft }, (_unused, index) => middleLeft + index);
    }

    function configureOpeningRow(game, map) {
      if (!map || !Array.isArray(map.rows) || map.rows.length < 2 || mapHasProgress(map)) return false;
      const row = map.rows[0];
      if (!row || !Array.isArray(row.nodes) || !row.nodes.length) return false;
      const rng = seededRandom(`${(window.CuddleSeed ? window.CuddleSeed.text(game.state) : (game.state.runId || "run"))}:opening-pair:v1`);
      // Lane-based routes (three lanes, sometimes two) already wire row 0
      // into row 1; only the stage types are randomized here.
      if (row.nodes.every(node => node && Number.isInteger(node.lane))) {
        const laneTypes = shuffled(OPENING_STAGE_TYPES, rng).slice(0, row.nodes.length);
        row.nodes.forEach((node, index) => {
          const next = Array.isArray(node.next) ? node.next.slice() : [];
          clearOpeningNodeFields(node);
          node.type = laneTypes[index % laneTypes.length];
          node.expandedBaseRow = 0;
          node.next = next;
        });
        map.expandedOpeningTypes = laneTypes.slice();
        map.expandedOpeningConfigured = VERSION;
        return true;
      }
      const types = shuffled(OPENING_STAGE_TYPES, rng).slice(0, 2);
      const template = row.nodes[0] || { row: 0, col: 0, next: [] };
      const nodes = row.nodes.slice(0, 2);
      while (nodes.length < 2) nodes.push(Object.assign({}, template));
      nodes.forEach((node, index) => {
        clearOpeningNodeFields(node);
        node.row = 0;
        node.col = index;
        node.type = types[index];
        node.expandedBaseRow = 0;
        node.next = [];
      });
      row.nodes = nodes;
      connectOpeningRow(row, map.rows[1]);
      map.expandedOpeningTypes = types.slice();
      map.expandedOpeningConfigured = VERSION;
      return true;
    }

    function annotateProgression(map) {
      if (!map || !Array.isArray(map.rows)) return;
      map.rows.forEach((row, rowIndex) => {
        const tier = progressionTier(map, rowIndex);
        (row.nodes || []).forEach(node => {
          node.expandedProgressionTier = tier;
          if (node.type === "challenge" || node.mysteryType === "challenge") {
            node.expandedChallengeTurns = tier;
          }
          if (node.type === "theme" || node.mysteryType === "theme") {
            node.expandedThemeRevealTier = tier;
          }
        });
      });
    }

    function challengeDefinition(game, challengeId) {
      const catalog = window.CuddleMoneyMode && Array.isArray(window.CuddleMoneyMode.challenges)
        ? window.CuddleMoneyMode.challenges
        : [];
      return catalog.find(item => item && item.id === challengeId) || null;
    }

    function challengeRewardFor(game, definition, turns, preview = false) {
      const config = window.CuddleMoneyMode && window.CuddleMoneyMode.config || {};
      const difficulty = String(game && game.state && game.state.megaState && game.state.megaState.difficulty || "hard");
      const rewardPerRound = integer(config.rewardPerCompletedRound, 2);
      const difficultyBonuses = config.difficultyRewardBonus || {};
      const map = ensureMap(game);
      const round = preview && map
        ? Math.max(1, integer(map.roundsPlayed, 0) + 1)
        : Math.max(1, integer(game && game.state && game.state.round, 1));
      return Math.max(1,
        integer(definition && definition.baseReward, 8)
        + Math.max(0, round - 1) * rewardPerRound
        + integer(difficultyBonuses[difficulty], difficulty === "hard" ? 4 : difficulty === "medium" ? 2 : 0)
        + (Math.max(1, Math.min(3, integer(turns, 1))) - 1) * 4
      );
    }

    // Every run has at least one Word Duel, and duels live in the later
    // worlds (2 and 3): a duel row is slotted between two ordinary rows of
    // the same world (never next to a boss), and half the time a second one
    // follows at least two rows further on.
    function addDuelRows(game, map, rng) {
      if (map.expandedDuelRowsInserted || mapHasProgress(map) || map.rows.length < 6) return false;
      const isBoss = row => Boolean(row && (row.kind === "boss" || (row.nodes || []).some(node => node && (node.type === "boss" || node.type === "final"))));
      const worldOf = index => {
        const row = map.rows[index];
        if (row && Number.isFinite(Number(row.act))) return Number(row.act);
        return map.rows.slice(0, index).filter(isBoss).length;
      };
      const slots = worldFloor => {
        const found = [];
        for (let insertion = 2; insertion <= map.rows.length - 1; insertion += 1) {
          const before = map.rows[insertion - 1];
          const after = map.rows[insertion];
          if (!before || !after || isBoss(before) || isBoss(after)) continue;
          if (before.kind === "duel" || after.kind === "duel") continue;
          if (worldOf(insertion - 1) !== worldOf(insertion) || worldOf(insertion) < worldFloor) continue;
          found.push(insertion);
        }
        return found;
      };
      let pool = slots(1);
      if (!pool.length) pool = slots(0);
      if (!pool.length) return false;
      const chosen = [pool[Math.floor(rng() * pool.length)]];
      if (rng() < 0.5) {
        const second = pool.filter(value => Math.abs(value - chosen[0]) >= 2);
        if (second.length) chosen.push(second[Math.floor(rng() * second.length)]);
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
          // Never the Shop / Free Upgrade fork before a boss: its two sides
          // have to show what they are.
          if (node.restChoice) return;
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
      configureOpeningRow(game, map);
      const rng = seededRandom(`${(window.CuddleSeed ? window.CuddleSeed.text(game.state) : (game.state.runId || "run"))}:expanded-stages`);
      decorateChallengeNodes(game, map, rng);
      decorateEventNodes(map, rng);
      addMysteryNode(map, rng);
      if (allowDuelInsertion && !mapHasProgress(map) && addDuelRows(game, map, rng)) {
        reindexRows(map);
        safeSave(game);
      }
      else if (!map.expandedDuelRowsInserted && mapHasProgress(map)) map.expandedDuelMigrationDeferred = true;
      reindexRows(map);
      annotateProgression(map);
      map.expandedStagesVersion = VERSION;
      return map;
    }

    function metaForNode(node, game) {
      if (!node) return BASE_STAGE_META.normal;
      if (node.type === "mystery" && !node.mysteryRevealed) return BASE_STAGE_META.mystery;
      if (node.type === "challenge") {
        const base = CHALLENGE_BY_ID[node.challengeId] || BASE_STAGE_META.normal;
        const turns = Math.max(1, Math.min(3, integer(node.expandedChallengeTurns || node.expandedProgressionTier, 1)));
        const definition = challengeDefinition(game, node.challengeId);
        const reward = Number(node.expandedChallengeReward || (definition ? challengeRewardFor(game, definition, turns, true) : 0));
        return Object.assign({}, base, {
          description: `${challengeDescription(node.challengeId, turns)}${reward > 0 ? ` Win for +$${reward}.` : ""}`
        });
      }
      if (node.type === "theme") {
        const tier = Math.max(1, Math.min(3, integer(node.expandedThemeRevealTier || node.expandedProgressionTier, 1)));
        return Object.assign({}, BASE_STAGE_META.theme, { description: themeDescription(tier) });
      }
      // Events stay a mystery on the map: which one it is, and what it
      // offers, only show once the player arrives (renderEventScreen).
      if (node.type === "event") return BASE_STAGE_META.event;
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

    // The stop preview on the map (cuddle-branch-map.js) reads a stop's
    // wording from here, and an event's two choices as separate options.
    window.CuddleExpandedStages = Object.freeze({
      dragDuelTile: (game, op) => dragDuelTile(game, op || {}),
      stopMeta: (node, game) => metaForNode(node, game),
      eventOptions: node => {
        const definition = node && EVENT_BY_ID[node.expandedEventId];
        return definition
          ? {
            flavor: definition.flavor,
            options: definition.options.map(option => {
              const game = window.CuddleBranchMap && typeof window.CuddleBranchMap.getActiveGame === "function"
                ? window.CuddleBranchMap.getActiveGame() : null;
              return { title: option.title, summary: plainEventText(game, option.summary).replace(/\*\*/g, "") };
            })
          }
          : null;
      }
    });

    function revealMystery(node) {
      if (!node || node.type !== "mystery" || !node.mysteryType) return node;
      node.type = node.mysteryType;
      node.mysteryRevealed = true;
      return node;
    }

    function scheduleThemeRevealPolicy(game, node) {
      const map = ensureMap(game);
      if (!map || !game.state || !game.state.secret) return;
      const tier = Math.max(1, Math.min(3, integer(
        node && (node.expandedThemeRevealTier || node.expandedProgressionTier),
        progressionTier(map, node || 0)
      )));
      map.expandedThemeRevealPolicy = {
        secret: String(game.state.secret || "").toUpperCase(),
        tier,
        attempts: 0,
        applied: tier === 3,
        withheld: ""
      };
      settleThemeRevealPolicy(game);
    }

    function settleThemeRevealPolicy(game) {
      const map = ensureMap(game);
      const policy = map && map.expandedThemeRevealPolicy;
      const campaign = game && game.state && game.state.cuddleCampaign;
      if (!policy || !campaign || policy.applied) return false;
      if (String(game.state.secret || "").toUpperCase() !== String(policy.secret || "")) {
        policy.applied = true;
        return false;
      }
      if (policy.tier === 3) {
        policy.applied = true;
        return false;
      }
      if (campaign.categoryPending) return false;
      if (campaign.noCategory) {
        policy.applied = true;
        safeSave(game);
        return true;
      }
      if (!campaign.categoryExhausted && integer(policy.attempts, 0) < 3
          && window.CuddleCampaign && typeof window.CuddleCampaign.queueCategoryReveal === "function") {
        policy.attempts = integer(policy.attempts, 0) + 1;
        window.CuddleCampaign.queueCategoryReveal(game, 8, "branch");
        safeSave(game);
        return true;
      }
      const categories = Array.isArray(campaign.revealedCategories)
        ? campaign.revealedCategories.slice()
        : [];
      if (policy.tier === 2 && categories.length > 1) {
        policy.withheld = categories.pop();
        campaign.revealedCategories = categories;
        campaign.categoryExhausted = false;
        campaign.categoryNotice = `${categories.length} themes revealed; one remains hidden.`;
      } else if (policy.tier === 1) {
        campaign.categoryNotice = categories.length
          ? `All ${categories.length} available themes revealed.`
          : campaign.categoryNotice;
      }
      policy.applied = true;
      safeSave(game);
      return true;
    }

    function reversibleUpgrade(game) {
      const upgrades = game && game.state && game.state.upgrades ? game.state.upgrades : {};
      const candidates = [
        { key: "extraMulligans", amount: 1, title: "Second Thoughts" },
        { key: "mulliganSize", amount: 1, title: "Bigger Mulligan" },
        { key: "questRefreshes", amount: 1, title: "Reward Refresh" },
        { key: "questCadence", amount: 1, title: "Quest Cadence" },
        { key: "questPoints", amount: 5, title: "Quest Value" },
        { key: "handSizeBonus", amount: 1, title: "Bigger Hand" }
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
        [{ type: "nextBonus", key: "mulligan", amount: 1 }],
        [{ type: "nextBonus", key: "cards", amount: 2 }],
        [{ type: "nextBonus", key: "clue", amount: 1 }]
      ];
      return pools[Math.floor(randomFor(game) * pools.length)];
    }

    // Mystery Crate's locked drawer: weighted, with a small Legendary shot.
    function randomMajorEffects(game) {
      const pools = [
        [35, [{ type: "upgradeTier", tier: "epic" }]],
        [30, [{ type: "upgradeTier", tier: "rare" }, { type: "money", amount: 20 }]],
        [27, [{ type: "money", amount: 60 }]],
        [8, [{ type: "upgradeTier", tier: "legendary" }]]
      ];
      let roll = randomFor(game) * pools.reduce((sum, entry) => sum + entry[0], 0);
      for (const [weight, effects] of pools) {
        roll -= weight;
        if (roll < 0) return effects;
      }
      return pools[0][1];
    }

    // A random upgrade of one tier (falling back a tier when none is left).
    function grantTierUpgrade(game, tier) {
      const api = window.CuddleEconomyRarityV8;
      if (!api || typeof api.packRewards !== "function" || typeof game._grantUpgradeChoice !== "function") {
        return grantRandomUpgrade(game);
      }
      const cards = api.packRewards(game, tier, `${game.state.runId || "run"}:${game.state.round || 0}:event:${tier}:${Math.floor(randomFor(game) * 1e9)}`) || [];
      const card = cards[cards.length - 1];
      if (!card) return grantRandomUpgrade(game);
      const { price, tier: cardTier, ...choice } = card;
      try {
        const result = game._grantUpgradeChoice(choice);
        if (result && result.ok) return { ok: true, message: `${tierLabel(cardTier)} upgrade: ${card.title}.` };
      } catch (_error) {}
      return grantRandomUpgrade(game);
    }

    // Three different upgrades of one tier, to choose from on the reward
    // screen (no refreshes), like a waystone.
    function tierChoices(game, tier) {
      const api = window.CuddleEconomyRarityV8;
      if (!api || typeof api.packRewards !== "function") return [];
      const seen = new Set();
      const choices = [];
      for (let attempt = 0; attempt < 6 && choices.length < 3; attempt += 1) {
        const cards = api.packRewards(game, tier, `${(window.CuddleSeed ? window.CuddleSeed.text(game.state) : (game.state.runId || "run"))}:${game.state.round || 0}:pick:${tier}:${attempt}`) || [];
        const card = cards[cards.length - 1];
        if (card && !seen.has(card.id)) {
          seen.add(card.id);
          const { price, ...choice } = card;
          choices.push(Object.assign(choice, { key: choice.key || choice.id }));
        }
      }
      return choices;
    }

    function tierLabel(tier) {
      const name = String(tier || "common");
      return name.charAt(0).toUpperCase() + name.slice(1);
    }

    // A permanent curse, like a beaten boss leaves: one guess of every
    // stage from now on has its feedback masked.
    const EVENT_CURSES = Object.freeze(["hiddenMargins", "countOnly", "blueMode", "arrowMode"]);
    const EVENT_CURSE_NAMES = Object.freeze({ hiddenMargins: "Hidden Tiles", countOnly: "Count Only", blueMode: "Blue Mode", arrowMode: "Arrow Signs" });
    function addEventCurse(game) {
      const mega = game.state.megaState || (game.state.megaState = {});
      if (!Array.isArray(mega.ratchetDebuffs)) mega.ratchetDebuffs = [];
      const used = new Set(mega.ratchetDebuffs.map(item => Number(item && item.guessIndex) || 0));
      const open = [1, 2, 3, 4].filter(index => !used.has(index));
      const guessIndex = open.length ? open[Math.floor(randomFor(game) * open.length)] : Math.max(4, ...used) + 1;
      const bossId = EVENT_CURSES[Math.floor(randomFor(game) * EVENT_CURSES.length)];
      const debuff = { bossId, guessIndex, source: "event" };
      if (bossId === "hiddenMargins") debuff.hiddenIndices = shuffled([0, 1, 2, 3, 4], () => randomFor(game)).slice(0, 2);
      mega.ratchetDebuffs.push(debuff);
      return `Curse: ${EVENT_CURSE_NAMES[bossId]} now haunts guess ${guessIndex} of every stage.`;
    }

    function grantUpgradeById(game, id) {
      if (typeof game._upgradeCatalog !== "function" || typeof game._grantUpgradeChoice !== "function") return null;
      const choice = (game._upgradeCatalog() || []).find(item => item && (item.id === id || item.key === id));
      if (!choice) return null;
      try {
        const result = game._grantUpgradeChoice(choice);
        return result && result.ok ? `${choice.title || "Upgrade"} acquired.` : null;
      } catch (_error) {
        return null;
      }
    }

    function applyEffects(game, effects, context = {}) {
      const map = ensureMap(game);
      const messages = [];
      const queue = (effects || []).slice();
      while (queue.length) {
        const effect = queue.shift();
        if (!effect || !effect.type) continue;
        switch (effect.type) {
          case "money": {
            const amount = scaledMoney(game, effect.amount);
            game.state.cuddleMoney = Math.max(0, Number(game.state.cuddleMoney || 0) + amount);
            messages.push(amount >= 0 ? `+$${amount}.` : `Paid $${Math.abs(amount)}.`);
            break;
          }
          case "points": {
            const amount = scaledMoney(game, effect.amount);
            game.state.score = Math.max(0, Number(game.state.score || 0) + amount);
            messages.push(amount >= 0 ? `+${amount} points.` : `Lost ${Math.abs(amount)} points.`);
            break;
          }
          case "upgradeTier":
            messages.push(grantTierUpgrade(game, effect.tier).message);
            break;
          case "upgradeId": {
            const message = grantUpgradeById(game, effect.id);
            messages.push(message || grantTierUpgrade(game, "rare").message);
            break;
          }
          case "pickTier": {
            const choices = tierChoices(game, effect.tier);
            if (choices.length) {
              context.pendingPick = { tier: effect.tier, choices };
              messages.push(`Choose one of ${choices.length} ${tierLabel(effect.tier)} upgrades.`);
            } else {
              messages.push(grantTierUpgrade(game, effect.tier).message);
            }
            break;
          }
          case "curse":
            messages.push(addEventCurse(game));
            break;
          case "gamble": {
            const won = randomFor(game) < Number(effect.chance || 0.5);
            context.gambleResult = won ? "won" : "lost";
            messages.push(won ? "The gamble paid off!" : "The gamble didn't pay off.");
            queue.unshift(...((won ? effect.win : effect.lose) || []));
            break;
          }
          case "nextBonus":
            addNextBonus(map, effect.key, effect.amount || 1);
            messages.push(effect.key === "guess"
              ? `The next Wordle gains ${effect.amount || 1} guess.`
              : effect.key === "mulligan"
                ? `The next Wordle gains ${effect.amount || 1} mulligan${Number(effect.amount || 1) === 1 ? "" : "s"}.`
                : effect.key === "cards"
                  ? `${effect.amount || 1} reward card${Number(effect.amount || 1) === 1 ? "" : "s"} will arrive next Wordle.`
                  : `${effect.amount || 1} opening clue${Number(effect.amount || 1) === 1 ? "" : "s"} banked.`);
            break;
          case "nextPenalty":
            addNextPenalty(map, effect.key, effect.amount || 1);
            messages.push(effect.key === "guess"
              ? "The next Wordle must be solved within the world's guess limit, or the run ends."
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
      const needed = scaledMoney(game, option.requires.money || 0);
      if (needed > Number(game.state.cuddleMoney || 0)) {
        return { ok: false, reason: `Needs $${needed}.` };
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
      const context = Object.assign({}, eventState);
      const messages = applyEffects(game, option.effects, context);
      map.expandedEvent = null;
      game.state.lastMessage = `${definition.title} - ${option.title}: ${messages.join(" ")}`;
      map.expandedEventResult = {
        title: definition.title,
        option: option.title,
        lines: messages,
        gamble: context.gambleResult || null,
        at: Date.now()
      };
      if (context.pendingPick) {
        // Choose-one-of-three: the reward screen, fixed like a waystone's.
        map.expandedEventResult = null;
        game.state.status = "upgrade";
        game.state.upgradePhase = "round";
        game.state.upgradeMilestone = null;
        game.state.upgradeChoices = context.pendingPick.choices;
        game.state.waystoneOffer = true;
        game.state.umtEventPick = { title: definition.title, tier: context.pendingPick.tier };
      } else {
        game.state.status = MAP_STATUS;
      }
      safeSave(game);
      return { ok: true, message: game.state.lastMessage };
    }

    function forceSpecificChallenge(game, node) {
      const mode = game.state && game.state.cuddleMoneyMode;
      const definition = node && challengeDefinition(game, node.challengeId);
      if (!mode || !definition || game.state.status !== "playing") return;
      const turns = Math.max(1, Math.min(3, integer(
        node.expandedChallengeTurns || node.expandedProgressionTier,
        progressionTier(ensureMap(game), node)
      )));
      const reward = challengeRewardFor(game, definition, turns);
      const meta = CHALLENGE_BY_ID[definition.id] || { title: definition.title || "Challenge" };
      node.expandedChallengeTurns = turns;
      node.expandedChallengeReward = reward;
      mode.challengeOffer = Object.assign({}, definition, {
        title: meta.title,
        description: challengeDescription(definition.id, turns),
        turns,
        expandedTurns: turns,
        expandedCapApplied: false,
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

    function activeExpandedChallenge(game) {
      const mode = game && game.state && game.state.cuddleMoneyMode;
      const challenge = mode && mode.activeChallenge;
      return challenge && challenge.expandedStage ? challenge : null;
    }

    function expandedChallengeTurns(challenge) {
      return Math.max(1, Math.min(3, integer(challenge && (challenge.expandedTurns || challenge.turns), 1)));
    }

    function syncExpandedChallengeRules(game) {
      const challenge = activeExpandedChallenge(game);
      if (!challenge || challenge.effect !== "guessCap" || challenge.expandedCapApplied) return false;
      // The Sprint's limit is the world's guess window (6/5/4), the same at
      // every tier -- it used to shave off more rows here, which on a normal
      // stage (no guess cap) never actually limited anything.
      if (typeof game._applyStrictGuessLimit === "function") game._applyStrictGuessLimit();
      challenge.expandedCapApplied = true;
      safeSave(game);
      return true;
    }

    function duelSacrifices(game) {
      const upgrade = reversibleUpgrade(game);
      return [
        { id: "pay", title: "Pay $10", description: "Start Easy after paying $10.", enabled: Number(game.state.cuddleMoney || 0) >= 10, upgrade: null },
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
        ratchetOrdinalsApplied: [],
        activeQuests: [],
        pendingExtraQuestRewards: [],
        questPersistsForRound: false,
        handSizePenaltyThisRound: 0,
        ratchetForcedQuestGuessIndex: null,
        presetWords: null,
        // The run's per-stage Jokers (Wild Card, Joker Cache) are dealt into
        // the Duel like any stage; banked one-use charges stay with the run.
        jokerCharges: Math.max(0, integer(campaign.megaState && campaign.megaState.jokerPerRoundBonus, 0)),
        jokerPerRoundBonus: 0
      });
      return state;
    }

    // One Joker card sits in the Duel hand at a time while charges remain,
    // exactly like an ordinary stage.
    function topUpDuelJoker(game, state) {
      const mega = state.megaState || (state.megaState = {});
      const joker = Engine.CUDDLE_JOKER_GLYPH;
      if (!joker || integer(mega.jokerCharges, 0) <= 0) return false;
      if ((state.hand || []).some(card => card && card.source === "joker")) return false;
      mega.jokerCharges = integer(mega.jokerCharges, 0) - 1;
      mega.hasJokerUnlocked = true;
      const id = typeof game._nextId === "function" ? game._nextId("joker") : `joker-${Date.now()}`;
      state.hand.push({ id, glyph: joker, source: "joker" });
      return true;
    }

    // The start-of-stage powers the run owns, applied to the Duel's own
    // hand and secret (called with game.state swapped to the Duel state).
    // Returns short notes for the status line.
    function applyDuelOpeningPowers(game, state) {
      const notes = [];
      const rebalance = window.CuddleRebalanceV5;
      const level = id => (rebalance && typeof rebalance.upgradeLevel === "function" ? integer(rebalance.upgradeLevel(game, id), 0) : 0);
      const synergies = window.CuddleSynergies;
      if (synergies && typeof synergies.owns === "function" && synergies.owns(game, "fullHouse")) {
        state.mulligansLeft = integer(state.mulligansLeft, 0) + 1;
      }
      if (integer(state.cuddleBonuses && state.cuddleBonuses.openingClue, 0) > 0 && typeof game._applyOpeningClue === "function") {
        game._applyOpeningClue();
        notes.push("Margin Note");
      }
      const coach = state.cuddleCoachExpansion || {};
      const reveals = Math.min(2, level("umtOpeningInsight")) + Math.min(4, Math.max(0, integer(coach.hintsPerRound, 0)));
      let placed = 0;
      for (let index = 0; index < reveals && typeof game._revealPositionPeek === "function"; index += 1) {
        game._revealPositionPeek();
        placed += 1;
      }
      if (placed) notes.push(`${placed} letter${placed === 1 ? "" : "s"} placed`);
      const jokers = integer(state.megaState && state.megaState.jokerCharges, 0);
      if (topUpDuelJoker(game, state)) notes.push(`${jokers} Joker${jokers === 1 ? "" : "s"}`);
      return notes;
    }

    // The player's own guess count: the quick-solve window, quests, curses
    // and the solve bonus all run on it, so the AI's rows never use up
    // the player's guesses.
    function duelPlayerGuesses(state) {
      return (state.history || []).filter(entry => entry && entry.actor !== "ai").length;
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
      // What the run had going in, so a won Duel can pay out what was
      // earned inside it (points, money tiles, interest...).
      duel.tileBase = {
        score: Number(game.state && game.state.score) || 0,
        money: Number(game.state && game.state.cuddleMoney) || 0
      };
      duel.tileStateVersion = VERSION;
      duel.mulliganMode = false;
      duel.mulliganSelection = [];
      duel.draft = "";
      withDuelTileState(game, duel, state => {
        // The same stage start every Wordle gets -- every layer's upgrades,
        // special tiles and the first quest -- with the Duel's own answer.
        const ownPick = Object.prototype.hasOwnProperty.call(game, "_pickSecret");
        const previousPick = game._pickSecret;
        game._pickSecret = () => duel.secret;
        let started = false;
        try {
          game._beginRound();
          started = true;
        } catch (error) {
          started = false;
        } finally {
          if (ownPick) game._pickSecret = previousPick;
          else delete game._pickSecret;
        }
        if (!started) {
          game._prepareInitialHand();
          state.mulligansLeft = game.getMulliganAllowance();
          if (!(duel.history || []).length) applyDuelOpeningPowers(game, state);
        }
        if (state.roundIntroPending && typeof game.dismissRoundIntro === "function") game.dismissRoundIntro();
        state.secret = duel.secret;
        state.usedSecrets = [duel.secret];
        state.status = "playing";
        // Turns alternate with the AI until someone solves: no guess limit.
        state.maxGuesses = Number.MAX_SAFE_INTEGER;
        state.strictGuessLimit = false;
        duel.powerNote = "";
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
        state.guessesUsed = duelPlayerGuesses(state);
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
          if (Number(game.state.cuddleMoney || 0) < 10) return { ok: false, error: "Easy mode needs $10 for that option." };
          game.state.cuddleMoney = Math.max(0, Number(game.state.cuddleMoney || 0) - 10);
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

    // How each AI plays. It always reads its own rows but only sometimes
    // takes the player's rows into account ("readsYourRows"). "commonWords"
    // is how often a turn sticks to everyday words (the answer list) the way
    // a person would, rather than anything in the dictionary; "smart" is how
    // often a turn uses the scoring heuristic instead of any fitting word;
    // "missesLastWord" is the chance of fumbling when one word is left; and
    // "wildGuess" is the chance of ignoring the clues altogether; and once no
    // more than "goesForIt" everyday words still fit, it plays one of them
    // instead of a probing word. Tuned by playing real duels against a bot
    // that reads every row and mulligans for missing letters: since the AI
    // also plays from a hand of letters (AI_CONSONANTS below), it wins about
    // 100% / 88% / 66% of duels (easy / medium / hard), up from 95% / 80% /
    // 60% when the AI could play any word in the dictionary.
    const AI_STYLE = Object.freeze({
      easy: Object.freeze({ readsYourRows: 0.25, commonWords: 0.3, smart: 0, missesLastWord: 0.45, wildGuess: 0.45, goesForIt: 0 }),
      medium: Object.freeze({ readsYourRows: 0.4, commonWords: 0.45, smart: 0.2, missesLastWord: 0.35, wildGuess: 0.1, goesForIt: 2 }),
      hard: Object.freeze({ readsYourRows: 0.6, commonWords: 0.5, smart: 1, missesLastWord: 0, wildGuess: 0, goesForIt: 4 })
    });

    // Words the AI never plays even though the dictionary accepts them.
    // (Anything on the answer list is left alone: the game already uses it.)
    const AI_NEVER_PLAYS = new Set((
      "TITTY BOOBS DICKS DICKY PUSSY BITCH WHORE SLUTS CUNTS FUCKS SHITS SHITE TWATS PORNO PORNY PORNS "
      + "NAZIS RAPED RAPES RAPER DILDO WANKS WANKY TURDS FARTS PENIS VULVA SKANK SPICK CHINK DYKES FAGGY "
      + "FAGOT HOMOS PIMPS BUTTS ARSES ASSES SEXED SEXES BUTTY COOCH COONS GOOKS HONKY GIMPS SPAZZ LEZZY "
      + "CRAPS CRAPY PISSY PUBES NUDES BIMBO BOINK HUMPS TESTE KNOBS MINGE SMUTS PERVS PERVY LUBES"
    ).split(" "));

    // The AI plays from a hand of letters too, like the player: every vowel
    // plus a fresh draw of consonants each turn (it can't mulligan, so it
    // draws a few more than the player's five). It used to be able to play
    // any word in the dictionary, which was a big edge over a player who
    // has to build each word from five consonants.
    const AI_CONSONANTS = Object.freeze({ easy: 9, medium: 12, hard: 14 });
    const VOWELS = "AEIOU";

    function consonantWeights(game) {
      if (game.__umtDuelConsonantWeights) return game.__umtDuelConsonantWeights;
      const counts = {};
      (game.secrets || []).forEach(word => {
        String(word).split("").forEach(letter => {
          if (/^[A-Z]$/.test(letter) && !VOWELS.includes(letter)) counts[letter] = (counts[letter] || 0) + 1;
        });
      });
      const weights = Object.entries(counts);
      Object.defineProperty(game, "__umtDuelConsonantWeights", { value: weights, configurable: true });
      return weights;
    }

    function drawAiLetters(game, duel) {
      const count = AI_CONSONANTS[duel.difficulty] || AI_CONSONANTS.medium;
      const pool = consonantWeights(game).slice();
      const letters = new Set(VOWELS);
      for (let drawn = 0; drawn < count && pool.length; drawn += 1) {
        const total = pool.reduce((sum, [, weight]) => sum + weight, 0);
        let pick = randomFor(game) * total;
        let index = 0;
        while (index < pool.length - 1 && pick >= pool[index][1]) {
          pick -= pool[index][1];
          index += 1;
        }
        letters.add(pool[index][0]);
        pool.splice(index, 1);
      }
      return letters;
    }

    function chooseAiWord(game, duel) {
      const style = AI_STYLE[duel.difficulty] || AI_STYLE.medium;
      const roll = () => randomFor(game);
      const pickFrom = words => words[Math.floor(roll() * words.length)] || words[0];
      const history = duel.history || [];
      const answers = new Set(game.secrets || []);
      const dictionary = unguessedLegalWords(game, duel).filter(word => !AI_NEVER_PLAYS.has(word) || answers.has(word));
      const hand = drawAiLetters(game, duel);
      const spellable = dictionary.filter(word => word.split("").every(letter => hand.has(letter)));
      const legal = spellable.length ? spellable : dictionary;
      if (!legal.length) return visibleCandidates(game, duel)[0] || null;
      if (style.wildGuess && roll() < style.wildGuess) return pickFrom(legal);

      const read = history.filter(entry => entry && (entry.actor === "ai" || roll() < style.readsYourRows));
      let candidates = legal.filter(word => consistentWithVisibleHistory(word, read));
      if (!candidates.length) candidates = legal;
      const everyday = candidates.filter(word => answers.has(word));
      if (everyday.length && (everyday.length <= style.goesForIt || (style.commonWords && roll() < style.commonWords))) {
        candidates = everyday;
      }
      if (candidates.length === 1) {
        if (style.missesLastWord && roll() < style.missesLastWord) {
          const others = legal.filter(word => word !== candidates[0]);
          if (others.length) return pickFrom(others);
        }
        return candidates[0];
      }
      if (roll() >= style.smart) return pickFrom(candidates);

      if (duel.difficulty === "medium") {
        const pool = evenlySample(candidates, 400);
        let best = pool[0];
        let bestScore = -Infinity;
        pool.forEach(word => {
          const score = mediumScore(word, pool);
          if (score > bestScore) { best = word; bestScore = score; }
        });
        return best;
      }

      if (!history.length) {
        const opener = COMMON_OPENERS.find(word => game.guessSet.has(word) && legal.includes(word));
        if (opener) return opener;
      }
      const candidateSample = evenlySample(candidates, 190);
      const guesses = evenlySample(candidates, 200);
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
      // Money, as the difficulty buttons promise ("Win +$18") -- it used to
      // be added to the run's points by mistake.
      game.state.cuddleMoney = Math.max(0, Number(game.state.cuddleMoney || 0)) + reward;
      messages.push(`+$${reward}.`);
      const tile = duel.tileState || {};
      const base = duel.tileBase || {};
      const earnedPoints = Math.max(0, Math.round((Number(tile.score) || 0) - (Number(base.score) || 0)));
      const earnedMoney = Math.max(0, Math.round((Number(tile.cuddleMoney) || 0) - (Number(base.money) || 0)));
      if (earnedPoints) {
        game.state.score = (Number(game.state.score) || 0) + earnedPoints;
        messages.push(`+${earnedPoints} points earned in the Duel.`);
      }
      if (earnedMoney) {
        game.state.cuddleMoney += earnedMoney;
        messages.push(`+$${earnedMoney} from tiles and powers.`);
      }
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
        // Special tiles are for the player's guesses: one sitting on the
        // row the AI just took moves along with the rest still to come.
        if (actor === "ai" && Array.isArray(state.cuddleMoneyTiles)) {
          const aiRow = state.history.length;
          state.cuddleMoneyTiles.forEach(tile => {
            if (tile && !tile.paid && Number(tile.row) >= aiRow) tile.row = Number(tile.row) + 1;
          });
        }
        state.history.push({ actor, word, feedback: visible, shownFeedback: visible.slice() });
        state.guessesUsed = duelPlayerGuesses(state);
        if (typeof game._updateKnowledge === "function") game._updateKnowledge(word, visible);
        if (typeof game._syncInfiniteCards === "function") game._syncInfiniteCards();
        if (typeof game.drawToHandLimit === "function") game.drawToHandLimit();
        topUpDuelJoker(game, state);
        state.draft = [];
        state.lastMessage = duel.message;
        if (state.status === "playing" && typeof game._ensureQuestForNextGuess === "function") {
          try { game._ensureQuestForNextGuess(); } catch (_error) { /* a quest is a bonus, never a blocker */ }
        }
      });
    }

    function recordDuelGuess(game, actor, word, jokerIndex = -1, synced = false) {
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
        duel.history.push(jokerIndex >= 0
          ? { actor, word, feedback: feedback.slice(), jokerIndex }
          : { actor, word, feedback: feedback.slice() });
        if (!synced) syncVisibleGuessToDuelHand(game, duel, actor, word, feedback);
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

    // The player's guess goes through the game's own submitDraft (with the
    // Duel's state swapped in), so every layer's per-guess effects run as
    // on any stage: scoring, special tiles, quests, clues, compass marks,
    // Process of Elimination and the rest.
    function submitDuelTiles(game) {
      const ready = requirePlayerDuel(game);
      if (!ready.ok) return ready;
      const duel = ready.duel;
      if (duel.mulliganMode) return { ok: false, error: "Finish or cancel the mulligan first." };
      const tileSnapshot = cloneForDuel(duel.tileState, null);
      let word = "";
      let jokerIndex = -1;
      let result;
      try {
        result = withDuelTileState(game, duel, state => {
          if (state.status !== "playing") return { ok: false, error: "Choose your quest reward first." };
          state.guessesUsed = duelPlayerGuesses(state);
          const validation = game.canSubmit();
          if (!validation.ok) return validation;
          if ((duel.history || []).some(entry => entry.word === validation.word)) {
            return { ok: false, error: `${validation.word} was already played in this Duel.` };
          }
          const before = state.history.length;
          const submitted = game.submitDraft();
          if (!submitted || submitted.ok === false) return submitted || { ok: false, error: "The Duel guess could not be submitted." };
          const entry = state.history[state.history.length - 1];
          if (state.history.length === before || !entry) return { ok: false, error: "The Duel guess could not be submitted." };
          entry.actor = "player";
          word = String(entry.word || "").toUpperCase();
          jokerIndex = Number.isInteger(entry.jokerIndex) ? entry.jokerIndex : -1;
          // A solve ends the Duel itself; the stage-end cash-out stays out.
          if (word === duel.secret) state.pendingRoundEnd = null;
          if (state.status !== "questReward") state.status = "playing";
          return { ok: true, word };
        });
      } catch (error) {
        if (tileSnapshot) duel.tileState = tileSnapshot;
        return { ok: false, error: error && error.message ? error.message : "The Duel guess could not be submitted." };
      }
      if (!result || !result.ok) {
        if (tileSnapshot) duel.tileState = tileSnapshot;
        return result || { ok: false, error: "The Duel guess could not be submitted." };
      }
      if (!/^[A-Z]{5}$/.test(word)) {
        if (tileSnapshot) duel.tileState = tileSnapshot;
        return { ok: false, error: "Duel guesses must resolve to five ordinary letters." };
      }
      const recorded = recordDuelGuess(game, "player", word, jokerIndex, true);
      if (!recorded.ok && tileSnapshot) duel.tileState = tileSnapshot;
      return recorded;
    }

    function chooseDuelQuestReward(game, rewardId) {
      const duel = ensureMap(game).expandedDuel;
      if (!duel || duel.phase !== "playing" || !duel.tileState) return { ok: false, error: "No Duel quest reward is open." };
      const result = withDuelTileState(game, duel, () => (
        typeof game.chooseQuestReward === "function" ? game.chooseQuestReward(rewardId) : { ok: false, error: "Quest rewards are unavailable." }
      ));
      safeSave(game);
      return result;
    }

    function toggleDuelCard(game, glyph) {
      const ready = requirePlayerDuel(game);
      if (!ready.ok) return ready;
      const duel = ready.duel;
      const normalized = String(glyph || "").toUpperCase();
      if (!/^[A-Z]$/.test(normalized) && normalized !== Engine.CUDDLE_JOKER_GLYPH) return { ok: false, error: "That tile is unavailable." };
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

    // A drag in the Duel (cuddle-drag-mode.js): a hand tile dropped on a
    // slot, a word tile moved to another slot, or dragged off the word.
    function dragDuelTile(game, op) {
      const ready = requirePlayerDuel(game);
      if (!ready.ok) return ready;
      const duel = ready.duel;
      if (duel.mulliganMode) return { ok: false, error: "Cancel the mulligan before editing the word." };
      try {
        const result = withDuelTileState(game, duel, state => {
          if (op.kind === "remove") return game.removeDraftAt(integer(op.from, -1));
          if (op.kind === "move") return game.moveDraftCard(integer(op.from, -1), integer(op.to, -1));
          const glyph = String(op.glyph || "").toUpperCase();
          const cards = cardsForDuelGlyph(game, state, glyph);
          const draft = new Set((state.draft || []).filter(Boolean));
          const card = cards.find(item => game.isInfiniteCard(item)) || cards.find(item => !draft.has(item.id));
          if (!card) return { ok: false, error: `${glyph} is not free in your hand.` };
          return game.insertDraftCardAt(card.id, integer(op.to, -1));
        });
        safeSave(game);
        return result;
      } catch (error) {
        return { ok: false, error: error && error.message ? error.message : "That tile could not be moved." };
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
        if (window.CuddleDeckFx) window.CuddleDeckFx.shuffle();
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
      // Type the word into the AI's row one letter at a time, then score it.
      const token = `${duel.id}:${duel.history.length}`;
      if (!aiTyping || aiTyping.token !== token) {
        aiTyping = { token, word, typed: 0 };
        const typeNext = () => {
          if (!aiTyping || aiTyping.token !== token) return;
          const live = game.state && game.state.branchMap && game.state.branchMap.expandedDuel;
          if (!live || live.phase !== "playing" || live.turn !== "ai") { aiTyping = null; return; }
          aiTyping.typed += 1;
          paintAiTyping();
          if (aiTyping.typed < aiTyping.word.length) {
            window.setTimeout(typeNext, AI_TYPE_STEP_MS);
          } else {
            window.setTimeout(() => {
              if (!aiTyping || aiTyping.token !== token) return;
              aiTyping = null;
              finishAiMove(game, word);
            }, 320);
          }
        };
        window.setTimeout(typeNext, AI_TYPE_STEP_MS);
      }
    }

    // Writes the letters typed so far into the AI's row without a full
    // re-render (a re-render draws them from aiTyping too).
    function paintAiTyping() {
      if (!aiTyping) return;
      const tiles = document.querySelectorAll(".umt-duel-row.is-thinking .cuddle-tile");
      tiles.forEach((tile, index) => {
        const letter = index < aiTyping.typed ? aiTyping.word[index] : "";
        if (tile.textContent !== letter) {
          tile.textContent = letter;
          tile.classList.toggle("is-typed", Boolean(letter));
        }
      });
    }

    function finishAiMove(game, word) {
      const map = ensureMap(game);
      const duel = map && map.expandedDuel;
      if (!duel || duel.phase !== "playing" || duel.turn !== "ai") return;
      duel.aiMoveNumber = Number(duel.aiMoveNumber || 0) + 1;
      const result = recordDuelGuess(game, "ai", word);
      if (!result.ok) {
        duel.aiMoveNumber = Math.max(0, Number(duel.aiMoveNumber || 1) - 1);
        duel.message = result.error || "The AI move could not be recorded.";
        safeSave(game);
      }
      requestRender(game);
    }

    function introduceRival(game) {
      const duel = game && game.state && game.state.branchMap && game.state.branchMap.expandedDuel;
      const worlds = window.CuddleWorlds;
      if (!duel || duel.phase !== "playing" || !worlds || typeof worlds.playBossEntrance !== "function") return;
      const rival = rivalOf(duel);
      rivalIntroOpen = true;
      worlds.playBossEntrance({
        game,
        boss: { title: rival.title },
        figure: rivalSvg(rival),
        eyebrow: "Word Duel · Your rival",
        line: rival.line,
        extraClass: `is-rival is-rival-${duel.difficulty || "medium"}`,
        onDone() {
          rivalIntroOpen = false;
          requestRender(game);
        }
      });
    }

    function scheduleAiMove(game) {
      const duel = game && game.state && game.state.branchMap && game.state.branchMap.expandedDuel;
      if (!duel || duel.phase !== "playing" || duel.turn !== "ai") return;
      if (rivalIntroOpen) return;
      if (duel.tileState && duel.tileState.status === "questReward") return;
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
      game.state.lastMessage = duel.message;
      // A won Duel ends like a cleared stage: pick an upgrade, then the
      // road (chooseUpgrade returns to the map).
      const choices = typeof game._generateUpgradeChoices === "function" ? game._generateUpgradeChoices() : [];
      if (Array.isArray(choices) && choices.length) {
        game.state.status = "upgrade";
        game.state.upgradePhase = "round";
        game.state.upgradeMilestone = null;
        game.state.upgradeChoices = choices;
      } else {
        game.state.status = MAP_STATUS;
      }
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
        if (node.type === "theme") scheduleThemeRevealPolicy(game, node);
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
      if (bonus.mulligan) {
        const gained = typeof this.mulliganGain === "function" ? this.mulliganGain(bonus.mulligan) : Number(bonus.mulligan || 0);
        this.state.mulligansLeft = Number(this.state.mulligansLeft || 0) + gained;
        messages.push(`+${gained} mulligan${gained === 1 ? "" : "s"}`);
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
      // Duel rows go in before the first step (addDuelRows refuses once the
      // map has progress), so a brand-new run gets them on its first render.
      const map = prepareMap(this, true);
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

    proto.canSubmit = function canSubmitWithExpandedChallenge() {
      syncExpandedChallengeRules(this);
      return originalCanSubmit.apply(this, arguments);
    };

    proto.mulligan = function mulliganWithExpandedChallenge() {
      const challenge = activeExpandedChallenge(this);
      if (challenge && challenge.effect === "mulliganLock"
          && integer(this.state.guessesUsed, 0) < expandedChallengeTurns(challenge)) {
        const count = expandedChallengeTurns(challenge);
        return { ok: false, error: `Mulligans are locked for the first ${count} ${count === 1 ? "guess" : "guesses"}.` };
      }
      return originalMulligan.apply(this, arguments);
    };

    proto.submitDraft = function submitDraftWithExpandedChallenge() {
      syncExpandedChallengeRules(this);
      return originalSubmitDraft.apply(this, arguments);
    };

    // (removed) applyProgressionChallengeFeedback used to rewind guessesUsed
    // to 0 and rotate challenge.fakeIndex by hand, so a multi-guess One
    // Little Lie would land on a different tile each guess instead of
    // repeating the opener's. The engine re-rolls a guess's marked span from
    // the guess number itself now, so the rotation is built in -- and the
    // rewind had become actively wrong, since pinning guessesUsed at 0 would
    // have handed every guess in the round the SAME span.

    function stageImage(meta, className = "umt-expanded-icon") {
      return `<img class="${className}" src="${ICON_ROOT}${escapeHtml(meta.icon)}" alt="" aria-hidden="true">`;
    }

    // Events and Duels use the same building blocks as every other Cuddle
    // screen -- the shared header, dark panels, choice cards, the board and
    // the tile hand -- so they read as part of the game, not a separate app.
    function shellHeader(game, eyebrow) {
      return (
        `<header class="cuddle-header">`
        + `<div class="cuddle-header-side"><button class="cuddle-icon-btn" data-action="run-menu" aria-label="Cuddle menu">&larr;</button></div>`
        + `<div class="cuddle-header-title"><span class="cuddle-eyebrow">${escapeHtml(eyebrow)}</span><div class="cuddle-header-title-line">`
        + `<span class="cuddle-header-score cuddle-header-points">${escapeHtml(typeof game.bankedScore === "function" ? game.bankedScore() : game.state.score)}</span>`
        + `<span class="cuddle-header-money">$${escapeHtml(Number(game.state.cuddleMoney || 0))}</span></div></div>`
        + `<div class="cuddle-header-side cuddle-header-side-right"></div>`
        + `</header>`
      );
    }

    function stopMedallion(kind) {
      const Worlds = window.CuddleWorlds;
      if (!Worlds) return "";
      return `<span class="umt-stop-medallion" style="--kind:${Worlds.KIND_COLORS[kind]}">${Worlds.iconSvg(kind)}</span>`;
    }

    // The event's short entrance (about a second): the medallion spins in
    // with a burst ring, the title rises, then the two deals. It plays once
    // per event; a redraw part-way through picks the animation up where it
    // is (--intro-elapsed) instead of starting it over. Tapping skips it.
    const EVENT_INTRO_MS = 1300;
    const eventIntro = { key: "", startedAt: 0 };

    function eventIntroState(game, eventState) {
      if (reducedMotion()) return null;
      const key = `${game.state.runId || "run"}:${eventState.nodeId}:${eventState.eventId}`;
      if (eventIntro.key !== key) {
        eventIntro.key = key;
        eventIntro.startedAt = Date.now();
      }
      const elapsed = Date.now() - eventIntro.startedAt;
      return elapsed < EVENT_INTRO_MS ? elapsed : null;
    }

    function reducedMotion() {
      return Boolean(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    }

    document.addEventListener("pointerdown", (event) => {
      const page = event.target && event.target.closest && event.target.closest(".umt-event-page.is-arriving");
      if (!page) return;
      eventIntro.startedAt = 0;
      page.classList.remove("is-arriving");
    }, true);

    function renderEventScreen(game, map) {
      const eventState = map.expandedEvent;
      const definition = eventState && EVENT_BY_ID[eventState.eventId];
      if (!definition) {
        map.expandedEvent = null;
        safeSave(game);
        return originalRenderMapScreen(game);
      }
      const choices = definition.options.map((option, index) => {
        const available = eventAvailability(game, option, eventState);
        const tag = option.id === "safe" ? "Safe" : option.id === "bold" ? "Bargain"
          : option.id === "gamble" ? "Gamble" : option.id === "risk" ? "High stakes" : "Chance";
        const gives = (option.effects || []).some(effect => effect.type === "surrenderUpgrade") && eventState.sacrificeUpgrade
          ? `<em class="umt-event-gives">Gives up: ${escapeHtml(eventState.sacrificeUpgrade.title)}</em>`
          : "";
        return (
          `<button type="button" class="cuddle-choice umt-event-choice is-${escapeHtml(option.id)}${available.ok ? "" : " is-disabled"}" style="--i:${index}" `
          + `data-cuddle-campaign-action="expanded-event-choice" data-shop-item-id="${escapeHtml(option.id)}"${available.ok ? "" : " disabled"}>`
          + `<span class="umt-event-tag">${tag}</span>`
          + `<strong>${escapeHtml(option.title)}</strong>`
          + `<small>${eventText(game, option.summary)}</small>`
          + (available.ok ? gives : `<em>${richText(available.reason)}</em>`)
          + `</button>`
        );
      }).join("");
      const elapsed = eventIntroState(game, eventState);
      const arriving = elapsed !== null;
      return (
        `<div class="cuddle-shell umt-event-shell">`
        + shellHeader(game, "EVENT")
        + `<main class="umt-event-page${arriving ? " is-arriving" : ""}"${arriving ? ` style="--intro-elapsed:${elapsed}ms"` : ""}>`
        + `<section class="umt-stop-panel umt-event-panel">`
        + `<div class="umt-event-hero">`
        + `<span class="umt-event-burst" aria-hidden="true"></span>`
        + stopMedallion("event")
        + `<span class="umt-event-eyebrow">Event on the road</span>`
        + `<h2>${escapeHtml(definition.title)}</h2>`
        + `</div>`
        + `<p class="umt-stop-lead">${escapeHtml(definition.flavor)}</p>`
        + `<div class="cuddle-choice-grid umt-event-choices">${choices}</div>`
        + `</section>`
        + `</main></div>`
      );
    }

    // The Duel board: every guess so far on ordinary board rows (the AI's
    // tagged "AI"), then the row being built -- your draft, or the AI's
    // row while it thinks.
    // Special tiles (cuddle-points-money.js) as the main board draws them:
    // a faint symbol before the guess, the payout after.
    const DUEL_SPECIAL_GLYPHS = Object.freeze({ money: "$", points: "●", mulligan: "↻", joker: "★", hint: "?" });
    function duelSpecialTile(duel, row, column) {
      const tiles = duel.tileState && Array.isArray(duel.tileState.cuddleMoneyTiles) ? duel.tileState.cuddleMoneyTiles : [];
      const tile = tiles.find(item => item && Number(item.row) === row && Number(item.col) === column);
      if (!tile) return { cls: "", attr: "" };
      const kind = DUEL_SPECIAL_GLYPHS[tile.kind] ? tile.kind : "money";
      const cls = ` is-special-tile is-special-${kind}` + (tile.paid ? (tile.payout > 0 ? " is-special-won" : " is-special-missed") : "");
      const attr = tile.paid
        ? (tile.payout > 0 ? ` data-special-paid="${escapeHtml(tile.label || (kind === "money" ? `+$${tile.payout}` : `+${tile.payout}`))}"` : "")
        : ` data-special="${DUEL_SPECIAL_GLYPHS[kind]}"`;
      return { cls, attr };
    }

    function duelCompassMark(duel, row, column) {
      const entry = duel.tileState && Array.isArray(duel.tileState.history) ? duel.tileState.history[row] : null;
      const mark = entry && Array.isArray(entry.umtCompass) ? entry.umtCompass.find(item => item && item.index === column) : null;
      if (!mark) return "";
      const side = mark.dir === "L" ? "left" : mark.dir === "R" ? "right" : "match";
      return `<span class="umt-compass-mark is-${side}">${mark.dir === "L" ? "&larr;" : mark.dir === "R" ? "&rarr;" : "&ndash;"}</span>`;
    }

    function renderDuelBoard(game, duel) {
      const rows = (duel.history || []).map((entry, rowIndex) => (
        `<div class="cuddle-board-row umt-duel-row is-${escapeHtml(entry.actor)}">`
        + entry.word.split("").map((letter, index) => {
          const special = duelSpecialTile(duel, rowIndex, index);
          const compass = duelCompassMark(duel, rowIndex, index);
          return `<span class="cuddle-tile is-${escapeHtml(entry.feedback[index] || "grey")}${entry.jokerIndex === index ? " is-joker" : ""}${special.cls}${compass ? " has-compass" : ""}"${special.attr}>${escapeHtml(letter)}${compass}</span>`;
        }).join("")
        + (entry.actor === "ai" ? `<span class="cuddle-row-score umt-duel-who is-ai">AI</span>` : `<span class="cuddle-row-score umt-duel-who is-you"></span>`)
        + `</div>`
      ));
      if (duel.phase === "playing" && duel.turn === "ai") {
        rows.push(
          `<div class="cuddle-board-row umt-duel-row is-ai is-thinking" aria-label="The AI is typing its guess">`
          + Array.from({ length: 5 }, (_unused, index) => {
            const letter = aiTyping && index < aiTyping.typed ? aiTyping.word[index] : "";
            return `<span class="cuddle-tile${letter ? " is-typed" : ""}">${escapeHtml(letter)}</span>`;
          }).join("")
          + `<span class="cuddle-row-score umt-duel-who is-ai">AI</span></div>`
        );
      } else if (duel.phase === "playing" && duel.turn === "player") {
        let draftRow = "";
        try {
          draftRow = withDuelTileState(game, duel, state => {
            const cardById = new Map((state.hand || []).map(card => [card.id, card]));
            const enabled = !duel.mulliganMode;
            const draftRow = (duel.history || []).length;
            return Array.from({ length: 5 }, (_unused, index) => {
              const cardId = (state.draft || [])[index];
              const card = cardId ? cardById.get(cardId) : null;
              const special = duelSpecialTile(duel, draftRow, index);
              // data-drag-index / data-duel-drag: tiles can be dragged into,
              // within and out of the word (cuddle-drag-mode.js).
              const drag = enabled ? ` data-drag-index="${index}" data-duel-drag="1"` : "";
              if (!card) return `<span class="cuddle-tile${special.cls}"${special.attr}${drag}></span>`;
              return `<button type="button" class="cuddle-tile is-draft-tile is-filled${card.source === "joker" || card.glyph === Engine.CUDDLE_JOKER_GLYPH ? " is-joker" : ""}${special.cls}"${special.attr}${drag} data-cuddle-campaign-action="expanded-duel-remove" data-shop-item-id="${index}"${enabled ? "" : " disabled"} aria-label="Remove ${escapeHtml(card.glyph)} from position ${index + 1}">${escapeHtml(card.glyph)}</button>`;
            }).join("");
          });
        } catch (_error) {
          draftRow = Array.from({ length: 5 }, () => `<span class="cuddle-tile"></span>`).join("");
        }
        rows.push(`<div class="cuddle-board-row umt-duel-row is-current-row">${draftRow}<span class="cuddle-row-score umt-duel-who is-you"></span></div>`);
      }
      return `<section class="cuddle-board umt-duel-board" aria-label="Duel board">${rows.join("")}</section>`;
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
        group.glyph === Engine.CUDDLE_JOKER_GLYPH ? "is-joker" : "",
        "umt-duel-hand-card"
      ].filter(Boolean).join(" ");
      const badge = infinite
        ? `<span class="cuddle-card-count is-infinite" aria-hidden="true">&infin;</span>`
        : group.cards.length > 1
          ? `<span class="cuddle-card-count" aria-hidden="true">×${group.cards.length}</span>`
          : "";
      const position = positionIndex >= 0
        ? `<span class="cuddle-card-position" aria-hidden="true">#${positionIndex + 1}</span>`
        : "";
      const modeText = duel.mulliganMode
        ? `${selectedCount} selected; ${eligible.length} finite available; limit ${limit}`
        : `${draftedCount} in the current word; reusable while visible`;
      return (
        `<button type="button" class="${classes}" data-cuddle-campaign-action="expanded-duel-card" data-shop-item-id="${escapeHtml(group.glyph)}" data-card-glyph="${escapeHtml(group.glyph)}" data-duel-drag="1" data-fx-glyph="${escapeHtml(group.glyph)}" data-fx-count="${group.cards.length}"${disabled ? " disabled" : ""} aria-pressed="${draftedCount > 0 || selectedCount > 0 ? "true" : "false"}" aria-label="${escapeHtml(group.glyph)}: ${escapeHtml(modeText)}">`
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
          // The deck beside Mulligan (cuddle-deck-fx.js deals tiles out of it).
          const deck = window.CuddleDeckFx ? window.CuddleDeckFx.deckHtml((state.deck || []).length, `duel:${duel.id || "duel"}`) : "";
          const deckClass = deck ? " has-deck" : "";
          const controls = duel.mulliganMode
            ? `<div class="cuddle-submit-row is-mulligan-mode${deckClass}">${deck}<button type="button" class="cuddle-btn cuddle-btn-primary cuddle-mulligan cuddle-mulligan-confirm" data-cuddle-campaign-action="expanded-duel-mulligan-confirm"${playerTurn && selected.size >= 1 && selected.size <= limit ? "" : " disabled"}>Confirm mulligan <span>${selected.size}/${limit} selected</span></button><button type="button" class="cuddle-btn cuddle-backspace" data-cuddle-campaign-action="expanded-duel-mulligan-cancel"${playerTurn ? "" : " disabled"} aria-label="Cancel mulligan" title="Cancel mulligan">&#215;</button></div>`
            : `<div class="cuddle-submit-row${deckClass}">${deck}<button type="button" class="cuddle-btn cuddle-mulligan" data-cuddle-campaign-action="expanded-duel-mulligan"${playerTurn && Number(state.mulligansLeft || 0) > 0 ? "" : " disabled"} title="Mulligan up to ${limit} finite tiles">Mulligan <span>${Number(state.mulligansLeft || 0)}</span></button><button type="button" class="cuddle-btn cuddle-btn-primary cuddle-submit" data-cuddle-campaign-action="expanded-duel-submit"${playerTurn && submit.ok ? "" : " disabled"}>Submit word</button><button type="button" class="cuddle-btn cuddle-backspace" data-cuddle-campaign-action="expanded-duel-backspace"${playerTurn && (state.draft || []).some(Boolean) ? "" : " disabled"} aria-label="Remove last tile" title="Remove last tile">&#9003;</button></div>`;
          const removed = Array.isArray(state.removedLetters) && state.removedLetters.length
            ? `<p class="cuddle-excluded-letters">Excluded this run: ${escapeHtml(state.removedLetters.join(", "))}</p>`
            : "";
          return (
            `<section class="cuddle-hand-panel umt-duel-hand-panel" aria-label="Your Cuddle tiles">`
            + controls
            + `<div class="cuddle-hand"><div class="cuddle-hand-row cuddle-hand-vowels" aria-label="Unlimited vowels">${vowels}</div><div class="cuddle-hand-row cuddle-hand-consonants" aria-label="Consonant hand">${consonants}</div></div>`
            + removed
            + `</section>`
          );
        });
      } catch (error) {
        return `<section class="umt-duel-hand-error" role="alert">${escapeHtml(error && error.message ? error.message : "The Duel tile hand could not be rendered.")}</section>`;
      }
    }

    // Short labels for the Easy costs; the full wording is the tooltip.
    const EASY_COST_LABELS = { pay: "Pay $10", nextGuess: "Next Wordle 1 guess short", boss: "Next boss 1 guess tougher" };

    function renderDuelDifficulty(game, duel) {
      duel.easySacrifices = duelSacrifices(game);
      const easyCosts = duel.easySacrifices.filter(item => item.enabled || item.id === "pay").map(item => (
        `<button type="button" class="umt-duel-cost" data-cuddle-campaign-action="expanded-duel-start" data-shop-item-id="easy:${escapeHtml(item.id)}"${item.enabled ? "" : " disabled"} title="${escapeHtml(item.description)}">`
        + richText(EASY_COST_LABELS[item.id] || item.title) + `</button>`
      )).join("");
      return (
        `<section class="umt-stop-panel umt-duel-choose">`
        + `<div class="umt-stop-head">${stopMedallion("duel")}<h2>Word Duel</h2></div>`
        + `<p class="umt-stop-lead">Take turns guessing against the AI. The first to solve wins. If the AI solves first, the run ends.</p>`
        + `<div class="umt-duel-options">`
        + `<button type="button" class="umt-duel-option is-medium" data-cuddle-campaign-action="expanded-duel-start" data-shop-item-id="medium"><b>Medium AI</b><span>${richText("Win +$18 · pick an upgrade")}</span></button>`
        + `<button type="button" class="umt-duel-option is-hard" data-cuddle-campaign-action="expanded-duel-start" data-shop-item-id="hard"><b>Hard AI</b><span>${richText("Win +$38 · bonus upgrade + pick")}</span></button>`
        + `<div class="umt-duel-option is-easy"><b>Easy AI</b><span>Pay one to start:</span><div class="umt-duel-costs">${easyCosts}</div></div>`
        + `</div>`
        + `</section>`
      );
    }

    // The live quest and the run's clue chips, read from the Duel's state.
    // "Guess N", turning red with its cost once the player's guess is past
    // the stage's quick-solve window (the same points penalty as a stage).
    // Just the count: the guess window's cost is explained once per world
    // (cuddle-world-intro.js).
    function renderDuelGuessCount(game, duel, mine) {
      return `<span class="umt-duel-status-count">Guess ${mine}</span>`;
    }

    function renderDuelStrip(game, duel) {
      const tile = duel.tileState;
      if (!tile) return "";
      const parts = [];
      const quests = [tile.activeQuest, ...(Array.isArray(tile.activeQuests) ? tile.activeQuests.slice(1) : [])].filter(Boolean);
      quests.forEach((quest, index) => {
        // Tap for the full rules (openQuestInfo in cuddle-campaign.js).
        parts.push(`<span class="cuddle-quest-inline" role="button" tabindex="0" data-quest-info="${index}" data-quest-source="duel" title="Tap for details">`
          + `<span class="cuddle-quest-tag"><span aria-hidden="true">${escapeHtml(quest.icon || "✦")}</span> Quest</span>`
          + `<span class="cuddle-quest-body"><b>${escapeHtml(quest.title || "Quest")}:</b> <span>${escapeHtml(quest.description || "")}</span></span></span>`);
      });
      let chips = [];
      try {
        chips = window.CuddleClues && typeof window.CuddleClues.clueChips === "function"
          ? withDuelTileState(game, duel, () => window.CuddleClues.clueChips(game)) : [];
      } catch (_error) {
        chips = [];
      }
      if (chips.length) {
        const icon = name => (window.CuddleIcons ? `<span class="umt-ico">${window.CuddleIcons.svg(name)}</span>` : "");
        parts.push(`<div class="umt-clues" aria-label="Clues">${chips.map(chip => (
          `<span class="umt-clue${chip.tone ? ` is-${chip.tone}` : ""}" title="${escapeHtml(chip.label)}">${icon(chip.icon)}`
          + `<span class="umt-clue-text${chip.mono ? " is-mono" : ""}">${escapeHtml(chip.text)}`
          + (chip.letters ? chip.letters.map(letter => `<b class="umt-clue-letter">${escapeHtml(letter)}</b>`).join("") : "")
          + (chip.words ? chip.words.map(word => `<b class="umt-clue-word">${escapeHtml(word)}</b>`).join("") : "")
          + `</span></span>`
        )).join("")}</div>`);
      }
      // What the Duel has earned so far; it joins the run on a win.
      const base = duel.tileBase || {};
      const points = Math.round((Number(tile.score) || 0) - (Number(base.score) || 0));
      const money = Math.round((Number(tile.cuddleMoney) || 0) - (Number(base.money) || 0));
      if (points > 0 || money > 0) {
        parts.push(`<span class="umt-duel-earned" title="Paid into your run if you win the Duel">Win to bank`
          + (points > 0 ? ` <b class="is-points">+${points}</b>` : "")
          + (money > 0 ? ` <b class="is-money">+$${money}</b>` : "")
          + `</span>`);
      }
      return parts.length ? `<div class="cuddle-play-strip umt-duel-strip">${parts.join("")}</div>` : "";
    }

    function renderDuelQuestReward(duel) {
      const tile = duel.tileState;
      if (!tile || tile.status !== "questReward") return "";
      const choices = Array.isArray(tile.questRewardChoices) ? tile.questRewardChoices : [];
      return `<div class="cuddle-overlay" role="dialog" aria-modal="true" aria-labelledby="umtDuelQuestTitle">`
        + `<section class="cuddle-modal cuddle-modal-wide cuddle-compact-cards"><h2 id="umtDuelQuestTitle">Quest reward</h2>`
        + `<div class="cuddle-choice-grid">${choices.map(choice => (
          `<button type="button" class="cuddle-choice" data-cuddle-campaign-action="expanded-duel-quest-reward" data-shop-item-id="${escapeHtml(choice.id)}">`
          + `<span class="cuddle-choice-icon">${escapeHtml(choice.icon || "🎁")}</span><strong>${escapeHtml(choice.title || "Reward")}</strong>`
          + `<small>${richText(choice.description || "")}</small></button>`
        )).join("")}</div></section></div>`;
    }

    function renderDuelScreen(game, map) {
      const duel = map.expandedDuel;
      const choosing = duel.phase === "choose";
      const playing = duel.phase === "playing";
      const secretTiles = String(duel.secret || "").split("").map((letter, index) => `<span class="cuddle-tile is-green" style="--i:${index}">${escapeHtml(letter)}</span>`).join("");
      let winFx = "";
      if (duel.phase === "won") {
        if (duelWinFx.id !== duel.id) duelWinFx = { id: duel.id, at: Date.now() };
        const elapsed = Date.now() - duelWinFx.at;
        if (elapsed < DUEL_WIN_FX_MS) winFx = ` is-celebrating" style="--win-t:-${elapsed}ms`;
      }
      const rival = rivalOf(duel);
      const sparks = duel.phase === "won"
        ? `<span class="umt-duel-sparks" aria-hidden="true">${Array.from({ length: 10 }, (_unused, index) => `<i style="--a:${index * 36}deg"></i>`).join("")}</span>`
        : "";
      const outcome = duel.phase === "won" || duel.phase === "lost"
        ? `<section class="umt-stop-panel umt-duel-outcome is-${duel.phase === "won" ? "win" : "loss"}${winFx}">`
          + `<div class="umt-duel-outcome-rival${duel.phase === "won" ? " is-defeated" : " is-gloating"}">${sparks}${rivalSvg(rival)}</div>`
          + `<h2>${duel.phase === "won" ? `You beat ${escapeHtml(rival.name)}` : `${escapeHtml(rival.name)} solved it first`}</h2>`
          + `<div class="cuddle-board-row umt-duel-answer">${secretTiles}</div>`
          + `<p class="umt-stop-lead">${richText(duel.message)}</p>`
          + (duel.phase === "won"
            ? `<button type="button" class="cuddle-btn cuddle-btn-primary" data-cuddle-campaign-action="expanded-duel-continue">Back on the road</button>`
            : `<button type="button" class="cuddle-btn" data-cuddle-campaign-action="expanded-duel-end">End this run</button>`)
          + `</section>`
        : "";
      const aiTurn = duel.turn === "ai";
      const mine = (duel.history || []).filter(entry => entry.actor === (aiTurn ? "ai" : "player")).length + 1;
      const statusTitle = aiTurn ? "AI's turn" : "Your turn";
      const statusLine = aiTurn
        ? `${escapeHtml(rivalOf(duel).name)} is thinking<span class="umt-duel-dots" aria-hidden="true"><i></i><i></i><i></i></span>`
        : escapeHtml(duel.mulliganMode
          ? "Pick tiles to swap, then confirm."
          : (duel.history || []).length ? "Build a word from your tiles." : duel.message || "Build a word from your tiles.");
      const statusIcon = aiTurn
        ? rivalSvg(rivalOf(duel))
        : `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.2 4.2L19 7"/></svg>`;
      let flash = "";
      if (playing && duel.turn === "player") {
        const key = `${duel.id}:${(duel.history || []).length}`;
        if (turnFlash.key !== key) turnFlash = { key, at: Date.now() };
        const elapsed = Date.now() - turnFlash.at;
        if (elapsed < TURN_FLASH_MS) flash = ` is-your-turn" style="--flash-t:-${elapsed}ms`;
      }
      return (
        `<div class="cuddle-shell umt-duel-shell">`
        + shellHeader(game, "WORD DUEL")
        + (choosing || !playing
          ? `<main class="umt-event-page">${choosing ? renderDuelDifficulty(game, duel) : ""}${!choosing && (duel.history || []).length ? renderDuelBoard(game, duel) : ""}${outcome}</main>`
          : `<main class="cuddle-play-area umt-duel-play">`
            + `<section class="cuddle-left-column">`
            + `<div class="umt-duel-status ${aiTurn ? "is-ai" : "is-player"}${flash}" role="status">`
            + `<span class="umt-duel-status-badge">${statusIcon}</span>`
            + `<span class="umt-duel-status-text"><b>${statusTitle}</b><small>${statusLine}</small></span>`
            + renderDuelGuessCount(game, duel, mine, !aiTurn)
            + `</div>`
            + renderDuelStrip(game, duel)
            + renderDuelBoard(game, duel)
            + `</section>`
            + `<section class="cuddle-right-column">${renderDuelTileHand(game, duel)}</section>`
            + `</main>`
            + renderDuelQuestReward(duel))
        + `</div>`
      );
    }

    // The map key follows the map's own icon set (cuddle-worlds.js): one
    // icon per kind of stop, with every Wordle variant under the one
    // Wordle icon and every named challenge under the one challenge icon.
    function renderLegend() {
      const Worlds = window.CuddleWorlds;
      if (!Worlds) return renderLegacyLegend();
      const game = window.CuddleBranchMap && typeof window.CuddleBranchMap.getActiveGame === "function"
        ? window.CuddleBranchMap.getActiveGame()
        : null;
      const icon = kind => `<span class="umt-legend-glyph" style="--kind:${Worlds.KIND_COLORS[kind]}">${Worlds.iconSvg(kind)}</span>`;
      const row = (kind, title, text) => `<li>${icon(kind)}<span><strong>${escapeHtml(title)}</strong><small>${richText(text)}</small></span></li>`;
      const variants = [
        ["Classic", "A standard Wordle with no help. Clearing it pays a bonus: more than the helped stages, less than a challenge."],
        ["Themed", "Opens with some of the solution's categories revealed."],
        ["Head Start", "A random word is played for you as the first guess."],
        ["Lucky Start", "One exact letter position is revealed before you start."],
        ["Jackpot", "Green tiles pay double, but you must solve within the world's guess limit."],
        ["Double or Nothing", "Solve fast to double the stage's earnings (by guess 5 in world 1, 4 in world 2, 3 in world 3); take longer and lose half."]
      ];
      const catalogue = window.CuddleRebalanceV5 && typeof window.CuddleRebalanceV5.mapChallenges === "function"
        ? window.CuddleRebalanceV5.mapChallenges(game)
        : CHALLENGES.map(meta => ({ title: meta.title, description: meta.description }));
      const stops = [
        row("wordle", "Wordle", "Solve the word. The name under the icon says which kind:"),
        `<li class="umt-legend-sub"><ul>${variants.map(([title, text]) => `<li><strong>${escapeHtml(title)}</strong><small>${escapeHtml(text)}</small></li>`).join("")}</ul></li>`,
        row("challenge", "Challenge", "A Wordle with a rule against you, named under the icon. Beat it for bonus money."),
        row("event", "Event", "A choice: a safe reward, or a bigger one with a cost."),
        row("shop", "Shop", "Spend money on supplies for the next stages, the next boss, or the whole run."),
        row("upgrade", "Free Upgrade", "Choose a free permanent upgrade."),
        row("duel", "Duel", "Alternate guesses with an AI. The first to solve wins; losing ends the run. One in every run, in world 2 or 3."),
        row("mystery", "Unknown", "Stays hidden until you step onto it."),
        row("boss", "Boss", "A boss Wordle guards the end of each world. Its reward is permanent."),
        row("final", "Final Boss", "The last guardian, at the top of the Eclipse Citadel.")
      ].join("");
      const challengeRows = catalogue.map(item => (
        `<li>${icon("challenge")}<span><strong>${escapeHtml(item.title)}</strong><small>${richText(item.description)}</small></span></li>`
      )).join("");
      return (
        `<div class="cuddle-overlay umt-stage-legend-overlay" role="dialog" aria-modal="true" aria-labelledby="umtStageLegendTitle">`
        + `<section class="cuddle-modal umt-stage-legend"><header><div><span class="cuddle-eyebrow">MAP KEY</span><h2 id="umtStageLegendTitle">What every stop means</h2></div><button type="button" class="umt-legend-close" data-cuddle-campaign-action="expanded-help-close" aria-label="Close map key">&times;</button></header>`
        + `<h3>Stops</h3><ul>${stops}</ul><h3>Challenges</h3><ul>${challengeRows}</ul>`
        + `</section></div>`
      );
    }

    function renderLegacyLegend() {
      const standard = ["normal", "theme", "event", "upgrade", "shop", "duel", "mystery", "boss"];
      const standardRows = standard.map(type => {
        const meta = BASE_STAGE_META[type];
        return `<li>${stageImage(meta, "umt-legend-icon")}<span><strong>${escapeHtml(meta.title)}</strong><small>${richText(meta.description)}</small></span></li>`;
      }).join("");
      const challengeRows = CHALLENGES.map(meta => (
        `<li>${stageImage(meta, "umt-legend-icon")}<span><strong>${escapeHtml(meta.title)}</strong>`
        + `<small>${escapeHtml(meta.description)} Difficulty scales to the first 1 / 2 / 3 guesses before Boss I / Boss II / after Boss II.</small></span></li>`
      )).join("");
      return (
        `<div class="cuddle-overlay umt-stage-legend-overlay" role="dialog" aria-modal="true" aria-labelledby="umtStageLegendTitle">`
        + `<section class="cuddle-modal umt-stage-legend"><header><div><span class="cuddle-eyebrow">MAP KEY</span><h2 id="umtStageLegendTitle">What every stop means</h2></div><button type="button" class="umt-legend-close" data-cuddle-campaign-action="expanded-help-close" aria-label="Close map key">&times;</button></header>`
        + `<h3>Road stops</h3><ul>${standardRows}</ul><h3>Named challenge stops</h3><ul>${challengeRows}</ul>`
        + `</section></div>`
      );
    }

    // What an event choice did, shown before the road goes on: a gamble's
    // win or loss and every gain and cost, one per line.
    function renderEventResult(game, map) {
      const result = map.expandedEventResult;
      const mood = result.gamble === "won" ? " is-won" : result.gamble === "lost" ? " is-lost" : "";
      const banner = result.gamble === "won" ? "Fortune smiles" : result.gamble === "lost" ? "Bad luck" : "Done";
      const lines = (result.lines || []).filter(line => !/^The gamble /.test(line))
        .map(line => `<li>${eventText(game, line)}</li>`).join("");
      return (
        `<div class="cuddle-shell umt-event-shell">`
        + shellHeader(game, "EVENT")
        + `<main class="umt-event-page">`
        + `<section class="umt-stop-panel umt-event-panel umt-event-result${mood}">`
        + `<span class="umt-event-eyebrow">${escapeHtml(result.title)} · ${escapeHtml(result.option)}</span>`
        + `<h2 class="umt-event-result-title">${banner}</h2>`
        + `<ul class="umt-event-result-lines">${lines}</ul>`
        + `<button type="button" class="cuddle-btn cuddle-btn-primary" data-cuddle-campaign-action="expanded-event-done">Back on the road</button>`
        + `</section></main></div>`
      );
    }

    function renderMapWithExpandedStages(game) {
      // startNew runs before the route exists (cuddle-branch-map.js builds it
      // lazily), so this first render is where a new run's duels get placed.
      const map = prepareMap(game, true);
      if (map && map.expandedEvent) return renderEventScreen(game, map);
      if (map && map.expandedEventResult) return renderEventResult(game, map);
      if (map && map.expandedDuel) return renderDuelScreen(game, map);
      const html = originalRenderMapScreen(game);
      return legendOpen ? html + renderLegend() : html;
    }

    function setSvgImage(group, meta) {
      if (!group || !meta) return;
      // The world map (cuddle-worlds.js) draws its own icons and captions.
      if (group.closest(".umt-map-v2")) return;
      const namespace = "http://www.w3.org/2000/svg";
      group.querySelectorAll(":scope > image:not(.umt-stage-svg-icon)").forEach(legacy => legacy.remove());
      group.querySelectorAll(":scope > .cuddle-map-node-icon, :scope > .cuddle-map-node-symbol")
        .forEach(legacy => legacy.setAttribute("display", "none"));
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
      const label = group.querySelector(".cuddle-map-node-label");
      if (label) label.textContent = meta.label;
      group.setAttribute("aria-label", meta.title);
    }

    function replaceHtmlIcon(container, meta) {
      if (!container || !meta) return;
      if (container.querySelector("[data-umt-stage-icon]")) return;
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
      if (!map || map.expandedEvent || map.expandedEventResult || map.expandedDuel) return;
      const flatNodes = map.rows.flatMap(row => row.nodes || []);
      root.querySelectorAll(".cuddle-branch-map-svg g.cuddle-map-node").forEach((group, index) => {
        const node = nodeFromElement(game, group) || flatNodes[index];
        if (node) setSvgImage(group, metaForNode(node, game));
      });
      root.querySelectorAll(".cuddle-branch-choice").forEach(button => {
        const node = nodeFromElement(game, button);
        if (!node) return;
        const meta = metaForNode(node, game);
        replaceHtmlIcon(button.querySelector(":scope > .cuddle-choice-icon"), meta);
        const heading = button.querySelector(":scope > strong");
        if (heading) {
          const direction = /\s+\u00b7\s+(left|right|middle)$/i.exec(heading.textContent || "");
          heading.textContent = meta.title + (direction ? ` - ${direction[1]}` : "");
        }
        const description = button.querySelector(":scope > small");
        if (description) description.innerHTML = richText(meta.description);
      });
      const preview = root.querySelector(".cuddle-branch-preview-overlay");
      // The briefing preview (cuddle-branch-map.js) already reads this
      // layer's wording through CuddleExpandedStages.stopMeta.
      if (preview && !preview.querySelector(".umt-stop-preview")) {
        const confirm = preview.querySelector("[data-cuddle-campaign-action='confirm-branch-node']");
        const node = nodeFromElement(game, confirm);
        if (node) {
          const meta = metaForNode(node, game);
          replaceHtmlIcon(preview.querySelector(".cuddle-choice-icon"), meta);
          const title = preview.querySelector("h2");
          const description = preview.querySelector("p");
          if (title) title.textContent = meta.title;
          if (description) description.innerHTML = richText(meta.description);
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
        const description = overlay.querySelector(".cuddle-money-challenge-offer > p");
        if (description) description.innerHTML = richText(challenge.description || meta.description);
        const reward = overlay.querySelector(".cuddle-money-reward-chip");
        if (reward) reward.innerHTML = goldenMoney(reward.textContent);
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
        const copy = banner.querySelector(".cuddle-money-challenge-copy em");
        if (copy) copy.innerHTML = richText(challenge.description || meta.description);
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

    // An Unknown Stop used to reveal and start in the same tap: the player
    // committed to it sight unseen and only learned what it was once the
    // stage was already running. Revealing on the first confirm and leaving
    // the preview open turns that into what the card promises -- the stop
    // opens, says what it is, and the player enters it deliberately. The
    // reveal is not a free peek: it sticks, so backing out of the preview
    // leaves the stop face-up on the map rather than hidden again.
    // Confirming an Unknown Stop commits to it: it is revealed and entered in
    // the same step. (It used to stop after the reveal and offer Back, so a
    // player could peek at it and then take another path.) Returns null so
    // the ordinary confirm goes on to enter the now-revealed stop.
    function revealMysteryBeforeEntering(game, itemId) {
      if (!game || !game.state || game.state.status !== MAP_STATUS) return null;
      const map = ensureMap(game);
      if (!map) return null;
      const parsed = parseNodeId(itemId);
      const node = nodeAt(map, parsed.row, parsed.col);
      if (!node || node.type !== "mystery" || node.mysteryRevealed) return null;
      if (!isReachable(map, node)) return null;

      revealMystery(node);
      const meta = metaForNode(node, game);
      game.state.lastMessage = `Unknown Stop revealed: ${meta.title}.`;
      return null;
    }

    function handleExpandedAction(game, action, itemId) {
      switch (action) {
        case "confirm-branch-node":
          // Always null: every stop, Unknown ones included, falls through to
          // the ordinary confirm below and is entered.
          return revealMysteryBeforeEntering(game, itemId);
        case "expanded-help-open":
          legendOpen = true;
          return { ok: true };
        case "expanded-help-close":
          legendOpen = false;
          return { ok: true };
        case "expanded-event-choice":
          return chooseExpandedEvent(game, itemId);
        case "expanded-event-done": {
          const map = ensureMap(game);
          if (map) map.expandedEventResult = null;
          safeSave(game);
          return { ok: true };
        }
        case "expanded-duel-start": {
          const started = startDuel(game, itemId);
          if (started && started.ok !== false) introduceRival(game);
          return started;
        }
        case "expanded-duel-card":
          return toggleDuelCard(game, itemId);
        case "expanded-duel-quest-reward":
          return chooseDuelQuestReward(game, itemId);
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
          settleThemeRevealPolicy(game);
          syncExpandedChallengeRules(game);
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
        if (expanded && expanded.code === "oneJoker" && typeof window.CuddleShakeHand === "function") window.CuddleShakeHand();
        if (expanded) return expanded;
        const result = typeof originalHandleUiAction === "function"
          ? originalHandleUiAction(game, action, itemId)
          : { ok: false, error: "Unknown campaign action." };
        syncExpandedChallengeRules(game);
        return result;
      }
    }));


    console.info(`Cuddle Expanded Stages ${VERSION} installed.`);
  }

  install();
}());
