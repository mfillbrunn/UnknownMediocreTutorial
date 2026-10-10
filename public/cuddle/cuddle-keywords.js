/* Cuddle: coloured keywords.
 *
 * Reward, badge, quest, combo and shop text names the same few things over
 * and over -- points, money, mulligans, Jokers. Each gets its own colour,
 * in bold, wherever it appears in that text, so a line reads at a glance:
 *   +5 points    green        +$3        money gold
 *   +1 mulligan  blue         +1 Joker   purple
 *   dead tile / doubled consonants  slate (a burden)
 * Text is wrapped where it is drawn (a light pass after each render), so
 * every screen that shows these descriptions picks it up.
 */
(function () {
  "use strict";

  if (window.CuddleKeywords) return;

  // Where descriptions are drawn. Kept to text the player reads about
  // rewards and stops, not the board or the hand.
  var SCOPES = [
    ".cuddle-choice small",
    ".cuddle-choice .cuddle-v8-level-text",
    ".umt-combo-line",
    ".umt-bd-card",
    ".umt-bd-short",
    ".umt-duel-win",
    ".umt-burden-note",
    ".umt-stop-summary",
    ".umt-stop-gets",
    ".umt-stop-panel li",
    ".cuddle-quest-body",
    ".cuddle-shop-item small",
    ".cuddle-shop-item p",
    "[class*=\"shop-card\"] small",
    "[class*=\"shop-card\"] p",
    ".umt-pack-card small",
    ".umt-pack-card p"
  ].join(",");

  // One pattern, four kinds. Money first, so "$10" is never read as "10".
  var PATTERN = /([+−-]?\$\d[\d,]*)|([+−-]?\d+\s*(?:points?|pts?)\b)|((?:[+−-]?\d+\s+)?(?:free\s+)?mulligans?\b)|((?:[+−-]?\d+\s+)?jokers?\b)|((?:[+−-]?\d+\s+)?(?:dead tiles?|doubled consonants?)\b)/gi;
  var KINDS = ["money", "points", "mulligan", "joker", "dead"];
  var SKIP = /^(SCRIPT|STYLE|TEXTAREA|INPUT|SVG)$/i;

  function inside(node, selector) {
    var element = node.parentElement;
    return Boolean(element && element.closest && element.closest(selector));
  }

  function wrapText(node) {
    var text = node.nodeValue;
    if (!text || !/\d|mulligan|joker|dead|doubled/i.test(text)) return;
    PATTERN.lastIndex = 0;
    if (!PATTERN.test(text)) return;
    PATTERN.lastIndex = 0;
    var fragment = document.createDocumentFragment();
    var last = 0;
    var match;
    while ((match = PATTERN.exec(text))) {
      var kindIndex = match[1] ? 0 : match[2] ? 1 : match[3] ? 2 : match[4] ? 3 : 4;
      if (match.index > last) fragment.appendChild(document.createTextNode(text.slice(last, match.index)));
      var span = document.createElement("span");
      span.className = "umt-kw is-" + KINDS[kindIndex];
      span.textContent = match[0];
      fragment.appendChild(span);
      last = match.index + match[0].length;
    }
    if (last < text.length) fragment.appendChild(document.createTextNode(text.slice(last)));
    node.parentNode.replaceChild(fragment, node);
  }

  function colour(root) {
    if (!root || !root.querySelectorAll) return;
    var scopes = root.querySelectorAll(SCOPES);
    for (var i = 0; i < scopes.length; i += 1) {
      var walker = document.createTreeWalker(scopes[i], NodeFilter.SHOW_TEXT, {
        acceptNode: function accept(node) {
          var parent = node.parentElement;
          if (!parent || SKIP.test(parent.tagName)) return NodeFilter.FILTER_REJECT;
          // Already coloured, or already styled as money elsewhere.
          if (inside(node, ".umt-kw, .cuddle-money-figure, svg")) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        }
      });
      var nodes = [];
      var current;
      while ((current = walker.nextNode())) nodes.push(current);
      nodes.forEach(wrapText);
    }
  }

  var pending = false;
  function schedule() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(function run() {
      pending = false;
      colour(document.getElementById("cuddleScreen") || document.body);
    });
  }

  function attach() {
    var host = document.getElementById("cuddleScreen") || document.body;
    if (!host) {
      document.addEventListener("DOMContentLoaded", attach, { once: true });
      return;
    }
    new MutationObserver(schedule).observe(host, { childList: true, subtree: true, characterData: true });
    schedule();
  }

  window.CuddleKeywords = Object.freeze({ colour: colour, PATTERN: PATTERN });
  attach();
}());
