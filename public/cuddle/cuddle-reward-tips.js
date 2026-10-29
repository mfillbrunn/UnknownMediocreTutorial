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
 *
 * Badges that pay less the more badges you hold (Lean Build, Ascetic)
 * also say how many of yours count against them, and what that means now.
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

  // A recommended card carries just a heart; tapped, it opens why (every
  // reason this card is recommended) in a small pop-up.
  function chip(reasons) {
    var lines = reasons.map(function (tip) { return tip.kind + "|" + tip.reason; }).join("\n");
    return "<span class=\"umt-tip is-heart\" role=\"button\" tabindex=\"0\" aria-expanded=\"false\" data-umt-tip=\"heart\" data-umt-tip-reason=\"" + esc(lines) + "\" title=\"Recommended: tap for why\" aria-label=\"Recommended. Tap for why.\">"
      + ICONS.solve + "</span>";
  }

  // How many of your badges count against a Restraint badge, and what it
  // would do with them; "" for any other badge.
  function countLine(game, node) {
    var strategies = window.CuddleStrategies;
    var fresh = window.CuddleNewBadges;
    var plural = function (n) { return n + " badge" + (n === 1 ? "" : "s"); };
    if (node.id === "leanBuild" && strategies && typeof strategies.otherBadges === "function") {
      var others = strategies.otherBadges(game);
      var pays = strategies.leanPayout(game);
      var full = typeof strategies.leanBase === "function" ? strategies.leanBase(game) : null;
      var each = typeof strategies.leanPerBadge === "function" ? strategies.leanPerBadge(game) : 5;
      var free = typeof strategies.leanFreeTiers === "function" ? strategies.leanFreeTiers(game) : [];
      var counted = free.length > 1 ? " that count (not Common or Rare)" : free.length ? " that count (not Common)" : " outside Restraint";
      return "You have " + plural(others) + counted + " (−" + each + " points each): right now it pays +" + pays + " a solve"
        + (full != null && full !== pays ? ", out of +" + full + "." : ".");
    }
    if (node.id === "ascetic" && fresh && typeof fresh.badgeCount === "function") {
      var count = fresh.badgeCount(game);
      var times = fresh.asceticMultiplier(game);
      return "You have " + plural(count) + " outside Restraint: "
        + (times > 1 ? "solves pay ×" + times + " right now." : "no bonus right now (it needs "
          + (typeof fresh.asceticTiers === "function" ? fresh.asceticTiers(game)[1][0] : 10) + " or fewer).");
    }
    return "";
  }

  // A Restraint badge that would pay nothing with the badges you hold now.
  function idleNow(game, node) {
    try {
      if (node.id === "leanBuild" && window.CuddleStrategies) return window.CuddleStrategies.leanPayout(game) <= 0;
      if (node.id === "ascetic" && window.CuddleNewBadges) return window.CuddleNewBadges.asceticMultiplier(game) <= 1;
    } catch (_error) { /* not known */ }
    return false;
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
    grid.querySelectorAll(".umt-tips, .umt-tip-count").forEach(function (el) { el.remove(); });
    closeTipPopup();
    grid.setAttribute("data-umt-tips-done", "1");
    var picks = cards.map(function (card) { return { card: card, node: nodeFor(card) }; }).filter(function (item) { return item.node; });
    picks.forEach(function (item) {
      var line = countLine(game, item.node);
      if (line) item.card.insertAdjacentHTML("beforeend", "<span class=\"umt-tip-count\">" + esc(line) + "</span>");
    });
    var tips = [];
    var solve = solveNeed(game);
    if (solve) {
      var hint = picks.find(function (item) { return item.node.type === "clues" || item.node.type === "safety"; });
      if (hint) tips.push({ card: hint.card, kind: "solve", reason: solve });
    }
    var points = pointsNeed(game);
    if (points) {
      var payer = picks.find(function (item) { return item.node.type === "points" && !idleNow(game, item.node); });
      if (payer) tips.push({ card: payer.card, kind: "points", reason: points });
    }
    var ranked = null;
    picks.some(function (item) {
      var up = schoolRankUp(game, item.node);
      if (up) ranked = { card: item.card, kind: "school", reason: "Takes " + up.label + " to rank " + NUMERAL[up.rank] + (up.perk ? ": " + up.perk + "." : ".") };
      return Boolean(up);
    });
    if (ranked) tips.push(ranked);
    var byCard = new Map();
    tips.forEach(function (tip) {
      if (!byCard.has(tip.card)) byCard.set(tip.card, []);
      byCard.get(tip.card).push(tip);
    });
    byCard.forEach(function (reasons, card) {
      card.insertAdjacentHTML("afterbegin", "<span class=\"umt-tips\">" + chip(reasons) + "</span>");
    });
    fitTips(grid);
  }

  // Tips sit on the card's top edge, left of the rarity tag. When they
  // would run into it (two tips, a narrow card), they drop their labels
  // and show just the icon and "Tip".
  function fitTips(grid) {
    grid.querySelectorAll(".umt-tips").forEach(function (holder) {
      holder.classList.remove("is-compact");
      var card = holder.parentElement;
      var tag = card && card.querySelector(".cuddle-v8-rarity-badge");
      if (!tag) return;
      var clash = function () { return holder.getBoundingClientRect().right > tag.getBoundingClientRect().left - 6; };
      if (clash()) holder.classList.add("is-compact");
    });
  }

  // A tap on a tip badge opens its explanation in a pop-up beside it (tap
  // it again, or anywhere else, to close), and doesn't pick the card it
  // sits on. Window capture runs before the card's own handlers.
  var popup = null;
  var popupTip = null;
  function closeTipPopup() {
    if (popup) popup.remove();
    if (popupTip) popupTip.setAttribute("aria-expanded", "false");
    popup = null;
    popupTip = null;
  }
  function toggleTip(tip) {
    if (popupTip === tip) { closeTipPopup(); return; }
    closeTipPopup();
    popup = document.createElement("div");
    popup.className = "umt-tip-popup is-heart";
    popup.setAttribute("role", "dialog");
    popup.setAttribute("aria-label", "Why it's recommended");
    popup.innerHTML = "<strong>Recommended</strong>" + String(tip.getAttribute("data-umt-tip-reason") || "").split("\n").filter(Boolean).map(function (line) {
      var cut = line.indexOf("|");
      var kind = line.slice(0, cut);
      return "<p class=\"is-" + esc(kind) + "\">" + (ICONS[kind] || "") + "<span><b>" + esc(LABEL[kind] || "") + ".</b> " + esc(line.slice(cut + 1)) + "</span></p>";
    }).join("");
    document.body.appendChild(popup);
    popupTip = tip;
    tip.setAttribute("aria-expanded", "true");
    placeTipPopup();
  }
  function placeTipPopup() {
    if (!popup || !popupTip) return;
    if (!popupTip.isConnected) { closeTipPopup(); return; }
    var box = popupTip.getBoundingClientRect();
    var width = Math.min(280, window.innerWidth - 24);
    popup.style.width = width + "px";
    popup.style.left = Math.round(Math.max(12, Math.min(window.innerWidth - width - 12, box.left))) + "px";
    var below = box.bottom + 8;
    popup.style.top = Math.round(below + popup.offsetHeight > window.innerHeight - 8 ? box.top - popup.offsetHeight - 8 : below) + "px";
  }
  window.addEventListener("click", function onTipTap(event) {
    var tip = event.target && event.target.closest ? event.target.closest("[data-umt-tip]") : null;
    if (!tip) {
      if (popup && !(event.target && event.target.closest && event.target.closest(".umt-tip-popup"))) closeTipPopup();
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    toggleTip(tip);
  }, true);
  window.addEventListener("resize", function () { closeTipPopup(); fitTips(document); });
  document.addEventListener("scroll", placeTipPopup, true);
  ["pointerdown", "mousedown", "touchstart"].forEach(function (type) {
    window.addEventListener(type, function keepCard(event) {
      if (event.target && event.target.closest && event.target.closest("[data-umt-tip]")) event.stopImmediatePropagation();
    }, true);
  });
  window.addEventListener("keydown", function onTipKey(event) {
    if (event.key === "Escape" && popup) { closeTipPopup(); return; }
    if (event.key !== "Enter" && event.key !== " ") return;
    var tip = event.target && event.target.closest ? event.target.closest("[data-umt-tip]") : null;
    if (!tip) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    toggleTip(tip);
  }, true);

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
