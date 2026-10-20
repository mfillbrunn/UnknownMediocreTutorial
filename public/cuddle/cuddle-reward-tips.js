/* Cuddle: tips on the reward screen.
 *
 * A reward card can carry a small tip chip, a suggestion read from the
 * run so far (never a rule):
 *   Easier solving  a Hints (or safety) badge, while the run has few hint
 *                   badges or its solves have been slow or late;
 *   More points     a points badge, while the score is behind the pace
 *                   for the next boss's points target;
 *   School rank     a badge that takes its school to its next rank.
 * At most one card per tip, so a screen never says "take everything".
 * The reason is on the chip's title and its aria-label.
 */
(function () {
  "use strict";

  if (window.CuddleRewardTips) return;

  var ICONS = {
    solve: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 21s-7.5-4.6-9.6-9.3C.9 8.3 3 4.5 6.7 4.5c2.1 0 3.6 1.1 4.3 2.6.7-1.5 2.2-2.6 4.3-2.6 3.7 0 5.8 3.8 4.3 7.2C19.5 16.4 12 21 12 21z"/></svg>',
    points: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="currentColor"/><path d="M12 7v10M9 9.5c0-1.2 1.3-2 3-2s3 .7 3 2-1.3 1.8-3 2.3-3 1-3 2.3 1.3 2 3 2 3-.8 3-2" fill="none" stroke="#1d1607" stroke-width="1.6" stroke-linecap="round"/></svg>',
    school: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2l8 3v6c0 5-3.4 9.3-8 11-4.6-1.7-8-6-8-11V5z"/><path d="M8 12l3 3 5-6" fill="none" stroke="#10241a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
  };
  var LABEL = { solve: "Easier solving", points: "More points", school: "School rank" };
  var NUMERAL = ["", "I", "II", "III"];

  function activeGame() {
    try {
      return window.CuddleBranchMap && typeof window.CuddleBranchMap.getActiveGame === "function" ? window.CuddleBranchMap.getActiveGame() : null;
    } catch (_error) {
      return null;
    }
  }

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[ch];
    });
  }

  function nodeFor(card) {
    var tree = window.CuddleSkillTree;
    if (!tree) return null;
    var key = card.getAttribute("data-upgrade-key");
    var title = card.querySelector("strong");
    try {
      return (key && typeof tree.resolve === "function" && tree.resolve(key))
        || (typeof tree.findNodeByName === "function" && title && tree.findNodeByName(title.textContent.trim())) || null;
    } catch (_error) {
      return null;
    }
  }

  function ownedOfTypes(game, types) {
    var tree = window.CuddleSkillTree;
    var count = 0;
    (tree && tree.BRANCHES || []).forEach(function (branch) {
      (branch.nodes || []).forEach(function (node) {
        if (types.indexOf(node.type) === -1) return;
        try { if (Math.floor(Number(tree.level(game, node)) || 0) > 0) count += 1; } catch (_error) { /* not owned */ }
      });
    });
    return count;
  }

  // Why the run could use easier solving, or "" when it's doing fine.
  function solveNeed(game) {
    var stats = window.CuddleRunStats ? window.CuddleRunStats.of(game.state) : null;
    var hints = ownedOfTypes(game, ["clues", "safety"]);
    if (stats && stats.stages >= 2) {
      var average = stats.guesses / Math.max(1, stats.stages);
      if (stats.inWindow < stats.stages) return "Some of your solves came after the guess window: a hint badge helps you solve sooner.";
      if (average >= 4.5) return "Your solves take " + average.toFixed(1) + " guesses on average: a hint badge helps you solve sooner.";
    }
    if (hints < 2) return "You have " + (hints ? "only one hint badge" : "no hint badges") + " yet: hints make every stage easier to solve.";
    return "";
  }

  // Why the run could use points, or "" when it's on pace for the boss.
  function pointsNeed(game) {
    var map = window.CuddleBranchMap;
    var next = map && typeof map.nextBossRequirement === "function" ? map.nextBossRequirement(game) : null;
    if (!next || !next.required) return "";
    var state = game.state;
    var rows = state.branchMap && Array.isArray(state.branchMap.rows) ? state.branchMap.rows : [];
    var here = state.branchMap && state.branchMap.position ? Number(state.branchMap.position.row) || 0 : 0;
    var isBoss = function (row) { return row && (row.nodes || []).some(function (node) { return node && (node.type === "boss" || node.type === "final"); }); };
    var last = -1;
    var upcoming = rows.length;
    rows.forEach(function (row, index) {
      if (!isBoss(row)) return;
      if (index < here) last = index;
      else if (upcoming === rows.length) upcoming = index;
    });
    var span = Math.max(1, upcoming - last);
    var progress = Math.min(1, Math.max(0, (here - last) / span));
    var expected = next.required * progress;
    if (next.score >= expected * 0.95 && ownedOfTypes(game, ["points"]) >= 2) return "";
    if (next.score < expected * 0.95) {
      return "You have " + next.score + " points; the next boss needs " + next.required + ". A points badge helps you get there.";
    }
    return "Few of your badges pay points yet, and the next boss needs " + next.required + ".";
  }

  // The rank this badge would take its school to, or 0.
  function schoolRankUp(game, node) {
    var tree = window.CuddleSkillTree;
    if (!tree || !node || !node.school || !tree.SCHOOLS || !tree.SCHOOLS[node.school]) return null;
    if (window.CuddleFirstRun && typeof window.CuddleFirstRun.schoolsHidden === "function" && window.CuddleFirstRun.schoolsHidden(game)) return null;
    var school = tree.SCHOOLS[node.school];
    var have = Number((tree.schoolPoints(game) || {})[node.school]) || 0;
    var rank = tree.schoolRank(node.school, have);
    var next = school.ranks[rank];
    if (!next) return null;
    var weight = (tree.TIER_WEIGHT && tree.TIER_WEIGHT[node.tier]) || 1;
    if (have + weight < next) return null;
    return { label: school.label, rank: rank + 1, perk: (school.perks || [])[rank] || "" };
  }

  function chip(kind, reason) {
    return "<span class=\"umt-tip is-" + kind + "\" role=\"note\" title=\"" + esc(reason) + "\" aria-label=\"Tip: " + esc(LABEL[kind]) + ". " + esc(reason) + "\">"
      + ICONS[kind] + "<b>Tip</b><span>" + esc(LABEL[kind]) + "</span></span>";
  }

  var lastKey = "";

  function decorate() {
    var game = activeGame();
    var grid = document.querySelector("#cuddleScreen .cuddle-upgrade-modal .cuddle-choice-grid");
    if (!game || !game.state || !grid) return;
    var cards = Array.prototype.slice.call(grid.querySelectorAll("[data-upgrade-key]"));
    if (!cards.length) return;
    var key = cards.map(function (card) { return card.getAttribute("data-upgrade-key"); }).join("|");
    if (key === lastKey && grid.querySelector(".umt-tip, [data-umt-tips-done]")) return;
    lastKey = key;
    grid.querySelectorAll(".umt-tips, .umt-tip-why").forEach(function (el) { el.remove(); });
    grid.setAttribute("data-umt-tips-done", "1");
    var picks = cards.map(function (card) { return { card: card, node: nodeFor(card) }; }).filter(function (item) { return item.node; });
    var tips = [];
    var solve = solveNeed(game);
    if (solve) {
      var hint = picks.find(function (item) { return item.node.type === "clues" || item.node.type === "safety"; });
      if (hint) tips.push({ card: hint.card, kind: "solve", reason: solve });
    }
    var points = pointsNeed(game);
    if (points) {
      var payer = picks.find(function (item) { return item.node.type === "points"; });
      if (payer) tips.push({ card: payer.card, kind: "points", reason: points });
    }
    var ranked = null;
    picks.some(function (item) {
      var up = schoolRankUp(game, item.node);
      if (up) ranked = { card: item.card, kind: "school", reason: "Takes " + up.label + " to rank " + NUMERAL[up.rank] + (up.perk ? ": " + up.perk + "." : ".") };
      return Boolean(up);
    });
    if (ranked) tips.push(ranked);
    tips.forEach(function (tip) {
      var holder = tip.card.querySelector(":scope > .umt-tips");
      if (!holder) {
        tip.card.insertAdjacentHTML("afterbegin", "<span class=\"umt-tips\"></span>");
        holder = tip.card.querySelector(":scope > .umt-tips");
      }
      holder.insertAdjacentHTML("beforeend", chip(tip.kind, tip.reason));
      // The reason, readable on a phone too (no hover there).
      tip.card.insertAdjacentHTML("beforeend", "<span class=\"umt-tip-why is-" + tip.kind + "\">" + ICONS[tip.kind] + "<span>" + esc(tip.reason) + "</span></span>");
    });
    var modal = grid.closest(".cuddle-upgrade-modal");
    var note = modal && modal.querySelector(".umt-tips-note");
    if (tips.length && modal && !note) {
      grid.insertAdjacentHTML("beforebegin", "<p class=\"umt-tips-note\">Tips are only suggestions, from how your run is going. Any pick is fine.</p>");
    } else if (!tips.length && note) {
      note.remove();
    }
  }

  var pending = false;
  function schedule() {
    if (pending) return;
    pending = true;
    window.requestAnimationFrame(function () {
      pending = false;
      try { decorate(); } catch (error) { console.debug("[Cuddle tips] skipped", error); }
    });
  }

  function start() {
    new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
    schedule();
  }
  if (document.body) start();
  else document.addEventListener("DOMContentLoaded", start, { once: true });

  window.CuddleRewardTips = Object.freeze({ solveNeed: solveNeed, pointsNeed: pointsNeed, schoolRankUp: schoolRankUp });
}());
