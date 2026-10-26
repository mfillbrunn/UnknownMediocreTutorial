/* Cuddle rankings.
 *
 * Every finished Standard or Hard run (won or lost) is kept on this device
 * and sent to the server's board (server/routes/cuddleRankings.js). The
 * home page's Rankings button opens both: "Mine" (this device's best runs)
 * and "Everyone" (each player's best, from the server). Tutorial runs and
 * Duels are left out.
 */
(function () {
  "use strict";

  if (window.CuddleRankings) return;

  var STORE_KEY = "umtCuddleRankings";
  var DEVICE_KEY = "umtDeviceId";
  var NAMES = { medium: "Standard", hard: "Hard" };
  var KEEP = 50;

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" }[c];
    });
  }

  function read() {
    try {
      var list = JSON.parse(window.localStorage.getItem(STORE_KEY) || "[]");
      return Array.isArray(list) ? list.filter(function (item) { return item && item.runId; }) : [];
    } catch (_error) {
      return [];
    }
  }

  function write(list) {
    try { window.localStorage.setItem(STORE_KEY, JSON.stringify(list.slice(0, KEEP))); } catch (_error) { /* not kept */ }
  }

  // The same id the play tracking uses (client/player-insights.js): the
  // account's, or this browser's.
  function playerId() {
    var user = window.currentUser;
    if (user && user.id) return String(user.id);
    try {
      var id = window.localStorage.getItem(DEVICE_KEY);
      if (!id) {
        id = "d-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
        window.localStorage.setItem(DEVICE_KEY, id);
      }
      return id;
    } catch (_error) {
      return "guest";
    }
  }

  function playerName() {
    var profile = window.myProfile;
    return (profile && profile.username) || "Guest";
  }

  function difficultyOf(state) {
    var value = String((state.megaState && state.megaState.difficulty) || state.difficulty || "").toLowerCase();
    return NAMES[value] ? value : "";
  }

  // -- recording a finished run -------------------------------------------------
  function record(state) {
    if (!state || (state.status !== "won" && state.status !== "lost")) return;
    var runId = String(state.runId || "");
    if (!runId || runId.indexOf(":duel:") !== -1) return;
    var difficulty = difficultyOf(state);
    if (!difficulty) return;
    var list = read();
    if (list.some(function (item) { return item.runId === runId; })) return;
    var entry = {
      runId: runId,
      difficulty: difficulty,
      ascension: difficulty === "hard" ? Number(state.umtAscension && state.umtAscension.level) || 0 : 0,
      score: Math.max(0, Math.round(Number(state.score) || 0)),
      stages: Number(state.umtRunStats && state.umtRunStats.stages) || 0,
      won: state.status === "won",
      seed: window.CuddleSeed && typeof window.CuddleSeed.current === "function" ? window.CuddleSeed.current({ state: state }) : "",
      at: Date.now()
    };
    list.push(entry);
    list.sort(function (a, b) { return b.score - a.score; });
    write(list);
    send(entry);
  }

  function send(entry) {
    try {
      fetch("/api/cuddle/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          runId: entry.runId,
          playerId: playerId(),
          name: playerName(),
          isGuest: !(window.currentUser && window.currentUser.id) || Boolean(window.currentUser.isGuest),
          difficulty: entry.difficulty,
          ascension: entry.ascension,
          score: entry.score,
          stages: entry.stages,
          won: entry.won,
          seed: entry.seed
        }),
        keepalive: true
      }).catch(function () { /* the board just misses it */ });
    } catch (_error) { /* no network */ }
  }

  function watch() {
    var map = window.CuddleBranchMap;
    var game = map && typeof map.getActiveGame === "function" ? map.getActiveGame() : null;
    if (game && game.state) record(game.state);
  }

  if (window.CuddlePulse) window.CuddlePulse.on(watch, 3000);
  else setInterval(watch, 2000);

  // -- the overlay --------------------------------------------------------------
  var view = { tab: "mine", difficulty: "medium", board: null, loading: false, error: false };

  function rowHtml(rank, item, mine) {
    var label = item.won ? "Won" : (item.stages ? item.stages + " stage" + (item.stages === 1 ? "" : "s") : "Lost");
    return '<li class="umt-rank-row' + (mine ? " is-mine" : "") + '">'
      + '<span class="umt-rank-pos">' + rank + "</span>"
      + '<span class="umt-rank-name">' + escapeHtml(item.name || (mine ? "You" : "Player"))
      + (item.ascension ? ' <i class="umt-rank-asc">A' + item.ascension + "</i>" : "") + "</span>"
      + '<span class="umt-rank-result' + (item.won ? " is-won" : "") + '">' + escapeHtml(label) + "</span>"
      + '<b class="umt-rank-score">' + Number(item.score || 0).toLocaleString() + "</b></li>";
  }

  function mineHtml() {
    var list = read().filter(function (item) { return item.difficulty === view.difficulty; })
      .sort(function (a, b) { return b.score - a.score; }).slice(0, 20);
    if (!list.length) return '<p class="umt-rank-empty">No ' + NAMES[view.difficulty] + " runs finished yet. Your best ones show up here.</p>";
    return '<ol class="umt-rank-list">' + list.map(function (item, index) {
      return rowHtml(index + 1, { name: new Date(item.at).toLocaleDateString(), score: item.score, stages: item.stages, won: item.won, ascension: item.ascension }, false);
    }).join("") + "</ol>";
  }

  function everyoneHtml() {
    if (view.loading) return '<p class="umt-rank-empty">Loading…</p>';
    if (view.error) return '<p class="umt-rank-empty">Couldn\'t reach the rankings. Check your connection and try again.</p>';
    var board = view.board && view.board[view.difficulty];
    if (!board) return '<p class="umt-rank-empty">Loading…</p>';
    if (!board.available) return '<p class="umt-rank-empty">Global rankings aren\'t switched on yet.</p>';
    if (!board.rows.length) return '<p class="umt-rank-empty">No ' + NAMES[view.difficulty] + " runs on the board yet. Finish one to be the first.</p>";
    return '<ol class="umt-rank-list">' + board.rows.map(function (item, index) { return rowHtml(index + 1, item, item.mine); }).join("") + "</ol>";
  }

  function overlayHtml() {
    var tab = function (id, label, current, attr) {
      return '<button type="button" class="umt-rank-tab' + (current === id ? " is-on" : "") + '" ' + attr + '="' + id + '" aria-pressed="' + (current === id ? "true" : "false") + '">' + label + "</button>";
    };
    return '<div class="cuddle-overlay umt-rank-overlay" role="dialog" aria-modal="true" aria-labelledby="umtRankTitle">'
      + '<section class="cuddle-modal umt-rank-modal">'
      + '<button class="cuddle-modal-close" data-umt-rank-close aria-label="Close">×</button>'
      + '<h2 id="umtRankTitle">Rankings</h2>'
      + '<div class="umt-rank-tabs" role="group" aria-label="Whose runs">' + tab("mine", "Mine", view.tab, "data-umt-rank-tab") + tab("everyone", "Everyone", view.tab, "data-umt-rank-tab") + "</div>"
      + '<div class="umt-rank-tabs is-small" role="group" aria-label="Difficulty">' + tab("medium", "Standard", view.difficulty, "data-umt-rank-diff") + tab("hard", "Hard", view.difficulty, "data-umt-rank-diff") + "</div>"
      + (view.tab === "mine" ? mineHtml() : everyoneHtml())
      + "</section></div>";
  }

  function paint() {
    var host = document.getElementById("cuddleScreen") || document.body;
    var old = host.querySelector(".umt-rank-overlay");
    var html = overlayHtml();
    if (old) old.outerHTML = html;
    else host.insertAdjacentHTML("beforeend", html);
  }

  function load() {
    if (view.board && view.board[view.difficulty]) return;
    view.loading = true;
    view.error = false;
    var difficulty = view.difficulty;
    fetch("/api/cuddle/rankings?difficulty=" + difficulty + "&player=" + encodeURIComponent(playerId()))
      .then(function (res) { return res.json(); })
      .then(function (data) {
        view.board = view.board || {};
        view.board[difficulty] = { available: Boolean(data && data.available), rows: Array.isArray(data && data.rows) ? data.rows : [] };
      })
      .catch(function () { view.error = true; })
      .then(function () { view.loading = false; if (isOpen()) paint(); });
  }

  function isOpen() {
    return Boolean(document.querySelector(".umt-rank-overlay"));
  }

  function open() {
    watch();
    view.board = null;
    paint();
  }

  function close() {
    document.querySelectorAll(".umt-rank-overlay").forEach(function (el) { el.remove(); });
  }

  document.addEventListener("click", function (event) {
    var target = event.target && event.target.closest ? event.target : null;
    if (!target || !target.closest(".umt-rank-overlay")) return;
    if (target.closest("[data-umt-rank-close]") || target.classList.contains("umt-rank-overlay")) { close(); return; }
    var tab = target.closest("[data-umt-rank-tab]");
    var diff = target.closest("[data-umt-rank-diff]");
    if (!tab && !diff) return;
    if (tab) view.tab = tab.getAttribute("data-umt-rank-tab");
    if (diff) view.difficulty = diff.getAttribute("data-umt-rank-diff");
    if (view.tab === "everyone") load();
    paint();
  });
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && isOpen()) close();
  });

  window.CuddleRankings = Object.freeze({ open: open, close: close, mine: read });
}());
