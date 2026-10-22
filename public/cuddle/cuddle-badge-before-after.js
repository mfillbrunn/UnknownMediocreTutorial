/* Cuddle: a badge before and after (cuddle-badge-help.js shows it).
 *
 * For every badge: what play looks like without it, what changes with it,
 * and a small picture of each side drawn in the game's own look -- a
 * cash-out's rows, a hand of cards, the clue chips, a row of tiles, or a
 * single number. The pictures are examples: how much a badge changes
 * depends on its level. Where the game itself was screenshotted before and
 * after (help/ba/<id>-before.webp, -after.webp; SHOT_PAIRS), the help shows
 * those too.
 *
 * Picture kinds:
 *   pay    cash-out rows [label, value]; the total is added up
 *   hand   cards: letters, and ★ Joker, ♣ lucky, ◇ idea, · dead, ≈ wave
 *   clues  clue chips (none: "no clues")
 *   row    a guess: [word, colours (g green, y yellow, x grey, . empty), marks]
 *   stat   one number with its label
 *   text   a short line when a picture wouldn't say more
 */
(function () {
  "use strict";

  if (window.CuddleBadgeBeforeAfter) return;

  var B = {
    // ---- Cards: mulligans, hand, special cards -----------------------------
    extraMulligans: ["Each stage gives you a few mulligans.", "Each stage gives you more of them, to swap away letters you can't use.",
      { t: "stat", label: "Mulligans each stage", before: "4", after: "5" }],
    mulliganSize: ["A mulligan swaps up to 3 cards at once.", "One mulligan swaps more cards at once, up to your whole hand.",
      { t: "stat", label: "Cards one mulligan can swap", before: "3", after: "4" }],
    handSizeBoost: ["Your hand holds a set number of consonant cards.", "Your hand holds more consonants, so more words are possible.",
      { t: "hand", before: "RSTLNC", after: "RSTLNCM" }],
    jokerCache: ["No Joker cards: a word needs real cards for every letter.", "Joker cards go into your deck; drawn, one can be any letter.",
      { t: "hand", before: "RSTLNC", after: "RSTLN★" }],
    jokerCacheLarge: ["Stages start with just your normal hand.", "Every stage starts with a Joker card on top of your hand.",
      { t: "hand", before: "RSTLNC", after: "RSTLNC★" }],
    ideaTiles: ["Your deck holds only letters (and whatever else you've picked up).", "Idea cards come into your deck: mulligan one away and a letter of the answer turns yellow.",
      { t: "hand", before: "RSTLNC", after: "RSTLN◇" }],
    luckyClover: ["Nothing pays for luck.", "Lucky cards come into your deck: still in your hand when you solve, each pays points.",
      { t: "pay", before: [["Solved", "+18"]], after: [["Solved", "+18"], ["Lucky card", "+5"]] }],
    waveTiles: ["Your consonants only change with guesses and mulligans.", "Drawing a wave card swaps every consonant in your hand for new ones, and washes dead cards away.",
      { t: "hand", before: "RSTL·C", after: "BGHMPK" }],
    fishHook: ["A card you discard is gone until the deck comes round again.", "Once a stage, tap the hook to fish a discarded card back into your hand.",
      { t: "hand", before: "RSTLN", after: "RSTLNB" }],
    fullCircle: ["Running through your whole deck just reshuffles it.", "The first time your deck starts over each stage, a letter of the answer is placed for you.",
      { t: "row", before: [".....", "....."], after: [".R...", ".g..."] }],
    doubleMulligans: ["Every mulligan you're given counts once.", "Every mulligan you're given comes twice, for the rest of the run.",
      { t: "stat", label: "Mulligans each stage", before: "4", after: "8" }],
    biggerMulligans: ["A mulligan swaps up to 3 cards at once.", "A mulligan swaps up to 5 cards at once.",
      { t: "stat", label: "Cards one mulligan can swap", before: "3", after: "5" }],
    treasureMap: ["Special squares turn up on the board now and then.", "More special squares on the board every stage: more chances for money, points, mulligans and hints.",
      { t: "row", before: [".....", "....."], after: [".$..?", "....."] }],
    mulliganTiles: ["No mulligan squares on the board.", "Mulligan squares (↻) turn up: a green or yellow on one gives +1 mulligan.",
      { t: "row", before: [".....", "....."], after: ["..↻..", "....."] }],
    jokerTiles: ["No Joker squares on the board.", "Joker squares (★) turn up: a green or yellow on one gives a Joker card.",
      { t: "row", before: [".....", "....."], after: [".★...", "....."] }],
    oracleTiles: ["No oracle squares on the board.", "Oracle squares (?) turn up: a green or yellow on one places a letter of the answer for you.",
      { t: "row", before: [".....", "....."], after: ["...?.", "....."] }],
    coachMeterThreshold: ["The Cuddle Meter needs its usual number of grey and yellow tiles to fill.", "It fills sooner, so its reward comes more often.",
      { t: "stat", label: "Tiles to fill the Cuddle Meter", before: "12", after: "10" }],
    coachMeterReward: ["A full Cuddle Meter gives a free mulligan.", "A full meter also tests a consonant, then gives a Joker card, then a yellow hint (by level).",
      { t: "text", before: "Full meter: +1 mulligan", after: "Full meter: +1 mulligan, and a tested letter" }],
    combine: ["Your badges keep their rarity.", "One of your playstyle badges turns into a random badge one rarity higher.",
      { t: "text", before: "A Common badge", after: "A random Rare badge" }],
    cleanSlate: ["Skipping a reward just pays its skip bonus.", "Skipping a reward also levels up one of your badges at random.",
      { t: "text", before: "Skip: +40 points", after: "Skip: +40 points, and a badge levels up" }],

    // ---- Quests -------------------------------------------------------------
    questRefreshes: ["A quest's reward choices are what you get.", "You can swap a quest's reward choices for new ones, for free.",
      { t: "stat", label: "Free refreshes on a quest reward", before: "0", after: "1" }],
    questPoints: ["A finished quest pays only its chosen reward.", "Every finished quest also pays points.",
      { t: "pay", before: [["Quest reward", "Rule Out"]], after: [["Quest reward", "Rule Out"], ["Quest Value", "+10"]] }],
    questReroll: ["You're stuck with the quest you get.", "Once a stage, swap your quest for a different one, free.",
      { t: "text", before: "Quest: Same first and last letter", after: "Swapped: Use a double letter" }],
    "surprise-assignment": ["Quests come only on their set guesses.", "Extra quests pop up on other guesses too: more rewards to win.",
      { t: "stat", label: "Quests in a stage", before: "2", after: "3" }],
    questMastery: ["Quest rewards are their usual size.", "Every quest reward is one step bigger.",
      { t: "text", before: "Reward: +1 mulligan", after: "Reward: +2 mulligans" }],
    overtime: ["A finished quest pays its reward and that's all.", "Each finished quest also gives you one more guess this stage.",
      { t: "stat", label: "Guesses before the late cost", before: "6", after: "7" }],
    questChain: ["After a quest, the next one comes on its usual guess.", "Finishing a quest puts a new one on your very next guess.",
      { t: "text", before: "Next quest: guess 5", after: "Next quest: your next guess" }],
    questScout: ["You work out a word that finishes the quest yourself.", "Some letters of a word that would finish it are placed in your word for you.",
      { t: "row", before: [".....", "....."], after: ["S....", "....."] }],
    questDoublePick: ["A finished quest lets you take 1 reward.", "You take 2 of its rewards.",
      { t: "stat", label: "Quest rewards you take", before: "1", after: "2" }],
    questCadence: ["Quests come on guesses 2 and 5.", "You get quests on more guesses (3, then 1 as well).",
      { t: "stat", label: "Quests in a stage", before: "2", after: "3" }],
    questPersistReward: ["A quest you miss is gone.", "A quest you miss stays open for the rest of the stage.",
      { t: "text", before: "Missed: quest gone", after: "Missed: still open next guess" }],

    // ---- Hints --------------------------------------------------------------
    categorySense: ["No theme shown: any word could be the answer.", "The theme line shows what kind of word it is from the start.",
      { t: "clues", before: [], after: ["Theme: Animals"] }],
    allThemesBoss: ["Only the themes your badges reveal are shown.", "Every stage shows all of the answer's themes.",
      { t: "clues", before: ["Theme: Food"], after: ["Theme: Food", "Theme: Fruit"] }],
    greenCount: ["A green says right letter, right spot.", "A green also says how many times its letter is in the answer.",
      { t: "row", before: ["BOOTY", "xgxxx"], after: ["BOOTY", "xgxxx", " ×2  "] }],
    vowelLamp: ["You find out the vowels by guessing.", "The clues tell you how many vowels the answer has.",
      { t: "clues", before: [], after: ["2 vowels"] }],
    echoFinder: ["A repeated letter only shows once you guess it twice.", "The clues tell you if the answer uses a letter twice.",
      { t: "clues", before: [], after: ["Repeats a letter"] }],
    patternLens: ["You don't know where the vowels go.", "From your 2nd guess, the clues show which spots are vowels and which consonants.",
      { t: "clues", before: [], after: ["C V V C C"] }],
    lastLight: ["Every letter is yours to find.", "After your 2nd guess, the answer's last letter is filled in.",
      { t: "row", before: [".....", "....."], after: ["....Y", "....g"] }],
    yellowHint: ["You find every letter by guessing.", "After your 1st guess, a letter of the answer turns yellow (green at level 2).",
      { t: "hand", before: "RSTLNC", after: "RSTLNC", mark: "T" }],
    "alphabet-compass": ["A grey or yellow tile only says it's not right there.", "Arrows under some tiles say if the answer's letter there is earlier (←) or later (→) in the ABCs.",
      { t: "row", before: ["CRANE", "xxyxx"], after: ["CRANE", "xxyxx", "←   →"] }],
    consonantSweep: ["You rule letters out by guessing them.", "After each guess, one more consonant that isn't in the answer is crossed out for you.",
      { t: "clues", before: [], after: ["Not: W"] }],
    coachPossibleAnswers: ["You don't know how many words still fit.", "The clues count the answers still possible.",
      { t: "clues", before: [], after: ["Secrets remaining: 12"] }],
    freeVowelSweep: ["You test the vowels with your own guesses.", "Each stage starts with 2 vowels tested: yellow if in the answer, red if not.",
      { t: "hand", before: "AEIOU", after: "AEIOU", mark: "A", out: "E" }],
    revealGreen: ["Your next stage starts with an empty board.", "Your next stage starts with one letter already in its spot.",
      { t: "row", before: [".....", "....."], after: ["..A..", "..g.."] }],
    boldOpener: ["Your first guess must be a real word.", "Your first guess can be any five letters, to test exactly the ones you want.",
      { t: "row", before: ["CRANE", "....."], after: ["RSTLN", "....."] }],
    goldenOpener: ["Yellows in your first guess stay yellow.", "Every yellow in your first guess moves to its spot and turns green.",
      { t: "row", before: ["CRANE", "xyxxy"], after: ["CRANE", "xgxxg"] }],
    mistakeShield: ["An all-grey first guess in a boss costs you a guess.", "You get that guess back.",
      { t: "stat", label: "Guesses left after an all-grey opener", before: "4", after: "5" }],
    gracePeriod: ["Every guess after the guess window costs points.", "Your first late guesses are free.",
      { t: "pay", before: [["Solved", "+18"], ["Late guess", "-10"]], after: [["Solved", "+18"], ["Late guess", "0"]] }],
    fastLane: ["A boss's or challenge's tricky rules can start on guess 1.", "They all start later, so your first guesses are normal.",
      { t: "text", before: "Boss rule from guess 1", after: "Boss rule from guess 2" }],
    secondCup: ["Out of guesses in a boss or strict stage, the run ends.", "Once per run, you get one more guess instead.",
      { t: "stat", label: "Last-chance guesses this run", before: "0", after: "1" }],
    insertCoin: ["Out of guesses in a boss or strict stage, the run ends.", "You can pay money for one more guess.",
      { t: "text", before: "Out of guesses: run over", after: "Out of guesses: pay $100 for one more" }],

    // ---- Elimination --------------------------------------------------------
    cullOne: ["Rare letters can be in the answer and fill your hand.", "Rare letters leave the game: out of your deck and out of every answer.",
      { t: "clues", before: [], after: ["Out: Q"] }],
    cullTwo: ["Rare letters can be in the answer and fill your hand.", "Rare letters leave the game: out of your deck and out of every answer.",
      { t: "clues", before: [], after: ["Out: Q"] }],
    cullRare: ["Rare letters can be in the answer and fill your hand.", "3 rare letters leave the game for good.",
      { t: "clues", before: [], after: ["Out: Q X Z"] }],
    greyscale: ["Grey tiles pay nothing.", "Every grey tile pays points.",
      { t: "pay", before: [["Grey tiles ×6", "0"]], after: [["Grey tiles ×6", "+6"]] }],
    strikeThrough: ["Crossed-out letters pay nothing.", "Every consonant that gets crossed out pays points.",
      { t: "pay", before: [["Crossed out ×3", "0"]], after: [["Crossed out ×3", "+3"]] }],

    // ---- Speed and points ---------------------------------------------------
    storybookStart: ["A stage starts at 0 points.", "Every stage starts with points already added.",
      { t: "pay", before: [["Solved", "+18"]], after: [["Opening Verse", "+10"], ["Solved", "+18"]] }],
    mulliganValueBoost: ["Each unused mulligan pays 1 point when you solve.", "Each unused mulligan pays more.",
      { t: "pay", before: [["Unused mulligans ×2", "+2"]], after: [["Unused mulligans ×2", "+8"]] }],
    earlySolveBoost: ["Each guess left pays a bonus row when you solve.", "Each guess left also pays extra points.",
      { t: "pay", before: [["3 guesses left", "+30"]], after: [["3 guesses left", "+30"], ["Early Finish", "+15"]] }],
    colourTrade: ["A green tile pays 2 points.", "Every green tile pays more.",
      { t: "pay", before: [["Green tiles ×5", "+10"]], after: [["Green tiles ×5", "+13"]] }],
    encore: ["Every solve pays its usual cash-out.", "Every third stage you solve pays a bonus on top.",
      { t: "pay", before: [["Solved (3rd stage)", "+18"]], after: [["Solved (3rd stage)", "+18"], ["Encore", "+30"]] }],
    vowelBounty: ["Vowels pay like any letter.", "When you solve, each vowel in the answer pays points.",
      { t: "pay", before: [["Solved", "+18"]], after: [["Solved", "+18"], ["Vowels ×2", "+10"]] }],
    momentum: ["A guess pays for its tiles only.", "A guess with more greens than the one before pays a bonus.",
      { t: "pay", before: [["Guess 2: 3 greens", "+6"]], after: [["Guess 2: 3 greens", "+6"], ["Momentum", "+4"]] }],
    bigOpener: ["Your first guess pays for its tiles only.", "Your first guess pays a bonus for every green or yellow.",
      { t: "pay", before: [["Guess 1: 2 hits", "+3"]], after: [["Guess 1: 2 hits", "+3"], ["Big Opener", "+10"]] }],
    lastStand: ["Solving on your last on-time guess pays as usual.", "Solving on exactly that guess pays a big bonus.",
      { t: "pay", before: [["Solved on guess 6", "+12"]], after: [["Solved on guess 6", "+12"], ["Last Stand", "+25"]] }],
    doubleDown: ["Every guess you solve on pays the same way.", "One secret guess (3rd to 7th) pays a bonus if you solve on it.",
      { t: "pay", before: [["Solved on guess 4", "+15"]], after: [["Solved on guess 4", "+15"], ["Double Down", "+50"]] }],
    highRoller: ["No bet: a stage pays what it pays.", "Each stage bets points: solve early to win them, late to lose them.",
      { t: "pay", before: [["Solved on guess 4", "+15"]], after: [["Solved on guess 4", "+15"], ["Bet won", "+10"]] }],
    hardMode: ["Any guess is fine.", "Keep your greens in place and use your yellows on every guess, and the solve pays a bonus.",
      { t: "pay", before: [["Solved", "+18"]], after: [["Solved", "+18"], ["Hard mode", "+10"]] }],
    leanBuild: ["A solve pays its usual cash-out.", "A solve pays a bonus, smaller for every badge you hold outside Restraint.",
      { t: "pay", before: [["Solved", "+18"]], after: [["Solved", "+18"], ["Lean Build", "+15"]] }],
    ascetic: ["A solve pays its usual cash-out.", "With few badges outside Restraint, every solve pays 1.6 times (5 or fewer) or 1.3 times (10 or fewer).",
      { t: "pay", before: [["Solved", "+20"]], after: [["Solved", "+20"], ["Ascetic ×2", "+20"]] }],

    // ---- Money --------------------------------------------------------------
    wideChoice: ["A reward screen shows 3 cards.", "It shows more cards to choose from.",
      { t: "stat", label: "Reward cards to pick from", before: "3", after: "4" }],
    rewardEcho: ["The next reward counts once.", "The next reward you take counts twice.",
      { t: "text", before: "Bigger Hand: +1 consonant", after: "Bigger Hand twice: +2 consonants" }],
    rainyDay: ["Money you keep just sits there.", "After each stage, your money earns interest.",
      { t: "stat", label: "Money after a stage, from $100", before: "$100", after: "$105" }],
    haggler: ["Refreshing reward cards costs $3, then $5, then $7.", "Refreshes cost less: $0, then $1, then $3.",
      { t: "stat", label: "First refresh", before: "$3", after: "$0" }],
    treasureHunter: ["Every word pays the usual money.", "Some stages hide a treasure word: solve it quickly for extra money.",
      { t: "pay", before: [["Stage cleared", "+$10"]], after: [["Stage cleared", "+$10"], ["Treasure word", "+$20"]] }],
    pickpocket: ["Yellow tiles pay points only.", "Every yellow tile also pays money.",
      { t: "pay", before: [["Yellow tiles ×3", "+3"]], after: [["Yellow tiles ×3", "+3"], ["Pickpocket", "+$6"]] }],
    monksVow: ["Skipping a reward pays points or money.", "Skipping pays both.",
      { t: "text", before: "Skip: +40 points or +$15", after: "Skip: +40 points and +$15" }],
    blackMarket: ["A reward screen gives you one pick.", "You can also buy a random badge there for $50.",
      { t: "stat", label: "Badges from one reward screen", before: "1", after: "2" }],
    treasureChest: ["No pack.", "Opens a free Large Pack of badges straight away.",
      { t: "stat", label: "Badges right away", before: "0", after: "Large Pack" }],
    goldenLedger: ["Only points count toward a boss's points target.", "Your money counts toward it too (it isn't spent).",
      { t: "stat", label: "Toward a 200-point boss, with 150 points and $40", before: "150", after: "170" }]
  };

  function spec(id) {
    var entry = B[id];
    return entry ? { without: entry[0], with: entry[1], picture: entry[2] } : null;
  }

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[ch];
    });
  }

  function amount(text) {
    var match = /^([+-])?\$?(\d+)/.exec(String(text).trim());
    if (!match) return null;
    return { value: (match[1] === "-" ? -1 : 1) * Number(match[2]), money: String(text).indexOf("$") !== -1 };
  }

  // A cash-out: its rows, then the points (and money) they add up to.
  function payPicture(rows, other) {
    var points = 0;
    var money = 0;
    var labels = (other || []).map(function (row) { return row[0] + "=" + row[1]; });
    var body = rows.map(function (row) {
      var worth = amount(row[1]);
      if (worth) { if (worth.money) money += worth.value; else points += worth.value; }
      var changed = other && labels.indexOf(row[0] + "=" + row[1]) === -1;
      return "<li class=\"" + (changed ? "is-new" : "") + "\"><span>" + esc(row[0]) + "</span><b>" + esc(row[1]) + "</b></li>";
    }).join("");
    var total = (points ? (points > 0 ? "+" : "") + points + " pts" : "") + (money ? (points ? " · " : "") + "+$" + money : "");
    return "<ul class=\"umt-ba-pay\">" + body + "</ul><p class=\"umt-ba-total\">Cash-out <b>" + esc(total || "+0 pts") + "</b></p>";
  }

  var CARD_KIND = { "★": "joker", "♣": "lucky", "◇": "idea", "·": "dead", "≈": "wave" };
  function handPicture(cards, other, marks) {
    var seen = (other || "").split("");
    return "<div class=\"umt-ba-hand\">" + String(cards).split("").map(function (ch) {
      var at = seen.indexOf(ch);
      var fresh = other != null && at === -1;
      if (at !== -1) seen.splice(at, 1);
      var kind = CARD_KIND[ch] || "";
      var cls = ["umt-ba-card", kind ? "is-" + kind : "", fresh ? "is-new" : "",
        marks && marks.mark === ch ? "is-yellow" : "", marks && marks.out === ch ? "is-red" : ""].filter(Boolean).join(" ");
      var face = kind === "lucky" ? "☘" : kind === "idea" ? "💡" : kind === "dead" ? "☠" : kind === "wave" ? "≈" : ch;
      return "<span class=\"" + cls + "\">" + esc(face) + "</span>";
    }).join("") + "</div>";
  }

  function cluesPicture(chips, other) {
    if (!chips.length) return "<div class=\"umt-ba-clues is-empty\">No clues</div>";
    return "<div class=\"umt-ba-clues\">" + chips.map(function (chip) {
      var fresh = other && other.indexOf(chip) === -1;
      return "<span class=\"umt-ba-chip" + (fresh ? " is-new" : "") + "\">" + esc(chip) + "</span>";
    }).join("") + "</div>";
  }

  var SQUARE = { "$": "money", "?": "hint", "↻": "mulligan", "★": "joker" };
  function rowPicture(row, other) {
    var letters = String(row[0] || "");
    var colours = String(row[1] || "");
    var marks = String(row[2] || "");
    var otherLetters = other ? String(other[0] || "") : null;
    var otherColours = other ? String(other[1] || "") : null;
    var otherMarks = other ? String(other[2] || "") : null;
    var tiles = [];
    for (var i = 0; i < 5; i += 1) {
      var ch = letters.charAt(i);
      var colour = colours.charAt(i);
      var square = SQUARE[ch];
      var shown = ch === "." || square ? "" : ch;
      var mark = marks.charAt(i).trim();
      var fresh = other != null && (ch !== otherLetters.charAt(i) || colour !== otherColours.charAt(i) || mark !== otherMarks.charAt(i).trim());
      var cls = ["umt-ba-tile", colour === "g" ? "is-green" : colour === "y" ? "is-yellow" : colour === "x" ? "is-grey" : "is-empty",
        square ? "is-square is-" + square : "", fresh ? "is-new" : ""].filter(Boolean).join(" ");
      tiles.push("<span class=\"" + cls + "\">" + esc(square ? ch : shown)
        + (mark ? "<i class=\"umt-ba-mark\">" + esc(mark) + "</i>" : "") + "</span>");
    }
    return "<div class=\"umt-ba-row\">" + tiles.join("") + "</div>";
  }

  function statPicture(label, value, other) {
    return "<div class=\"umt-ba-stat" + (other != null && other !== value ? " is-new" : "") + "\"><b>" + esc(value) + "</b><span>" + esc(label) + "</span></div>";
  }

  function picture(p, side) {
    var before = side === "before";
    var mine = before ? p.before : p.after;
    var other = before ? null : p.before;
    switch (p.t) {
      case "pay": return payPicture(mine, other);
      case "hand": return handPicture(mine, other, before ? null : { mark: p.mark, out: p.out });
      case "clues": return cluesPicture(mine, other);
      case "row": return rowPicture(mine, other);
      case "stat": return statPicture(p.label, mine, other);
      default: return "<p class=\"umt-ba-text" + (before ? "" : " is-new") + "\">" + esc(mine) + "</p>";
    }
  }

  // Badges with screenshots of the game itself, before and after
  // (help/ba/<id>-before.webp and -after.webp: one seeded stage played
  // twice with the same guesses, without the badge and with it).
  // The caption says what to compare.
  var SHOT_PAIRS = {
    mulliganValueBoost: "The same stage and guesses: the unused mulligans line pays more, and so does the cash-out.",
    earlySolveBoost: "The same stage and guesses: Solved 3 guesses early goes from +15 to +30.",
    colourTrade: "The same stage and guesses: the solving row's greens pay more.",
    greyscale: "The same stage and guesses: the grey tiles of the first two guesses now pay too.",
    vowelBounty: "The same stage and guesses: a new row pays for the vowels in the secret.",
    momentum: "The same stage and guesses: a new row, the Momentum bonus.",
    bigOpener: "The same stage and guesses: a new row, Big Opener +10.",
    storybookStart: "The same stage and guesses: the stage started with points, so the cash-out goes from +93 to +103.",
    pickpocket: "The same stage and guesses: the yellow tiles pay money too, $39 becomes $45.",
    vowelLamp: "The same stage after one guess: a clue chip says how many vowels.",
    echoFinder: "The same stage after one guess: a clue chip says whether a letter repeats.",
    patternLens: "The same stage after one guess: a clue chip shows the vowel (V) and consonant (C) spots.",
    coachPossibleAnswers: "The same stage after one guess: the answers still possible are counted.",
    categorySense: "The same stage at its start: the theme line shows the answer's theme.",
    consonantSweep: "The same stage after one guess: consonants that aren't in the answer are crossed out.",
    cullOne: "After one guess: the culled letter is listed as out of the game (the answers differ, since culling changes the word list).",
    cullTwo: "After one guess: the culled letter is listed as out of the game (the answers differ, since culling changes the word list).",
    "alphabet-compass": "The same stage and guesses: arrows under tiles point earlier or later in the ABCs.",
    yellowHint: "The same stage after one guess: Y turns yellow in your hand.",
    handSizeBoost: "The same stage at its start: one more consonant in your hand.",
    jokerCacheLarge: "The same stage at its start: a Joker card (★) in your hand.",
    extraMulligans: "The same stage at its start: Mulligan shows 5 instead of 4.",
    treasureMap: "The same stage at its start: a special square on your next row.",
    coachMeterThreshold: "The same stage at its start: the Cuddle Meter heart needs 8 tiles instead of 10."
  };

  function markup(node) {
    var info = node && spec(node.id);
    if (!info) return "";
    var scaled = (Array.isArray(node.levels) && node.levels.length > 1) || (node.maxLevel && node.maxLevel > 1);
    var shots = SHOT_PAIRS[node.id]
      ? "<h4 class=\"umt-ba-shots-title\">In the game</h4><div class=\"umt-ba-shots\"><figure><figcaption>Without it</figcaption><img src=\"cuddle/help/ba/" + esc(node.id) + "-before.webp\" alt=\"\" loading=\"lazy\"></figure>"
        + "<figure><figcaption>With it</figcaption><img src=\"cuddle/help/ba/" + esc(node.id) + "-after.webp\" alt=\"\" loading=\"lazy\"></figure></div>"
        + (SHOT_PAIRS[node.id] ? "<p class=\"umt-ba-shot-note\">" + esc(SHOT_PAIRS[node.id]) + "</p>" : "")
      : "";
    return "<div class=\"umt-ba\">"
      + "<section class=\"umt-ba-side is-before\"><h4>Without it</h4><p>" + esc(info.without) + "</p>" + picture(info.picture, "before") + "</section>"
      + "<section class=\"umt-ba-side is-after\"><h4>With it</h4><p>" + esc(info.with) + "</p>" + picture(info.picture, "after") + "</section>"
      + "</div>"
      + (scaled ? "<p class=\"umt-ba-note\">An example: how much changes depends on the badge's level.</p>" : "<p class=\"umt-ba-note\">An example of what changes.</p>")
      + shots;
  }

  window.CuddleBadgeBeforeAfter = Object.freeze({
    has: function (id) { return Boolean(B[id]); },
    markup: markup,
    ids: function () { return Object.keys(B).filter(function (id) { return B[id]; }); },
    setShotPairs: function (pairs) { Object.keys(pairs || {}).forEach(function (id) { SHOT_PAIRS[id] = pairs[id]; }); }
  });
}());
