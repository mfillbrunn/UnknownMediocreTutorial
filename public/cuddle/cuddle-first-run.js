/* Cuddle: a gentler first run.
 *
 * A player's first run (until one run has ended, or beaten its first boss)
 * leaves two systems out, on every difficulty:
 *   - quests: none appear, quest badges aren't offered, and no stage or
 *     boss that needs quests is drawn;
 *   - special squares: none on the board, and the badges that add them
 *     aren't offered.
 * On Easy and Medium the first world is calmer too:
 *   - only Wordle stops (and Free Upgrades) before the first boss: no
 *     shops, events, Unknown stops, Duels or Trials;
 *   - the schools (badge ranks) stay hidden until the first boss is
 *     beaten, and their perks with them.
 * The run is marked when it starts (state.umtFirstRun, state.umtCalmWorld),
 * so the rules hold for the whole run even after it ends.
 */
(function () {
  "use strict";

  var Engine = window.CuddleEngine;
  var Game = Engine && Engine.CuddleGame;
  if (!Game || Game.prototype.__cuddleFirstRun) return;
  var proto = Game.prototype;
  proto.__cuddleFirstRun = true;

  var STORE_KEY = "umt-cuddle-runs-v1";
  // Badges for the systems a first run leaves out.
  var QUEST_BADGES = ["questPoints", "questRefreshes", "questReroll", "surprise-assignment", "questCadence", "questPersistReward", "questDoublePick"];
  var SQUARE_BADGES = ["bonusSquares", "treasureMap", "mulliganTiles", "jokerTiles", "oracleTiles"];
  // Stages and bosses that need quests.
  var QUEST_CHALLENGES = ["questEndurance", "questTrial"];
  // Stops a calm first world doesn't have.
  var BUSY_STOPS = ["shop", "event", "mystery", "duel", "trial"];

  function read() {
    try {
      var data = JSON.parse(window.localStorage.getItem(STORE_KEY) || "null");
      return data && typeof data === "object" ? data : { done: 0, runs: [] };
    } catch (_error) {
      return { done: 0, runs: [] };
    }
  }

  function write(data) {
    try { window.localStorage.setItem(STORE_KEY, JSON.stringify(data)); } catch (_error) { /* not saved */ }
  }

  function experienced() {
    return Number(read().done) > 0;
  }

  // A run counts once it ends or beats its first boss.
  function countRun(state) {
    var id = String(state && state.runId || "");
    if (!id || id.indexOf(":duel:") !== -1) return;
    var data = read();
    data.runs = Array.isArray(data.runs) ? data.runs : [];
    if (data.runs.indexOf(id) !== -1) return;
    data.runs = data.runs.concat([id]).slice(-20);
    data.done = (Number(data.done) || 0) + 1;
    write(data);
  }

  function stateOf(game) {
    return game && game.state ? game.state : null;
  }

  // While startNew builds the run (its map and bosses included), the run's
  // marks aren't on the state yet: the game carries them meanwhile.
  function marks(gameOrState) {
    var game = gameOrState && gameOrState.state ? gameOrState : null;
    var state = game ? game.state : gameOrState;
    if (state && state.umtFirstRun !== undefined) return { first: Boolean(state.umtFirstRun), calm: Boolean(state.umtCalmWorld) };
    if (game && game.__umtPendingRun) return game.__umtPendingRun;
    return { first: false, calm: false };
  }

  function isFirstRun(gameOrState) {
    return marks(gameOrState).first;
  }

  function isCalm(gameOrState) {
    return marks(gameOrState).calm;
  }

  function bossBeaten(state) {
    return Array.isArray(state && state.bossGatesDone) && state.bossGatesDone.length > 0;
  }

  // -- marking the run ----------------------------------------------------------
  var baseStartNew = proto.startNew;
  if (typeof baseStartNew === "function") {
    proto.startNew = function startNewFirstRun(difficulty) {
      var first = !experienced();
      this.__umtPendingRun = { first: first, calm: first && String(difficulty || "").toLowerCase() !== "hard" };
      var result;
      try {
        result = baseStartNew.apply(this, arguments);
      } finally {
        this.__umtPendingRun = null;
      }
      var state = stateOf(this);
      if (state) {
        state.umtFirstRun = first;
        state.umtCalmWorld = first && String(difficulty || "").toLowerCase() !== "hard";
        // startNew already set up round 1: put away what it may have drawn.
        if (first) {
          clearQuests(state);
          state.cuddleMoneyTiles = [];
        }
      }
      return result;
    };
  }

  // -- what a first run leaves out --------------------------------------------------
  function hidesReward(idOrName, state) {
    if (!isFirstRun(state)) return false;
    var tree = window.CuddleSkillTree;
    var node = tree && typeof tree.resolve === "function" ? tree.resolve(idOrName) : null;
    var id = node ? node.id : String(idOrName || "");
    return QUEST_BADGES.indexOf(id) !== -1 || SQUARE_BADGES.indexOf(id) !== -1;
  }

  var baseCatalog = proto._upgradeCatalog;
  if (typeof baseCatalog === "function") {
    proto._upgradeCatalog = function catalogFirstRun() {
      var list = baseCatalog.apply(this, arguments) || [];
      var state = stateOf(this);
      if (!isFirstRun(state)) return list;
      return list.filter(function keep(card) { return !card || !hidesReward(card.id || card.title, state); });
    };
  }

  // No quests: none is set up, and any already showing is put away.
  function clearQuests(state) {
    state.activeQuest = null;
    if (Array.isArray(state.activeQuests)) state.activeQuests = [];
    if (state.megaState && Array.isArray(state.megaState.activeQuests)) state.megaState.activeQuests = [];
  }

  var baseEnsureQuest = proto._ensureQuestForNextGuess;
  if (typeof baseEnsureQuest === "function") {
    proto._ensureQuestForNextGuess = function ensureQuestFirstRun() {
      var state = stateOf(this);
      if (isFirstRun(state)) {
        clearQuests(state);
        return undefined;
      }
      return baseEnsureQuest.apply(this, arguments);
    };
  }

  var baseBeginRound = proto._beginRound;
  proto._beginRound = function beginRoundFirstRun() {
    var result = baseBeginRound.apply(this, arguments);
    var state = stateOf(this);
    if (isFirstRun(state)) clearQuests(state);
    return result;
  };

  // A first run is over for this player once it ends or beats a boss.
  function watchProgress() {
    var game = window.CuddleBranchMap && typeof window.CuddleBranchMap.getActiveGame === "function" ? window.CuddleBranchMap.getActiveGame() : null;
    var state = stateOf(game);
    if (!state) return;
    if (state.status === "won" || state.status === "lost" || bossBeaten(state)) countRun(state);
  }

  // -- a calm first world --------------------------------------------------------
  // Stops before the first boss that aren't Wordles become Wordles (a Free
  // Upgrade stays). Called after the map is laid out (cuddle-expanded-stages.js
  // prepareMap); stops already walked are left alone.
  function calmMap(game, map) {
    var state = stateOf(game);
    if (!isCalm(state) || !map || !Array.isArray(map.rows)) return false;
    var changed = false;
    var visited = Array.isArray(map.visited) ? map.visited : [];
    var walked = function walked(node) {
      return visited.some(function match(entry) { return entry && entry.row === node.row && entry.col === node.col; });
    };
    for (var r = 0; r < map.rows.length; r += 1) {
      var row = map.rows[r];
      if (!row || row.kind === "boss") break;
      (row.nodes || []).forEach(function calm(node) {
        if (!node || BUSY_STOPS.indexOf(String(node.type)) === -1) return;
        if (walked(node)) return;
        node.type = "normal";
        delete node.mysteryType;
        delete node.mysteryRevealed;
        delete node.eventId;
        delete node.shopSlot;
        delete node.cuddleVariant;
        changed = true;
      });
    }
    return changed;
  }

  // The schools stay hidden in a calm first world until its boss is beaten.
  function schoolsHidden(gameOrState) {
    var state = gameOrState && gameOrState.state ? gameOrState.state : gameOrState;
    return isCalm(state) && !bossBeaten(state);
  }

  function attach() {
    var host = document.getElementById("cuddleScreen");
    if (!host) {
      document.addEventListener("DOMContentLoaded", attach, { once: true });
      return;
    }
    var pending = false;
    new MutationObserver(function schedule() {
      if (pending) return;
      pending = true;
      requestAnimationFrame(function run() { pending = false; watchProgress(); });
    }).observe(host, { childList: true, subtree: true });
  }
  attach();

  window.CuddleFirstRun = Object.freeze({
    isFirstRun: isFirstRun,
    isCalm: isCalm,
    hidesReward: hidesReward,
    noQuests: isFirstRun,
    noSquares: isFirstRun,
    questChallenges: function questChallenges(gameOrState) { return isFirstRun(gameOrState) ? QUEST_CHALLENGES.slice() : []; },
    calmMap: calmMap,
    schoolsHidden: schoolsHidden,
    experienced: experienced
  });
}());
