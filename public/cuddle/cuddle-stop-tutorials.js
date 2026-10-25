/* Cuddle: how a Trial and a Word Duel work.
 *
 * The first time a player reaches a Duel's start screen, or a Trial's of
 * a kind they haven't met (Preset, Open, Pair), a sheet walks through it
 * step by step, with pictures from the game
 * (help/trial-*.webp, help/duel-*.webp). It looks like the badge help
 * (cuddle-badge-help.css). After that, a "How it works" button on the
 * same start screen opens it again.
 */
(function () {
  "use strict";

  if (window.CuddleStopTutorials) return;

  var STORE = "umt-cuddle-stop-tutorials-v1";

  var GUIDES = {
    // One guide per kind of Trial, each shown the first time that kind
    // comes up.
    "trial-blind": {
      title: "Preset Trial",
      kicker: "How a Preset Trial works",
      color: "#e6c27a",
      steps: [
        ["Choose how hard", "The answer is one of a short list of words. Harder means more words to choose from, and a bigger prize. On Hard, your first guess also has a challenge (you see which when you play it).", "trial-levels"],
        ["Three guesses, as usual", "Play three guesses like any Wordle. Every colour you see rules words out. The list stays hidden until your last guess.", "trial-board"],
        ["Pick the answer", "On guess 4 you don't type: the answer is one of the listed words. Check each one against your colours, tap × to cross out a word that can't be it, then pick. Hide list shows your guesses again. A wrong pick ends the run.", "trial-pick"],
        ["Pass, and take a Rare badge", "A right pick pays the Trial's points and money, and you choose one of three Rare badges.", "trial-reward"]
      ],
      note: "There are three kinds of Trial: Preset (the list comes at the end), Open (the list is there from the start) and Pair (no typing). Each explains itself the first time you meet it."
    },
    "trial-open": {
      title: "Open Trial",
      kicker: "How an Open Trial works",
      color: "#e6c27a",
      steps: [
        ["Choose how hard", "The answer is one of the listed words. Harder means more words on the list, and a bigger prize. On Hard, your first guess also has a challenge (you see which when you play it).", "trial-open-levels"],
        ["The list is there from the start", "The words sit above the board the whole time. Guess as usual and check each word against the colours you see.", "trial-open-list"],
        ["Pick on guess 3, or sooner", "After two guesses, guess 3 is the pick. Sure already? Tap Answer now to lock in early (Keep guessing backs out). Tap × to cross out words that can't be it. A wrong pick ends the run.", "trial-open-early"],
        ["Pass, and take a Rare badge", "A right pick pays the Trial's points and money, and you choose one of three Rare badges.", "trial-reward"]
      ],
      note: "Use your guesses to split the list: a word that tests letters several listed words share tells you the most."
    },
    "trial-pairs": {
      title: "Pair Trial",
      kicker: "How a Pair Trial works",
      color: "#e6c27a",
      steps: [
        ["Choose how hard", "The answer is one of the listed words, shown from the start. Harder means more words on the list, and a bigger prize. On Hard, your first guess also has a challenge.", "trial-pair-levels"],
        ["No typing: tap one of two words", "Each guess, you're offered two words: tap one to play it. If it's the answer, you pass straight away.", "trial-pair-choose"],
        ["Read the board", "The word you played shows its colours like any guess. Use them to rule words off the list.", "trial-pair-board"],
        ["Pick now, or see two more", "After each guess: pick the answer from the list, or show two more words to play. The sooner you pass, the more it pays; by guess 5 you must pick. A wrong pick ends the run.", "trial-pair-next"],
        ["Pass, and take a Rare badge", "A right pick pays its share of the Trial's points and money, and you choose one of three Rare badges.", "trial-reward"]
      ],
      note: "Each pick button says what passing pays right now, so you can weigh picking early against learning more."
    },
    duel: {
      title: "Word Duel",
      kicker: "How a Duel works",
      color: "#c79bff",
      steps: [
        ["Choose your rival", "A Word Duel is a race against an AI to solve the same word. The Easy AI costs something to take on; Medium and Hard are free but sharper, and pay more.", "duel-start"],
        ["Take turns", "You and the AI take turns guessing. Both of you see every row's colours, the AI's too (marked AI): its guesses help you, and yours help it.", "duel-board"],
        ["First to solve wins", "Solve it before the AI does and you win money, plus the points you earned in the Duel.", "duel-won"],
        ["Win, and take an Epic badge", "After a win you choose one of three Epic badges.", "duel-reward"],
        ["If the AI is faster", "On Easy you just get no reward, on Medium it costs 50 points, and on Hard the run ends.", "duel-lost"]
      ],
      note: "Your badges work in a Duel too: special cards, squares, mulligans and quests all play their part."
    }
  };

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function seen() {
    var all;
    try { all = JSON.parse(localStorage.getItem(STORE) || "{}") || {}; } catch (_error) { all = {}; }
    // The single Trial guide of before was the Preset Trial's.
    if (all.trial) all["trial-blind"] = true;
    return all;
  }
  function markSeen(kind) {
    var all = seen();
    all[kind] = true;
    try { localStorage.setItem(STORE, JSON.stringify(all)); } catch (_error) { /* shown again next time */ }
  }

  var lastFocus = null;
  function close() {
    var layer = document.querySelector(".umt-stop-tut-layer");
    if (layer) layer.remove();
    document.removeEventListener("keydown", onKey, true);
    if (lastFocus && typeof lastFocus.focus === "function") {
      try { lastFocus.focus({ preventScroll: true }); } catch (_error) { /* gone */ }
    }
    lastFocus = null;
  }
  function onKey(event) {
    if (event.key === "Escape") {
      event.stopPropagation();
      close();
    }
  }

  function open(kind) {
    var guide = GUIDES[kind];
    if (!guide) return false;
    close();
    markSeen(kind);
    lastFocus = document.activeElement;
    var layer = document.createElement("div");
    layer.className = "umt-help-layer umt-stop-tut-layer";
    layer.innerHTML = "<div class=\"umt-help-backdrop\" data-umt-tut-close></div>"
      + "<section class=\"umt-help-card umt-stop-tut\" role=\"dialog\" aria-modal=\"true\" aria-labelledby=\"umtStopTutTitle\" style=\"--help-color:" + esc(guide.color) + "\">"
      + "<header class=\"umt-help-head\"><div><span class=\"umt-help-tier\">" + esc(guide.kicker) + "</span>"
      + "<h2 id=\"umtStopTutTitle\">" + esc(guide.title) + "</h2></div>"
      + "<button type=\"button\" class=\"umt-help-close\" data-umt-tut-close aria-label=\"Close\">×</button></header>"
      + "<div class=\"umt-help-body\"><ol class=\"umt-stop-tut-steps\">"
      + guide.steps.map(function (step) {
        return "<li><h3>" + esc(step[0]) + "</h3><p class=\"umt-help-more\">" + esc(step[1]) + "</p>"
          + "<figure class=\"umt-help-shot\"><img src=\"cuddle/help/" + esc(step[2]) + ".webp\" alt=\"\" loading=\"lazy\" decoding=\"async\"></figure></li>";
      }).join("")
      + "</ol><p class=\"umt-stop-tut-note\">" + esc(guide.note) + "</p>"
      + "<button type=\"button\" class=\"cuddle-btn cuddle-btn-primary umt-stop-tut-done\" data-umt-tut-close>Got it</button>"
      + "</div></section>";
    document.body.appendChild(layer);
    layer.addEventListener("click", function (event) {
      if (event.target.closest("[data-umt-tut-close]")) close();
    });
    document.addEventListener("keydown", onKey, true);
    var button = layer.querySelector(".umt-help-close");
    if (button) button.focus({ preventScroll: true });
    return true;
  }

  // Which kind of Trial the run is standing on: "blind" (Preset),
  // "open" or "pairs" (cuddle-curses.js).
  function trialKind() {
    try {
      var game = window.CuddleBranchMap && window.CuddleBranchMap.getActiveGame();
      var map = game && game.state && game.state.branchMap;
      var position = map && map.position;
      var row = position && map.rows ? map.rows[Number(position.row)] : null;
      var node = row && row.nodes ? row.nodes[Number(position.col)] : null;
      var kind = node && node.trialKind;
      return kind === "open" || kind === "pairs" ? kind : "blind";
    } catch (_error) {
      return "blind";
    }
  }

  // The start screens: a Trial's difficulty choice, a Duel's rival choice.
  var SCREENS = [
    { kind: function () { return "trial-" + trialKind(); }, marker: "[data-umt-trial-level]" },
    { kind: function () { return "duel"; }, marker: "[data-cuddle-campaign-action='expanded-duel-start']" }
  ];

  function decorate() {
    SCREENS.forEach(function (screen) {
      var marker = document.querySelector("#cuddleScreen " + screen.marker);
      if (!marker) return;
      var kind = screen.kind();
      var panel = marker.closest(".umt-stop-panel") || marker.parentElement;
      var how = panel && panel.querySelector(":scope > .umt-stop-how");
      if (panel && !how) {
        panel.insertAdjacentHTML("beforeend", "<button type=\"button\" class=\"umt-stop-how\" data-umt-keep data-umt-stop-tut=\"" + kind + "\">How it works</button>");
      } else if (how && how.getAttribute("data-umt-stop-tut") !== kind) {
        how.setAttribute("data-umt-stop-tut", kind);
      }
      if (!seen()[kind] && !document.querySelector(".umt-stop-tut-layer")) open(kind);
    });
  }

  window.addEventListener("click", function (event) {
    var button = event.target instanceof Element ? event.target.closest("[data-umt-stop-tut]") : null;
    if (!button) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    open(button.getAttribute("data-umt-stop-tut"));
  }, true);

  var pending = false;
  function schedule() {
    if (pending) return;
    pending = true;
    window.requestAnimationFrame(function () {
      pending = false;
      decorate();
    });
  }
  function start() {
    var root = document.getElementById("cuddleScreen") || document.body;
    new MutationObserver(schedule).observe(root, { childList: true, subtree: true });
    schedule();
  }
  if (document.body) start();
  else document.addEventListener("DOMContentLoaded", start, { once: true });

  window.CuddleStopTutorials = Object.freeze({ open: open, close: close });
}());
