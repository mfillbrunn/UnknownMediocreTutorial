/* Cuddle: the boss-gate warning.
 *
 * A boss can only be entered with enough run points (cuddle-branch-map.js's
 * boss point requirements). On the approach to a boss -- choosing the last
 * stage before it on the map, playing that stage, or standing right in
 * front of the boss -- this says whether the run is there yet:
 *   short    the screen's edges pulse red, with "N pts short" on a pill
 *   reached  a green pill, "Boss target reached"
 * On a stage the pill would cover the hand, so there the header's
 * "Next boss" line flashes red (or turns green) instead. In the shop a
 * floating pill sat on top of the wares as the page scrolled, so there
 * the verdict is a line in the page itself, under the wallet.
 * The points counted are the banked ones, as the header shows and the
 * boss gate itself checks.
 *
 * Lives outside #cuddleRoot, never takes a tap, and stays out of the way
 * of the cash-out, packs and other popups.
 */
(function () {
  "use strict";

  if (window.CuddleBossDanger) return;

  function activeGame() {
    try {
      return window.CuddleBranchMap && typeof window.CuddleBranchMap.getActiveGame === "function"
        ? window.CuddleBranchMap.getActiveGame()
        : null;
    } catch (_error) {
      return null;
    }
  }

  function hasBoss(row) {
    return Boolean(row && Array.isArray(row.nodes) && row.nodes.some(function boss(node) { return node && node.type === "boss"; }));
  }

  // Whether the run is on the approach to a boss.
  function approaching(state) {
    var map = state.branchMap;
    if (!map || !Array.isArray(map.rows)) return false;
    var rows = map.rows;
    var row = map.position && Number.isInteger(map.position.row) ? map.position.row : -1;
    if (state.boss || /^(won|lost|gameOver|bossChoice)$/.test(String(state.status || ""))) return false;
    // On the last stop before the boss (a stage, shop, upgrade or event),
    // or on the map with the boss next.
    if (hasBoss(rows[row + 1])) return true;
    // On the map, picking that last stop.
    return state.status === "branchMap" && hasBoss(rows[row + 2]) && !hasBoss(rows[row]);
  }

  function busy(state) {
    var money = window.CuddleMoneyMode;
    return Boolean(state.pendingRoundEnd
      || state.umtPackOffer
      || state.roundIntroPending
      || document.querySelector(".umt-pack-overlay, .umt-wi-overlay, .umt-pt-overlay, .cuddle-landing")
      || document.getElementById("cuddleMoneyPayoutOverlay")
      || (money && typeof money.payoutActive === "function" && money.payoutActive())
      || (state.cuddleMoneyMode && state.cuddleMoneyMode.pendingPayout)
      // A Word Duel (and its result) is its own screen, not the map.
      || (state.branchMap && (state.branchMap.expandedEvent || state.branchMap.expandedEventResult || state.branchMap.expandedDuel)));
  }

  function verdict() {
    var game = activeGame();
    var state = game && game.state;
    var map = window.CuddleBranchMap;
    if (!state || !document.getElementById("cuddleRoot") || !map || typeof map.nextBossRequirement !== "function") return null;
    if (String(state.runId || "").indexOf(":duel:") !== -1) return null;
    if (!approaching(state) || busy(state)) return null;
    var next = map.nextBossRequirement(game);
    if (!next || !next.required) return null;
    // The same banked points the header's "Next boss" line shows.
    var score = Math.round(Number(next.score) || 0);
    return { short: Math.max(0, next.required - score), required: next.required, onMap: state.status === "branchMap", inShop: state.status === "shop" };
  }

  var view = null;

  // The shop's own line (in the page, under the shopkeeper and wallet).
  function syncShopLine(found, state, text) {
    var page = document.querySelector("#cuddleRoot .umt-shop-page");
    var line = page && page.querySelector(".umt-bd-shop");
    if (!found || !found.inShop || !page) {
      if (line) line.remove();
      return;
    }
    if (!line) {
      line = document.createElement("p");
      line.className = "umt-bd-shop";
      line.setAttribute("role", "status");
      var hero = page.querySelector(".umt-shop-hero");
      page.insertBefore(line, hero ? hero.nextSibling : page.firstChild);
    }
    if (line.dataset.state !== state) line.dataset.state = state;
    if (line.innerHTML !== text) line.innerHTML = text;
  }

  function sync() {
    var found = verdict();
    var root = document.documentElement;
    if (found) root.dataset.umtBossDanger = found.short > 0 ? "danger" : "safe";
    else delete root.dataset.umtBossDanger;
    if (!found) {
      if (view) view.remove();
      view = null;
      syncShopLine(null);
      return;
    }
    if (!view || !view.isConnected) {
      view = document.createElement("div");
      view.className = "umt-bd";
      view.setAttribute("aria-live", "polite");
      view.innerHTML = '<div class="umt-bd-edge" aria-hidden="true"></div><div class="umt-bd-pill"></div>';
      (document.getElementById("cuddleScreen") || document.body).appendChild(view);
    }
    var danger = found.short > 0;
    var state = danger ? "danger" : "safe";
    var text = danger
      ? "<b>Danger</b> " + found.short + " pts short of the boss (" + found.required + ")"
      : "<b>Boss target reached</b> " + found.required + " pts";
    if (view.dataset.state !== state) view.dataset.state = state;
    var where = found.onMap ? "map" : found.inShop ? "shop" : "stage";
    if (view.dataset.where !== where) view.dataset.where = where;
    var pill = view.querySelector(".umt-bd-pill");
    if (pill.innerHTML !== text) pill.innerHTML = text;
    syncShopLine(found, state, text);
  }

  var pending = false;
  function schedule() {
    if (pending) return;
    pending = true;
    var run = function run() { pending = false; sync(); };
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(run);
    else setTimeout(run, 0);
  }

  function attach() {
    var root = document.getElementById("cuddleRoot");
    if (!root) {
      document.addEventListener("DOMContentLoaded", attach, { once: true });
      return;
    }
    var screen = document.getElementById("cuddleScreen") || document.body;
    new MutationObserver(function onChange(records) {
      // Ignore our own pill updates.
      if (records.every(function own(record) {
        var target = record.target;
        return (view && view.contains(target)) || (target.closest && target.closest(".umt-bd-shop"))
          || (target.nodeType === 3 && target.parentNode && target.parentNode.closest && target.parentNode.closest(".umt-bd-shop"));
      })) return;
      schedule();
    }).observe(screen, { childList: true, subtree: true, characterData: true });
    window.addEventListener("cuddle:campaign-update", schedule);
    schedule();
  }

  window.CuddleBossDanger = Object.freeze({ sync: schedule });
  attach();
}());
