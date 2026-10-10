/* Cuddle: achievements and Cuddle Coins.
 *
 * Coins: a run costs one Cuddle Coin to start. A new player starts with
 * one; finishing that first run (won or lost) gives three more, once; and
 * each new day the game is opened gives one. Achievements are earned in
 * play and each can be claimed once, from the Achievements page, for one
 * more coin.
 *
 * Everything lives in this browser (localStorage). Achievements are
 * checked as the run is played: a light poll of the active game, plus a
 * hook on each guess for the ones that depend on a single guess.
 */
(function () {
  "use strict";

  if (window.CuddleAchievements) return;

  var COIN_KEY = "umt-cuddle-coins-v1";
  var ACH_KEY = "umt-cuddle-achievements-v1";

  // -- the list ------------------------------------------------------------------
  var GROUPS = [
    { id: "wins", label: "Wins" },
    { id: "run", label: "In a run" },
    { id: "stage", label: "In a stage" },
    { id: "powers", label: "Powers" },
    { id: "ascension", label: "Ascension" }
  ];

  var LIST = [
    { id: "winEasy", group: "wins", icon: "🏆", title: "Easy Win", text: "Win a run on Easy." },
    { id: "winMedium", group: "wins", icon: "🏆", title: "Medium Win", text: "Win a run on Medium." },
    { id: "winHard", group: "wins", icon: "🏆", title: "Hard Win", text: "Win a run on Hard." },
    { id: "flawless", group: "wins", icon: "⭐", title: "Flawless", text: "Win a run without ever guessing past the guess window." },
    { id: "firstBoss", group: "run", icon: "💀", title: "Boss Down", text: "Defeat your first boss." },
    { id: "points500", group: "run", icon: "📈", title: "500 Club", text: "Reach 500 points in a run." },
    { id: "points1000", group: "run", icon: "📈", title: "1,000 Club", text: "Reach 1,000 points in a run." },
    { id: "points2000", group: "run", icon: "📈", title: "2,000 Club", text: "Reach 2,000 points in a run." },
    { id: "money100", group: "run", icon: "💰", title: "Pocketful", text: "Earn $100 in total in one run." },
    { id: "money200", group: "run", icon: "💰", title: "Moneybags", text: "Earn $200 in total in one run." },
    { id: "firstGuess", group: "stage", icon: "🎯", title: "First Try", text: "Solve a stage on your first guess." },
    { id: "secondGuess", group: "stage", icon: "🎯", title: "Second Look", text: "Solve a stage on your second guess." },
    { id: "stage100", group: "stage", icon: "✨", title: "Big Stage", text: "Score 100 points in a single stage." },
    { id: "stage200", group: "stage", icon: "✨", title: "Huge Stage", text: "Score 200 points in a single stage." },
    { id: "legendary4", group: "powers", icon: "🏅", title: "Legend", text: "Hold 4 Legendary rewards in one run." },
    { id: "epic10", group: "powers", icon: "💎", title: "Epic Collector", text: "Pick 10 Epic rewards in one run." },
    { id: "maxCommon", group: "powers", icon: "⬆", title: "Maxed Out", text: "Max out a Common power for the first time." },
    { id: "maxRare", group: "powers", icon: "⬆", title: "Rare Mastery", text: "Max out a Rare power with several levels." }
  ];
  for (var level = 1; level <= 9; level += 1) {
    LIST.push({ id: "ascension" + level, group: "ascension", icon: "▲", title: "Ascension " + level, text: "Win a Hard run at Ascension " + level + "." });
  }
  var BY_ID = {};
  LIST.forEach(function index(item) { BY_ID[item.id] = item; });

  // -- storage -----------------------------------------------------------------
  function read(key, fallback) {
    try {
      var value = JSON.parse(window.localStorage.getItem(key) || "null");
      return value && typeof value === "object" ? value : fallback;
    } catch (_error) {
      return fallback;
    }
  }

  function write(key, value) {
    try { window.localStorage.setItem(key, JSON.stringify(value)); } catch (_error) { /* not saved */ }
  }

  function today() {
    var now = new Date();
    return now.getFullYear() + "-" + (now.getMonth() + 1) + "-" + now.getDate();
  }

  // The wallet, with today's free coin added the first time it's read today.
  function wallet() {
    var data = read(COIN_KEY, null);
    if (!data) {
      data = { coins: 1, lastDaily: today(), firstRunBonus: false };
      write(COIN_KEY, data);
      return data;
    }
    data.coins = Math.max(0, Math.floor(Number(data.coins) || 0));
    if (data.lastDaily !== today()) {
      data.coins += 1;
      data.lastDaily = today();
      write(COIN_KEY, data);
    }
    return data;
  }

  function coins() {
    return wallet().coins;
  }

  function addCoins(count) {
    var data = wallet();
    data.coins += Math.max(0, Math.floor(Number(count) || 0));
    write(COIN_KEY, data);
    return data.coins;
  }

  // Spends one coin to start a run; false when there are none.
  function spend() {
    var data = wallet();
    if (data.coins < 1) return false;
    data.coins -= 1;
    write(COIN_KEY, data);
    return true;
  }

  function record() {
    var data = read(ACH_KEY, null) || {};
    data.unlocked = data.unlocked && typeof data.unlocked === "object" ? data.unlocked : {};
    data.claimed = data.claimed && typeof data.claimed === "object" ? data.claimed : {};
    return data;
  }

  var toastQueue = [];

  function unlock(id) {
    if (!BY_ID[id]) return;
    var data = record();
    if (data.unlocked[id]) return;
    data.unlocked[id] = Date.now();
    write(ACH_KEY, data);
    toastQueue.push(BY_ID[id]);
    showToast();
  }

  function claim(id) {
    var data = record();
    if (!data.unlocked[id] || data.claimed[id]) return false;
    data.claimed[id] = Date.now();
    write(ACH_KEY, data);
    addCoins(1);
    return true;
  }

  // -- detection ------------------------------------------------------------------
  function activeGame() {
    try {
      return window.CuddleBranchMap && typeof window.CuddleBranchMap.getActiveGame === "function"
        ? window.CuddleBranchMap.getActiveGame() : null;
    } catch (_error) {
      return null;
    }
  }

  function inDuel(state) {
    return String((state && state.runId) || "").indexOf(":duel:") !== -1;
  }

  function runMemo(state) {
    if (!state.umtAch || typeof state.umtAch !== "object") {
      state.umtAch = { late: false, earned: 0, lastMoney: Math.max(0, Number(state.cuddleMoney) || 0), finished: false };
    }
    return state.umtAch;
  }

  function difficultyOf(state) {
    return String((state.megaState && state.megaState.difficulty) || "");
  }

  function countPowers(game) {
    var tree = window.CuddleSkillTree;
    var out = { legendary: 0, epic: 0, maxCommon: false, maxRare: false };
    if (!tree || !Array.isArray(tree.BRANCHES) || typeof tree.level !== "function") return out;
    tree.BRANCHES.forEach(function branch(group) {
      (group.nodes || []).forEach(function node(item) {
        if (!item || item.type === "combo") return;
        var level = 0;
        try { level = Math.max(0, Number(tree.level(game, item)) || 0); } catch (_error) { level = 0; }
        if (!level) return;
        if (item.tier === "legendary") out.legendary += level;
        if (item.tier === "epic") out.epic += level;
        var max = Number(item.maxLevel) || 1;
        if (max > 1 && level >= max && item.tier === "common") out.maxCommon = true;
        if (max > 1 && level >= max && item.tier === "rare") out.maxRare = true;
      });
    });
    return out;
  }

  function check() {
    var game = activeGame();
    var state = game && game.state;
    if (!state || !state.runId || inDuel(state)) return;
    var memo = runMemo(state);
    var money = Math.max(0, Number(state.cuddleMoney) || 0);
    if (money > memo.lastMoney) memo.earned += money - memo.lastMoney;
    memo.lastMoney = money;

    var score = Number(state.score) || 0;
    if (score >= 500) unlock("points500");
    if (score >= 1000) unlock("points1000");
    if (score >= 2000) unlock("points2000");
    if (memo.earned >= 100) unlock("money100");
    if (memo.earned >= 200) unlock("money200");
    var stagePoints = Number(state.roundScore) || 0;
    if (stagePoints >= 100) unlock("stage100");
    if (stagePoints >= 200) unlock("stage200");
    var bosses = Math.max(Number(state.bossesCleared) || 0, Array.isArray(state.bossGatesDone) ? state.bossGatesDone.length : 0);
    if (bosses > 0 || state.status === "won") unlock("firstBoss");

    var powers = countPowers(game);
    if (powers.legendary >= 4) unlock("legendary4");
    if (powers.epic >= 10) unlock("epic10");
    if (powers.maxCommon) unlock("maxCommon");
    if (powers.maxRare) unlock("maxRare");

    if ((state.status === "won" || state.status === "lost") && !memo.finished) {
      memo.finished = true;
      // The first run finished, won or lost, is worth three coins.
      var data = wallet();
      if (!data.firstRunBonus) {
        data.firstRunBonus = true;
        data.coins += 3;
        write(COIN_KEY, data);
        toastQueue.push({ icon: "🪙", title: "+3 Cuddle Coins", text: "For finishing your first run." });
        showToast();
      }
      if (state.status === "won") {
        var difficulty = difficultyOf(state);
        if (difficulty === "easy") unlock("winEasy");
        if (difficulty === "medium") unlock("winMedium");
        if (difficulty === "hard") unlock("winHard");
        if (!memo.late) unlock("flawless");
        var ascension = state.umtAscension && Number(state.umtAscension.level);
        if (difficulty === "hard" && ascension >= 1 && ascension <= 9) unlock("ascension" + ascension);
      }
      try { game.save(); } catch (_error) { /* next save */ }
    }
  }

  // Per guess: a late guess spoils Flawless; a solve on guess 1 or 2.
  var Game = window.CuddleEngine && window.CuddleEngine.CuddleGame;
  if (Game && !Game.prototype.__umtAchievements) {
    Game.prototype.__umtAchievements = true;
    var baseSubmit = Game.prototype.submitDraft;
    Game.prototype.submitDraft = function submitDraftWithAchievements() {
      var state = this.state;
      var before = state && Array.isArray(state.history) ? state.history.length : 0;
      var result = baseSubmit.apply(this, arguments);
      state = this.state;
      try {
        var history = state && Array.isArray(state.history) ? state.history : [];
        if (result && result.ok !== false && history.length > before && !inDuel(state)) {
          var entry = history[history.length - 1];
          var memo = runMemo(state);
          if (Number(entry && entry.latePenalty) > 0) memo.late = true;
          if (entry && state.secret && String(entry.word).toUpperCase() === String(state.secret).toUpperCase()) {
            if (history.length === 1) unlock("firstGuess");
            if (history.length === 2) unlock("secondGuess");
          }
        }
      } catch (_error) { /* never block a guess */ }
      return result;
    };
  }

  // -- toast -----------------------------------------------------------------------
  var toastBusy = false;
  function showToast() {
    if (toastBusy || !toastQueue.length || !document.body) return;
    var item = toastQueue.shift();
    toastBusy = true;
    var el = document.createElement("div");
    el.className = "umt-ach-toast";
    el.setAttribute("role", "status");
    el.innerHTML = '<span class="umt-ach-toast-icon" aria-hidden="true">' + iconHtml(item.icon) + "</span>"
      + "<span><b>" + escapeHtml(item.title) + "</b><small>" + escapeHtml(item.text) + "</small></span>";
    (document.getElementById("cuddleScreen") || document.body).appendChild(el);
    setTimeout(function hide() { el.classList.add("is-leaving"); }, 2600);
    setTimeout(function remove() { el.remove(); toastBusy = false; showToast(); }, 3000);
  }

  // -- the page ----------------------------------------------------------------------
  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function swap(character) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" }[character];
    });
  }

  function iconHtml(icon) {
    var icons = window.CuddleIcons;
    if (icon === "▲") return '<span class="umt-ach-tri">▲</span>';
    return icons && typeof icons.svg === "function" ? icons.svg(icon) : escapeHtml(icon);
  }

  function coinChip() {
    return '<span class="umt-coin-chip" title="Cuddle Coins: a run costs 1"><span class="umt-coin" aria-hidden="true"></span><b>' + coins() + "</b></span>";
  }

  function pageHtml() {
    var data = record();
    var unlockedCount = LIST.filter(function has(item) { return data.unlocked[item.id]; }).length;
    var groups = GROUPS.map(function group(g) {
      var items = LIST.filter(function inGroup(item) { return item.group === g.id; }).map(function card(item) {
        var unlocked = Boolean(data.unlocked[item.id]);
        var claimed = Boolean(data.claimed[item.id]);
        var state = claimed ? "is-claimed" : unlocked ? "is-ready" : "is-locked";
        var foot = claimed ? "Claimed" : unlocked ? "Tap to claim +1 coin" : "Locked";
        return '<button type="button" class="umt-ach ' + state + '" data-umt-ach="' + item.id + '"' + (unlocked && !claimed ? "" : ' aria-disabled="true"') + ">"
          + '<span class="umt-ach-icon" aria-hidden="true">' + iconHtml(item.icon) + "</span>"
          + '<span class="umt-ach-body"><b>' + escapeHtml(item.title) + "</b><small>" + escapeHtml(item.text) + "</small>"
          + '<em class="umt-ach-foot">' + foot + "</em></span></button>";
      }).join("");
      return '<section class="umt-ach-group"><h3>' + escapeHtml(g.label) + '</h3><div class="umt-ach-grid">' + items + "</div></section>";
    }).join("");
    return '<div class="umt-ach-overlay" role="dialog" aria-modal="true" aria-labelledby="umtAchTitle">'
      + '<section class="umt-ach-modal">'
      + '<header class="umt-ach-head"><div><h2 id="umtAchTitle">Achievements</h2><p>' + unlockedCount + " of " + LIST.length + " unlocked</p></div>"
      + coinChip()
      + '<button type="button" class="umt-ach-close" data-umt-ach-close aria-label="Close achievements">×</button></header>'
      + '<p class="umt-ach-help">A run costs 1 Cuddle Coin. You get 1 free coin each day, and 1 for each achievement you claim.</p>'
      + '<div class="umt-ach-body-scroll">' + groups + "</div>"
      + "</section></div>";
  }

  var openNow = false;

  function open() {
    openNow = true;
    render();
  }

  function close() {
    openNow = false;
    var layer = document.querySelector(".umt-ach-overlay");
    if (layer) layer.remove();
    refreshLanding();
  }

  function render() {
    var existing = document.querySelector(".umt-ach-overlay");
    if (!openNow) {
      if (existing) existing.remove();
      return;
    }
    var host = document.getElementById("cuddleScreen") || document.body;
    var scroll = existing ? existing.querySelector(".umt-ach-body-scroll") : null;
    var top = scroll ? scroll.scrollTop : 0;
    if (existing) existing.remove();
    host.insertAdjacentHTML("beforeend", pageHtml());
    var fresh = document.querySelector(".umt-ach-overlay .umt-ach-body-scroll");
    if (fresh) fresh.scrollTop = top;
  }

  // The lobby's coin count (cuddle-ui.js draws the chip; this keeps it fresh).
  function refreshLanding() {
    document.querySelectorAll("[data-umt-coin-count]").forEach(function update(element) {
      element.textContent = String(coins());
    });
  }

  document.addEventListener("click", function onClick(event) {
    var target = event.target;
    if (!target || !target.closest) return;
    if (target.closest("[data-umt-ach-close]") || target.classList.contains("umt-ach-overlay")) {
      event.preventDefault();
      close();
      return;
    }
    var card = target.closest("[data-umt-ach]");
    if (card) {
      event.preventDefault();
      if (claim(card.dataset.umtAch)) {
        render();
        var claimed = document.querySelector('.umt-ach-overlay [data-umt-ach="' + card.dataset.umtAch + '"]');
        if (claimed) claimed.classList.add("is-just-claimed");
        refreshLanding();
      }
    }
  });

  document.addEventListener("keydown", function onKey(event) {
    if (openNow && event.key === "Escape") close();
  });

  wallet();
  setInterval(check, 500);

  window.CuddleAchievements = Object.freeze({
    LIST: LIST,
    open: open,
    close: close,
    coins: coins,
    spend: spend,
    addCoins: addCoins,
    unlock: unlock,
    claim: claim,
    record: record,
    check: check
  });
}());
