/* Cuddle: badge help.
 *
 * Every badge gets a small "?" (on the badge page's card, the reward
 * screen and the shop). It opens a panel that says what the badge does at
 * each level, explains the mechanic behind it in more detail, and shows
 * pictures of that mechanic taken from the game itself (help/*.webp).
 */
(function () {
  "use strict";

  if (window.CuddleBadgeHelp) return;

  // Pictures of the game's mechanics, and what each one shows.
  var SHOTS = {
    board: "Your guesses. Green: right letter, right spot. Yellow: in the word, wrong spot. Grey: not in the word.",
    hand: "Your hand: vowels on top (always there), consonant cards below, and your deck on the left.",
    mulligan: "A mulligan: tap the letters you don't want, then confirm. New cards come from your deck.",
    themes: "The theme line above the board: what kind of word the answer is.",
    clues: "Clues above the board: answers still possible, vowel count, a repeated letter, the vowel/consonant pattern, and tested letters.",
    compass: "Compass arrows under a tile: the answer's letter there comes earlier (←) or later (→) in the ABCs.",
    squares: "Special squares on the board: $ money, ● points, ↻ mulligan, ★ Joker, ? oracle. A green or yellow on one pays out.",
    specialCards: "Special cards in your hand: a Joker (★), an idea card (bulb), a lucky card (clover) and a dead card (skull).",
    luckyCard: "A lucky card: no letter. Keep it in your hand until you solve for points.",
    ideaCard: "An idea card: no letter. Mulligan it away to learn a letter of the answer.",
    deadCard: "A dead card: no letter, it only takes up room. Mulligan it away.",
    jokerCard: "A Joker card: it can be any letter you need.",
    wave: "A wave: every consonant card washes out and new ones are dealt.",
    fishhook: "The Fish Hook sits on your deck: tap it to fish back a card you discarded.",
    quest: "A quest: do what it asks with this guess.",
    questReward: "Finish a quest and you pick one of its rewards.",
    cashout: "The cash-out after a solve: every row, bonus and badge that paid, added up.",
    reward: "After a stage you pick one new badge, or skip for points or money.",
    shop: "The shop: one-time supplies for your next stages and the next boss, paid with money.",
    map: "The road: you pick your stops. A boss needs enough points (here 200) before you can challenge it.",
    header: "The top bar: the Cuddle Meter (heart), your points and the next boss's target, and your money.",
    meter: "The Cuddle Meter: every grey or yellow tile fills it. When it's full, it gives a reward."
  };

  // Per badge: the longer explanation, and which pictures go with it.
  var HELP = {
    extraMulligans: ["A mulligan swaps cards in your hand for new ones from your deck: handy when the consonants you hold don't fit the answer. Each stage starts with a few; this badge adds more. Mulligans you don't use pay a small bonus when you solve.", ["mulligan", "hand"]],
    questRefreshes: ["When you finish a quest, you pick one of a few rewards. If none of them suits you, a refresh deals new ones. This badge gives you free refreshes on that screen.", ["questReward"]],
    questPoints: ["Quests show up on some guesses and ask for something, like a letter in a certain spot. Finish one and you get its reward; with this badge you also get these points on top.", ["quest", "questReward"]],
    questReroll: ["Some quests are hard to fit into a useful guess. Once each stage you can swap the quest you have for a different one, for free.", ["quest"]],
    mulliganSize: ["Normally a mulligan swaps up to 3 cards at once. This badge lets one mulligan swap more, up to your whole hand at level 3, so a bad hand can be fixed in one go.", ["mulligan"]],
    cullOne: ["Culling takes rare consonants (like Q, X, Z) out of the game for the rest of the run: they leave your deck, and no answer will use them. Fewer letters to worry about means easier guesses. A run never culls more than 8 letters in all.", ["clues", "hand"]],
    cullTwo: ["Culling takes rare consonants (like Q, X, Z) out of the game for the rest of the run: they leave your deck, and no answer will use them. Fewer letters to worry about means easier guesses. A run never culls more than 8 letters in all.", ["clues", "hand"]],
    categorySense: ["Every answer belongs to one or more themes, like \"animals\" or \"food\". With this badge, the theme line above the board shows some of them from the start of each stage, so you know what kind of word to look for.", ["themes"]],
    storybookStart: ["Free points: each stage simply starts with these points added to your score, whatever happens in it.", ["header"]],
    wideChoice: ["After each stage you pick one new badge from a few cards. This badge shows you more cards to choose from, so you're more likely to find the one you want.", ["reward"]],
    handSizeBoost: ["Your hand holds a set number of consonant cards (vowels are always there on top). This badge raises that number, so you have more letters to build your guesses from.", ["hand"]],
    mulliganValueBoost: ["When you solve, every mulligan you didn't use pays 1 point. This badge makes each unused mulligan worth more, so saving your mulligans pays off.", ["mulligan", "cashout"]],
    earlySolveBoost: ["When you solve, each guess you still had left pays a bonus row. This badge adds these points for every guess left, so solving early pays much more.", ["cashout"]],
    colourTrade: ["Every green tile you reveal pays points. This badge makes each green worth more.", ["board", "cashout"]],
    greyscale: ["Grey tiles (letters that aren't in the word) normally pay nothing. With this badge each one pays points, so even a guess that misses still earns something.", ["board", "cashout"]],
    rewardEcho: ["The very next reward you take counts twice: you get it two times over. It's used up after that.", ["reward"]],
    greenCount: ["A green tile normally just says \"right letter, right spot\". With this badge it also tells you how many times that letter is in the answer, so you know if it's used twice.", ["board"]],
    "surprise-assignment": ["Quests normally show up on set guesses. This badge adds extra quests at random guesses in every stage, so there are more rewards to win.", ["quest", "questReward"]],
    bonusSquares: ["The board has no special squares until a badge adds them. This one adds money ($) and points (●) squares: get a green or yellow on one and it pays out. Higher levels add more of them.", ["squares"]],
    treasureMap: ["Special squares appear on the board in some spots. Get a green or yellow on one and it pays out: money, points, a mulligan, a Joker card or a placed letter, depending on the square. This badge adds more of them.", ["squares"]],
    mulliganTiles: ["Special squares appear on the board in some spots. A mulligan square (↻) pays out when your guess puts a green or yellow on it: you get one more mulligan for this stage.", ["squares", "mulligan"]],
    jokerTiles: ["Special squares appear on the board in some spots. A Joker square (★) pays out when your guess puts a green or yellow on it: you get a Joker card, which can be any letter.", ["squares", "jokerCard"]],
    oracleTiles: ["Special squares appear on the board in some spots. An oracle square (?) pays out when your guess puts a green or yellow on it: one letter of the answer is placed in its spot for you.", ["squares", "board"]],
    rainyDay: ["Money is spent in the shop and on refreshes. With this badge, the money you keep earns interest after each stage, up to a cap, so saving grows your pile.", ["header", "shop"]],
    encore: ["Counts the stages you solve: every third one pays these points on top of its usual cash-out.", ["cashout"]],
    vowelBounty: ["When you solve, every vowel in the answer pays these points. Answers with lots of vowels pay the most.", ["cashout"]],
    haggler: ["Refreshing the cards on a reward screen costs money, and gets dearer each time. With this badge refreshes cost less.", ["reward"]],
    doubleDown: ["Each stage secretly picks one guess between your 3rd and 7th. Solve on exactly that guess and you win the bonus. It's a gamble that rewards not rushing.", ["board", "cashout"]],
    vowelLamp: ["Shown in the clues above the board from the start of every stage: how many vowels the answer has.", ["clues"]],
    echoFinder: ["Shown in the clues above the board from the start of every stage: whether the answer uses a letter twice (like the two Os in BOOTY).", ["clues"]],
    treasureHunter: ["Some stages hide a treasure word, marked with a diamond in the theme line. Solve it quickly and it pays this money.", ["themes", "header"]],
    patternLens: ["From your 2nd guess, the clues above the board show the answer's shape: which spots are vowels (V) and which are consonants (C).", ["clues"]],
    mistakeShield: ["Bosses and strict stages end the run when you run out of guesses. If your first guess there is all grey, this badge gives that guess back, so a bad opener doesn't cost you a guess.", ["board", "map"]],
    autopilot: ["On every 2nd guess (the 2nd, 4th, 6th...) the AI plays for you. It picks the best word your hand can make right now, from what the board and your hints show (never from tiles hidden from you), and plays it with your own cards. If no word fits your cards, or a stage's rule turns its word down, that guess is yours instead.", ["board", "hand"]],
    lastLight: ["After your 2nd guess, the answer's last letter is placed in its spot for you, as if you had found it green.", ["board"]],
    yellowHint: ["After your 1st guess, a letter of the answer you haven't found yet is marked for you: at level 1 it turns yellow (it's in the word), at level 2 green (its exact spot).", ["board", "hand"]],
    jokerCache: ["Joker cards go into your deck each stage. A Joker can stand in for any letter, so it fills a gap your hand can't. You can use one Joker per word.", ["jokerCard", "specialCards"]],
    jokerCacheLarge: ["Every stage starts with a Joker card already in your hand, on top of your normal hand. A Joker can stand in for any letter (one per word).", ["jokerCard", "specialCards"]],
    "alphabet-compass": ["After each guess, small arrows appear under some tiles: ← means the answer's letter in that spot comes earlier in the ABCs, → later. Higher levels mark more tiles.", ["compass"]],
    consonantSweep: ["After each guess, one more consonant that isn't in the answer is found and crossed out for you (it shows in the clues). Fewer letters left to try.", ["clues"]],
    coachPossibleAnswers: ["The clues above the board count how many answers still fit everything you've learned. When it says 1, you know there's only one word left.", ["clues"]],
    coachMeterThreshold: ["The Cuddle Meter (the heart at the top) fills with every grey or yellow tile your guesses show. When it's full it gives a reward. This badge makes it fill faster.", ["meter", "header"]],
    coachMeterReward: ["The Cuddle Meter (the heart at the top) fills with every grey or yellow tile and, when full, gives a free mulligan. This badge adds to that reward: a tested consonant, then a Joker card, then a yellow hint.", ["meter", "jokerCard"]],
    momentum: ["Every guess that shows more greens than your previous guess pays these points. Steady progress pays.", ["board", "cashout"]],
    bigOpener: ["Your first guess pays these points for every green or yellow it shows. A good opening word earns a lot.", ["board", "cashout"]],
    lastStand: ["Each world has a guess window (6 guesses, then 5, then 4). Solve on the very last guess inside it and you get this bonus.", ["board", "cashout"]],
    pickpocket: ["Every yellow tile your guesses show pays this much money.", ["board", "header"]],
    gracePeriod: ["Each world has a guess window (6 guesses, then 5, then 4); every guess after it costs points. This badge makes your first late guesses free.", ["board", "cashout"]],
    boldOpener: ["Normally every guess must be a real word. With this badge your first guess can be any five letters, so you can test exactly the letters you want.", ["board"]],
    ideaTiles: ["Idea cards go into your deck. An idea card has no letter; mulligan it away and it shows you a letter of the answer (it turns yellow).", ["ideaCard", "mulligan"]],
    waveTiles: ["Wave cards go into your deck. When you draw one, it washes away every consonant card in your hand (and any dead cards), deals you new ones and gives you a mulligan. Idea cards it washes away still give their hint.", ["wave", "deadCard"]],
    fullCircle: ["Your deck is reshuffled when it runs out. Once a stage, when that happens, a letter of the answer is placed in its spot for you.", ["hand", "board"]],
    leanBuild: ["A Restraint badge: it rewards keeping few badges. Each solve pays this bonus, minus 5 points for every badge you have outside the Restraint school (Legendaries don't count).", ["cashout", "reward"]],
    monksVow: ["You can always skip a reward. With this badge a skip pays both points and money, instead of one or the other.", ["reward"]],
    strikeThrough: ["Consonants that are shown not to be in the answer get crossed out. Each one crossed out pays these points.", ["clues", "cashout"]],
    highRoller: ["A bet every stage: solve within the target guess and you win the bet; solve later and you lose it.", ["board", "cashout"]],
    hardMode: ["Hard mode means every guess keeps the greens you've found in their spots and uses every yellow you've found. Solve a stage that way and you get these points.", ["board", "cashout"]],
    combine: ["Takes one of your badges from a playstyle school and turns it into a random badge one rarity higher (common to rare, rare to epic, and so on).", ["reward"]],
    luckyClover: ["Lucky cards go into your deck. A lucky card has no letter. If it's still in your hand when you solve, it pays points; mulligan it away and it pays a little.", ["luckyCard", "cashout"]],
    fishHook: ["The hook sits on your deck. Once a stage, tap it to fish a card you've discarded (by a guess or a mulligan) back into your hand. Higher levels test the letter you fish, and can hook a letter of the answer on their own.", ["fishhook", "hand"]],
    cleanSlate: ["A Restraint badge: whenever you skip a reward, one of your badges levels up at random, so skipping doesn't mean falling behind.", ["reward"]],
    ascetic: ["A Restraint badge: every stage you solve pays 1.6 times while you have 5 badges or fewer outside the Restraint school, and 1.3 times with 10 or fewer (Legendaries don't count). With more than 10 it pays nothing extra.", ["cashout", "reward"]],
    questMastery: ["Every reward a finished quest offers is one step bigger than usual: more mulligans, more letters checked, more letters ruled out.", ["questReward"]],
    overtime: ["Every time a quest asks you to pick a reward, Overtime is one of the choices. Picking it buys one more guess this stage: a boss gets one more try, and on other stages the late-guess cost starts a guess later.", ["quest", "board"]],
    questClue: ["Every time a quest asks you to pick a reward, Clue is one of the choices. Picking it gives you a yellow hint (a letter that's in the answer); at level 2 it's a green hint (a letter in its exact spot).", ["quest", "board"]],
    questChain: ["When you finish a quest, a new one appears on your next guess (if that guess doesn't have one). Keep finishing them and the chain goes on.", ["quest", "questReward"]],
    questScout: ["When a quest appears, a word you could play from your hand that would finish it is found, and some of its letters are placed in your word for you.", ["quest"]],
    blackMarket: ["On every reward screen you can also buy a random badge for $50, on top of the one you pick.", ["reward", "header"]],
    treasureChest: ["Opens a free Large Pack of badges straight away. It has no other effect, but it counts toward the Money school's ranks.", ["reward"]],
    insertCoin: ["Bosses and strict stages end the run when you run out of guesses. With this badge you can pay money for one more guess instead.", ["header", "map"]],
    goldenLedger: ["A boss needs a number of points before you can challenge it. With this badge your money counts toward that target too (it isn't spent).", ["map", "header"]],
    fastLane: ["Bosses, challenges and curses change the rules on some guesses. This badge pushes all of that back: your first guesses are normal, and the tricky ones come later.", ["map", "board"]],
    goldenOpener: ["After your first guess, every yellow letter in it is moved to its right spot and turns green.", ["board"]],
    cullRare: ["Takes 3 rare consonants out of the game for the rest of the run: out of your deck and out of every answer. A run never culls more than 8 letters in all.", ["clues", "hand"]],
    doubleMulligans: ["For the rest of the run, every mulligan you're given (at the start of a stage, from a square, from a quest) comes twice.", ["mulligan"]],
    biggerMulligans: ["Normally a mulligan swaps up to 3 cards at once. With this badge one mulligan can swap up to 5.", ["mulligan"]],
    freeVowelSweep: ["At the start of every stage, 2 vowels are tested for you: each one turns yellow if it's in the answer, or red if it isn't.", ["hand"]],
    revealGreen: ["One time only: your next stage starts with one letter of the answer already in its spot.", ["board"]],
    questDoublePick: ["When you finish a quest, you take 2 of its rewards instead of 1.", ["questReward"]],
    questCadence: ["Quests normally come on guesses 2 and 5. This badge adds guess 3, then guess 1, so you get more quests every stage.", ["quest"]],
    questPersistReward: ["Normally a quest you miss is gone. With this badge it stays open, so you can still finish it on a later guess this stage.", ["quest"]],
    allThemesBoss: ["Every stage starts with all of the answer's themes shown in the theme line.", ["themes"]],
    secondCup: ["Once in the whole run: when a boss or strict stage is about to end because you're out of guesses, you get one more guess.", ["board", "map"]]
  };

  var TIER_NAME = { common: "Common", rare: "Rare", epic: "Epic", legendary: "Legendary" };

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[ch];
    });
  }

  function tree() { return window.CuddleSkillTree || null; }

  function activeGame() {
    try {
      return window.CuddleBranchMap && typeof window.CuddleBranchMap.getActiveGame === "function" ? window.CuddleBranchMap.getActiveGame() : null;
    } catch (_error) {
      return null;
    }
  }

  // A badge from an id or a display name (reward and shop cards only carry
  // the name).
  function findNode(idOrName) {
    var t = tree();
    if (!t || !idOrName) return null;
    try {
      return (typeof t.findNode === "function" && t.findNode(idOrName))
        || (typeof t.findNodeByName === "function" && t.findNodeByName(idOrName)) || null;
    } catch (_error) {
      return null;
    }
  }

  function hasHelp(node) {
    return Boolean(node && HELP[node.id]);
  }

  function levelsMarkup(node, held) {
    if (Array.isArray(node.levels) && node.levels.length) {
      return "<ol class=\"umt-help-levels\">" + node.levels.map(function (text, index) {
        var mark = held === index + 1 ? " class=\"is-held\"" : "";
        return "<li" + mark + "><b>Level " + (index + 1) + "</b><span>" + esc(text) + "</span></li>";
      }).join("") + "</ol>";
    }
    return "<p class=\"umt-help-does\">" + esc(node.description || "") + "</p>";
  }

  function shotsMarkup(keys) {
    return (keys || []).filter(function (key) { return SHOTS[key]; }).map(function (key) {
      return "<figure class=\"umt-help-shot\"><img src=\"cuddle/help/" + esc(key) + ".webp\" alt=\"\" loading=\"lazy\" decoding=\"async\">"
        + "<figcaption>" + esc(SHOTS[key]) + "</figcaption></figure>";
    }).join("");
  }

  // The badge's icon as the badge page draws it (cuddle-progression.js).
  function iconMarkup(icon, id) {
    var art = window.CuddleBadgeArt;
    if (id && art && art.has(id)) return art.img(id);
    var text = String(icon || "\u2726");
    var Icons = window.CuddleIcons;
    if (Icons && typeof Icons.hasEmoji === "function" && Icons.hasEmoji(text)) return Icons.svg(text);
    return esc(text);
  }

  var lastFocus = null;

  function close() {
    var layer = document.querySelector(".umt-help-layer");
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

  function open(idOrName) {
    var node = findNode(idOrName);
    if (!hasHelp(node)) return false;
    close();
    lastFocus = document.activeElement;
    var t = tree();
    var game = activeGame();
    var held = 0;
    try { held = game && t && typeof t.level === "function" ? Math.floor(Number(t.level(game, node)) || 0) : 0; } catch (_error) { held = 0; }
    var school = node.school && t && t.SCHOOLS ? t.SCHOOLS[node.school] : null;
    var info = HELP[node.id];
    var color = school ? school.color : "#9d97b0";
    var layer = document.createElement("div");
    layer.className = "umt-help-layer";
    layer.innerHTML = "<div class=\"umt-help-backdrop\" data-umt-help-close></div>"
      + "<section class=\"umt-help-card\" role=\"dialog\" aria-modal=\"true\" aria-labelledby=\"umtHelpTitle\" style=\"--help-color:" + esc(color) + "\">"
      + "<header class=\"umt-help-head\"><span class=\"umt-help-icon\" aria-hidden=\"true\">" + iconMarkup(node.icon, node.id) + "</span>"
      + "<div><h2 id=\"umtHelpTitle\">" + esc(node.title) + "</h2>"
      + "<span class=\"umt-help-tier\">" + esc([TIER_NAME[node.tier] || "", school ? school.label : ""].filter(Boolean).join(" · ")) + "</span></div>"
      + "<button type=\"button\" class=\"umt-help-close\" data-umt-help-close aria-label=\"Close\">×</button></header>"
      + "<div class=\"umt-help-body\">"
      + "<h3>What it does</h3>" + levelsMarkup(node, held)
      + (window.CuddleBadgeBeforeAfter && window.CuddleBadgeBeforeAfter.has(node.id)
        ? "<h3>Before and after</h3>" + window.CuddleBadgeBeforeAfter.markup(node) : "")
      + "<h3>How it works</h3><p class=\"umt-help-more\">" + esc(info[0]) + "</p>"
      + shotsMarkup(info[1])
      + "</div></section>";
    document.body.appendChild(layer);
    layer.addEventListener("click", function (event) {
      if (event.target.closest("[data-umt-help-close]")) close();
    });
    document.addEventListener("keydown", onKey, true);
    var button = layer.querySelector(".umt-help-close");
    if (button) button.focus({ preventScroll: true });
    return true;
  }

  // -- the "?" on badges ---------------------------------------------------------
  // A span acting as a button: the cards it sits on are buttons themselves.
  function questionButton(node) {
    return "<span class=\"umt-help-q\" role=\"button\" tabindex=\"0\" data-umt-help=\"" + esc(node.id) + "\" aria-label=\"How " + esc(node.title) + " works\">?</span>";
  }

  // Reward cards (data-upgrade-key) and shop items carry the badge's name in
  // their first <strong>; the badge page's badges carry their id.
  var CARD_SELECTOR = "#cuddleScreen [data-upgrade-key], #cuddleScreen .cuddle-shop-item, .umt-bd-badge[data-umt-badge]";

  function decorate() {
    var cards = document.querySelectorAll(CARD_SELECTOR);
    Array.prototype.forEach.call(cards, function (card) {
      if (card.querySelector(":scope > .umt-help-q")) return;
      var title = card.querySelector("strong");
      var node = findNode(card.getAttribute("data-umt-badge")) || findNode(card.getAttribute("data-upgrade-key"))
        || findNode(title && title.textContent.trim());
      if (!hasHelp(node)) return;
      card.insertAdjacentHTML("beforeend", questionButton(node));
    });
  }

  // A tap on the "?" opens the help and nothing else: not the reward pick,
  // not the purchase underneath it. The press itself is only kept from the
  // card (not cancelled): cancelling a touch also cancels the click that
  // follows it on a phone, and the click is what opens the help.
  function onHelpTap(event) {
    var button = event.target instanceof Element ? event.target.closest(".umt-help-q") : null;
    if (!button) return;
    event.stopImmediatePropagation();
    if (event.type !== "click") return;
    event.preventDefault();
    open(button.getAttribute("data-umt-help"));
  }
  ["pointerdown", "mousedown", "touchstart", "click"].forEach(function (type) {
    window.addEventListener(type, onHelpTap, { capture: true, passive: true });
  });
  window.addEventListener("keydown", function (event) {
    var button = event.target instanceof Element ? event.target.closest(".umt-help-q") : null;
    if (!button || (event.key !== "Enter" && event.key !== " ")) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    open(button.getAttribute("data-umt-help"));
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
    var observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });
    schedule();
  }
  if (document.body) start();
  else document.addEventListener("DOMContentLoaded", start, { once: true });

  window.CuddleBadgeHelp = Object.freeze({ open: open, close: close, HELP_IDS: Object.keys(HELP), SHOTS: Object.keys(SHOTS) });
}());
