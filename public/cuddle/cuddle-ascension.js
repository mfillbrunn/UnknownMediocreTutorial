/* Cuddle: the Ascension ladder.
 *
 * Win a Hard run and Ascension 1 unlocks; win at Ascension N and N+1
 * unlocks, up to 9. Each level adds one handicap to all the ones below it,
 * so Ascension 5 carries five. Only Hard runs climb the ladder.
 *
 *   1 Thin Hand      one fewer consonant in your hand
 *   2 Frayed Nerves  one fewer mulligan every stage
 *   3 Slim Pickings  reward screens offer one card fewer (never under two)
 *   4 Tight Window   the solve window is one guess shorter
 *   5 Gauntlet       no plain Wordles: every Wordle stop has a challenge
 *                    (read by cuddle-rebalance-v5.js)
 *   6 Steep Gates    boss point targets are 20% higher
 *                    (read by cuddle-branch-map.js)
 *   7 Heavy Toll     each late guess costs 10 more points
 *   8 Hexed          the run starts cursed: one of the first three guesses
 *                    of every stage has its feedback masked
 *   9 Dead Weight    a dead tile sits in your deck all run
 *                    (dealt by cuddle-burdens.js)
 *
 * The level a run was started at is stored on the run (state.umtAscension),
 * so a saved run keeps its handicaps whatever is picked in the lobby later.
 * The ladder itself (what's unlocked, what's picked) lives in localStorage.
 */
(function () {
  "use strict";

  var Engine = window.CuddleEngine;
  var Game = Engine && Engine.CuddleGame;
  if (!Game || Game.prototype.__cuddleAscension) return;
  var proto = Game.prototype;
  proto.__cuddleAscension = true;

  var STORAGE_KEY = "umt-cuddle-ascension-v1";
  var GATE_FACTOR = 1.2;
  var TOLL = 10;
  var HEX_CURSES = ["hiddenMargins", "countOnly", "blueMode", "arrowMode"];

  var LEVELS = Object.freeze([
    Object.freeze({ level: 1, id: "thinHand", name: "Thin Hand", text: "One fewer consonant in your hand." }),
    Object.freeze({ level: 2, id: "frayedNerves", name: "Frayed Nerves", text: "One fewer mulligan every stage." }),
    Object.freeze({ level: 3, id: "slimPickings", name: "Slim Pickings", text: "Reward screens offer one card fewer." }),
    Object.freeze({ level: 4, id: "tightWindow", name: "Tight Window", text: "The solve window is one guess shorter." }),
    Object.freeze({ level: 5, id: "gauntlet", name: "Gauntlet", text: "No plain Wordles: every Wordle stop has a challenge." }),
    Object.freeze({ level: 6, id: "steepGates", name: "Steep Gates", text: "Boss point targets are 20% higher." }),
    Object.freeze({ level: 7, id: "heavyToll", name: "Heavy Toll", text: "Each late guess costs 10 more points." }),
    Object.freeze({ level: 8, id: "hexed", name: "Hexed", text: "You start cursed: one early guess of every stage is masked." }),
    Object.freeze({ level: 9, id: "deadWeight", name: "Dead Weight", text: "A dead tile sits in your deck all run. Mulligan it away." })
  ]);
  var MAX = LEVELS.length;
  var BY_ID = {};
  LEVELS.forEach(function index(entry) { BY_ID[entry.id] = entry; });

  function clampLevel(value) {
    var number = Math.floor(Number(value));
    return Number.isFinite(number) ? Math.max(0, Math.min(MAX, number)) : 0;
  }

  // -- the ladder (localStorage) ---------------------------------------------
  function readLadder() {
    var ladder = { unlocked: 0, selected: 0, best: 0, wins: {} };
    try {
      var saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "null");
      if (saved && typeof saved === "object") {
        ladder.unlocked = clampLevel(saved.unlocked);
        ladder.selected = Math.min(clampLevel(saved.selected), ladder.unlocked);
        ladder.best = clampLevel(saved.best);
        ladder.wins = saved.wins && typeof saved.wins === "object" ? saved.wins : {};
      }
    } catch (_error) { /* a blocked or empty store reads as a fresh ladder */ }
    return ladder;
  }

  function writeLadder(ladder) {
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ladder)); } catch (_error) { /* not saved */ }
  }

  function select(level) {
    var ladder = readLadder();
    ladder.selected = Math.min(clampLevel(level), ladder.unlocked);
    writeLadder(ladder);
    return ladder.selected;
  }

  // -- the run's level -------------------------------------------------------
  function levelOf(game) {
    if (!game) return 0;
    var state = game.state;
    if (state && state.umtAscension && typeof state.umtAscension === "object") return clampLevel(state.umtAscension.level);
    // While startNew is still building the run (round 1's hand is dealt
    // inside it), the level it was asked for.
    return clampLevel(game.__umtAscensionPending);
  }

  function has(game, id) {
    var entry = BY_ID[id];
    return Boolean(entry && levelOf(game) >= entry.level);
  }

  function active(game) {
    var level = levelOf(game);
    return LEVELS.filter(function upTo(entry) { return entry.level <= level; });
  }

  // -- handicaps -------------------------------------------------------------
  var baseStartNew = proto.startNew;
  proto.startNew = function startNewWithAscension(difficulty) {
    var hard = String(difficulty || "hard").toLowerCase() === "hard";
    var level = hard ? readLadder().selected : 0;
    this.__umtAscensionPending = level;
    var game = this;
    var finish = function finish(value) {
      game.__umtAscensionPending = 0;
      if (game.state) {
        game.state.umtAscension = { level: level };
        if (level >= BY_ID.hexed.level) addHex(game);
        try { game.save(); } catch (_error) { /* next save */ }
      }
      return value;
    };
    var result;
    try {
      result = baseStartNew.apply(this, arguments);
    } catch (error) {
      this.__umtAscensionPending = 0;
      throw error;
    }
    return result && typeof result.then === "function" ? result.then(finish) : finish(result);
  };

  // Hexed: a permanent curse from the start, the same kind an event or a
  // beaten boss leaves (mega.ratchetDebuffs), on guess 1, 2 or 3.
  function addHex(game) {
    var mega = game.state.megaState || (game.state.megaState = {});
    if (!Array.isArray(mega.ratchetDebuffs)) mega.ratchetDebuffs = [];
    if (mega.ratchetDebuffs.some(function mine(item) { return item && item.source === "ascension"; })) return;
    var random = typeof game.random === "function" ? game.random : Math.random;
    var bossId = HEX_CURSES[Math.floor(random() * HEX_CURSES.length)];
    var debuff = { bossId: bossId, guessIndex: 1 + Math.floor(random() * 3), source: "ascension" };
    if (bossId === "hiddenMargins") {
      var spots = [0, 1, 2, 3, 4];
      for (var i = spots.length - 1; i > 0; i -= 1) {
        var j = Math.floor(random() * (i + 1));
        var held = spots[i]; spots[i] = spots[j]; spots[j] = held;
      }
      debuff.hiddenIndices = spots.slice(0, 2);
    }
    mega.ratchetDebuffs.push(debuff);
  }

  var baseHandLimit = proto.getHandLimit;
  proto.getHandLimit = function handLimitWithAscension() {
    var limit = baseHandLimit.apply(this, arguments);
    return has(this, "thinHand") ? Math.max(1, limit - 1) : limit;
  };

  var baseMulligans = proto.getMulliganAllowance;
  proto.getMulliganAllowance = function mulliganAllowanceWithAscension() {
    var count = baseMulligans.apply(this, arguments);
    return has(this, "frayedNerves") ? Math.max(0, count - 1) : count;
  };

  // Slim Pickings. Other layers (the same-tier offers in
  // cuddle-economy-rarity-v8.js) wrap the reward generator late and pad the
  // offer back to three, so this wrapper re-attaches itself on top whenever
  // it finds another one there; only the outermost copy trims.
  function slim(game, choices) {
    if (!has(game, "slimPickings") || !Array.isArray(choices) || choices.length <= 2) return choices;
    return choices.slice(0, choices.length - 1);
  }

  function keepOnTop(name, after) {
    var current = proto[name];
    if (typeof current !== "function" || current.__umtAscension) return;
    var wrapped = function ascensionOutermost() {
      if (this.__umtAscensionDepth) return current.apply(this, arguments);
      this.__umtAscensionDepth = true;
      var result;
      try {
        result = current.apply(this, arguments);
      } finally {
        this.__umtAscensionDepth = false;
      }
      return after(this, result);
    };
    wrapped.__umtAscension = true;
    proto[name] = wrapped;
  }

  function wrapChoices() {
    keepOnTop("_generateUpgradeChoices", slim);
    keepOnTop("refreshUpgradeChoices", function trimRefresh(game, result) {
      if (result && result.ok !== false && game.state) game.state.upgradeChoices = slim(game, game.state.upgradeChoices);
      return result;
    });
  }
  wrapChoices();
  setInterval(wrapChoices, 1000);

  var baseThreshold = proto._solveGuessThreshold;
  proto._solveGuessThreshold = function solveThresholdWithAscension() {
    var window = baseThreshold.apply(this, arguments);
    return has(this, "tightWindow") ? Math.max(3, window - 1) : window;
  };

  var baseLate = proto._lateGuessPenalty;
  proto._lateGuessPenalty = function lateGuessPenaltyWithAscension() {
    var penalty = baseLate.apply(this, arguments);
    return penalty > 0 && has(this, "heavyToll") ? penalty + TOLL : penalty;
  };

  // Steep Gates: cuddle-branch-map.js multiplies each boss target by this.
  function gateFactor(game) {
    return has(game, "steepGates") ? GATE_FACTOR : 1;
  }

  // -- winning ---------------------------------------------------------------
  function isHardRun(state) {
    return String((state && state.megaState && state.megaState.difficulty) || "") === "hard";
  }

  // A won Hard run unlocks the next level (once per run).
  function recordWin(state) {
    if (!state || state.status !== "won" || !isHardRun(state)) return null;
    var level = clampLevel(state.umtAscension && state.umtAscension.level);
    var ladder = readLadder();
    var runId = String(state.runId || "");
    var known = ladder.wins[runId];
    if (known) return known;
    var unlocked = level < MAX && ladder.unlocked < level + 1 ? level + 1 : 0;
    if (unlocked) {
      ladder.unlocked = unlocked;
      ladder.selected = unlocked;
    }
    ladder.best = Math.max(ladder.best, level);
    var record = { level: level, unlocked: unlocked };
    ladder.wins[runId] = record;
    // Only the latest few wins need remembering.
    var ids = Object.keys(ladder.wins);
    if (ids.length > 20) ids.slice(0, ids.length - 20).forEach(function drop(id) { delete ladder.wins[id]; });
    writeLadder(ladder);
    return record;
  }

  // -- markup ----------------------------------------------------------------
  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function swap(character) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" }[character];
    });
  }

  function penaltyList(level) {
    return LEVELS.filter(function upTo(entry) { return entry.level <= level; }).map(function item(entry) {
      return '<li class="' + (entry.level === level ? "is-new" : "") + '"><b>' + entry.level + " · " + escapeHtml(entry.name) + "</b> "
        + escapeHtml(entry.text) + "</li>";
    }).join("");
  }

  // The lobby's level picker (cuddle-ui.js renderNewRunOverlay).
  function pickerHtml() {
    var ladder = readLadder();
    var buttons = "";
    for (var level = 0; level <= MAX; level += 1) {
      var locked = level > ladder.unlocked;
      var picked = level === ladder.selected;
      buttons += '<button type="button" class="umt-asc-level' + (picked ? " is-selected" : "") + (locked ? " is-locked" : "")
        + (level <= ladder.best && level > 0 ? " is-beaten" : "") + '"'
        + ' data-action="ascension-pick" data-level="' + level + '"'
        + ' role="radio" aria-checked="' + (picked ? "true" : "false") + '"'
        + (locked ? ' disabled aria-label="Ascension ' + level + ', locked"' : ' aria-label="Ascension ' + level + '"')
        + ">" + (level === 0 ? "–" : level) + "</button>";
    }
    var selected = ladder.selected;
    var body;
    if (ladder.unlocked === 0) {
      body = '<p class="umt-asc-hint">Win a Hard run to unlock Ascension 1. Each level adds a new handicap to the ones before it.</p>';
    } else if (selected === 0) {
      body = '<p class="umt-asc-hint">Plain Hard. Pick a level to climb: each one adds a handicap to the ones before it.</p>';
    } else {
      body = '<ul class="umt-asc-penalties">' + penaltyList(selected) + "</ul>";
    }
    return '<section class="umt-asc-picker" aria-labelledby="umtAscTitle">'
      + '<div class="umt-asc-head"><h3 id="umtAscTitle">Ascension</h3><span>Hard only</span></div>'
      + '<div class="umt-asc-levels" role="radiogroup" aria-label="Ascension level">' + buttons + "</div>"
      + body + "</section>";
  }

  // What the Hard button says when a level is picked.
  function hardLabel() {
    var selected = readLadder().selected;
    return selected > 0 ? "Hard · A" + selected : "Hard";
  }

  // The win screen's ladder line (cuddle-ui.js renderWinOverlay).
  function winHtml(state) {
    var record = recordWin(state);
    if (!record) return "";
    var next = record.unlocked ? LEVELS[record.unlocked - 1] : null;
    if (next) {
      return '<div class="umt-asc-win"><span class="umt-asc-win-kicker">Ascension ' + next.level + " unlocked</span>"
        + "<b>" + escapeHtml(next.name) + "</b><p>" + escapeHtml(next.text) + " It adds to every handicap before it.</p></div>";
    }
    if (record.level >= MAX) {
      return '<div class="umt-asc-win is-top"><span class="umt-asc-win-kicker">Ascension ' + MAX + " cleared</span>"
        + "<b>The top of the ladder</b><p>Every handicap at once, and you still won.</p></div>";
    }
    return record.level > 0
      ? '<div class="umt-asc-win"><span class="umt-asc-win-kicker">Ascension ' + record.level + " cleared</span></div>"
      : "";
  }

  // -- the run chip ------------------------------------------------------------
  var chipOpen = false;

  function chipHtml(game) {
    var level = levelOf(game);
    return '<div class="umt-asc-chip-wrap">'
      + '<button type="button" class="umt-asc-chip" data-umt-asc-chip aria-expanded="' + (chipOpen ? "true" : "false") + '">'
      + '<span aria-hidden="true">▲</span>Ascension ' + level + "</button>"
      + (chipOpen ? '<ul class="umt-asc-penalties umt-asc-pop">' + penaltyList(level) + "</ul>" : "")
      + "</div>";
  }

  function inDuel(state) {
    return String((state && state.runId) || "").indexOf(":duel:") !== -1;
  }

  function render(root, game, landing) {
    if (!root) return;
    root.querySelectorAll(".umt-asc-chip-wrap").forEach(function drop(element) { element.remove(); });
    if (landing || !game || !game.state || inDuel(game.state) || levelOf(game) <= 0) return;
    var state = game.state;
    if (state.status === "branchMap") {
      var page = root.querySelector(".cuddle-branch-shell .cuddle-branch-page");
      if (page) page.insertAdjacentHTML("afterbegin", chipHtml(game));
      return;
    }
    if (state.status !== "playing") return;
    var strip = root.querySelector(".cuddle-play-strip");
    if (strip) strip.insertAdjacentHTML("beforeend", chipHtml(game));
  }

  function activeGame() {
    try {
      return window.CuddleBranchMap && typeof window.CuddleBranchMap.getActiveGame === "function"
        ? window.CuddleBranchMap.getActiveGame() : null;
    } catch (_error) {
      return null;
    }
  }

  document.addEventListener("click", function onChip(event) {
    var chip = event.target.closest && event.target.closest("[data-umt-asc-chip]");
    if (!chip) return;
    event.preventDefault();
    chipOpen = !chipOpen;
    var root = document.getElementById("cuddleRoot");
    if (root) render(root, activeGame(), false);
  });

  // The same render hook the other add-ons use; re-hook when a newer
  // CuddleCampaign replaces this one.
  function installRenderHook() {
    var campaign = window.CuddleCampaign;
    if (!campaign || campaign.__umtAscension) return false;
    var previous = campaign.afterRender;
    window.CuddleCampaign = Object.freeze(Object.assign({}, campaign, {
      __umtAscension: true,
      afterRender: function afterRender(root, game, landing) {
        if (typeof previous === "function") previous.call(this, root, game, landing);
        try {
          render(root, game, landing);
        } catch (error) {
          console.warn("Cuddle ascension: render failed.", error);
        }
      }
    }));
    return true;
  }

  var attempts = 0;
  (function install() {
    attempts += 1;
    if (!window.CuddleCampaign) {
      if (attempts < 200) setTimeout(install, 50);
      return;
    }
    installRenderHook();
    setInterval(installRenderHook, 1000);
  }());

  window.CuddleAscension = Object.freeze({
    LEVELS: LEVELS,
    MAX: MAX,
    levelOf: levelOf,
    has: has,
    active: active,
    gateFactor: gateFactor,
    select: select,
    ladder: readLadder,
    pickerHtml: pickerHtml,
    hardLabel: hardLabel,
    winHtml: winHtml
  });
}());
