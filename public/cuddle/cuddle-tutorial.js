/* Cuddle: the first-run tour.
 *
 * A new player's first run explains itself as it goes. Each moment of the
 * run that needs explaining is a "scene" with one or more short cards; a
 * scene plays once, the first time its moment comes up:
 *
 *   pack     the free Starting Pack: what upgrades are (no need to read them yet)
 *   map0     the map, before the first stage: pick a Wordle stop
 *   stage    the first stage: the goal, the colours, the tiles, mulligans, quests
 *   cashout  the first cash-out: how points are paid, points vs money
 *   reward   the first upgrade pick: what upgrades and rarities are
 *   map1     the map after a stage: challenges, skulls, bosses and winning
 *   boss     the first boss choice: reward and curse
 *   loop     the second stage: a send-off; the tour is done
 *
 * Progress lives in localStorage ("umt-cuddle-tutorial-v1"), so the tour
 * plays once per browser. It starts only with a fresh run (never mid-run),
 * can be skipped from any card, and can be replayed from the lobby.
 * Cards sit in a sheet at the top or bottom of the screen and can point
 * at the part of the screen they talk about.
 */
(function () {
  "use strict";

  if (window.CuddleTutorial) return;

  var KEY = "umt-cuddle-tutorial-v1";

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (_error) {
      return null;
    }
  }

  function store(record) {
    try {
      if (record) localStorage.setItem(KEY, JSON.stringify(record));
      else localStorage.removeItem(KEY);
    } catch (_error) {
      // Private mode: the tour simply won't be remembered.
    }
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function activeGame() {
    try {
      return window.CuddleBranchMap && typeof window.CuddleBranchMap.getActiveGame === "function"
        ? window.CuddleBranchMap.getActiveGame()
        : null;
    } catch (_error) {
      return null;
    }
  }

  function shown(element) {
    return Boolean(element && element.getClientRects().length > 0);
  }

  function present(selector) {
    return shown(document.querySelector(selector));
  }

  function stagesSolved(state) {
    var stats = state.umtRunStats;
    return Number(stats && stats.stages) || 0;
  }

  // A run that has only just begun -- the tour never starts mid-run.
  function freshRun(state) {
    if (!state || String(state.runId || "").indexOf(":duel:") !== -1) return false;
    var gates = Array.isArray(state.bossGatesDone) ? state.bossGatesDone.length : 0;
    return gates === 0 && stagesSolved(state) === 0 && !(state.history || []).length && (Number(state.round) || 1) <= 1;
  }

  // Overlays that come first; a scene waits until they've gone.
  var BUSY = [".umt-wi-overlay", ".umt-pt-overlay", ".umt-boss-entrance", ".cuddle-quest-info", ".umt-bd-overlay"];

  function busy(except) {
    return BUSY.some(function check(selector) { return (except || []).indexOf(selector) === -1 && present(selector); });
  }

  function moneyOverlayUp() {
    return present("#cuddleMoneyPayoutOverlay") || present(".cuddle-money-overlay");
  }

  var SCENES = [
    {
      id: "pack",
      when: function when(game, state) {
        return state.umtPackOffer && state.umtPackOffer.starter && !state.umtPackOffer.cards && present(".umt-pack-overlay");
      },
      at: "bottom",
      cards: [
        { title: "Welcome to Cuddle", text: "Cuddle is Wordle as a road trip: solve word after word, collect upgrades along the way, and beat three bosses. This quick tour shows you around. You can skip it any time." },
        { title: "A free pack to start", text: "Packs hold <b>upgrades</b>: boosts that last the whole run. No need to read them yet. Open the pack and they're yours.", focus: ".umt-pack-sealed" }
      ]
    },
    {
      id: "map0",
      when: function when(game, state) {
        return state.status === "branchMap" && stagesSolved(state) === 0 && !state.umtPackOffer
          && !present(".umt-pack-overlay") && !moneyOverlayUp();
      },
      at: "bottom",
      cards: [
        { title: "The map", text: "Each row of the map is a choice of stops, and you move up one row at a time. Tap a <b>Wordle</b> stop on the first row to play your first stage." }
      ]
    },
    {
      id: "stage",
      when: function when(game, state) {
        // Any quiet moment of the first stage (some stops open with a guess
        // already played, so "no guesses yet" can't be the test).
        return state.status === "playing" && !state.roundIntroPending && !state.pendingRoundEnd
          && stagesSolved(state) === 0 && !(typeof game.isBossRound === "function" && game.isBossRound())
          && present(".cuddle-hand") && !moneyOverlayUp() && !present(".cuddle-overlay");
      },
      at: "top",
      cards: [
        { title: "Find the secret word", text: "Each stage hides a five-letter word. Build a guess from your tiles and submit it. <span class=\"umt-tut-g\">Green</span>: right letter, right spot. <span class=\"umt-tut-y\">Yellow</span>: in the word, wrong spot. <span class=\"umt-tut-x\">Grey</span>: not in the word.", focus: ".cuddle-board", at: "bottom" },
        { title: "Your tiles", text: "<b>Vowels</b> are reusable: they stay in your hand all stage, and turn <span class=\"umt-tut-r\">red</span> once they're ruled out. <b>Consonants</b> are used up when you guess with them, and new ones are drawn from your deck. The little pile shows how many are left.", focus: ".cuddle-hand" },
        { title: "Mulligans", text: "Stuck with letters you can't use? A <b>mulligan</b> swaps some consonants for fresh ones from the deck. You get a few each stage, and any you don't use pay points at the end.", focus: ".cuddle-mulligan" },
        { title: "Quests", text: "Every few guesses a <b>quest</b> appears, like \"use two yellow letters\". Meet it with your next guess to pick a bonus. Tap a quest to read it in full.", focus: ".cuddle-quest-inline" }
      ]
    },
    {
      id: "cashout",
      when: function when() {
        var collect = document.querySelector("#cuddleMoneyPayoutOverlay [data-cuddle-money-action=\"collect-payout\"]");
        return Boolean(collect && !collect.hidden);
      },
      except: [".umt-pt-overlay"],
      at: "top",
      cards: [
        { title: "Cash-out", text: "Solved! Every tile you revealed pays points: grey 0, yellow 1, green 2. Each row you didn't need pays a bonus, solving within the guess window pays extra, and unused mulligans and many upgrades add more. Tap a row to see what it paid.", focus: ".cuddle-money-payout-rows" },
        { title: "Points and money", text: "<b>Points</b> are your score, and they're what lets you challenge a boss. <b class=\"umt-tut-gold\">Money</b> comes from clearing stages and challenges. You spend it in shops, on packs and on refreshes. Tap <b>Collect</b> to bank it.", focus: ".cuddle-money-collect" }
      ]
    },
    {
      id: "reward",
      when: function when(game, state) {
        return state.status === "upgrade" && !state.legendaryOffer && present(".cuddle-choice-grid") && !moneyOverlayUp();
      },
      at: "top",
      cards: [
        { title: "Pick an upgrade", text: "After each stage you choose one of these, and it helps for the rest of the run. Every card on a screen shares one rarity: <span class=\"umt-tut-common\">Common</span>, <span class=\"umt-tut-rare\">Rare</span> or <span class=\"umt-tut-epic\">Epic</span>. <span class=\"umt-tut-legendary\">Legendary</span> ones only come after a boss. Don't like them? Refresh for a few dollars.", focus: ".cuddle-choice-grid", at: "bottom" }
      ]
    },
    {
      id: "map1",
      when: function when(game, state) {
        return state.status === "branchMap" && stagesSolved(state) >= 1 && !state.umtPackOffer
          && !present(".umt-pack-overlay") && !moneyOverlayUp();
      },
      at: "bottom",
      cards: [
        { title: "Choose your path", text: "Some Wordle stops carry a <b>challenge</b>, a twist like a short clock or banned letters. Red skulls show how hard a stop is, and harder stops pay more. Shops, events and free upgrades sit between them." },
        { title: "Bosses and winning", text: "Each world ends in a <b>boss</b>. You need enough points to challenge it, shown on the boss. Bosses bend the rules, and beating one gives you a <span class=\"umt-tut-legendary\">Legendary</span> pick. Beat the final boss to win the run.", focus: ".cuddle-header-points" }
      ]
    },
    {
      id: "boss",
      when: function when(game, state) {
        return state.status === "bossChoice" && present(".cuddle-boss-choice");
      },
      at: "top",
      cards: [
        { title: "Choose your boss", text: "Pick the boss you'll fight. The <b>+</b> shows what you win, and the <b>&minus;</b> is the curse it leaves for the rest of the run. Tap either to read it." }
      ]
    },
    {
      id: "loop",
      when: function when(game, state) {
        return state.status === "playing" && !state.roundIntroPending && !state.pendingRoundEnd
          && stagesSolved(state) >= 1 && present(".cuddle-hand") && !moneyOverlayUp() && !present(".cuddle-overlay");
      },
      needs: ["map1"],
      at: "bottom",
      done: true,
      cards: [
        { title: "You've got it", text: "That's the loop: solve stages, cash out, pick upgrades, and build up the points to take on the bosses. Good luck!" }
      ]
    }
  ];

  var view = { scene: null, index: 0, el: null, focus: null };

  function clearFocus() {
    if (view.focus) view.focus.classList.remove("umt-tut-focus");
    view.focus = null;
  }

  function close() {
    clearFocus();
    if (view.el) view.el.remove();
    view.el = null;
    view.scene = null;
    view.index = 0;
  }

  function render() {
    var scene = view.scene;
    if (!scene) return;
    var card = scene.cards[view.index];
    var last = view.index === scene.cards.length - 1;
    if (!view.el) {
      view.el = document.createElement("div");
      view.el.className = "umt-tut";
      (document.getElementById("cuddleScreen") || document.body).appendChild(view.el);
    }
    view.el.dataset.at = card.at || scene.at || "bottom";
    var dots = scene.cards.length > 1
      ? "<span class=\"umt-tut-dots\" aria-hidden=\"true\">" + scene.cards.map(function dot(_card, index) {
        return "<i" + (index === view.index ? " class=\"is-on\"" : "") + "></i>";
      }).join("") + "</span>"
      : "";
    view.el.innerHTML = "<section class=\"umt-tut-card\" role=\"dialog\" aria-live=\"polite\" aria-labelledby=\"umtTutTitle\">"
      + "<span class=\"umt-tut-kicker\">How to play</span>"
      + "<h2 id=\"umtTutTitle\">" + escapeHtml(card.title) + "</h2>"
      + "<p>" + card.text + "</p>"
      + "<div class=\"umt-tut-actions\">" + dots
      + "<button type=\"button\" class=\"umt-tut-skip\" data-umt-tut=\"skip\">Skip tour</button>"
      + "<button type=\"button\" class=\"cuddle-btn cuddle-btn-primary umt-tut-next\" data-umt-tut=\"next\">" + (last ? (scene.done ? "Let's go" : "Got it") : "Next") + "</button>"
      + "</div></section>";
    clearFocus();
    var target = card.focus ? document.querySelector(card.focus) : null;
    if (shown(target)) {
      target.classList.add("umt-tut-focus");
      view.focus = target;
    }
    var next = view.el.querySelector("[data-umt-tut=\"next\"]");
    if (next) next.focus({ preventScroll: true });
  }

  function sync() {
    var record = load();
    if (record && record.status === "done") {
      if (view.el) close();
      return;
    }
    var game = activeGame();
    var state = game && game.state;
    if (!state || !document.getElementById("cuddleRoot")) return;
    if (!record) {
      // Only a fresh run starts the tour.
      if (!freshRun(state)) return;
      record = { status: "active", seen: [] };
      store(record);
    }
    // A card on screen: keep it while its moment lasts; re-point the
    // highlight after a re-render.
    if (view.scene) {
      var still = false;
      try { still = Boolean(view.scene.when(game, state)); } catch (_error) { still = false; }
      // Another overlay came up (a badge reveal, the world popup...): step
      // aside; the scene plays again from its start once it's gone.
      if (!still || busy(view.scene.except)) {
        close();
        if (still) return;
      } else {
        var card = view.scene.cards[view.index];
        if (card.focus && (!view.focus || !document.body.contains(view.focus))) {
          var target = document.querySelector(card.focus);
          clearFocus();
          if (shown(target)) {
            target.classList.add("umt-tut-focus");
            view.focus = target;
          }
        }
        return;
      }
    }
    for (var i = 0; i < SCENES.length; i += 1) {
      var scene = SCENES[i];
      if (record.seen.indexOf(scene.id) !== -1) continue;
      if (scene.needs && scene.needs.some(function missing(id) { return record.seen.indexOf(id) === -1; })) continue;
      if (busy(scene.except)) continue;
      var showing = false;
      try {
        showing = Boolean(scene.when(game, state));
      } catch (_error) {
        showing = false;
      }
      if (!showing) continue;
      view.scene = scene;
      view.index = 0;
      render();
      return;
    }
  }

  function finishScene() {
    var record = load() || { status: "active", seen: [] };
    var scene = view.scene;
    if (scene && record.seen.indexOf(scene.id) === -1) record.seen.push(scene.id);
    if (scene && scene.done) record.status = "done";
    store(record);
    close();
    schedule();
  }

  document.addEventListener("click", function onTutorialClick(event) {
    var button = event.target.closest && event.target.closest("[data-umt-tut]");
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    var action = button.getAttribute("data-umt-tut");
    if (action === "skip") {
      store({ status: "done", seen: SCENES.map(function id(scene) { return scene.id; }), skipped: true });
      close();
    } else if (action === "next") {
      if (view.scene && view.index < view.scene.cards.length - 1) {
        view.index += 1;
        render();
      } else {
        finishScene();
      }
    } else if (action === "replay") {
      store(null);
      button.textContent = "The tour will play in your next run";
      button.disabled = true;
    }
  }, true);

  var pending = false;
  function schedule() {
    if (pending) return;
    pending = true;
    var run = function run() { pending = false; sync(); };
    // A moment's own render settles first (overlays fade in, the hand is dealt).
    setTimeout(run, 120);
  }

  function attach() {
    var root = document.getElementById("cuddleRoot");
    if (!root) {
      document.addEventListener("DOMContentLoaded", attach, { once: true });
      return;
    }
    var screen = document.getElementById("cuddleScreen") || document.body;
    new MutationObserver(function changed(records) {
      // Ignore the tour's own changes.
      for (var i = 0; i < records.length; i += 1) {
        var target = records[i].target;
        if (!(view.el && (target === view.el || view.el.contains(target)))) {
          schedule();
          return;
        }
      }
    }).observe(screen, { childList: true, subtree: true });
    window.addEventListener("cuddle:campaign-update", schedule);
    schedule();
  }

  window.CuddleTutorial = Object.freeze({
    // For the lobby's "Replay the tour" link.
    isDone: function isDone() { var record = load(); return Boolean(record && record.status === "done"); },
    reset: function reset() { store(null); close(); },
    sync: schedule
  });

  attach();
}());
