/* Cuddle: how a Trial and a Word Duel work.
 *
 * The first time a player reaches a Trial's or a Duel's start screen, a
 * sheet walks through it step by step, with pictures from the game
 * (help/trial-*.webp, help/duel-*.webp). It looks like the badge help
 * (cuddle-badge-help.css). After that, a "How it works" button on the
 * same start screen opens it again.
 */
(function () {
  "use strict";

  if (window.CuddleStopTutorials) return;

  var STORE = "umt-cuddle-stop-tutorials-v1";

  var GUIDES = {
    trial: {
      title: "Trial",
      kicker: "How a Trial works",
      color: "#e6c27a",
      steps: [
        ["Choose how hard", "A Trial asks you to find the answer among a short list of words. Harder means more words to choose from, and a bigger prize.", "trial-levels"],
        ["Guess as usual", "Play your guesses like any Wordle. Every colour you see rules words out. In a Preset Trial the list stays hidden until your last guess.", "trial-board"],
        ["Pick the answer", "On the last guess you don't type: the answer is one of the listed words. Check each one against your colours, tap × to cross out a word that can't be it, then pick. A wrong pick ends the run.", "trial-pick"],
        ["Pass, and take a Rare badge", "A right pick pays the Trial's points and money, and you choose one of three Rare badges.", "trial-reward"]
      ],
      note: "Other Trials: an Open Trial shows its list from the start, and you can pick early. A Pair Trial has no typing: each guess is one of two words you tap. The sooner you pass, the more it pays."
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
    try { return JSON.parse(localStorage.getItem(STORE) || "{}") || {}; } catch (_error) { return {}; }
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

  // The start screens: a Trial's difficulty choice, a Duel's rival choice.
  var SCREENS = [
    { kind: "trial", marker: "[data-umt-trial-level]" },
    { kind: "duel", marker: "[data-cuddle-campaign-action='expanded-duel-start']" }
  ];

  function decorate() {
    SCREENS.forEach(function (screen) {
      var marker = document.querySelector("#cuddleScreen " + screen.marker);
      if (!marker) return;
      var panel = marker.closest(".umt-stop-panel") || marker.parentElement;
      if (panel && !panel.querySelector(":scope > .umt-stop-how")) {
        panel.insertAdjacentHTML("beforeend", "<button type=\"button\" class=\"umt-stop-how\" data-umt-keep data-umt-stop-tut=\"" + screen.kind + "\">How it works</button>");
      }
      if (!seen()[screen.kind] && !document.querySelector(".umt-stop-tut-layer")) open(screen.kind);
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
