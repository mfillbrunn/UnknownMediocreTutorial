/* Cuddle: unlocks. The harder and more involved parts of the game open up
 * as the player plays.
 *
 * Progress points: every run, finished or not, adds its points to the
 * player's progress, up to 500 a run (counted as the run goes, so a run
 * given up halfway still counts what it scored). Progress passes four
 * levels; each opens new stage challenges and bosses, world themes,
 * badges and quest rewards. Until then they're never drawn: not on the map, not on reward
 * screens, in packs or the shop, and not when a quest pays out.
 *
 * Hard opens once a Medium run is won.
 *
 * Kept in this browser (localStorage), like the coins and achievements.
 * Players from before this existed start with credit for what they've
 * already won (seed()).
 */
(function () {
  "use strict";

  if (window.CuddleUnlocks) return;

  var STORE_KEY = "umt-cuddle-unlocks-v1";
  var RUN_CAP = 500;

  // Each level: the progress it needs and what it opens. `rules` are
  // constraints (cuddle-quests.js CONSTRAINTS) that are a stage challenge,
  // a boss or both; `bosses` are bosses alone; `themes` are world themes
  // (cuddle-worlds.js THEMES) a run can draw.
  var LEVELS = [
    {
      points: 150,
      rules: ["noMulligans"],
      bosses: [],
      themes: ["swamp"],
      badges: ["ideaTiles", "waveTiles", "doubleDown", "greenCount"],
      quest: ["revealCategory"]
    },
    {
      points: 400,
      rules: ["countOnly", "questEndurance", "copilot"],
      bosses: [],
      themes: ["frost", "tides"],
      badges: ["highRoller", "hardMode", "strikeThrough", "rewardEcho", "alphabet-compass", "boldOpener"],
      quest: ["letterProbe", "umtVowelCheck"]
    },
    {
      points: 800,
      rules: ["delayedFeedback", "arrowMode"],
      bosses: [],
      themes: ["storm", "forge"],
      badges: ["leanBuild", "monksVow", "fullCircle"],
      quest: ["sillyWord", "umtSpotlight"]
    },
    {
      points: 1300,
      rules: ["fakeFeedback"],
      bosses: ["chimera"],
      themes: ["glacier"],
      badges: ["combine", "encoreNight"],
      quest: []
    }
  ];

  // -- storage -------------------------------------------------------------------
  function readRaw(key) {
    try {
      var value = JSON.parse(window.localStorage.getItem(key) || "null");
      return value && typeof value === "object" ? value : null;
    } catch (_error) {
      return null;
    }
  }

  function write(data) {
    try { window.localStorage.setItem(STORE_KEY, JSON.stringify(data)); } catch (_error) { /* not saved */ }
  }

  // A player from before unlocks existed: credit for the runs they've won
  // (and Hard, if they've won on Medium or Hard already).
  function seed() {
    var ach = readRaw("umt-cuddle-achievements-v1");
    var got = ach && ach.unlocked && typeof ach.unlocked === "object" ? ach.unlocked : {};
    var wins = ["winEasy", "winMedium", "winHard"].filter(function has(id) { return got[id]; }).length;
    var points = wins * RUN_CAP + (got.firstBoss ? 150 : 0);
    var data = { points: points, runs: {}, hard: Boolean(got.winMedium || got.winHard), shown: 0 };
    data.shown = levelFor(points);
    return data;
  }

  var cache = null;
  function read() {
    if (cache) return cache;
    var data = readRaw(STORE_KEY);
    if (!data) {
      data = seed();
      write(data);
    }
    data.points = Math.max(0, Math.floor(Number(data.points) || 0));
    data.runs = data.runs && typeof data.runs === "object" ? data.runs : {};
    data.hard = Boolean(data.hard);
    data.shown = Math.max(0, Math.floor(Number(data.shown) || 0));
    cache = data;
    return data;
  }

  function save(data) {
    cache = data;
    write(data);
  }

  // Another tab may have played: read fresh now and then.
  window.addEventListener("storage", function onStorage(event) {
    if (event.key === STORE_KEY) cache = null;
  });

  // How many levels `points` has reached (0-4).
  function levelFor(points) {
    var reached = 0;
    LEVELS.forEach(function check(level, index) { if (points >= level.points) reached = index + 1; });
    return reached;
  }

  function points() {
    return read().points;
  }

  function level() {
    return levelFor(points());
  }

  function hardUnlocked() {
    return read().hard;
  }

  // Everything the levels not yet reached keep shut.
  function locked(key) {
    var reached = level();
    var out = [];
    LEVELS.forEach(function collect(entry, index) {
      if (index >= reached) out = out.concat(entry[key]);
    });
    return out;
  }

  function lockedRules() {
    return locked("rules");
  }

  function lockedBosses() {
    return locked("rules").concat(locked("bosses"));
  }

  function lockedQuestRewards() {
    return locked("quest");
  }

  function lockedThemes() {
    return locked("themes");
  }

  function badgeId(idOrName) {
    var tree = window.CuddleSkillTree;
    var node = tree && typeof tree.resolve === "function" && idOrName ? tree.resolve(idOrName) : null;
    return node ? node.id : String(idOrName || "");
  }

  function hidesReward(idOrName, name) {
    var shut = locked("badges");
    if (!shut.length) return false;
    var id = badgeId(idOrName);
    if (shut.indexOf(id) !== -1) return true;
    return name ? shut.indexOf(badgeId(name)) !== -1 : false;
  }

  // -- the pools -----------------------------------------------------------------
  // Badges: the reward catalog (reward screens, packs, the shop). The
  // economy also asks hidesReward (cuddle-economy-rarity-v8.js).
  var Game = window.CuddleEngine && window.CuddleEngine.CuddleGame;
  var proto = Game && Game.prototype;
  if (proto && !proto.__cuddleUnlocks) {
    proto.__cuddleUnlocks = true;
    var baseCatalog = proto._upgradeCatalog;
    if (typeof baseCatalog === "function") {
      proto._upgradeCatalog = function catalogWithUnlocks() {
        var list = baseCatalog.apply(this, arguments) || [];
        if (!locked("badges").length) return list;
        return list.filter(function keep(card) { return !card || !hidesReward(card.id, card.title); });
      };
    }
    var baseStartNew = proto.startNew;
    if (typeof baseStartNew === "function") {
      proto.startNew = function startNewWithUnlocks(difficulty) {
        ensureBook();
        // Hard stays shut until a Medium run is won.
        if (String(difficulty || "").toLowerCase() === "hard" && !hardUnlocked()) {
          var args = Array.prototype.slice.call(arguments);
          args[0] = "medium";
          return baseStartNew.apply(this, args);
        }
        return baseStartNew.apply(this, arguments);
      };
    }
  }

  function activeGame() {
    try {
      return window.CuddleBranchMap && typeof window.CuddleBranchMap.getActiveGame === "function"
        ? window.CuddleBranchMap.getActiveGame() : null;
    } catch (_error) {
      return null;
    }
  }

  function shuffle(items, random) {
    var copy = items.slice();
    for (var i = copy.length - 1; i > 0; i -= 1) {
      var j = Math.floor(random() * (i + 1));
      var held = copy[i];
      copy[i] = copy[j];
      copy[j] = held;
    }
    return copy;
  }

  // Quest rewards and bosses come from the quest book, which other files
  // replace with their own copies as they load: wrap whichever is current.
  var MARK = "__umtUnlocks";
  function ensureBook() {
    var book = window.CuddleQuestBook;
    if (!book || typeof book.rewardChoices !== "function" || book.rewardChoices[MARK]) return;
    var baseRewards = book.rewardChoices;
    var baseBosses = book.bossChoices;
    var baseMixed = book.mixedBoss;

    var rewardChoices = function rewardChoicesWithUnlocks(count, random) {
      var shut = lockedQuestRewards();
      if (!shut.length) return baseRewards.apply(this, arguments);
      var wanted = Math.max(0, Math.floor(Number(count) || 0));
      var pool = baseRewards.call(this, 99, random) || [];
      return pool.filter(function open(item) { return item && shut.indexOf(item.id) === -1; }).slice(0, wanted);
    };
    rewardChoices[MARK] = true;

    // Two bosses from the open ones, the way cuddle-quests.js draws them.
    var bossChoices = function bossChoicesWithUnlocks(random, excludeIds) {
      var shut = lockedBosses();
      var current = window.CuddleQuestBook || book;
      if (!shut.length || !Array.isArray(current.BOSSES)) return baseBosses.apply(this, arguments);
      var draw = typeof random === "function" ? random : Math.random;
      var skip = Array.isArray(excludeIds) ? excludeIds : [];
      var offered = current.BOSSES.filter(function open(boss) { return boss && !boss.retired && shut.indexOf(boss.id) === -1; });
      var pool = offered.filter(function fresh(boss) { return skip.indexOf(boss.id) === -1; });
      if (pool.length < 2) pool = offered.slice();
      return shuffle(pool, draw).slice(0, 2).map(function withReward(boss) {
        var reward = typeof current.getBossReward === "function" ? current.getBossReward(boss.rewardId) : null;
        return Object.assign({}, boss, { reward: reward });
      });
    };

    // The mixed boss (Chimera) is a boss of its own: while it's shut, the
    // slot it would take gets an ordinary open boss instead, one not
    // already on this run's map.
    var mixedBoss = function mixedBossWithUnlocks(random, turns) {
      if (lockedBosses().indexOf("chimera") === -1 || typeof baseMixed !== "function") return baseMixed.apply(this, arguments);
      var game = activeGame();
      var state = game && game.state;
      var used = (state && Array.isArray(state.bossesSeen) ? state.bossesSeen : []).slice();
      var map = state && state.branchMap;
      (map && Array.isArray(map.rows) ? map.rows : []).forEach(function row(entry) {
        (entry && entry.nodes || []).forEach(function node(item) { if (item && item.bossId) used.push(item.bossId); });
      });
      var choice = bossChoices(random, used)[0];
      return choice || baseMixed.apply(this, arguments);
    };

    var replacement = Object.assign({}, book, { rewardChoices: rewardChoices });
    if (typeof baseBosses === "function") replacement.bossChoices = bossChoices;
    if (typeof baseMixed === "function") replacement.mixedBoss = mixedBoss;
    window.CuddleQuestBook = Object.isFrozen(book) ? Object.freeze(replacement) : replacement;
  }

  // -- progress ------------------------------------------------------------------
  function inDuel(state) {
    return String((state && state.runId) || "").indexOf(":duel:") !== -1;
  }

  function toast(item) {
    var ach = window.CuddleAchievements;
    if (ach && typeof ach.toast === "function") ach.toast(item);
  }

  function names(entry) {
    var book = window.CuddleQuestBook;
    var tree = window.CuddleSkillTree;
    var rule = function ruleName(id) {
      if (id === "chimera") return "Chimera";
      var item = book && typeof book.getConstraint === "function" ? book.getConstraint(id) : null;
      return item ? item.title : id;
    };
    var badge = function badgeName(id) {
      var node = tree && typeof tree.resolve === "function" ? tree.resolve(id) : null;
      return node ? node.title : id;
    };
    var theme = function themeName(id) {
      var worlds = window.CuddleWorlds;
      for (var slot = 0; worlds && slot < 3; slot += 1) {
        var found = worlds.themeOptions(slot).find(function match(option) { return option.theme === id; });
        if (found) return found.name || id;
      }
      return id;
    };
    var quest = function questName(id) {
      var item = book && typeof book.getReward === "function" ? book.getReward(id) : null;
      return item ? item.title : id;
    };
    return {
      rules: entry.rules.map(rule).concat(entry.bosses.map(rule)),
      themes: (entry.themes || []).map(theme),
      badges: entry.badges.map(badge),
      quest: entry.quest.map(quest)
    };
  }

  function listText(items, most) {
    if (items.length <= most) {
      return items.length > 1 ? items.slice(0, -1).join(", ") + " and " + items[items.length - 1] : items.join("");
    }
    return items.slice(0, most).join(", ") + " and " + (items.length - most) + " more";
  }

  function announce(from, to) {
    for (var index = from; index < to; index += 1) {
      var list = names(LEVELS[index]);
      var all = list.rules.concat(list.themes, list.badges, list.quest);
      toast({ icon: "🔓", title: "Unlocked: level " + (index + 1), text: listText(all, 3) + " can now show up in your runs." });
    }
  }

  function tick() {
    ensureBook();
    var game = activeGame();
    var state = game && game.state;
    if (!state || !state.runId || inDuel(state)) return;
    var data = read();
    var id = String(state.runId);
    var earned = Math.min(RUN_CAP, Math.max(0, Math.floor(Number(state.score) || 0)));
    var credited = Math.max(0, Number(data.runs[id]) || 0);
    var changed = false;
    if (earned > credited) {
      data.points += earned - credited;
      data.runs[id] = earned;
      var keys = Object.keys(data.runs);
      while (keys.length > 40) delete data.runs[keys.shift()];
      changed = true;
    }
    var difficulty = String((state.megaState && state.megaState.difficulty) || "");
    if (state.status === "won" && (difficulty === "medium" || difficulty === "hard") && !data.hard) {
      data.hard = true;
      changed = true;
      toast({ icon: "🔓", title: "Hard unlocked", text: "You won a Medium run. Hard runs are open now." });
    }
    var reached = levelFor(data.points);
    if (reached > data.shown) {
      announce(data.shown, reached);
      data.shown = reached;
      changed = true;
    }
    if (changed) {
      save(data);
      refreshLanding();
    }
  }

  // -- the lobby -----------------------------------------------------------------
  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function swap(character) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" }[character];
    });
  }

  function landingInner() {
    var have = points();
    var reached = levelFor(have);
    var next = LEVELS[reached];
    if (!next) {
      return '<span class="umt-unl-head"><b>Unlocks</b><small>All unlocked</small></span>'
        + '<span class="umt-unl-track"><i style="width:100%"></i></span>'
        + '<small class="umt-unl-next">' + (hardUnlocked() ? "Every challenge, boss and badge is in the game." : "Win a Medium run to unlock Hard.") + "</small>";
    }
    var from = reached ? LEVELS[reached - 1].points : 0;
    var share = Math.max(0, Math.min(100, Math.round(((have - from) / (next.points - from)) * 100)));
    var list = names(next);
    return '<span class="umt-unl-head"><b>Unlocks</b><small>' + have.toLocaleString() + " / " + next.points.toLocaleString() + " points</small></span>"
      + '<span class="umt-unl-track"><i style="width:' + share + '%"></i></span>'
      + '<small class="umt-unl-next">Next: ' + esc(listText(list.rules.concat(list.themes, list.badges, list.quest), 2)) + "</small>";
  }

  function landingHtml() {
    return '<button type="button" class="umt-unl-bar" data-umt-unlocks-open aria-label="Unlocks: see what opens next">' + landingInner() + "</button>";
  }

  function refreshLanding() {
    document.querySelectorAll(".umt-unl-bar").forEach(function update(el) { el.innerHTML = landingInner(); });
    if (document.querySelector(".umt-unl-overlay")) renderPage();
  }

  function chips(items, kind) {
    return items.map(function chip(text) { return '<span class="umt-unl-chip is-' + kind + '">' + esc(text) + "</span>"; }).join("");
  }

  function pageHtml() {
    var have = points();
    var reached = levelFor(have);
    var rows = LEVELS.map(function row(entry, index) {
      var open = index < reached;
      var list = names(entry);
      var status = open ? "Unlocked" : (entry.points - have).toLocaleString() + " points to go";
      var groups = [
        list.rules.length ? '<div class="umt-unl-group"><small>Challenges and bosses</small><div>' + chips(list.rules, "rule") + "</div></div>" : "",
        list.themes.length ? '<div class="umt-unl-group"><small>Worlds</small><div>' + chips(list.themes, "theme") + "</div></div>" : "",
        list.badges.length ? '<div class="umt-unl-group"><small>Badges</small><div>' + chips(list.badges, "badge") + "</div></div>" : "",
        list.quest.length ? '<div class="umt-unl-group"><small>Quest rewards</small><div>' + chips(list.quest, "quest") + "</div></div>" : ""
      ].join("");
      return '<section class="umt-unl-level' + (open ? " is-open" : "") + (index === reached ? " is-next" : "") + '">'
        + '<header><b>Level ' + (index + 1) + '</b><span>' + entry.points.toLocaleString() + " points</span><em>" + status + "</em></header>"
        + groups + "</section>";
    }).join("");
    var hard = '<section class="umt-unl-level' + (hardUnlocked() ? " is-open" : "") + '">'
      + "<header><b>Hard</b><span>Win a Medium run</span><em>" + (hardUnlocked() ? "Unlocked" : "Locked") + "</em></header></section>";
    return '<div class="umt-unl-overlay" role="dialog" aria-modal="true" aria-labelledby="umtUnlTitle">'
      + '<section class="umt-unl-modal">'
      + '<header class="umt-unl-modal-head"><div><h2 id="umtUnlTitle">Unlocks</h2><p>' + have.toLocaleString() + " progress points</p></div>"
      + '<button type="button" class="umt-unl-close" data-umt-unlocks-close aria-label="Close unlocks">×</button></header>'
      + '<p class="umt-unl-help">Every run adds its points to your progress, up to 500 a run. Runs you don\'t finish count too. New challenges, bosses, worlds, badges and quest rewards open as you go.</p>'
      + '<div class="umt-unl-scroll">' + rows + hard + "</div>"
      + "</section></div>";
  }

  function renderPage() {
    var existing = document.querySelector(".umt-unl-overlay");
    var scroll = existing ? existing.querySelector(".umt-unl-scroll") : null;
    var top = scroll ? scroll.scrollTop : 0;
    if (existing) existing.remove();
    (document.getElementById("cuddleScreen") || document.body).insertAdjacentHTML("beforeend", pageHtml());
    var fresh = document.querySelector(".umt-unl-overlay .umt-unl-scroll");
    if (fresh) fresh.scrollTop = top;
  }

  function closePage() {
    var layer = document.querySelector(".umt-unl-overlay");
    if (layer) layer.remove();
  }

  document.addEventListener("click", function onClick(event) {
    var target = event.target;
    if (!target || !target.closest) return;
    if (target.closest("[data-umt-unlocks-open]")) {
      event.preventDefault();
      renderPage();
      return;
    }
    if (target.closest("[data-umt-unlocks-close]") || target.classList.contains("umt-unl-overlay")) {
      event.preventDefault();
      closePage();
    }
  });

  document.addEventListener("keydown", function onKey(event) {
    if (event.key === "Escape" && document.querySelector(".umt-unl-overlay")) closePage();
  });

  read();
  ensureBook();
  setInterval(tick, 1000);

  window.CuddleUnlocks = Object.freeze({
    LEVELS: LEVELS,
    RUN_CAP: RUN_CAP,
    points: points,
    level: level,
    hardUnlocked: hardUnlocked,
    lockedRules: lockedRules,
    lockedBosses: lockedBosses,
    lockedQuestRewards: lockedQuestRewards,
    lockedThemes: lockedThemes,
    hidesReward: hidesReward,
    landingHtml: landingHtml,
    open: renderPage,
    close: closePage,
    // For testing: open everything (or set progress to `value`).
    unlockAll: function unlockAll(value) {
      var data = read();
      data.points = value == null ? LEVELS[LEVELS.length - 1].points : Math.max(0, Math.floor(Number(value) || 0));
      data.hard = value == null ? true : data.hard;
      data.shown = levelFor(data.points);
      save(data);
      refreshLanding();
      return data.points;
    }
  });
}());
