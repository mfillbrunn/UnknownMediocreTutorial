/* Cuddle: unlocks. The harder and more involved parts of the game open up
 * as the player plays, a couple at a time.
 *
 * Progress points: every run, finished or not, adds its points to the
 * player's progress, up to 500 a run (counted as the run goes, so a run
 * given up halfway still counts what it scored). Progress passes a line of
 * small unlocks (STEPS), each a challenge, a boss, a world, a pair of
 * badges or a pair of quest rewards. Until one opens, what it holds is
 * never drawn: not on the map, not on reward screens, in packs or the
 * shop, and not when a quest pays out.
 *
 * A run opens at most two unlocks (RUN_UNLOCKS), however many points it
 * scores: progress beyond that waits, and the next run opens what it has
 * already earned (up to two again), so new things arrive a couple at a
 * time rather than all at once.
 *
 * Hard opens once a Standard run is won.
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
  var RUN_UNLOCKS = 2;

  // The unlocks in the order they open, each with the progress it needs.
  // `rules` are constraints (cuddle-quests.js CONSTRAINTS) that are a stage
  // challenge, a boss or both; `bosses` are bosses alone; `themes` are world
  // themes (cuddle-worlds.js THEMES) a run can draw; `badges` and `quest`
  // are rewards. Simpler things first, the hardest last.
  var STEPS = [
    { points: 100, rules: ["noMulligans"] },
    { points: 200, badges: ["ideaTiles", "waveTiles"] },
    { points: 300, badges: ["greenCount"], quest: ["revealCategory"] },
    { points: 400, themes: ["swamp"] },
    { points: 520, rules: ["countOnly", "wordChain"] },
    { points: 640, badges: ["doubleDown", "highRoller"] },
    { points: 760, quest: ["umtVowelCheck"] },
    { points: 880, rules: ["questEndurance"] },
    { points: 1000, themes: ["frost"] },
    { points: 1150, badges: ["hardMode", "strikeThrough"] },
    { points: 1300, rules: ["copilot"] },
    { points: 1450, themes: ["tides"] },
    { points: 1600, badges: ["rewardEcho", "alphabet-compass"] },
    { points: 1750, rules: ["delayedFeedback", "lockedIn"] },
    { points: 1900, quest: ["sillyWord", "umtSpotlight"] },
    { points: 2050, themes: ["storm"] },
    { points: 2200, badges: ["boldOpener", "leanBuild"] },
    { points: 2350, rules: ["arrowMode"] },
    { points: 2500, themes: ["forge"] },
    { points: 2650, badges: ["monksVow", "fullCircle"] },
    { points: 2800, rules: ["fakeFeedback"] },
    { points: 2950, bosses: ["chimera"] },
    { points: 3100, themes: ["glacier"] },
    { points: 3250, badges: ["combine"] },
    // The legendaries added with cuddle-new-badges.js, two at a time.
    { points: 3400, badges: ["cleanSlate", "ascetic"] },
    { points: 3550, badges: ["questMastery", "overtime"] },
    { points: 3700, badges: ["blackMarket", "treasureChest"] },
    { points: 3850, badges: ["goldenOpener"] }
  ].map(function complete(step) {
    return Object.freeze({
      points: step.points,
      rules: step.rules || [],
      bosses: step.bosses || [],
      themes: step.themes || [],
      badges: step.badges || [],
      quest: step.quest || []
    });
  });

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

  // How many unlocks `points` has paid for (whether opened yet or not).
  function earnedSteps(points) {
    var reached = 0;
    STEPS.forEach(function check(step, index) { if (points >= step.points) reached = index + 1; });
    return reached;
  }

  // A player from before unlocks existed: credit for the runs they've won
  // (and Hard, if they've won on Medium or Hard already), opened at once.
  function seed() {
    var ach = readRaw("umt-cuddle-achievements-v1");
    var got = ach && ach.unlocked && typeof ach.unlocked === "object" ? ach.unlocked : {};
    var wins = ["winEasy", "winMedium", "winHard"].filter(function has(id) { return got[id]; }).length;
    var points = wins * RUN_CAP + (got.firstBoss ? 150 : 0);
    return { points: points, runs: {}, hard: Boolean(got.winMedium || got.winHard), opened: earnedSteps(points), runOpened: {} };
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
    // Saved before unlocks came in small steps: what its points paid for
    // stays open.
    if (!Number.isFinite(Number(data.opened))) data.opened = earnedSteps(data.points);
    data.opened = Math.max(0, Math.min(STEPS.length, Math.floor(Number(data.opened) || 0)));
    data.runOpened = data.runOpened && typeof data.runOpened === "object" ? data.runOpened : {};
    delete data.shown;
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

  function points() {
    return read().points;
  }

  // How many unlocks are open.
  function level() {
    return read().opened;
  }

  function hardUnlocked() {
    return read().hard;
  }

  // Everything the unlocks not yet opened keep shut.
  function locked(key) {
    var out = [];
    STEPS.slice(level()).forEach(function collect(step) { out = out.concat(step[key]); });
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
      themes: entry.themes.map(theme),
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

  function stepNames(step) {
    var list = names(step);
    return list.rules.concat(list.themes, list.badges, list.quest);
  }

  // What kind of thing a step opens, in the words of its notice.
  function stepText(step) {
    if (step.rules.length) {
      var book = window.CuddleQuestBook;
      var rule = book && typeof book.getConstraint === "function" ? book.getConstraint(step.rules[0]) : null;
      return rule && !rule.boss ? "A new stage challenge can now turn up in your runs."
        : "A new challenge can now turn up on stages and as a boss.";
    }
    if (step.bosses.length) return "A new boss can now turn up in your runs.";
    if (step.themes.length) return "A new world can now turn up in your runs.";
    if (step.badges.length && step.quest.length) return "New rewards can now turn up in your runs.";
    if (step.badges.length) return "New badges can now turn up as rewards.";
    return "New quest rewards can now turn up.";
  }

  function announce(index) {
    var step = STEPS[index];
    toast({ icon: "🔓", title: "Unlocked: " + listText(stepNames(step), 2), text: stepText(step) });
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
      toast({ icon: "🔓", title: "Hard unlocked", text: "You won a Standard run. Hard runs are open now." });
    }
    // At most RUN_UNLOCKS open in this run; the rest wait for the next one.
    var used = Math.max(0, Number(data.runOpened[id]) || 0);
    while (data.opened < earnedSteps(data.points) && used < RUN_UNLOCKS) {
      announce(data.opened);
      data.opened += 1;
      used += 1;
      data.runOpened[id] = used;
      var runs = Object.keys(data.runOpened);
      while (runs.length > 40) delete data.runOpened[runs.shift()];
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

  // Unlocks paid for but waiting, because the last run already opened its two.
  function waiting() {
    var data = read();
    return Math.max(0, earnedSteps(data.points) - data.opened);
  }

  function landingInner() {
    var data = read();
    var have = data.points;
    var next = STEPS[data.opened];
    if (!next) {
      return '<span class="umt-unl-head"><b>Unlocks</b><small>All unlocked</small></span>'
        + '<span class="umt-unl-track"><i style="width:100%"></i></span>'
        + '<small class="umt-unl-next">' + (hardUnlocked() ? "Every challenge, boss, world and badge is in the game." : "Win a Standard run to unlock Hard.") + "</small>";
    }
    var ready = waiting();
    var from = data.opened ? STEPS[data.opened - 1].points : 0;
    var share = ready ? 100 : Math.max(0, Math.min(100, Math.round(((have - from) / (next.points - from)) * 100)));
    var head = ready
      ? (ready === 1 ? "1 unlock ready" : ready + " unlocks ready")
      : have.toLocaleString() + " / " + next.points.toLocaleString() + " points";
    var line = ready
      ? "Opens in your next run: " + esc(listText(stepNames(next), 2))
      : "Next: " + esc(listText(stepNames(next), 2));
    return '<span class="umt-unl-head"><b>Unlocks</b><small>' + head + "</small></span>"
      + '<span class="umt-unl-track' + (ready ? " is-ready" : "") + '"><i style="width:' + share + '%"></i></span>'
      + '<small class="umt-unl-next">' + line + "</small>";
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

  function stepChips(step) {
    var list = names(step);
    return chips(list.rules, "rule") + chips(list.themes, "theme") + chips(list.badges, "badge") + chips(list.quest, "quest");
  }

  function pageHtml() {
    var data = read();
    var have = data.points;
    var earned = earnedSteps(have);
    var rows = STEPS.map(function row(step, index) {
      var open = index < data.opened;
      var status = open ? "Unlocked" : index < earned ? "Opens next run" : (step.points - have).toLocaleString() + " points to go";
      return '<section class="umt-unl-level' + (open ? " is-open" : "") + (index === data.opened ? " is-next" : "") + (!open && index < earned ? " is-ready" : "") + '">'
        + "<header><b>" + step.points.toLocaleString() + " points</b><span></span><em>" + status + "</em></header>"
        + '<div class="umt-unl-chips">' + stepChips(step) + "</div></section>";
    }).join("");
    var hard = '<section class="umt-unl-level' + (hardUnlocked() ? " is-open" : "") + '">'
      + "<header><b>Hard</b><span>Win a Standard run</span><em>" + (hardUnlocked() ? "Unlocked" : "Locked") + "</em></header></section>";
    return '<div class="umt-unl-overlay" role="dialog" aria-modal="true" aria-labelledby="umtUnlTitle">'
      + '<section class="umt-unl-modal">'
      + '<header class="umt-unl-modal-head"><div><h2 id="umtUnlTitle">Unlocks</h2><p>' + have.toLocaleString() + " progress points · " + data.opened + " of " + STEPS.length + " unlocked</p></div>"
      + '<button type="button" class="umt-unl-close" data-umt-unlocks-close aria-label="Close unlocks">×</button></header>'
      + '<div class="umt-unl-help"><p>Every run adds its points to your progress, up to 500 a run, and runs you don\'t finish count too. A run opens at most ' + RUN_UNLOCKS + " unlocks; anything more you've earned opens in your next run.</p>"
      + '<p class="umt-unl-legend"><span class="umt-unl-chip is-rule">Challenge or boss</span><span class="umt-unl-chip is-theme">World</span><span class="umt-unl-chip is-badge">Badge</span><span class="umt-unl-chip is-quest">Quest reward</span></p></div>'
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
  // When the game changes (cuddle-pulse.js), not every second.
  if (window.CuddlePulse) window.CuddlePulse.on(tick, 5000);
  else setInterval(tick, 1000);

  window.CuddleUnlocks = Object.freeze({
    STEPS: STEPS,
    RUN_CAP: RUN_CAP,
    RUN_UNLOCKS: RUN_UNLOCKS,
    points: points,
    level: level,
    waiting: waiting,
    hardUnlocked: hardUnlocked,
    lockedRules: lockedRules,
    lockedBosses: lockedBosses,
    lockedQuestRewards: lockedQuestRewards,
    lockedThemes: lockedThemes,
    hidesReward: hidesReward,
    landingHtml: landingHtml,
    open: renderPage,
    close: closePage,
    // For testing: open everything, or set progress to `value` points with
    // what they pay for opened at once.
    unlockAll: function unlockAll(value) {
      var data = read();
      data.points = value == null ? STEPS[STEPS.length - 1].points : Math.max(0, Math.floor(Number(value) || 0));
      data.hard = value == null ? true : data.hard;
      data.opened = earnedSteps(data.points);
      save(data);
      refreshLanding();
      return data.points;
    }
  });
}());
