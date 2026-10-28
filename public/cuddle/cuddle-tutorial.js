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
 *   boss     the first boss choice: its reward
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

  // Shown and actually on top: nothing (a solve animation, a cash-out)
  // covers its middle. The tour's own card doesn't count.
  function onTop(selector) {
    var element = document.querySelector(selector);
    if (!shown(element) || typeof document.elementsFromPoint !== "function") return shown(element);
    var box = element.getBoundingClientRect();
    var stack = document.elementsFromPoint(box.left + box.width / 2, box.top + Math.min(box.height / 2, 60));
    for (var i = 0; i < stack.length; i += 1) {
      if (stack[i].closest && stack[i].closest(".umt-tut")) continue;
      return element.contains(stack[i]);
    }
    return false;
  }

  // Easy (cuddle-easy-mode.js) is a short straight road with no badges on
  // show: some cards have an Easy version, and some don't apply there.
  function easyRun(game) {
    return Boolean(window.CuddleEasyMode && window.CuddleEasyMode.isEasy(game));
  }
  function onlyEasy(game) { return !easyRun(game); }

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
  // (.umt-fb: the "Did you have fun?" card after a run, player-insights.js.)
  var BUSY = [".umt-wi-overlay", ".umt-pt-overlay", ".umt-boss-entrance", ".cuddle-quest-info", ".umt-bd-overlay", ".umt-fb"];

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
        { title: "Welcome to Cuddle", skip: onlyEasy, text: "Cuddle is Wordle as a short walk: solve a few words in a row, then beat the boss at the end of the road. Every letter of the answer is already in your hand, and the answer's themes are shown at the top." },
        { title: "The road", skip: onlyEasy, text: "The road is a straight line. Tap the next stop to play it." },
        { title: "The map", skip: easyRun, text: "Each row of the map is a choice of stops, and you move up one row at a time. Tap a <b>Wordle</b> stop on the first row to play your first stage." }
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
        { title: "Find the secret word", text: "Each stage hides a five-letter word. Build a guess from your letter cards and submit it. <span class=\"umt-tut-g\">Green</span>: right letter, right spot. <span class=\"umt-tut-y\">Yellow</span>: in the word, wrong spot. <span class=\"umt-tut-x\">Grey</span>: not in the word.", focus: ".cuddle-board", at: "bottom" },
        { title: "Your cards", skip: onlyEasy, text: "Any card in your hand can be used <b>as many times as you like</b> in a word. <b>Vowels</b> always stay in your hand, and turn <span class=\"umt-tut-r\">red</span> once they're ruled out. Every consonant of the answer is in your hand too, mixed in with a few others: work out which ones." },
        { title: "Your cards", skip: easyRun, text: "Any card in your hand can be used <b>as many times as you like</b> in a word. After a guess, <b>vowels</b> stay in your hand (they turn <span class=\"umt-tut-r\">red</span> once ruled out), and so do letters found in the answer. Other <b>consonants</b> you guessed with are used up, and new ones are drawn from your deck. The little pile shows how many are left.", focus: ".cuddle-hand" },
        { title: "Cards, squares and tiles", skip: easyRun, text: "Three words, three places. <b>Cards</b> are in your hand and deck (letters, and special ones like lucky or Joker cards). <b>Squares</b> are spots on the board (some are special, like money squares). <b>Tiles</b> are the colours a guess shows: green, yellow or grey.", focus: ".cuddle-hand" },
        { title: "Mulligans", skip: easyRun, text: "Stuck with letters you can't use? A <b>mulligan</b> swaps some consonants for fresh ones from the deck. You get a few each stage, and any you don't use pay points at the end.", focus: ".cuddle-mulligan" },
        // Easy and Medium runs start with Fish Hook (cuddle-new-badges.js).
        { title: "Fish Hook", skip: function noHook(game) { return !(window.CuddleFishHook && game && window.CuddleSkillTree && window.CuddleSkillTree.level(game, window.CuddleSkillTree.findNode("fishHook")) > 0); }, text: "You start with the <b>Fish Hook</b>. Threw away a letter you need after all? Once you've used or mulliganed cards, a <b>hook</b> appears by your deck: tap it, once a stage, to fish back a card you discarded.", focus: ".umt-fish-btn" },
        { title: "Quests", skip: function noQuests(game) { return Boolean(window.CuddleFirstRun && window.CuddleFirstRun.noQuests(game)); }, text: "Every few guesses a <b>quest</b> appears, like \"use two yellow letters\". Meet it with your next guess to pick a bonus. Tap a quest to read it in full.", focus: ".cuddle-quest-inline" }
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
        { title: "Cash-out", text: "Solved! Every tile you revealed pays points: grey 0, yellow 1, green 2. Each guess you didn't need pays a BONUS row of greens plus 5 points for finishing early, and unused mulligans, Jokers and many upgrades add more. Tap a row to see what it paid.", focus: ".cuddle-money-payout-rows" },
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
        { title: "Pick a helper", skip: onlyEasy, text: "After each stage, pick one helper. It stays with you to the end of the run.", focus: ".cuddle-choice-grid", at: "bottom" },
        { title: "Pick an upgrade", skip: easyRun, text: "After each stage you choose one of these, and it helps for the rest of the run. Every card on a screen shares one rarity: <span class=\"umt-tut-common\">Common</span>, <span class=\"umt-tut-rare\">Rare</span> or <span class=\"umt-tut-epic\">Epic</span>. <span class=\"umt-tut-legendary\">Legendary</span> ones only come after a boss. Don't like them? Refresh for a few dollars.", focus: ".cuddle-choice-grid", at: "bottom" }
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
        { title: "Choose your path", skip: easyRun, text: "Every Wordle stop shows only how hard it is: a <b>heart</b> is an easier one, no mark a regular one, and one to three red <b>skulls</b> a harder one with a twist you find out by playing it. Harder stops pay more points and money. Shops, events and free upgrades sit between them." },
        { title: "The boss", skip: onlyEasy, text: "The road ends at a <b>boss</b>. It bends the rules a little: beat it and you win the run." },
        { title: "Bosses and winning", skip: easyRun, text: "Each world ends in a <b>boss</b>. You need enough points to challenge it, shown on the boss. Bosses bend the rules, and beating one gives you a <span class=\"umt-tut-legendary\">Legendary</span> pick. Beat the final boss to win the run.", focus: ".cuddle-header-points" }
      ]
    },
    {
      id: "boss",
      when: function when(game, state) {
        return state.status === "bossChoice" && present(".cuddle-boss-choice");
      },
      at: "top",
      cards: [
        { title: "Choose your boss", text: "Pick the boss you'll fight. The <b>+</b> shows what you win: tap it to read it." }
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
        { title: "You've got it", skip: onlyEasy, text: "That's it: solve the stages, pick helpers, and beat the boss at the end. Good luck!" },
        { title: "You've got it", skip: easyRun, text: "That's the loop: solve stages, cash out, pick upgrades, and build up the points to take on the bosses. Good luck!" }
      ]
    }
  ];

  // Educational (cuddle-easy-mode.js) is the tutorial itself: its own tour,
  // played in every Educational run and kept on the run (state.umtEduTour).
  // Stage 1 has every letter in hand, stage 2 needs a mulligan, the reward
  // after it is the first badge pick, then the boss.
  function eduStage(game) {
    return window.CuddleEasyMode && typeof window.CuddleEasyMode.stageNumber === "function" ? window.CuddleEasyMode.stageNumber(game) : 0;
  }
  function playing(state) {
    return state.status === "playing" && !state.roundIntroPending && !state.pendingRoundEnd
      && present(".cuddle-hand") && !moneyOverlayUp() && !present(".cuddle-overlay");
  }

  var EDU_SCENES = [
    {
      id: "e-map",
      when: function when(game, state) {
        return state.status === "branchMap" && stagesSolved(state) === 0 && !moneyOverlayUp();
      },
      at: "bottom",
      cards: [
        { title: "Welcome to Cuddle", text: "Cuddle is Wordle with letter cards. This run teaches you how it works, one stage at a time: a few words, then a boss at the end." },
        { title: "The road", text: "Your road is a straight line of stops. Tap the first one to play your first stage." }
      ]
    },
    {
      id: "e-stage1",
      when: function when(game, state) { return playing(state) && stagesSolved(state) === 0 && !state.boss; },
      at: "top",
      cards: [
        { title: "Find the secret word", text: "Each stage hides a five-letter word. Build a guess from your letter cards and tap <b>Submit word</b>. <span class=\"umt-tut-g\">Green</span>: right letter, right spot. <span class=\"umt-tut-y\">Yellow</span>: in the word, wrong spot. Grey: not in the word." },
        { title: "Building a word", text: "Tap a card to put its letter in the next empty spot. Changed your mind? Tap a letter in your word to send it back, or tap <b>⌫</b> to take off the last one. Any card can be used as often as you like in a word.", focus: ".cuddle-hand" },
        { title: "Your cards", text: "<b>Vowels</b> always stay in your hand. Wrong <b>consonants</b> leave it after a guess, and new ones are drawn. This time every consonant of the answer is already in your hand, so you only need to find the order.", focus: ".cuddle-hand" },
        { title: "Themes", text: "The tags at the top are the answer's <b>themes</b>, a hint about what kind of word it is.", focus: ".cuddle-category-chips" },
        { title: "A hint for this one", text: "The answer uses all three of your consonants, <b>S</b>, <b>C</b> and <b>B</b>, in that order, with two vowels in between. And it's a fun activity!", focus: ".cuddle-hand" }
      ]
    },
    {
      // After a guess rules a letter out, whichever stage that is.
      id: "e-colours",
      when: function when(game, state) { return playing(state) && present(".cuddle-hand .cuddle-card.is-card-red"); },
      at: "top",
      cards: [
        { title: "Red means not in the word", text: "Your cards keep score too. A card that turns <span class=\"umt-tut-r\">red</span> is <b>not in the word</b>: leave it out of your next guesses. <span class=\"umt-tut-y\">Yellow</span> and <span class=\"umt-tut-g\">green</span> cards are in the word, and they now stay in your hand. You don't have to use them again, though: every guess can use any letters you like.", focus: ".cuddle-hand" }
      ]
    },
    {
      // Once a card shows where it goes.
      id: "e-position",
      when: function when(game, state) { return playing(state) && present(".cuddle-hand .cuddle-card-position"); },
      at: "top",
      cards: [
        { title: "Where it goes", text: "A <span class=\"umt-tut-g\">green</span> card shows a number in its corner: the spot it takes in the answer. <b>#1</b> is the first letter, <b>#5</b> the last.", focus: ".cuddle-hand .cuddle-card-position" }
      ]
    },
    {
      id: "e-points",
      when: function when() {
        var collect = document.querySelector("#cuddleMoneyPayoutOverlay [data-cuddle-money-action=\"collect-payout\"]");
        return Boolean(collect && !collect.hidden);
      },
      except: [".umt-pt-overlay"],
      at: "top",
      cards: [
        { title: "Points", text: "Solved! Every tile you revealed pays points: a yellow 1, a green 2. Every guess you didn't need pays a bonus row too, so solving sooner pays more. Tap a row to see what it paid.", focus: ".cuddle-money-payout-rows" },
        { title: "You need points", text: "Points add up over the run, and you'll need them: the <b>boss</b> at the end only lets you challenge it once you have enough points: 30 in this run. Every solved stage gets you closer. Tap <b>Collect</b> to bank these.", focus: ".cuddle-money-collect" },
        { title: "And money", text: "The <b class=\"umt-tut-gold\">$</b> beside your points is <b>money</b>. In a full run you spend it in shops, on badge packs and on new choices. Here it just adds up, so don't worry about it yet.", focus: ".cuddle-header-money, .cuddle-money-collect" }
      ]
    },
    {
      id: "e-mulligan",
      when: function when(game, state) {
        return playing(state) && window.CuddleEasyMode && window.CuddleEasyMode.isMulliganStage(game) && present(".cuddle-mulligan");
      },
      at: "top",
      cards: [
        { title: "A letter is missing", text: "This time one consonant of the answer is <b>not</b> in your hand: the <b>T</b>. Consonants come from your <b>deck</b>, the pile beside the buttons, and the T is waiting on top." },
        { title: "Mulligan the K", text: "A <b>mulligan</b> swaps cards for new ones from the deck. Tap <b>Mulligan</b>, choose the <b>K</b> (the answer doesn't use it), and confirm: the T comes in.", focus: ".cuddle-mulligan" },
        { title: "A hint for this one", text: "The answer uses <b>T</b>, <b>G</b> and <b>R</b>, in that order; the <b>X</b> isn't in it either. And it's a big striped cat!" }
      ]
    },
    {
      id: "e-badge",
      when: function when(game, state) {
        // Once the choices are really up: the solve animation and the
        // cash-out come first.
        return state.status === "upgrade" && onTop(".cuddle-choice-grid") && !moneyOverlayUp();
      },
      at: "top",
      cards: [
        { title: "Pick a badge", text: "After a stage you pick one of these. Each is a <b>badge</b>: it stays with you for the rest of the run and makes you better, usually with a hint about the answer. Pick the one that sounds most useful.", focus: ".cuddle-choice-grid", at: "bottom" },
        { title: "Not sure what it does?", text: "Tap the <b>?</b> on a badge any time, here or in your badges, to see what it does, with an example from the game.", focus: ".cuddle-choice-grid .umt-help-q", at: "bottom" }
      ]
    },
    {
      // The second reward screen offers the badge you hold, a level up.
      id: "e-levelup",
      when: function when(game, state) {
        return state.status === "upgrade" && onTop(".cuddle-choice-grid") && !moneyOverlayUp()
          && Boolean(window.CuddleEasyMode && window.CuddleEasyMode.levelUpOffer(game));
      },
      needs: ["e-badge"],
      at: "top",
      cards: [
        { title: "Level up a badge", text: "Badges you already have can be <b>levelled up</b>: each level makes the badge stronger. This time, instead of a new badge, take the next level of yours. Its <b>?</b> shows what each level does.", focus: ".cuddle-choice-grid", at: "bottom" }
      ]
    },
    {
      // Back in play with a badge: where to find it again.
      id: "e-mybadges",
      when: function when(game, state) { return playing(state) && stagesSolved(state) >= 2 && !state.boss && present(".umt-pt-mini"); },
      needs: ["e-badge"],
      at: "bottom",
      cards: [
        { title: "Your badges", text: "Every badge you pick waits behind the <b>badges button</b> at the top, the one with a number (how many you have). Tap it any time to see your badges and what each one does.", focus: ".umt-pt-mini" }
      ]
    },
    {
      // A later stage, once washing out opens (cuddle-washout.js).
      id: "e-washout",
      when: function when(game, state) { return playing(state) && !state.boss && present(".umt-washout-btn"); },
      at: "top",
      cards: [
        { title: "Wash out", text: "Stuck with letters you can't use? Tap the <b>✕</b> on your deck to <b>wash out</b>: all your consonants are swapped for new ones and you get 2 more mulligans. It costs a guess.", focus: ".umt-washout-btn" }
      ]
    },
    {
      id: "e-crossroads",
      when: function when() { return present(".umt-event-page") && present(".umt-event-choice"); },
      at: "bottom",
      cards: [
        { title: "A choice", text: "Pick the help you like for the rest of the way. <b>A hint</b> marks one letter of every answer yellow from the start. <b>A free opener</b> lets your first guess in every stage be any five letters, so you can test the letters you like." }
      ]
    },
    {
      id: "e-boss",
      when: function when(game, state) {
        return (state.status === "bossChoice" && present(".cuddle-boss-choice")) || (playing(state) && Boolean(state.boss));
      },
      at: "top",
      cards: [
        { title: "The boss", text: "The last stop is a <b>boss</b>. A boss bends one rule of Wordle for a guess or two. Pick the boss you'd rather face: each says what it bends. In the fight, tap its icon beside a row to read it again." },
        { title: "How you win", text: "Solve the boss's word within its guesses and you <b>win the run</b>. Run out of guesses and the run is over. Good luck!" }
      ]
    },
    {
      id: "e-won",
      when: function when(game, state) { return state.status === "won" && onTop(".cuddle-win-modal") && !moneyOverlayUp(); },
      at: "bottom",
      cards: [
        { title: "You did it!", text: "You know the basics now: guess with your cards, read the colours, mulligan what you don't need, and pick badges that help." },
        { title: "What's next", text: "<b>Standard</b> is the full game: three worlds and three bosses, forks in the road, <b>quests</b>, special <b>squares</b> on the board, <b>shops</b> to spend your money in, Duels and Trials. Every new thing explains itself the first time you meet it." }
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

  function eduRecord(state) {
    if (!state.umtEduTour || typeof state.umtEduTour !== "object" || !Array.isArray(state.umtEduTour.seen)) {
      state.umtEduTour = { status: "active", seen: [] };
    }
    return state.umtEduTour;
  }

  function sync() {
    var game = activeGame();
    var state = game && game.state;
    var edu = Boolean(state && easyRun(game));
    var record = edu ? eduRecord(state) : load();
    var scenes = edu ? EDU_SCENES : SCENES;
    if (record && record.status === "done") {
      if (view.el) close();
      return;
    }
    if (!state || !document.getElementById("cuddleRoot")) return;
    // Never over the lobby.
    if (document.querySelector(".cuddle-landing")) {
      if (view.el) close();
      return;
    }
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
        // Its moment passed (Collect tapped mid-lesson, say): it counts as
        // seen, so it isn't told again at the next cash-out.
        if (!still) markSeen(view.scene);
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
    for (var i = 0; i < scenes.length; i += 1) {
      var scene = scenes[i];
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
      // A card about something this run doesn't have (quests on a first
      // run, cuddle-first-run.js) is left out.
      var cards = scene.cards.filter(function shown(card) {
        try { return !(typeof card.skip === "function" && card.skip(game, state)); } catch (_error) { return true; }
      });
      if (!cards.length) continue;
      view.scene = Object.assign({}, scene, { cards: cards, edu: edu });
      view.index = 0;
      render();
      return;
    }
  }

  function markSeen(scene) {
    if (!scene) return;
    if (scene.edu) {
      var game = activeGame();
      if (game && game.state) {
        var own = eduRecord(game.state);
        if (own.seen.indexOf(scene.id) === -1) own.seen.push(scene.id);
        try { game.save(); } catch (_error) { /* next save */ }
      }
      return;
    }
    var record = load() || { status: "active", seen: [] };
    if (record.seen.indexOf(scene.id) === -1) record.seen.push(scene.id);
    if (scene.done) record.status = "done";
    store(record);
  }

  function finishScene() {
    markSeen(view.scene);
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
      if (view.scene && view.scene.edu) {
        var game = activeGame();
        if (game && game.state) {
          eduRecord(game.state).status = "done";
          try { game.save(); } catch (_error) { /* next save */ }
        }
      } else {
        store({ status: "done", seen: SCENES.map(function id(scene) { return scene.id; }), skipped: true });
      }
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
