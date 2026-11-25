// client/daily-pick.js — Unstruck: three shared puzzles a day, played once.
//
// Each puzzle is sixteen five-letter words in a 4x4 grid, one of them the
// secret. Select a word and confirm it, and the panel below shows Wordle
// feedback for it; exclude the words that feedback rules out, then pick again,
// until the secret is picked. Solving one moves on to the next; the score is
// the total number of guesses across all three. The puzzles come from the
// date in US Eastern time alone (no server state), and progress is kept in
// localStorage under that date, so it resets daily at midnight Eastern and
// can't be replayed.
// It needs no server API, account or Supabase: the word list is a static file.
//
// The same script runs inside the main site (opened from the game choice
// screen) and on its own page, unstruck/index.html, which marks its <body> with
// data-unstruck-standalone and starts the game straight away. The game's markup
// is built here so both pages share it; a <script data-words="..."> attribute
// says where the word list lives relative to the page, and data-media where
// the weekly game's pictures live (unstruck-media/, built by
// scripts/build-unstruck-media.js).
//
// Two games share all of this: the Daily (three word grids, new every day)
// and the Weekly (three picture grids: flags, animals, food, new every
// Monday). In the Weekly each picture is reduced to a small grid of colors,
// and those color cells play the part of letters: same color in the same
// cell is green, a color found elsewhere in the secret picture is yellow.

(function () {
  const WORD_COUNT = 16;
  // From this day on, a Daily grid would have 18 words (a full 4 x 5 block
  // around the middle spot). Switched off: every grid has 16, in four
  // straight columns with empty space either side of the middle spot.
  const BIG_GRID_FROM = "9999-12-31";
  const BIG_GRID = 18;
  // The practice grid, the same for everyone.
  const PRACTICE_WORDS = 16;
  const PUZZLE_COUNT = 3;
  // Par for the whole day's three grids, for the golf verdict at the end.
  const DAY_PAR = 7;
  // How long a solved grid stays up (the feedback flip and the little
  // celebration) before the next grid or the scorecard.
  const ADVANCE_MS = 2600;
  const STORE_KEY = "umt.dailyPick.v10";
  // Finished days, kept for good (not reset with STORE_KEY): streaks and stats.
  const HISTORY_KEY = "umt.winnow.history"; // named from an earlier name of the game; kept so stats carry over
  // Puzzle #1 is the first Unstruck day; the number counts days from there.
  const LAUNCH_DATE = "2026-11-07";
  const WORDS_URL = document.currentScript?.dataset.words || "wordlists/daily-pick-words.txt";
  const MEDIA_URL = document.currentScript?.dataset.media || "unstruck-media/";
  // Weekly puzzle #1 is the week starting Monday 9 November 2026.
  const WEEKLY_LAUNCH = "2026-11-09";
  // The Weekly's three grids: flag pictures, rows of five paint colors, and
  // words with alphabet arrows.
  const WEEKLY_KINDS = ["flags", "colors", "arrows"];
  // The kinds drawn from the picture catalog (unstruck-media/weekly.json).
  const PIC_KINDS = ["flags", "animals", "food"];
  // Switches the Weekly (its button on the Daily's results, its rules and
  // credits) on or off; keep it in step with WEEKLY in scripts/build-unstruck.js.
  const WEEKLY_ENABLED = true;
  // Speed: as many of the day's ten grids (all with full feedback) as you can
  // solve in three minutes; every guess, right or wrong, costs two seconds.
  // Switches Speed (its button on the Daily's results and its rules) on or off.
  const SPEED_ENABLED = true;
  // The archive page (/archive, behind a password on the server) sets
  // data-archive on this script: past days' Dailies, played from a list.
  const ARCHIVE = "archive" in (document.currentScript?.dataset || {});
  let archiveDate = null; // the past day being played
  // Arrived from a friend's shared result: their score and the day it was for.
  const FRIEND = (() => {
    try {
      const q = new URLSearchParams(location.search);
      const g = +q.get("g"), n = +q.get("n");
      return g >= 3 && g <= 48 && n > 0 ? { score: g, day: n } : null;
    } catch (e) { return null; }
  })();
  // Shows the Experimental button (Speed, Flags / Colors / Arrows) on the
  // Daily's results, and its paragraphs in How to play. Hidden for now.
  const EXPERIMENTAL_BUTTON = false;
  // "Past games" on the Daily's results: replay any of the last few days
  // (they count apart, like the archive: no streak, no stats).
  // Just yesterday, so it's a treat, not a binge; a new player's first week
  // (from the first Daily they played) gets the last three, to get hooked.
  const PAST_DAYS = 1;
  const PAST_DAYS_NEW = 3;
  const NEW_PLAYER_DAYS = 7;
  // Experimental's third set: the Daily's three rules on smaller grids of 12 words.
  const MINI_ENABLED = false;
  const MINI_WORDS = 12;
  // Experimental's second set: One letter, Autopilot, Pick two.
  const TWISTS_ENABLED = true;
  const TWIST_KINDS = ["oneletter", "auto", "choice"];
  // Grids won by striking out everything but the secret (the game, not the
  // player, chooses which words get guessed, and never the secret).
  const ELIM_KINDS = ["auto", "choice"];
  // Autopilot's gap between its guesses: 10 seconds each.
  const autoGap = () => 10000;
  // A grid lost (the secret struck out, nothing left to guess) counts as this many guesses.
  const LOST_SCORE = 16;
  // The Experimental sets (each grid has a kind, and its own rule card).
  const SET_GAMES = ["weekly", "twists"];
  const SPEED_GRIDS = 10;
  const SPEED_MS = 180000;
  const SPEED_PENALTY_MS = 2000;
  const SPEED_ADVANCE_MS = 1100;

  let puzzles = null; // [{ answer, words }]
  let state = null; // { date, rounds: [{ guesses: [], struck: [], solved }] }
  let current = 0; // index of the puzzle on screen
  let advanceTimer = null;
  // The clock runs from the moment Unstruck opens until the last grid is
  // solved, only while Unstruck is on screen. state.elapsed holds the time
  // banked so far; runningSince is when the current stretch began.
  let runningSince = null;
  let ticker = null;
  // Each tap moves a word one step round: normal -> struck out -> selected
  // -> normal. One word at a time can be selected; the Guess button submits it.
  let selected = "";
  // The word just tapped, so only it plays its little animation.
  let toggled = null; // { word, kind: "struck" | "selected" | "freed" }
  // Set for the one render right after a guess, so only then the feedback
  // tiles flip in (and celebrate, when it was the secret).
  let revealing = false;

  // Which game is on screen; the other one's puzzles and state wait in slots.
  let game = "daily";
  const slots = { daily: { puzzles: null, state: null }, weekly: { puzzles: null, state: null }, speed: { puzzles: null, state: null }, twists: { puzzles: null, state: null }, mini: { puzzles: null, state: null }, archive: { puzzles: null, state: null } };
  let catalog = null; // the Weekly's pictures, loaded the first time it's opened

  // Daily play or the practice grid. Practice swaps its own one-grid puzzle
  // and state in; the day's are parked in dailyPuzzles / dailyState meanwhile.
  let playMode = "daily";
  let wordList = null;
  let dailyPuzzles = null;
  let dailyState = null;
  // The practice grid is the same for everyone, always: a fixed seed.
  const PRACTICE_SEED = "whittle-practice-1"; // keep: changing it changes the practice grid

  // Player settings, kept on the device.
  const SETTINGS_KEY = "umt.whittle.settings"; // named from when the game was Whittle; kept so settings carry over
  // Dark is the default look; the switch in ? turns on the paper (light) look.
  // layout: where the feedback / guessing spot is ("middle" of the board or
  // "bottom", under it). input: how a guess is picked ("drag" a word to that
  // spot, or "tap": once crosses out, twice picks, three times clears, then
  // the Guess button in that spot).
  // firstPick (Tap mode): a grid's first guess picked with "double" taps like
  // every other pick (once crosses out, twice picks), or a "single" tap.
  let settings = { colorblind: false, light: false, layout: "bottom", input: "tap", firstPick: "double" };
  try { settings = { ...settings, ...JSON.parse(localStorage.getItem(SETTINGS_KEY)) }; } catch (e) { /* defaults */ }
  const saveSettings = () => { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (e) { /* private mode */ } };
  // Color-blind mode swaps green/yellow for orange/blue (as Wordle's high
  // contrast mode does); the words for the colors follow.
  const colorName = which => (settings.colorblind ? { hit: "orange", near: "blue" } : { hit: "green", near: "yellow" })[which];
  const SPLIT_FILL = "linear-gradient(135deg, var(--dp-hit) 0 49%, rgba(0,0,0,.2) 49% 51%, var(--dp-near) 51% 100%)";

  const $ = id => document.getElementById(id);
  // The day turns over at midnight US Eastern time (daylight saving
  // included), for everyone wherever they are. "en-CA" formats as YYYY-MM-DD.
  const dayFormat = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" });
  const today = () => dayFormat.format(new Date());

  // Whole days between two YYYY-MM-DD dates.
  const dayIndex = date => Math.round(Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10)) / 86400000);
  const addDays = (date, n) => new Date((dayIndex(date) + n) * 86400000).toISOString().slice(0, 10);
  const puzzleNumber = date => dayIndex(date) - dayIndex(LAUNCH_DATE) + 1;
  // The Monday that starts the week a date is in (Eastern time, like the day).
  const weekStart = date => addDays(date, -((new Date(dayIndex(date) * 86400000).getUTCDay() + 6) % 7));
  const weekNumber = date => Math.round((dayIndex(date) - dayIndex(WEEKLY_LAUNCH)) / 7) + 1;

  // Milliseconds until the next midnight in New York. Most days that's 24h
  // after the last one; on a daylight-saving change day it's an hour off, so
  // the guess is nudged until the date flips exactly there.
  function msUntilNextDay() {
    const now = Date.now();
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York", hour: "numeric", minute: "numeric", second: "numeric", hourCycle: "h23"
    }).formatToParts(new Date(now)).map(part => [part.type, part.value]));
    const intoDay = (+parts.hour * 3600 + +parts.minute * 60 + +parts.second) * 1000;
    let next = now + 86400000 - intoDay;
    const dateAt = t => dayFormat.format(new Date(t));
    const todayNow = dateAt(now);
    if (dateAt(next) === todayNow) next += 3600000;
    else if (dateAt(next - 3600000) !== todayNow) next -= 3600000;
    return Math.max(0, next - now);
  }

  // Until next Monday's midnight in New York.
  function msUntilNextWeek() {
    const daysLeft = (7 - (new Date(dayIndex(today()) * 86400000).getUTCDay() + 6) % 7) % 7 || 7;
    return msUntilNextDay() + (daysLeft - 1) * 86400000;
  }

  // What changes between the two games. period() is the key the saved
  // progress belongs to (today, or this week's Monday); step is how far
  // apart two periods in a streak are.
  const GAMES = {
    daily: {
      storeKey: STORE_KEY, historyKey: HISTORY_KEY, par: DAY_PAR, step: 1,
      period: () => today(), number: puzzleNumber, title: "Unstruck", unit: "day", scoreLabel: "guesses today",
      next: () => msUntilNextDay(), nextLabel: "Next Unstruck in"
    },
    weekly: {
      storeKey: "umt.unstruck.weekly.v4", historyKey: "umt.unstruck.weeklyHistory", par: DAY_PAR, step: 7,
      period: () => weekStart(today()), number: weekNumber, title: "Unstruck Experimental", unit: "week", scoreLabel: "guesses this week",
      next: () => msUntilNextWeek(), nextLabel: "Next Experimental in"
    },
    twists: {
      storeKey: "umt.unstruck.twists.v2", historyKey: "umt.unstruck.twistsHistory2", par: 12, step: 7,
      period: () => weekStart(today()), number: weekNumber, title: "Unstruck Twists", unit: "week", scoreLabel: "guesses this week",
      next: () => msUntilNextWeek(), nextLabel: "Next Twists in"
    },
    mini: {
      storeKey: "umt.unstruck.mini.v1", historyKey: "umt.unstruck.miniHistory", par: 6, step: 1,
      period: () => today(), number: puzzleNumber, title: "Unstruck 12", unit: "day", scoreLabel: "guesses today",
      next: () => msUntilNextDay(), nextLabel: "Next Unstruck 12 in"
    },
    // A past day's Daily, from the archive: its own progress per day and its
    // own history, so the real Daily's streak and stats aren't touched.
    archive: {
      get storeKey() { return `umt.unstruck.archive.${archiveDate}`; },
      historyKey: "umt.unstruck.archiveHistory", par: DAY_PAR, step: 1,
      period: () => archiveDate, number: puzzleNumber, title: "Unstruck", unit: "day", scoreLabel: "guesses",
      next: () => 0, nextLabel: ""
    },
    speed: {
      storeKey: "umt.unstruck.speed.v1", historyKey: "umt.unstruck.speedHistory", par: 0, step: 1,
      period: () => today(), number: puzzleNumber, title: "Unstruck Speed", unit: "day", scoreLabel: "grids solved",
      next: () => msUntilNextDay(), nextLabel: "Next Speed in"
    }
  };
  const G = () => GAMES[game];
  const dailyLike = () => game === "daily" || game === "archive" || game === "mini";

  function hash(text) {
    let h = 1779033703 ^ text.length;
    for (let i = 0; i < text.length; i++) {
      h = Math.imul(h ^ text.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return h >>> 0;
  }

  function mulberry32(seed) {
    return () => {
      seed = (seed + 0x6D2B79F5) >>> 0;
      let t = seed;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const shuffle = (list, rand) => {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  // How many tiles two words have in common, green or yellow: that's always
  // the number of letters they share, counting repeats (no feedback needed).
  // Letter counts are cached per word: a day's grids compare each word
  // against the whole list dozens of times.
  const letterCounts = new Map();
  function countsOf(word) {
    let counts = letterCounts.get(word);
    if (!counts) {
      counts = new Uint8Array(26);
      for (let i = 0; i < word.length; i++) counts[word.charCodeAt(i) - 97]++;
      letterCounts.set(word, counts);
    }
    return counts;
  }

  function sharedTiles(a, b) {
    const x = countsOf(a);
    const y = countsOf(b);
    let shared = 0;
    for (let i = 0; i < 26; i++) shared += Math.min(x[i], y[i]);
    return shared;
  }

  // How many letters two words have in the same spot (greens).
  function sameSpots(a, b) {
    let greens = 0;
    for (let i = 0; i < 5; i++) if (a[i] === b[i]) greens++;
    return greens;
  }

  // How a grid's words link up: each new word must share `shared` letters
  // (green or yellow, a [min, max] range) and `greens` letters in the same
  // spot with the word before it; null means anything goes. Each grid draws
  // one recipe at random, by weight.
  const RECIPES = [
    { name: "related", weight: 30, shared: [3, 4], greens: null }, // 3-4 letters in common
    { name: "aligned", weight: 25, shared: null, greens: [1, 2] }, // 1-2 letters in the same spot
    { name: "family", weight: 20, shared: null, greens: [3, 3] }, //  exactly 3 in the same spot (-ATCH, -ILLY...)
    { name: "random", weight: 25, shared: null, greens: null } //    any words at all
  ];
  const within = (value, range) => !range || (value >= range[0] && value <= range[1]);
  const linked = (a, b, recipe) => within(sharedTiles(a, b), recipe.shared) && within(sameSpots(a, b), recipe.greens);

  function pickRecipe(rand) {
    const total = RECIPES.reduce((sum, r) => sum + r.weight, 0);
    let roll = rand() * total;
    for (const recipe of RECIPES) {
      roll -= recipe.weight;
      if (roll < 0) return recipe;
    }
    return RECIPES[RECIPES.length - 1];
  }

  // Each grid sets how much the feedback gives away:
  //   "full"   - Wordle tiles: green right spot, yellow wrong spot, gray not in it
  //   "split"  - half green, half yellow if the letter is in the word at all
  //              (right or wrong spot, not saying which), gray if not
  //   "counts" - only how many greens and how many yellows, no positions
  const LEVELS = [
    { mode: "full" },
    { mode: "split" },
    { mode: "counts" }
  ];

  // A grid is a chain of words rather than a cluster around the answer: start
  // anywhere, then each new word is linked to the one before it by the grid's
  // recipe. Words a few links apart can have little in common, so there's no
  // obvious hub word that splits the grid, and the answer is any link. At a
  // dead end the chain branches off an earlier word instead.
  function buildPuzzle(list, seed, taken, recipe, count = WORD_COUNT) {
    const rand = mulberry32(hash(seed));
    const key = w => countsOf(w).join("");
    const free = list.filter(w => !taken.has(w));
    for (let attempt = 0; attempt < 50; attempt++) {
      const start = free[Math.floor(rand() * free.length)];
      const chain = [start];
      const used = new Set([key(start)]);
      let tip = start;
      let stuck = 0;
      while (chain.length < count && stuck < count) {
        const options = free.filter(w => !used.has(key(w)) && linked(w, tip, recipe));
        const next = options[Math.floor(rand() * options.length)];
        if (next) {
          chain.push(next);
          used.add(key(next));
          tip = next;
          stuck = 0;
        } else {
          tip = chain[Math.floor(rand() * chain.length)];
          stuck++;
        }
      }
      if (chain.length === count) {
        const answer = chain[Math.floor(rand() * chain.length)];
        return { answer, words: shuffle(chain, rand), recipe: recipe.name };
      }
    }
    // Never seen in testing, but a recipe that can't fill a grid falls back
    // to random words rather than leaving the day unplayable.
    if (recipe !== RECIPES[RECIPES.length - 1]) return buildPuzzle(list, `${seed}:fallback`, taken, RECIPES[RECIPES.length - 1], count);
    throw new Error("Unstruck: couldn't build a grid");
  }

  // Days whose grids use a different feedback rule: { date: { gridIndex: mode } }.
  // "oneletter": full colors, but each guess shows just one letter, in turn.
  const DAY_RULE_SWAPS = {};
  // From this day on (until changed), grid 3 is the Arrows grid: each letter
  // shows whether the secret's letter there comes earlier or later in the
  // alphabet, or is right.
  const GRID3_ARROWS_FROM = "2026-11-15";
  // ...and back to the counts grid from today (Nov 17 on).
  const GRID3_ARROWS_UNTIL = "2026-11-16";

  // Days given fresh grids after the fact: { date: n } (bump n to reroll again).
  // Anyone who'd started that day's old grids starts the new ones over.
  const DAY_RESEEDS = { "2026-11-23": 1 };

  function buildDay(pool, date) {
    const list = [...new Set(pool.filter(w => /^[a-z]{5}$/.test(w)))].sort();
    // Every word on the day's three grids is different, not just the answers.
    const taken = new Set();
    return Array.from({ length: PUZZLE_COUNT }, (_, i) => {
      const level = Math.min(i, LEVELS.length - 1);
      const seed = `griddle-4:${date}${DAY_RESEEDS[date] ? `:r${DAY_RESEEDS[date]}` : ""}:${i + 1}`;
      const recipe = pickRecipe(mulberry32(hash(`${seed}:recipe`)));
      const puzzle = buildPuzzle(list, seed, taken, recipe, date >= BIG_GRID_FROM ? BIG_GRID : WORD_COUNT);
      puzzle.words.forEach(w => taken.add(w));
      // Some days swap a grid's feedback rule for a different one.
      const swap = DAY_RULE_SWAPS[date]?.[i] || (i === 2 && date >= GRID3_ARROWS_FROM && date <= GRID3_ARROWS_UNTIL ? "arrows" : null);
      return { ...puzzle, ...LEVELS[level], ...(swap ? { mode: swap } : {}) };
    });
  }

  // Unstruck 12: the Daily's three rules (full, split, counts), 12 words each.
  function buildMini(pool, date) {
    const taken = new Set();
    return Array.from({ length: PUZZLE_COUNT }, (_, i) => {
      const seed = `unstruck-mini-1:${date}:${i + 1}`;
      const puzzle = buildPuzzle(pool, seed, taken, pickRecipe(mulberry32(hash(`${seed}:recipe`))), MINI_WORDS);
      puzzle.words.forEach(w => taken.add(w));
      return { ...puzzle, ...LEVELS[Math.min(i, LEVELS.length - 1)] };
    });
  }

  // Twists: three word grids, each with its own twist.
  function buildTwists(pool, date) {
    const taken = new Set();
    return TWIST_KINDS.map(kind => {
      const seed = `unstruck-twists-2:${date}:${kind}`;
      const puzzle = buildPuzzle(pool, seed, taken, pickRecipe(mulberry32(hash(`${seed}:recipe`))));
      puzzle.words.forEach(w => taken.add(w));
      return { kind, answer: puzzle.answer, words: puzzle.words, mode: "full" };
    });
  }

  // Speed's ten grids: the same for everyone on a day, in the same order, all
  // with full feedback, and no word twice.
  function buildSpeed(pool, date) {
    const taken = new Set();
    return Array.from({ length: SPEED_GRIDS }, (_, i) => {
      const seed = `unstruck-speed-1:${date}:${i + 1}`;
      const puzzle = buildPuzzle(pool, seed, taken, pickRecipe(mulberry32(hash(`${seed}:recipe`))));
      puzzle.words.forEach(w => taken.add(w));
      return { ...puzzle, ...LEVELS[0] };
    });
  }

  // The Weekly: flags, colors and arrows, one grid each.
  const KIND_INFO = {
    flags: { label: "Flags", noun: "flag" },
    animals: { label: "Animals", noun: "animal" },
    food: { label: "Food", noun: "food" },
    colors: { label: "Colors", noun: "row" },
    arrows: { label: "Arrows", noun: "word" },
    oneletter: { label: "One letter", noun: "word" },
    auto: { label: "Autopilot", noun: "word" },
    choice: { label: "Pick two", noun: "word" }
  };

  // The Colors grid's paints: the three primaries, white and black, and every
  // mix of two of them except with black. A paint is its parts.
  const PAINTS = {
    R: { name: "red", hex: "#e03b3b", parts: "R" },
    Y: { name: "yellow", hex: "#f7d038", parts: "Y" },
    B: { name: "blue", hex: "#2f66d6", parts: "B" },
    W: { name: "white", hex: "#f5f5f2", parts: "W" },
    K: { name: "black", hex: "#16171a", parts: "K" },
    O: { name: "orange", hex: "#f18a22", parts: "RY" },
    P: { name: "purple", hex: "#8b45b5", parts: "RB" },
    G: { name: "green", hex: "#169e86", parts: "YB" },
    N: { name: "pink", hex: "#f59bbd", parts: "RW" },
    C: { name: "light yellow", hex: "#fbf0a4", parts: "YW" },
    L: { name: "light blue", hex: "#92c8f5", parts: "BW" }
  };
  const PAINT_CODES = Object.keys(PAINTS);
  const shareAPaint = (x, y) => [...PAINTS[x].parts].some(part => PAINTS[y].parts.includes(part));

  // Colors feedback, paint by paint. Green: it has a color in common with
  // the secret's paint in that spot (a base color that is that paint or part
  // of its mix; a mix that is the same or shares one of its two colors).
  // Yellow: it has one in common with a paint in another spot. Gray: none.
  function paintFeedback(guess, answer) {
    return [...guess].map((c, i) => (shareAPaint(c, answer[i]) ? "correct"
      : [...answer].some((d, j) => j !== i && shareAPaint(c, d)) ? "present" : "absent"));
  }

  // Arrows feedback, letter by letter: where the secret's letter sits in the
  // alphabet compared with the guess's ("left" = earlier), or "same".
  function arrowFeedback(guess, answer) {
    return [...guess].map((c, i) => (c === answer[i] ? "same" : answer[i] < c ? "left" : "right"));
  }
  const ARROWS = { left: "←", right: "→", same: "–" };

  // Sixteen rows of five paints, built like the word grids: each new row
  // changes one to three paints of an earlier one, so rows share a lot. No
  // row may come out all green against another (it would look solved).
  function buildColors(seed) {
    const rand = mulberry32(hash(seed));
    const paint = () => PAINT_CODES[Math.floor(rand() * PAINT_CODES.length)];
    // Rows sharing a color in every spot are kept apart (this also rules out
    // any row looking solved against another).
    const allGreen = (a, b) => [...a].every((c, i) => shareAPaint(c, b[i]));
    for (let attempt = 0; attempt < 100; attempt++) {
      const rows = [Array.from({ length: 5 }, paint).join("")];
      for (let tries = 0; rows.length < WORD_COUNT && tries < 3000; tries++) {
        const row = [...rows[Math.floor(rand() * rows.length)]];
        const changes = 1 + Math.floor(rand() * 3);
        for (let k = 0; k < changes; k++) row[Math.floor(rand() * 5)] = paint();
        const next = row.join("");
        if (!rows.some(other => allGreen(other, next))) rows.push(next);
      }
      if (rows.length === WORD_COUNT) return { answer: rows[Math.floor(rand() * rows.length)], words: shuffle(rows, rand) };
    }
    throw new Error("Unstruck: couldn't build the Colors grid");
  }

  // Raising a kind's number deals it a fresh grid (same for everyone).
  const SEED_VERSIONS = { flags: 2 };

  function buildWeek(cat, date, list) {
    return WEEKLY_KINDS.map(kind => {
      const seed = `unstruck-weekly-${SEED_VERSIONS[kind] || 1}:${date}:${kind}`;
      if (kind === "colors") return { kind, ...buildColors(seed), mode: "full" };
      if (kind === "arrows") {
        const { answer, words } = buildPuzzle(list, seed, new Set(), pickRecipe(mulberry32(hash(`${seed}:recipe`))));
        return { kind, answer, words, mode: "full" };
      }
      // A picture kind only plays once it has enough distinct pictures.
      if (new Set((cat[kind]?.items || []).map(item => item.cells)).size < WORD_COUNT) return null;
      const rand = mulberry32(hash(seed));
      const seen = new Set();
      const picks = [];
      for (const item of shuffle(cat[kind].items, rand)) {
        if (picks.length === WORD_COUNT) break;
        if (seen.has(item.cells)) continue;
        seen.add(item.cells);
        picks.push(item.id);
      }
      const answer = picks[Math.floor(rand() * picks.length)];
      return { kind, answer, words: picks, mode: "full" };
    }).filter(Boolean);
  }

  const itemOf = (kind, id) => catalog[kind].byId[id];
  // The thing a puzzle's tile shows by name: the word, or the picture's name.
  const labelOf = (puzzle, id) => (PIC_KINDS.includes(puzzle.kind) ? itemOf(puzzle.kind, id).name
    : puzzle.kind === "colors" ? [...id].map(c => PAINTS[c].name).join(", ") : id.toUpperCase());
  // A row of paints as little swatches.
  const paintRow = (id, cls = "dp-paints") => `<span class="${cls}">${[...id].map(c => `<i style="background:${PAINTS[c].hex}"></i>`).join("")}</span>`;

  // Golf names for a score relative to par.
  function golfTerm(diff) {
    const names = { "-3": "Albatross", "-2": "Eagle", "-1": "Birdie", 0: "Par", 1: "Bogey", 2: "Double bogey", 3: "Triple bogey", 4: "Quadruple bogey" };
    return names[diff] || (diff < 0 ? "Albatross" : "Over par");
  }
  const relToPar = diff => (diff === 0 ? "even" : `${diff > 0 ? "+" : "−"}${Math.abs(diff)}`);

  // Wordle feedback for two words: a letter is only yellow as many times as
  // the answer still has it.
  function feedback(guess, answer) {
    const n = guess.length;
    const result = Array(n).fill("absent");
    const left = {};
    for (let i = 0; i < n; i++) {
      if (guess[i] === answer[i]) result[i] = "correct";
      else left[answer[i]] = (left[answer[i]] || 0) + 1;
    }
    for (let i = 0; i < n; i++) {
      if (result[i] === "correct") continue;
      if (left[guess[i]] > 0) { result[i] = "present"; left[guess[i]]--; }
    }
    return result;
  }

  // Feedback for a picture's color cells (one character per cell): green
  // where the secret has the same color in the same cell; yellow wherever the
  // secret has that color anywhere else, however many cells that is; gray
  // where the secret has none of that color. An emoji's empty background
  // (".") isn't a color: those cells stay blank.
  function colorFeedback(guess, answer) {
    return [...guess].map((color, i) => (color === "." ? "none" : color === answer[i] ? "correct" : answer.includes(color) ? "present" : "absent"));
  }

  // ---- Analytics -----------------------------------------------------------------
  // A handful of anonymous moments (no personal data), sent to GoatCounter when
  // its script is on the page (see unstruck/index.html); otherwise nothing.
  function track(name, title) {
    try { window.goatcounter?.count?.({ path: `unstruck-${game === "daily" ? "" : `${game}-`}${name}`, title: title || name, event: true }); } catch (e) { /* never break the game */ }
  }

  function load(count = PUZZLE_COUNT) {
    const date = G().period();
    try {
      const saved = JSON.parse(localStorage.getItem(G().storeKey));
      if (saved && saved.date === date && saved.rounds.length === count) return saved;
    } catch (e) { /* fall through */ }
    const rounds = Array.from({ length: count }, () => ({ guesses: [], struck: [], solved: false }));
    return { date, rounds };
  }

  function save() {
    if (playMode === "practice") return;
    try { localStorage.setItem(G().storeKey, JSON.stringify(state)); } catch (e) { /* private mode */ }
  }

  // ---- Streaks and stats -------------------------------------------------
  // HISTORY_KEY holds { "YYYY-MM-DD": { score, time, grids: [n, n, n] } } for
  // every finished day on this device.
  function loadHistory() {
    try { return JSON.parse(localStorage.getItem(G().historyKey)) || {}; } catch (e) { return {}; }
  }

  function recordDay() {
    const history = loadHistory();
    if (history[state.date]) return;
    history[state.date] = {
      score: totalGuesses(), time: Math.round(elapsed()), grids: state.rounds.map(r => r.guesses.length),
      gridTimes: gridTimes()
    };
    track("finished", golfTerm(totalGuesses() - G().par));
    try { localStorage.setItem(G().historyKey, JSON.stringify(history)); } catch (e) { /* private mode */ }
    if (game === "daily" && playMode === "daily") boardSubmit();
  }

  // ---- Global leaderboard (today's Daily) -----------------------------------
  // No sign-up: a random id for this browser, the first finish of the day,
  // and a name if the player gives one. Only on Unstruck's own site, where
  // the server (worker/leaderboard.js) answers /api/.
  const boardOn = () => "unstruckStandalone" in (document.body?.dataset || {});
  const BOARD_SHOWN = 10;
  let boardData = null;
  function boardDevice() {
    try {
      let id = localStorage.getItem("umt.unstruck.device");
      if (!id) {
        id = Array.from(crypto.getRandomValues(new Uint8Array(24)), b => "abcdefghijklmnopqrstuvwxyz0123456789"[b % 36]).join("");
        localStorage.setItem("umt.unstruck.device", id);
      }
      return id;
    } catch (e) { return ""; }
  }
  async function boardPost(path, body) {
    const res = await fetch(`/api/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return res.json().catch(() => ({ error: "Something went wrong." }));
  }
  async function boardSubmit() {
    if (!boardOn() || !boardDevice()) return;
    const key = `umt.unstruck.boardSent.${state.date}`;
    try { if (localStorage.getItem(key)) return; } catch (e) { return; }
    const day = state.date;
    try {
      const res = await boardPost("score", { day, device: boardDevice(), grids: state.rounds.map(r => r.guesses.length), timeMs: Math.round(elapsed()) });
      if (res.ok || res.error) localStorage.setItem(key, "1"); // sent, or refused for good
    } catch (e) { /* offline: tried again when the board opens */ }
  }
  async function boardLoad() {
    const pane = document.querySelector('#dailyPickRoot [data-pane="board"]');
    if (!pane) return;
    await boardSubmit();
    try {
      const res = await fetch(`/api/board?day=${state.date}&device=${boardDevice()}`);
      boardData = await res.json();
    } catch (e) { boardData = { error: true }; }
    boardRender();
  }
  function boardRender() {
    const pane = document.querySelector('#dailyPickRoot [data-pane="board"]');
    if (!pane) return;
    if (!boardData) { pane.innerHTML = `<div class="dp-board-note">Loading…</div>`; return; }
    if (boardData.error || !boardData.top) { pane.innerHTML = `<div class="dp-board-note">Couldn't load the leaderboard. Try again in a bit.</div>`; return; }
    const esc = t => String(t).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
    const row = r => `<div class="dp-lb-row${r.me ? " is-me" : ""}"><span class="dp-lb-rank">${r.rank}</span>
      <span class="dp-lb-name">${r.name ? esc(r.name) : ""}${r.me ? ` <em>you</em>` : ""}</span>
      <span class="dp-lb-score">${r.guesses}</span><span class="dp-lb-time">${formatTime(r.timeMs)}</span></div>`;
    const top = boardData.top.slice(0, BOARD_SHOWN);
    const me = boardData.me && !top.some(r => r.me) ? `<div class="dp-lb-gap">⋯</div>${row(boardData.me)}` : "";
    pane.innerHTML = `<div class="dp-lb">
      <div class="dp-lb-head"><span>Today · ${boardData.total} ${boardData.total === 1 ? "player" : "players"}</span><span>Guesses</span><span>Time</span></div>
      ${top.length ? top.map(row).join("") : `<div class="dp-board-note">No scores yet today.</div>`}${me}
      <form class="dp-lb-form" id="dpLbForm"><input id="dpLbName" maxlength="16" autocomplete="nickname" placeholder="Your name (optional)" value="${esc(boardData.name || "")}"><button type="submit" class="dp-next dp-side-btn">Save</button></form>
      <div class="dp-lb-msg" id="dpLbMsg">${boardData.name ? "" : "Without a name, your score shows without one."}</div>
    </div>`;
  }
  async function boardSaveName(event) {
    event.preventDefault();
    const name = $("dpLbName").value;
    const msg = $("dpLbMsg");
    msg.textContent = "Saving…";
    try {
      const res = await boardPost("name", { device: boardDevice(), name });
      if (res.error) { msg.textContent = res.error; return; }
      track("board-name");
      await boardLoad();
      $("dpLbMsg").textContent = res.name ? "Saved!" : "Name removed.";
    } catch (e) { msg.textContent = "Couldn't save. Try again in a bit."; }
  }

  // Each grid's time (ms): from the grid before being solved to this one;
  // null where it wasn't recorded (days played before grid times existed).
  // Whole seconds on the running clock, the same way the results cards count
  // them, so the cards, the Details table and the total all agree.
  function gridTimes() {
    const secs = t => Math.floor(t / 1000) * 1000;
    return state.rounds.map((r, i) => {
      const before = i ? state.rounds[i - 1].solvedAt : 0;
      return r.solvedAt != null && before != null ? Math.max(0, secs(r.solvedAt) - secs(before)) : null;
    });
  }

  // Averages and bests per grid and overall, for the results' Details view.
  function computeDetails() {
    const days = Object.values(loadHistory());
    const avg = list => (list.length ? list.reduce((a, b) => a + b, 0) / list.length : null);
    const count = state.rounds.length;
    const grids = Array.from({ length: count }, (_, i) => {
      const guesses = days.map(d => d.grids?.[i]).filter(n => n != null);
      const times = days.map(d => d.gridTimes?.[i]).filter(t => t != null);
      return { avg: avg(guesses), best: guesses.length ? Math.min(...guesses) : null, time: avg(times), fastest: times.length ? Math.min(...times) : null };
    });
    const totals = days.map(d => d.score).filter(n => n != null);
    const times = days.map(d => d.time).filter(t => t != null);
    return {
      grids,
      total: { avg: avg(totals), best: totals.length ? Math.min(...totals) : null, time: avg(times), fastest: times.length ? Math.min(...times) : null }
    };
  }

  function computeStats() {
    const history = loadHistory();
    const dates = Object.keys(history).sort();
    const scores = dates.map(d => history[d].score);
    // Current streak: days in a row up to today (or up to yesterday, if
    // today isn't finished yet, so a streak doesn't look broken all morning).
    let current = 0;
    const { step } = G();
    const now = G().period();
    let day = history[now] ? now : addDays(now, -step);
    while (history[day]) { current++; day = addDays(day, -step); }
    let best = 0;
    let run = 0;
    dates.forEach((d, i) => {
      run = i && dayIndex(d) - dayIndex(dates[i - 1]) === step ? run + 1 : 1;
      best = Math.max(best, run);
    });
    return {
      played: dates.length,
      current,
      best,
      average: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0,
      bestScore: scores.length ? Math.min(...scores) : 0
    };
  }

  const round = () => state.rounds[current];
  const firstUnsolved = () => {
    const i = state.rounds.findIndex(r => !r.solved);
    return i < 0 ? state.rounds.length - 1 : i;
  };
  const allSolved = () => state.rounds.every(r => r.solved);
  // Finished: every grid solved, or (Speed) the time ran out.
  const over = () => allSolved() || (game === "speed" && !!state.timeUp);
  const solvedCount = () => state.rounds.filter(r => r.solved).length;
  // A grid's score: its guesses, or LOST_SCORE when it was lost.
  const gridScore = r => (r.lost ? LOST_SCORE : r.guesses.length);
  const totalGuesses = () => state.rounds.reduce((sum, r) => sum + gridScore(r), 0);
  // A grid's name: Grid 2, or its kind (Flags, Autopilot, ...).
  const gridLabel = i => (puzzles[i]?.kind && KIND_INFO[puzzles[i].kind] ? KIND_INFO[puzzles[i].kind].label : `Grid ${i + 1}`);

  const elapsed = () => (state.elapsed || 0) + (runningSince ? Date.now() - runningSince : 0);
  // Speed's time left: three minutes, less the time played and two seconds a guess.
  const speedLeft = () => Math.max(0, SPEED_MS - elapsed() - SPEED_PENALTY_MS * totalGuesses());
  function formatTime(ms) {
    const secs = Math.floor(ms / 1000);
    const h = Math.floor(secs / 3600);
    const m = Math.floor(secs / 60) % 60;
    const ss = String(secs % 60).padStart(2, "0");
    return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
  }

  // Days too, once it's more than a day away (the Weekly).
  const formatCountdown = ms => (ms >= 86400000 ? `${Math.floor(ms / 86400000)}d ${formatTime(ms % 86400000)}` : formatTime(ms));

  function showClock() {
    const clock = $("dpClock");
    if (!clock) return;
    $("dailyPickScreen")?.classList.toggle("is-first-game", firstGame());
    clock.hidden = over() && !advanceTimer;
    if (game !== "speed") {
      clock.textContent = formatTime(elapsed());
      clock.classList.remove("is-low");
      return;
    }
    const left = speedLeft();
    clock.textContent = formatTime(left + 999); // counts down, so round up
    clock.classList.toggle("is-low", left < 30000);
    if (left <= 0 && !state.timeUp && runningSince) timeUp();
  }

  // Speed's clock has run out: the grid on screen stays unsolved.
  function timeUp() {
    state.timeUp = true;
    stopClock();
    clearTimeout(advanceTimer);
    advanceTimer = null;
    selected = "";
    render();
  }

  // A player's very first Daily: the clock runs but isn't shown, so there's
  // no pressure while learning; the results still show the time.
  const firstGame = () => game === "daily" && playMode === "daily" && !Object.keys(loadHistory()).length;

  function startClock() {
    // Never in a tab nobody is looking at (it starts when they come back).
    if (runningSince || document.hidden || over() || !$("dailyPickScreen")?.classList.contains("active") || helpOpen() || introOpen() || ruleOpen() || splashOpen()) return;
    runningSince = Date.now();
    showClock();
    ticker = setInterval(() => { showClock(); autoTick(); }, 250);
  }

  function stopClock() {
    clearInterval(ticker);
    ticker = null;
    if (!runningSince) return;
    state.elapsed = elapsed();
    runningSince = null;
    save();
  }

  // Once all three are solved (and the last one's feedback has had its
  // moment), the grid gives way to the day's scorecard.
  function setTitle(grid) {
    const title = $("dpTitle");
    if (!title) return;
    const number = state ? ` <span class="dp-title-grid">${G().title.replace(/^Unstruck ?/, "")} #${G().number(state.date)}</span>` : "";
    const kind = SET_GAMES.includes(game) && grid ? gridLabel(grid - 1) : game === "speed" ? "Speed" : game === "mini" ? "12 ·" : game === "archive" && state ? `#${G().number(state.date)} ·` : "Grid";
    if (playMode === "practice") title.innerHTML = `Unstruck <span class="dp-title-grid">Practice${puzzles.length > 1 && grid ? ` ${grid}/${puzzles.length}` : ""}</span>`;
    else title.innerHTML = grid ? `Unstruck <span class="dp-title-grid">${kind} ${grid}/${puzzles.length}</span>` : `Unstruck${number}`;
    document.querySelectorAll("#dailyPickScreen .dp-tab").forEach(tab => tab.classList.toggle("is-on", tab.dataset.game === game));
    // A long label (SPEED 1/10, ONE LETTER 1/3) steps down so the buttons fit.
    const label = title.querySelector(".dp-title-grid")?.textContent || "";
    title.classList.toggle("is-long", label.length > 8);
    requestAnimationFrame(() => {
      title.style.removeProperty("font-size");
      let size = parseFloat(getComputedStyle(title).fontSize);
      while (title.scrollWidth > title.clientWidth + 1 && size > 12) { size -= 0.5; title.style.setProperty("font-size", `${size}px`, "important"); }
    });
  }

  let countdownTimer = null;

  // Past results by how they went against par, for the scorecard's chart.
  const BUCKETS = [
    { label: "Eagle or better (−2)", test: d => d <= -2 },
    { label: "Birdie (−1)", test: d => d === -1 },
    { label: "Par (0)", test: d => d === 0 },
    { label: "Bogey (+1)", test: d => d === 1 },
    { label: "Double bogey (+2)", test: d => d === 2 },
    { label: "Triple bogey+ (+3)", test: d => d >= 3 }
  ];

  function distributionChart(todayDiff) {
    const history = loadHistory();
    const counts = BUCKETS.map(bucket => Object.values(history).filter(day => bucket.test(day.score - G().par)).length);
    const most = Math.max(1, ...counts);
    const rows = BUCKETS.map((bucket, i) => {
      const mine = bucket.test(todayDiff);
      const width = Math.max(8, Math.round(100 * counts[i] / most));
      return `<div class="dp-dist-row${mine ? ` is-today ${todayDiff <= 0 ? "is-good" : "is-over"}` : ""}"><span class="dp-dist-label">${bucket.label}</span>
        <span class="dp-dist-track"><span class="dp-dist-bar" style="width:${counts[i] ? width : 0}%"></span><b>${counts[i]}</b></span></div>`;
    }).join("");
    return `<div class="dp-dist"><div class="dp-dist-title">Your scores</div>${rows}</div>`;
  }

  function renderPracticeSummary(root) {
    setTitle(0);
    if (coach || state.coached) {
      state.coached = true;
      coachEnd(true);
      root.innerHTML = `<div class="dp-summary dp-coach-done">
        <div class="dp-done-badge" aria-hidden="true">✓</div>
        <div class="dp-verdict">You're ready!</div>
        <p class="dp-done-lead">Two last things:</p>
        <ol class="dp-done-steps is-notes">
          <li>You don't have to cross out <b>every</b> word, but it helps.</li>
          <li>Grids 2 and 3 work the same way, with a little <b>less help</b> from the colors.</li>
        </ol>
        <button type="button" class="dp-next dp-brag dp-done-play" data-practice="end">Play today's Unstruck</button>
        <button type="button" class="dp-link" data-coach="again">Replay the tutorial</button>
      </div>`;
      return;
    }
    const n = state.rounds[0].guesses.length;
    root.innerHTML = `<div class="dp-summary">
      <div class="dp-verdict">Practice solved!</div>
      <div class="dp-verdict-sub">${n} ${n === 1 ? "guess" : "guesses"} · ${formatTime(elapsed())} · doesn't count toward your stats</div>
      <button type="button" class="dp-next dp-brag" data-practice="start">Play it again</button>
      <button type="button" class="dp-next" data-practice="end">Today's Unstruck →</button>
    </div>`;
  }

  // Overall (stats and score chart) or Details (averages by grid).
  let summaryView = "overall";

  function detailsTable() {
    const d = computeDetails();
    const num = v => (v == null ? "–" : Number.isInteger(v) ? v : v.toFixed(1));
    // Averages rounded to the nearest second (formatTime alone would cut them down).
    const time = v => (v == null ? "–" : formatTime(Math.round(v / 1000) * 1000));
    const name = gridLabel;
    const row = (label, x, cls = "") => `<tr class="${cls}"><th>${label}</th><td>${num(x.avg)}</td><td>${time(x.time)}</td><td>${time(x.fastest)}</td></tr>`;
    return `<div class="dp-details">
      <table>
        <thead><tr><th></th><th>Avg guesses</th><th>Avg time</th><th>Fastest</th></tr></thead>
        <tbody>${d.grids.map((g, i) => row(name(i), g)).join("")}${row("Total", d.total, "is-total")}</tbody>
      </table>
      <div class="dp-details-note">Over all the days you've played on this device.</div>
    </div>`;
  }

  // ---- Results tour (the first finished Daily) -----------------------------------
  const TOUR_KEY = "umt.unstruck.resultsTour";
  let tour = null; // { i, steps }

  function maybeStartTour() {
    if (game !== "daily" || playMode !== "daily" || tour) return;
    try { if (localStorage.getItem(TOUR_KEY)) return; localStorage.setItem(TOUR_KEY, "1"); } catch (e) { return; }
    const times = gridTimes();
    const each = state.rounds.map((r, i) => `Grid ${i + 1}: <b>${r.guesses.length}</b> ${r.guesses.length === 1 ? "guess" : "guesses"}${times[i] != null ? ` in <b>${formatTime(times[i])}</b>` : ""}`).join("<br>");
    tour = { i: 0, steps: [
      { target: ".dp-score", text: `You solved all three grids! This is your <b>total number of guesses</b> across them, and <b>how long you took</b>.` },
      { target: ".dp-grid-scores", text: `Here's each grid:<br>${each}` },
      { target: ".dp-panes", text: "Down here are your stats over time: days played, your streak, averages, and more under <b>Details</b>." },
      { target: "#dpBrag", text: "Share your result with friends: it sends your score, not the words." },
      { target: "#dpSettingsBtn", tap: true, text: "And this gear up here is <b>Settings</b>. Tap it" },
      { target: "#dpSettings .dp-setting-group:nth-of-type(1)", settings: true, text: "<b>Look</b>: dark or light." },
      { target: "#dpSettings .dp-setting-group:nth-of-type(2)", settings: true, text: "<b>Colors</b>: switch on color-blind colors if green and yellow are hard to tell apart." },
      { target: "#dpSettings .dp-setting-group:nth-of-type(3)", settings: true, text: "<b>Feedback box</b>: under the grid, or in the middle of it." },
      { target: "#dpSettings .dp-setting-group:nth-of-type(4)", settings: true, leave: true, text: "<b>How to guess</b>: one tap always crosses a word out. Instead of tapping twice to pick, you can <b>drag</b> a word to the box, or <b>hold</b> it. Try it next time!" },
      { text: "I hope you had fun. Come back tomorrow for the next Unstruck!" }
    ] };
    setTimeout(tourShow, 500);
  }

  function tourEl(id, cls) {
    let el = $(id);
    if (!el) { el = document.createElement("div"); el.id = id; el.className = cls; $("dailyPickScreen").appendChild(el); }
    return el;
  }

  function tourShow() {
    if (!tour) return;
    const st = tour.steps[tour.i];
    document.querySelectorAll(".dp-coach-focus").forEach(el => el.classList.remove("dp-coach-focus"));
    const dim = tourEl("dpTourDim", "dp-coach-dim");
    const say = tourEl("dpTourSay", "dp-coach-say");
    const hand = tourEl("dpTourHand", "dp-coach-hand");
    hand.innerHTML = HAND_HTML;
    dim.hidden = false;
    const last = tour.i === tour.steps.length - 1;
    say.innerHTML = `${st.text}${st.tap ? "" : `<small>${last ? "Tap to finish" : "Tap anywhere to continue"}</small>`}${last ? "" : `<button type="button" class="dp-coach-skip" id="dpTourSkip">Skip</button>`}`;
    const target = st.target ? document.querySelector(st.target) : null;
    if (target) {
      if (!st.tap) target.scrollIntoView({ block: "center", behavior: "instant" });
      target.classList.add("dp-coach-focus");
      const b = target.getBoundingClientRect();
      say.classList.toggle("is-low", b.top + b.height / 2 < innerHeight * 0.45);
      hand.hidden = !st.tap;
      if (st.tap) { hand.style.left = `${b.left + b.width / 2}px`; hand.style.top = `${b.top + b.height * 0.65}px`; }
    } else {
      hand.hidden = true;
      say.classList.add("is-low");
    }
    if (st.settings) say.classList.add("is-low");
  }

  function tourNext() {
    if (!tour) return;
    const st = tour.steps[tour.i];
    if (st.tap) return; // waits for the tap on Settings
    if (st.leave) {
      // leave Settings, back to the results for the goodbye
      document.querySelectorAll(".dp-coach-focus").forEach(el => el.classList.remove("dp-coach-focus"));
      closeSettings();
    }
    tour.i++;
    if (tour.i >= tour.steps.length) return tourEnd();
    tourShow();
  }
  function tourAfterSettings() {
    if (!tour || !tour.steps[tour.i].tap) { openSettings(); return; }
    document.querySelectorAll(".dp-coach-focus").forEach(el => el.classList.remove("dp-coach-focus"));
    openSettings();
    tour.i++;
    requestAnimationFrame(tourShow);
  }
  function tourEnd() {
    tour = null;
    ["dpTourDim", "dpTourSay", "dpTourHand"].forEach(id => $(id)?.remove());
    document.querySelectorAll(".dp-coach-focus").forEach(el => el.classList.remove("dp-coach-focus"));
    if (settingsOpen()) closeSettings();
  }

  function renderSummary(root) {
    $("dailyPickScreen")?.classList.add("is-results");
    if (playMode === "practice") return renderPracticeSummary(root);
    if (game === "speed") return renderSpeedSummary(root);
    if (game === "archive") return renderArchiveSummary(root);
    recordDay();
    setTitle(0);
    const stats = computeStats();
    const stat = (value, label) => `<div class="dp-stat"><b>${value}</b><span>${label}</span></div>`;
    const diff = totalGuesses() - G().par;
    const gridName = gridLabel;
    // Today's guesses lead: the total, big, then each grid as its own card.
    const grids = state.rounds.map((r, i) => {
      const n = r.guesses.length;
      const t = gridTimes()[i];
      const time = t != null ? `<span class="dp-grid-time">${CLOCK_ICON}${formatTime(t)}</span>` : "";
      if (r.lost) return `<div class="dp-grid-score is-lost"><span class="dp-grid-name">${gridName(i)}</span>
        <b>✗</b><span class="dp-grid-unit">lost (+${LOST_SCORE})</span>${time}</div>`;
      return `<div class="dp-grid-score"><span class="dp-grid-name">${gridName(i)}</span>
        <b>${n}</b><span class="dp-grid-unit">${n === 1 && !ELIM_KINDS.includes(puzzles[i].kind) ? "Hole in one!" : n === 1 ? "guess" : "guesses"}</span>${time}</div>`;
    }).join("");
    // The score and Share come first, so sharing never needs a scroll.
    root.innerHTML = `<div class="dp-summary">
      <div class="dp-score">
        <div class="dp-score-main">
          <div><div class="dp-score-num">${totalGuesses()}</div><div class="dp-score-label">${G().scoreLabel}</div></div>
          <div><div class="dp-score-num dp-score-time">${formatTime(elapsed())}</div><div class="dp-score-label">time</div></div>
        </div>
        <div class="dp-score-verdict ${diff <= 0 ? "is-good" : "is-over"}">${golfTerm(diff)} <span>${diff === 0 ? `(even with par ${G().par})` : `(${relToPar(diff)} vs par ${G().par})`}</span></div>
      </div>
      <div class="dp-grid-scores">${grids}</div>
      <div class="dp-brag-row"><button type="button" class="dp-next dp-brag" id="dpBrag">${SHARE_LABEL}</button>${game === "daily" && pastDays().length ? `<button type="button" class="dp-next dp-side-btn" id="dpPast" data-past>Past games</button>` : ""}${game === "daily" && EXPERIMENTAL_BUTTON && (WEEKLY_ENABLED || SPEED_ENABLED) ? `<button type="button" class="dp-next dp-side-btn" id="dpExperimental">Experimental</button>` : ""}</div>
      <div class="dp-views" role="tablist">
        <button type="button" class="dp-view${summaryView === "overall" ? " is-on" : ""}" data-view="overall" role="tab">Overall</button>
        <button type="button" class="dp-view${summaryView === "details" ? " is-on" : ""}" data-view="details" role="tab">Details</button>
        ${boardOn() && game === "daily" ? `<button type="button" class="dp-view${summaryView === "board" ? " is-on" : ""}" data-view="board" role="tab">Leaderboard</button>` : ""}
      </div>
      <div class="dp-panes">
      <div class="dp-pane" data-pane="details"${summaryView === "details" ? "" : " aria-hidden=\"true\""}>${detailsTable()}</div>
      ${boardOn() && game === "daily" ? `<div class="dp-pane dp-pane-board" data-pane="board"${summaryView === "board" ? "" : " aria-hidden=\"true\""}></div>` : ""}
      <div class="dp-pane" data-pane="overall"${summaryView === "overall" ? "" : " aria-hidden=\"true\""}><div class="dp-stats${stats.best > stats.current ? "" : " is-four"}">
        ${stat(stats.played, "Played")}
        ${stat(stats.current, "Streak")}
        ${stats.best > stats.current ? stat(stats.best, "Best streak") : ""}
        ${stat(stats.average ? stats.average.toFixed(1) : "–", "Average")}
        ${stat(stats.bestScore || "–", "Best score")}
      </div>
      ${distributionChart(diff)}</div>
      </div>
      <div class="dp-countdown">${G().nextLabel} <b id="dpCountdown">${formatCountdown(G().next())}</b></div>
      ${game === "daily" ? "" : `<button type="button" class="dp-link" data-game="daily">Play today's Daily →</button>`}
      <div class="dp-copyright">&copy; 2026 Unstruck. All rights reserved.</div></div>`;
    clearInterval(countdownTimer);
    countdownTimer = setInterval(tickCountdown, 1000);
    if (game === "daily") maybeStartTour();
    // Finished before the leaderboard existed (or offline then): send it now.
    if (game === "daily" && playMode === "daily") boardSubmit();
    if (summaryView === "board" && document.querySelector('#dailyPickRoot [data-pane="board"]')) { boardRender(); boardLoad(); }
  }

  // Speed's results: how many grids, then each grid as a square.
  function recordSpeed() {
    const history = loadHistory();
    if (history[state.date]) return;
    history[state.date] = { score: solvedCount(), guesses: totalGuesses(), left: Math.round(speedLeft()), grids: state.rounds.map(r => (r.solved ? r.guesses.length : null)) };
    track("finished", `${solvedCount()} grids`);
    try { localStorage.setItem(G().historyKey, JSON.stringify(history)); } catch (e) { /* private mode */ }
  }

  function renderSpeedSummary(root) {
    recordSpeed();
    setTitle(0);
    const solved = solvedCount();
    const stats = computeStats();
    const days = Object.values(loadHistory());
    const best = days.length ? Math.max(...days.map(d => d.score)) : 0;
    const stat = (value, label) => `<div class="dp-stat"><b>${value}</b><span>${label}</span></div>`;
    const verdict = solved === SPEED_GRIDS ? `All ${SPEED_GRIDS}! <span>(${formatTime(speedLeft())} to spare)</span>` : `Time's up! <span>(${solved} of ${SPEED_GRIDS} grids)</span>`;
    const cells = state.rounds.map((r, i) => `<span class="dp-speed-cell${r.solved ? " is-solved" : ""}">${r.solved ? r.guesses.length : ""}<small>${i + 1}</small></span>`).join("");
    root.innerHTML = `<div class="dp-summary">
      <div class="dp-score">
        <div class="dp-score-main">
          <div><div class="dp-score-num">${solved}</div><div class="dp-score-label">grids solved</div></div>
          <div><div class="dp-score-num dp-score-time">${totalGuesses()}</div><div class="dp-score-label">guesses</div></div>
        </div>
        <div class="dp-score-verdict ${solved === SPEED_GRIDS ? "is-good" : "is-over"}">${verdict}</div>
      </div>
      <div class="dp-speed-cells">${cells}</div>
      <div class="dp-speed-note">The number in each solved grid is how many guesses it took.</div>
      <div class="dp-brag-row"><button type="button" class="dp-next dp-brag" id="dpBrag">${SHARE_LABEL}</button></div>
      <div class="dp-stats is-four">
        ${stat(stats.played, "Played")}
        ${stat(stats.current, "Streak")}
        ${stat(best, "Best")}
        ${stat(stats.average ? stats.average.toFixed(1) : "–", "Average")}
      </div>
      <div class="dp-countdown">${G().nextLabel} <b id="dpCountdown">${formatCountdown(G().next())}</b></div>
      <button type="button" class="dp-link" data-game="daily">Back to today's Daily →</button>
      <div class="dp-copyright">&copy; 2026 Unstruck. All rights reserved.</div></div>`;
    clearInterval(countdownTimer);
    countdownTimer = setInterval(tickCountdown, 1000);
  }

  // Counts down on the scorecard; at midnight Eastern the new day loads.
  function tickCountdown() {
    const label = $("dpCountdown");
    if (!label || !$("dailyPickScreen")?.classList.contains("active")) {
      clearInterval(countdownTimer);
      return;
    }
    if (playMode === "daily" && state.date !== G().period()) {
      // The new day opens on its start screen: its clock waits for Play,
      // not midnight (a tab left open overnight used to start it then).
      clearInterval(countdownTimer);
      splashDone = false;
      open();
      return;
    }
    label.textContent = formatCountdown(G().next());
  }

  function render() {
    const root = $("dailyPickRoot");
    if (!root) return;
    showClock();
    if ((over() || (playMode === "practice" && state.coachDone)) && !advanceTimer) return renderSummary(root);
    $("dailyPickScreen")?.classList.remove("is-results");
    clearInterval(countdownTimer);
    setTitle(current + 1);
    const puzzle = puzzles[current];
    const { answer: secret, words, mode, kind } = puzzle;
    const pics = PIC_KINDS.includes(kind);
    const paints = kind === "colors";
    const arrows = kind === "arrows" || mode === "arrows";
    const oneLetter = kind === "oneletter" || mode === "oneletter";
    const elim = ELIM_KINDS.includes(kind);
    const info = pics ? catalog[kind] : null;
    const r = round();
    const lastGuess = r.guesses[r.guesses.length - 1];
    const done = r.solved;
    // What's compared: a word's letters, or a picture's color cells.
    const code = id => (pics ? itemOf(kind, id).cells : id);
    const name = id => labelOf(puzzle, id);
    // What a guess reveals under this grid's rule, letter (or cell) by letter.
    const compare = (g, a) => (pics ? colorFeedback(g, a) : paints ? paintFeedback(g, a) : arrows ? arrowFeedback(g, a) : feedback(g, a));
    // One letter: each guess only shows the letter in turn (1st guess letter
    // 1, 2nd letter 2, ... 6th letter 1 again); the rest stay hidden.
    const shownResult = guess => compare(code(guess), code(secret)).map((f, i) => (
      oneLetter && guess !== secret && i !== r.guesses.indexOf(guess) % 5 ? "hidden"
        : mode === "split" && guess !== secret && f !== "absent" ? "in" : f));
    if (elim && !done) ensureOffer();
    const counts = guess => {
      const result = compare(code(guess), code(secret));
      return [result.filter(f => f === "correct").length, result.filter(f => f === "present").length];
    };
    // A guessed word carries its own feedback in miniature, so all the
    // evidence stays on the board.
    const mini = guess => {
      if (pics) return `<span class="dp-mini dp-mini-grid" style="--cols:${info.cols}">${shownResult(guess).map(f => `<i class="is-${f}"></i>`).join("")}</span>`;
      if (arrows) return `<span class="dp-mini dp-mini-arrows">${shownResult(guess).map(f => `<i class="is-${f}">${ARROWS[f]}</i>`).join("")}</span>`;
      if (mode === "counts") {
        const [g, y] = counts(guess);
        return `<span class="dp-mini"><i class="is-correct is-count">${g}</i><i class="is-present is-count">${y}</i></span>`;
      }
      return `<span class="dp-mini">${shownResult(guess).map(f => `<i class="is-${f}"></i>`).join("")}</span>`;
    };
    // One letter: the letter the next guess will show, marked on every card.
    const nextPos = r.guesses.length % 5;
    const face = id => (pics
      ? `<img class="dp-pic" src="${MEDIA_URL}${itemOf(kind, id).img}" alt="" draggable="false"><span class="dp-pic-name">${name(id)}</span>`
      : paints ? paintRow(id) : `<span class="dp-card-word">${oneLetter && !done ? [...id].map((ch, i) => (i === nextPos ? `<b class="dp-next-letter">${ch}</b>` : ch)).join("") : id}</span>`);
    // A guessed word shows its feedback right on its card: the letters in
    // their colors (or, on grid 3, the word and its two counts).
    const wordCards = !pics && !paints;
    const cardFeedback = guess => {
      if (mode === "counts") {
        const [g, y] = counts(guess);
        return `<span class="dp-card-word">${guess}</span><span class="dp-card-counts"><i class="is-correct">${g}</i><i class="is-present">${y}</i></span>`;
      }
      return `<span class="dp-card-fb">${shownResult(guess).map((f, i) => `<i class="is-${f}">${guess[i]}${arrows ? `<small>${ARROWS[f]}</small>` : ""}</i>`).join("")}</span>`;
    };

    // Where each card goes: a 4 x 5 board with the middle two spots of the
    // third row kept for guessing. 18 words fill every other spot; 16 words
    // leave the third row's ends empty.
    const full = words.length >= 18;
    // "bottom": the 4 x 4 grid, with the spot as a fifth row underneath.
    const bottom = settings.layout === "bottom" && !full;
    const boardRows = full ? 5 : Math.ceil(words.length / 4) + 1;
    const spotRow = bottom ? boardRows - 1 : Math.ceil((boardRows - 1) / 2);
    const spots = [];
    for (let r = 0; r < boardRows; r++) for (let c = 0; c < 4; c++) {
      if (r === spotRow && (c === 1 || c === 2)) continue;
      if (r === spotRow && !full) continue;
      spots.push([r, c]);
    }
    const buttons = words.map((word, wi) => {
      const [gr, gc] = spots[wi] || [0, 0];
      // (No sliding: straight rows and columns are easiest to scan.)
      const slide = 0;
      const struck = r.struck.includes(word);
      const guessed = r.guesses.includes(word);
      // Words already guessed stay struck for good, so they can't be tapped.
      const disabled = done || guessed;
      const won = done && word === secret && !r.lost;
      const offered = kind === "choice" && !done && (r.offer || []).includes(word);
      const snap = toggled && toggled.word === word ? ` just-${toggled.kind}` : "";
      const fresh = revealing && word === lastGuess ? " just-guessed" : "";
      const classes = `dp-word${won ? " is-solved" : struck ? " is-struck" : ""}${guessed && !won ? " is-guessed" : ""}${word === selected ? " is-selected" : ""}${offered ? " is-offered" : ""}${done && r.lost && word === secret ? " is-lost-secret" : ""}${snap}${fresh}`;
      const shown = guessed && !won ? (wordCards ? cardFeedback(word) : face(word) + mini(word)) : face(word);
      // Tapping a card crosses the word out (or brings it back); dragging it
      // into the middle spot guesses it.
      const xStrip = settings.input === "xbtn" && !elim && !disabled ? `<span class="dp-xbtn" aria-hidden="true">${struck ? "↺" : "✕"}</span>` : "";
      return `<div class="${classes}${disabled ? "" : " is-tappable"}${xStrip ? " has-xbtn" : ""}${slide > 0 ? " is-slid-down" : slide < 0 ? " is-slid-up" : ""}" data-word="${word}" data-slide="${slide}" style="grid-row:${gr + 1};grid-column:${gc + 1}"${disabled ? " disabled" : ""} role="button" tabindex="${disabled ? -1 : 0}" aria-label="${name(word)}: ${settings.input === "xbtn" && !elim ? (struck ? "crossed out: tap the left side to bring it back" : "tap the left side to cross it out, the word to pick it") : settings.input === "tap" && !elim ? (word === selected ? "picked, tap to clear" : struck ? "crossed out, tap to pick" : "tap to cross out") : `tap to ${struck ? "bring it back" : "cross it out"}${elim ? "" : ", or drag it to the guessing spot"}`}">${xStrip}<span class="dp-card-face">${shown}</span></div>`;
    }).join("");

    const SPLIT_TILE = SPLIT_FILL;
    const swatch = (color, label, round) =>
      `<span><i class="${round ? "is-round" : ""}" style="background:${color}"></i>${label}</span>`;
    const key = oneLetter
      ? swatch("var(--dp-hit)", "Right spot") + swatch("var(--dp-near)", "Wrong spot") + swatch("#555b63", "Not in word")
      : paints
      ? swatch("var(--dp-hit)", "Shares a color, this spot") + swatch("var(--dp-near)", "Another spot") + swatch("#555b63", "Not in it")
      : arrows
      ? `<span><b>←</b> earlier (A side)</span><span><b>→</b> later (Z side)</span><span><b>–</b> right letter</span>`
      : pics
      ? swatch("var(--dp-hit)", "Same color, same spot") + swatch("var(--dp-near)", "Color is elsewhere") + swatch("#555b63", "Color not in it")
      : {
        full: swatch("var(--dp-hit)", "Right spot") + swatch("var(--dp-near)", "Wrong spot") + swatch("#555b63", "Not in word"),
        split: swatch(SPLIT_TILE, "In the word (any spot)") + swatch("#555b63", "Not in word"),
        counts: swatch("var(--dp-hit)", "Count in right spot", true) + swatch("var(--dp-near)", "Count in wrong spot", true)
      }[mode];

    // The latest guess, large. Right after a guess its tiles flip in one by
    // one (--i staggers them), and hop if it was the secret.
    const tiles = guess => {
      const rowClass = `dp-row${revealing ? " is-revealing" : ""}${revealing && guess === secret ? " is-win" : ""}`;
      if (pics) {
        // The picture beside its color feedback, cell by cell. Cells flip
        // in diagonally, so the reveal stays quick on a bigger grid.
        const cells = shownResult(guess).map((f, i) => `<span class="dp-cell is-${f}" style="--i:${(i % info.cols) + Math.floor(i / info.cols)}"></span>`).join("");
        return `<div class="${rowClass} dp-pic-row">
          <span class="dp-pic-guess"><img src="${MEDIA_URL}${itemOf(kind, guess).img}" alt="" style="aspect-ratio:${info.ratio}"><small>${name(guess)}</small></span>
          <span class="dp-arrow">→</span>
          <span class="dp-fb-grid" style="--cols:${info.cols};aspect-ratio:${info.ratio}">${cells}</span></div>`;
      }
      if (paints) {
        return `<div class="${rowClass}">${shownResult(guess).map((f, i) =>
          `<span class="dp-tile dp-paint-tile" style="--i:${i}"><i style="background:${PAINTS[guess[i]].hex}"></i><b class="is-${f}"></b></span>`).join("")}</div>`;
      }
      if (arrows) {
        return `<div class="${rowClass}">${shownResult(guess).map((f, i) =>
          `<span class="dp-tile dp-arrow-tile is-${f}" style="--i:${i}">${guess[i]}<small>${ARROWS[f]}</small></span>`).join("")}</div>`;
      }
      if (mode === "counts" && guess !== secret) {
        const [g, y] = counts(guess);
        return `<div class="${rowClass}"><span class="dp-plain-word" style="--i:0">${guess}</span>
          <span class="dp-tile is-correct dp-count-tile" style="--i:3">${g}</span>
          <span class="dp-tile is-present dp-count-tile" style="--i:4">${y}</span></div>`;
      }
      return `<div class="${rowClass}">${shownResult(guess).map((f, i) =>
        `<span class="dp-tile is-${f}" style="--i:${i}">${guess[i]}</span>`).join("")}</div>`;
    };

    // The panel holds the same rows (tiles, hint, action) so the screen
    // doesn't shift as the game moves along.
    // Pictures show nothing until the first guess (an empty color grid
    // just looks like a broken image).
    let hint;
    let action = "";
    if (done && r.lost) {
      hint = `<strong class="dp-result is-lost${revealing ? " is-new" : ""}">You struck out the secret, ${secret.toUpperCase()}.</strong> ${allSolved() ? "" : "Next grid…"}`;
    } else if (done && elim && !r.guesses.includes(secret)) {
      hint = `<strong class="dp-result${revealing ? " is-new" : ""}">Only the secret was left: solved in ${r.guesses.length}!</strong> ${allSolved() ? "" : "Next grid…"}`;
    } else if (done) {
      hint = `<strong class="dp-result${revealing ? " is-new" : ""}">Solved in ${r.guesses.length}!</strong> ${allSolved() ? "" : "Next grid…"}`;
    } else if (elim) {
      hint = kind === "auto" ? "Strike out the words you've ruled out" : "Pick one to guess, strike out the rest you've ruled out";
      if (kind === "choice") action = `<div class="dp-pick-two">${(r.offer || []).map(w => `<button type="button" class="dp-next dp-pick" data-pick="${w}">${w.toUpperCase()}</button>`).join("")}</div>`;
    } else {
      const ord = ["1st", "2nd", "3rd", "4th", "5th"][nextPos];
      hint = oneLetter ? `<span class="dp-pos-hint">Next guess shows the <b>${ord} letter</b> <span class="dp-pos">${[0, 1, 2, 3, 4].map(i => `<i class="${i === nextPos ? "is-on" : ""}"></i>`).join("")}</span></span>` : "";
    }

    const exit = playMode === "practice" ? `<button type="button" class="dp-link" data-practice="end">← Back to today's Unstruck</button>`
      : game === "archive" ? (ARCHIVE ? `<button type="button" class="dp-link" data-archive-list>← Back to the archive</button>` : `<button type="button" class="dp-link" data-game="daily">← Back to today's Unstruck</button>`)
      : game !== "daily" ? `<button type="button" class="dp-link" data-game="daily">← Back to the Daily</button>` : "";
    // The middle spot. Word grids show the latest guess there, big; before
    // the first guess it says what to do, and that goes as a word is dragged in.
    const xMode = settings.input === "xbtn" && !elim;
    // Tap and ✕-button modes both pick a word, then press Guess.
    const tapping = (settings.input === "tap" || xMode) && !elim;
    const dropText = elim ? "<b>Tap</b> to cross out"
      : xMode ? "<b>Tap ✕</b> to cross a word out<br><b>Tap the word</b> to pick it, then press <b>Guess</b>"
      : tapping ? (r.guesses.length || settings.firstPick !== "single" ? "<b>Tap</b> once to cross out, <b>twice</b> to pick<br>then press <b>Guess</b>" : "<b>Tap</b> a word to pick your first guess,<br>then press <b>Guess</b>")
        : settings.input === "hold" ? "<b>Tap</b> to cross out<br><b>Hold</b> a word to guess it"
        : "<b>Tap</b> to cross out<br><b>Drag</b> here to guess";
    // Tapping: the Guess button always sits beside the legend under the
    // grid (grayed out until a word is picked), so nothing moves.
    const guessButton = "";
    const pickName = !selected ? "" : pics ? name(selected) : paints ? paintRow(selected, "dp-paints dp-paints-inline") : selected.toUpperCase();
    const sideGuess = tapping && !done
      ? `<button type="button" class="dp-next dp-side-guess" id="dpGuess"${selected ? "" : " disabled"}>Guess</button>` : "";
    const inMiddle = guessButton || (lastGuess && wordCards ? tiles(lastGuess).replace('class="dp-row', 'class="dp-row dp-drop-row') : `<span class="dp-drop-text">${dropText}</span>`);
    // With 16 words the third row is free, so the spot takes all of it.
    const middle = `<div class="dp-drop${lastGuess && wordCards && !guessButton ? " has-guess" : ""}${guessButton ? " has-button" : ""}${full ? "" : " is-wide"}${bottom ? " is-bottom" : ""}" id="dpDrop" style="grid-row:${spotRow + 1};grid-column:${full ? "2 / 4" : "1 / 5"}">${inMiddle}</div>`;
    // Autopilot's countdown to its next guess: big, red, see-through, behind play.
    const autoCount = kind === "auto" && !done ? `<div class="dp-auto-count" id="dpAutoCount" aria-hidden="true">${Math.max(1, Math.ceil(((r.autoDue ?? elapsed()) - elapsed()) / 1000)) || ""}</div>` : "";
    requestAnimationFrame(fitWords);
    if (coach) requestAnimationFrame(coachShow);
    root.innerHTML = `<div class="dp-board is-diamond${full ? " is-full" : ""}${boardRows === 4 ? " is-rows4" : ""}${pics ? ` is-pics is-${kind}` : kind ? ` is-${kind}` : ""}" style="${pics ? `--ratio:${info.ratio}` : ""}">${buttons}${middle}${autoCount}</div>
      <div class="dp-center">${lastGuess && !wordCards ? `<div class="dp-last">Last guess</div>${tiles(lastGuess)}` : ""}${tapping ? `<div class="dp-key-row"><div class="dp-key is-stacked">${key}</div>${sideGuess || `<button type="button" class="dp-next dp-side-guess" disabled>Guess</button>`}</div>` : `<div class="dp-key">${key}</div>`}${hint || action ? `<div class="dp-hint">${hint}</div>${action}` : ""}</div>${exit}`;
  }

  // ---- Tap to cross out, drag to the middle to guess ------------------------
  // A card's resting spot on screen: offsets ignore the flip and bounce
  // animations, and a slid card (16-word diamond) moves half a card plus
  // half the gap.
  function cardSpot(el) {
    const board = el.offsetParent.getBoundingClientRect();
    const gap = parseFloat(getComputedStyle(el.offsetParent).rowGap) || 0;
    const slide = +el.dataset.slide || 0;
    return {
      left: board.left + el.offsetParent.clientLeft + el.offsetLeft,
      top: board.top + el.offsetParent.clientTop + el.offsetTop + slide * (el.offsetHeight + gap) / 2,
      w: el.offsetWidth, h: el.offsetHeight
    };
  }
  // The card under a point, found by position rather than by what's drawn
  // there (a card mid-flip doesn't cover its spot exactly).
  function cardAt(x, y) {
    return [...document.querySelectorAll("#dailyPickRoot .dp-word:not([disabled])")].find(el => {
      const b = cardSpot(el);
      return x >= b.left && x <= b.left + b.w && y >= b.top && y <= b.top + b.h;
    }) || null;
  }
  const overDrop = (x, y) => {
    const b = $("dpDrop")?.getBoundingClientRect();
    return !!b && x >= b.left - 6 && x <= b.right + 6 && y >= b.top - 6 && y <= b.bottom + 6;
  };

  // Hold mode: how long before the ring shows (a shorter press is a tap),
  // and how long it takes to fill.
  const HOLD_DELAY = 160;
  const HOLD_FILL = 700;

  function initDrag() {
    const root = $("dailyPickRoot");
    let drag = null;
    const end = () => {
      if (!drag) return;
      clearTimeout(drag.holdStart);
      clearTimeout(drag.holdDone);
      drag.ring?.remove();
      drag.dim?.remove();
      drag.card.classList.remove("is-holding");
      drag.ghost?.remove();
      drag.card.classList.remove("is-dragging");
      $("dpDrop")?.classList.remove("is-over", "is-target");
      document.body.classList.remove("dp-dragging");
      drag = null;
    };
    root.addEventListener("pointerdown", event => {
      if (event.button > 0 || !event.target.closest?.(".dp-board") || event.target.closest?.("#dpGuess")) return;
      const card = cardAt(event.clientX, event.clientY);
      if (!card || round().solved) return;
      drag = { card, word: card.dataset.word, x: event.clientX, y: event.clientY, moved: false, ghost: null, id: event.pointerId };
      root.setPointerCapture?.(event.pointerId);
      // Hold mode: after a moment a ring appears above the word and fills;
      // when it's full, the word is guessed.
      if (settings.input === "hold" && !ELIM_KINDS.includes(puzzles[current]?.kind)) {
        const d = drag;
        d.hold = true;
        d.holdStart = setTimeout(() => {
          if (drag !== d) return;
          const b = cardSpot(d.card);
          // A bubble above the finger: the word (the finger hides the card)
          // and the ring filling beside it. The rest of the screen dims.
          const dim = document.createElement("div");
          dim.className = "dp-hold-dim";
          $("dailyPickScreen").appendChild(dim);
          const ring = document.createElement("div");
          ring.className = "dp-hold-ring";
          ring.style.setProperty("--fill", `${HOLD_FILL}ms`);
          ring.innerHTML = `<span class="dp-hold-word">${d.word.toUpperCase()}</span><svg viewBox="0 0 36 36" aria-hidden="true"><circle class="dp-hold-track" cx="18" cy="18" r="15"/><circle class="dp-hold-fill" cx="18" cy="18" r="15"/></svg>`;
          $("dailyPickScreen").appendChild(ring);
          // Centered over the card, kept on screen.
          const half = ring.offsetWidth / 2;
          ring.style.left = `${Math.min(Math.max(b.left + b.w / 2, half + 8), innerWidth - half - 8)}px`;
          ring.style.top = `${b.top - 10}px`;
          d.ring = ring;
          d.dim = dim;
          d.card.classList.add("is-holding");
          d.holdDone = setTimeout(() => {
            if (drag !== d) return;
            d.completed = true;
            const word = d.word;
            end();
            navigator.vibrate?.(15);
            if (!round().solved && !round().guesses.includes(word)) { selected = word; guessSelected(); }
          }, HOLD_FILL);
        }, HOLD_DELAY);
      }
    });
    root.addEventListener("pointermove", event => {
      if (!drag || event.pointerId !== drag.id) return;
      if (drag.hold) {
        // Sliding off cancels the hold (nothing happens on release).
        if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 14) { drag.canceled = true; clearTimeout(drag.holdStart); clearTimeout(drag.holdDone); drag.ring?.remove(); drag.ring = null; drag.dim?.remove(); drag.dim = null; drag.card.classList.remove("is-holding"); }
        return;
      }
      if (!drag.moved) {
        if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 9) return;
        // Words in an elimination grid can't be guessed by hand, and in
        // tap mode nothing is dragged.
        if (ELIM_KINDS.includes(puzzles[current]?.kind) || settings.input === "tap" || settings.input === "xbtn") return;
        drag.moved = true;
        const b = drag.card.getBoundingClientRect();
        const ghost = drag.card.cloneNode(true);
        ghost.classList.add("dp-ghost");
        ghost.classList.remove("is-struck", "just-struck", "just-freed", "is-flap", "is-slid-down", "is-slid-up");
        ghost.removeAttribute("style");
        ghost.style.width = `${b.width}px`;
        ghost.style.height = `${b.height}px`;
        $("dailyPickScreen").appendChild(ghost);
        drag.ghost = ghost;
        drag.card.classList.add("is-dragging");
        document.body.classList.add("dp-dragging");
        // Light the spot up right away, so it's clear where the word goes.
        $("dpDrop")?.classList.add("is-target");
      }
      drag.ghost.style.left = `${event.clientX}px`;
      drag.ghost.style.top = `${event.clientY}px`;
      $("dpDrop")?.classList.toggle("is-over", overDrop(event.clientX, event.clientY));
    });
    const finish = event => {
      if (!drag || event.pointerId !== drag.id) return;
      const { word, moved } = drag;
      const drag0 = drag.card;
      if (drag.hold) {
        // A quick tap crosses out; a hold let go early (or slid off) does nothing.
        const tapped = !drag.ring && !drag.canceled && !drag.completed;
        end();
        if (tapped) onWordClick(word, "strike");
        return;
      }
      const dropped = moved && overDrop(event.clientX, event.clientY);
      end();
      if (!moved) {
        if (settings.input === "xbtn" && !ELIM_KINDS.includes(puzzles[current]?.kind)) {
          // The ✕ strip's tap area is generous: the left 40% of the card.
          const b = cardSpot(drag0);
          return onWordClick(word, event.clientX - b.left < b.w * 0.4 ? "strike" : "pick");
        }
        return onWordClick(word, settings.input === "tap" ? "cycle" : "strike");
      }
      if (dropped && !round().solved && !round().guesses.includes(word)) {
        selected = word;
        guessSelected();
      }
    };
    root.addEventListener("pointerup", finish);
    root.addEventListener("pointercancel", end);
    // No long-press menu on the cards (hold mode).
    root.addEventListener("contextmenu", event => { if (event.target.closest?.(".dp-board")) event.preventDefault(); });
  }

  // Words are as big as their card allows: a wide one (MOMMY, on a small
  // phone) steps down a size or two until it fits.
  function fitWords() {
    // Grid 3's middle: a wide word steps down until it and its counts fit.
    const row = document.querySelector("#dpDrop .dp-drop-row");
    const word = row?.querySelector(".dp-plain-word");
    if (word) {
      word.style.removeProperty("font-size");
      let size = parseFloat(getComputedStyle(word).fontSize);
      while (row.scrollWidth > row.clientWidth + 1 && size > 12) {
        size -= 1;
        word.style.setProperty("font-size", `${size}px`);
      }
    }
    // One size for every word on the board: the largest at which all of
    // them fit their cards (a wide word sets it for the rest).
    const words = [...document.querySelectorAll("#dailyPickRoot .dp-card-word")];
    words.forEach(el => el.style.removeProperty("font-size"));
    if (!words.length) return;
    let size = Math.min(...words.map(el => parseFloat(getComputedStyle(el).fontSize)));
    // Measured on each card's real word, not what's drawn (letters spin
    // while a new grid flips in).
    const ctx = (fitWords.canvas ||= document.createElement("canvas")).getContext("2d");
    const tooWide = () => words.some(el => {
      const cs = getComputedStyle(el);
      ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      const text = (el.closest(".dp-word")?.dataset.word || el.textContent).toUpperCase();
      const width = ctx.measureText(text).width + (parseFloat(cs.letterSpacing) || 0) * text.length;
      // The room is the card face's width (less its padding), not the word's own box.
      const face = el.parentElement, fs = getComputedStyle(face);
      return width > face.clientWidth - parseFloat(fs.paddingLeft) - parseFloat(fs.paddingRight) - 2;
    });
    words.forEach(el => el.style.setProperty("font-size", `${size}px`, "important"));
    while (tooWide() && size > 11) {
      size -= 0.5;
      words.forEach(el => el.style.setProperty("font-size", `${size}px`, "important"));
    }
  }

  function onWordClick(word, act = "pick") {
    const r = round();
    if (r.solved || r.guesses.includes(word)) return;
    if (tip) tipHide();
    if (coach && !coachAllows(word)) return;
    if (ELIM_KINDS.includes(puzzles[current].kind)) {
      // No picking here: a tap strikes a word out, or brings it back.
      const at = r.struck.indexOf(word);
      if (at >= 0) { r.struck.splice(at, 1); toggled = { word, kind: "freed" }; }
      else { r.struck.push(word); toggled = { word, kind: "struck" }; navigator.vibrate?.(8); }
      const finished = elimCheck();
      save();
      revealing = finished;
      render();
      revealing = false;
      toggled = null;
      return;
    }
    const struckAt = r.struck.indexOf(word);
    if (act === "cycle") {
      // Tap mode. Before a grid's first guess a tap just picks (or unpicks);
      // after it, each tap moves a word along: crossed out, picked, cleared.
      if (!r.guesses.length && settings.firstPick === "single") {
        selected = selected === word ? "" : word;
        toggled = { word, kind: selected ? "selected" : "freed" };
      } else if (word === selected) {
        selected = "";
        toggled = { word, kind: "freed" };
      } else if (struckAt >= 0) {
        r.struck.splice(struckAt, 1);
        selected = word;
        toggled = { word, kind: "selected" };
      } else {
        r.struck.push(word);
        toggled = { word, kind: "struck" };
        navigator.vibrate?.(8);
      }
    } else if (act === "strike") {
      // ✕: cross it out, or bring it back (↺).
      if (struckAt >= 0) { r.struck.splice(struckAt, 1); toggled = { word, kind: "freed" }; }
      else {
        r.struck.push(word);
        if (selected === word) selected = "";
        toggled = { word, kind: "struck" };
        navigator.vibrate?.(8);
      }
    } else if (word === selected) {
      // ✓ again: unpick
      selected = "";
      toggled = { word, kind: "freed" };
    } else {
      // ✓: pick it (bringing it back if it was crossed out)
      if (struckAt >= 0) r.struck.splice(struckAt, 1);
      selected = word;
      toggled = { word, kind: "selected" };
    }
    save();
    render();
    toggled = null;
    if (coach) coachAfterTap(word);
  }

  function guessSelected() {
    const r = round();
    if (!selected || r.solved) return;
    if (!coachCanGuess()) return;
    coachBeforeGuess();
    const coachGuess = !!coach;
    if (playMode === "daily" && totalGuesses() === 0) track("started");
    r.guesses.push(selected);
    if (selected === puzzles[current].answer) {
      r.solved = true;
      // The clock when this grid was solved: its own time is the gap since
      // the grid before.
      r.solvedAt = Math.round(elapsed());
      if (allSolved()) stopClock();
      advanceTimer = setTimeout(nextPuzzle, game === "speed" ? SPEED_ADVANCE_MS : ADVANCE_MS);
    } else if (!r.struck.includes(selected)) {
      r.struck.push(selected);
    }
    selected = "";
    elimCheck();
    save();
    if (game === "speed") {
      // Two seconds off, shown on the clock.
      const clock = $("dpClock");
      clock?.classList.remove("is-penalty");
      void clock?.offsetWidth;
      clock?.classList.add("is-penalty");
      showClock();
      if (state.timeUp) return;
    }
    revealing = true;
    render();
    revealing = false;
    if (coachGuess) coachAfterGuess();
    if (tip) tipAfterGuess();
  }

  // One row per puzzle: a white square per wrong guess, then the green one.
  function shareText() {
    const link = ARCHIVE ? `${location.origin}/` : location.origin + location.pathname.replace(/index\.html$/, "");
    if (game === "speed") {
      const solved = solvedCount();
      const streak = computeStats().current;
      return [
        `${G().title} #${G().number(state.date)}`,
        solved === SPEED_GRIDS ? `${solved}/${SPEED_GRIDS} grids, ${formatTime(speedLeft())} to spare` : `${solved}/${SPEED_GRIDS} grids in 3:00`,
        state.rounds.map(r => (r.solved ? (settings.colorblind ? "🟧" : "🟩") : "⬜")).join(""),
        `Guesses: ${totalGuesses()}`,
        ...(streak >= 5 ? [`🔥 ${streak}-day streak`] : []),
        link
      ].join("\n");
    }
    const green = settings.colorblind ? "🟧" : "🟩";
    const rows = state.rounds.map((r, i) => `${gridLabel(i)}: ${r.lost ? `🟥 lost`
      // Won by elimination: every guess was a miss, then the secret was left.
      // (Unless the secret itself was picked, in Pick two's last two.)
      : ELIM_KINDS.includes(puzzles[i].kind) && !r.guesses.includes(puzzles[i].answer) ? `${"⬜".repeat(r.guesses.length)}${green} ${r.guesses.length}`
      : `${"⬜".repeat(r.guesses.length - 1)}${green} ${r.guesses.length}`}`);
    const diff = totalGuesses() - G().par;
    const verdict = `${golfTerm(diff)} (${totalGuesses()}; ${diff === 0 ? "even" : `${diff > 0 ? "+" : "-"}${Math.abs(diff)}`} par)`;
    const streak = computeStats().current;
    const unit = G().unit;
    return [
      `${G().title} #${G().number(state.date)}${game === "archive" ? " (from the archive)" : ""}`,
      ...rows,
      `Total: ${verdict}`,
      `Time: ${formatTime(elapsed())}`,
      // The streak only once it's worth bragging about.
      ...(streak >= 5 && game !== "archive" ? [`🔥 ${streak}-${unit} streak`] : []),
      // The Daily's link carries the score, so a friend's start screen can say
      // "A friend scored 8. Can you beat it?" (ref=share: counted apart).
      game === "daily" ? `${link}?ref=share&g=${totalGuesses()}&n=${G().number(state.date)}` : link
    ].join("\n");
  }

  // ---- Autopilot and Pick two -----------------------------------------------
  // The words the game may still guess: not struck out, not guessed, not the secret.
  const elimCandidates = () => {
    const { words, answer } = puzzles[current];
    const r = round();
    return words.filter(w => w !== answer && !r.struck.includes(w) && !r.guesses.includes(w));
  };

  // Nothing left to guess: solved if the secret is still in, lost if it was
  // struck out. Returns true when that just finished the grid.
  function elimCheck() {
    const r = round();
    if (r.solved || !ELIM_KINDS.includes(puzzles[current].kind) || elimCandidates().length) return false;
    r.solved = true;
    r.lost = r.struck.includes(puzzles[current].answer);
    r.solvedAt = Math.round(elapsed());
    selected = "";
    if (allSolved()) stopClock();
    advanceTimer = setTimeout(nextPuzzle, ADVANCE_MS);
    return true;
  }

  // Pick two's offer: two words the game may guess. It stays put until one
  // of them is guessed or struck out. Once four or fewer words are left (and
  // the secret isn't struck out), the secret can be one of the two.
  function ensureOffer() {
    const r = round();
    const { kind, answer } = puzzles[current];
    if (kind !== "choice") return;
    const left = elimCandidates();
    // Down to 4 words or fewer (the secret among them, not struck out), the
    // secret can be offered too.
    if (left.length <= 3 && !r.struck.includes(answer)) left.push(answer);
    const want = Math.min(2, left.length);
    const keep = (r.offer || []).filter(w => left.includes(w));
    if (keep.length === want && (r.offer || []).length === want) return;
    const pool = left.filter(w => !keep.includes(w));
    while (keep.length < want) keep.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    r.offer = keep;
    save();
  }

  // Autopilot, on every clock tick: counts down, and guesses when it's time.
  // The countdown follows the game clock, so it pauses whenever the clock does.
  function autoTick() {
    if (!SET_GAMES.includes(game) || playMode !== "daily" || !runningSince) return;
    const r = round();
    if (puzzles[current]?.kind !== "auto" || r.solved || advanceTimer) return;
    if (r.autoDue == null) r.autoDue = elapsed(); // the first guess comes straight away
    const left = r.autoDue - elapsed();
    if (left <= 0) return autoGuess();
    const count = $("dpAutoCount");
    const n = String(Math.ceil(left / 1000));
    if (count && count.textContent !== n) {
      count.textContent = n;
      count.classList.remove("is-tick");
      void count.offsetWidth;
      count.classList.add("is-tick");
    }
  }

  function autoGuess() {
    const r = round();
    const left = elimCandidates();
    if (!left.length) { if (elimCheck()) { save(); render(); } return; }
    r.autoDue = elapsed() + autoGap(r.guesses.length + 1);
    selected = left[Math.floor(Math.random() * left.length)];
    guessSelected();
  }

  // A small stylized clock (face, hands, a crown on top), drawn in the text color.
  const CLOCK_ICON = `<svg class="dp-clock-icon" viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" focusable="false"><circle cx="8" cy="9" r="5.6" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M8 6.2V9l1.9 1.3M6.6 1.6h2.8M8 1.6v1.8" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

  // The Share button's label: a share icon (box with an arrow) and the word.
  const SHARE_LABEL = `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><path d="M12 3v12M7.5 7.5 12 3l4.5 4.5M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>Share`;

  // The phone's own share sheet (WhatsApp, Messages, Instagram, ...) where
  // there is one; otherwise the result is copied for pasting anywhere.
  async function share(button) {
    track("shared");
    shareOut(shareText(), button, SHARE_LABEL);
  }

  // The phone's share sheet, else the clipboard; the button says which.
  async function shareOut(text, button, label) {
    if (navigator.share) {
      try {
        await navigator.share({ text });
        return;
      } catch (e) {
        if (e && e.name === "AbortError") return; // closed the share sheet
      }
    }
    const copied = await copyText(text);
    button.textContent = copied ? "Copied! Paste it anywhere" : "Couldn't copy";
    setTimeout(() => { button.innerHTML = label; }, 2500);
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      // Older browsers, or no clipboard permission: copy from a hidden field.
      const field = document.createElement("textarea");
      field.value = text;
      field.setAttribute("readonly", "");
      field.style.cssText = "position:fixed;opacity:0;top:0;left:0";
      document.body.appendChild(field);
      field.select();
      let ok = false;
      try { ok = document.execCommand("copy"); } catch (err) { ok = false; }
      field.remove();
      return ok;
    }
  }

  function nextPuzzle() {
    advanceTimer = null;
    tipClear();
    current = firstUnsolved();
    selected = "";
    render();
    if (over()) return;
    maybeAnnounceRule();
    // Behind a new grid's rule card the flip would go unseen: it waits for "Got it".
    if (ruleOpen()) flapPending = true;
    else flapIn();
  }
  let flapPending = false;

  // A new grid comes up like a split-flap departures board: each tile flips
  // down and its letters spin through the alphabet before settling, left to
  // right, row by row.
  function flapIn() {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    // Letters spin only on word grids; flags and paints just flip.
    const spinning = !puzzles[current].kind || puzzles[current].kind === "arrows";
    const letters = "abcdefghijklmnopqrstuvwxyz";
    document.querySelectorAll("#dailyPickRoot .dp-word").forEach((button, i) => {
      const word = button.dataset.word;
      const delay = (i % 4) * 45 + Math.floor(i / 4) * 90;
      button.style.setProperty("--flap-delay", `${delay}ms`);
      button.classList.add("is-flap");
      button.addEventListener("animationend", () => button.classList.remove("is-flap"), { once: true });
      const text = button.querySelector(".dp-card-word");
      const finalHtml = text?.innerHTML;
      if (!spinning || !text) return;
      let frame = 0;
      const frames = 8;
      const spin = () => {
        if (!text.isConnected || button.dataset.word !== word) return;
        frame++;
        if (frame >= frames) { text.innerHTML = finalHtml; return; }
        text.textContent = frame >= frames ? word
          : [...word].map((c, k) => (k < frame - 2 ? c : letters[Math.floor(Math.random() * 26)])).join("");
        if (frame < frames) setTimeout(spin, 50);
      };
      text.textContent = [...word].map(() => letters[Math.floor(Math.random() * 26)]).join("");
      setTimeout(spin, delay);
    });
  }

  // ---- A new grid's rule ---------------------------------------------------
  // Grids 2 and 3 change what the feedback shows, so as each starts a short
  // card says how, once per day. The clock waits while it's up.
  const RULES = {
    oneletter: () => `Today this grid shows feedback for <b>just one letter</b> per guess, in turn: your 1st guess shows letter 1, the 2nd shows letter 2, and so on (the 6th goes back to letter 1). Colors mean the same as on grid 1.`,
    split: () => `Letters in the word show <span class="dp-help-chip" style="background:${SPLIT_FILL}"></span> half ${colorName("hit")}, half ${colorName("near")} &ndash; you won't know if they're in the right spot. Gray means not in the word.`,
    counts: () => `You only see <i class="dp-rule-count is-correct">2</i> how many letters are in the right spot and <i class="dp-rule-count is-present">1</i> how many are in the wrong spot &ndash; not which ones.`
  };
  const SPEED_RULE = `You have <b>3 minutes</b> to solve as many of today's ${SPEED_GRIDS} grids as you can. Every grid has full feedback, like grid 1.</p>
      <p>Every guess costs <b>2 seconds</b>, right or wrong. The clock starts when you press Start.`;
  const ruleOpen = () => !!$("dpRule") && !$("dpRule").hidden;

  // The Weekly's grids each get their own card, once a week, as they start.
  // Each comes with a worked example in a red box: a secret, a guess, and
  // why each tile came out the way it did.
  const fbName = f => ({ correct: `<b data-c="hit">${colorName("hit")}</b>`, present: `<b data-c="near">${colorName("near")}</b>`, absent: "<b>gray</b>" })[f];
  const WEEKLY_RULES = {
    flags: () => {
      const demo = ["absent", "correct", "correct", "present", "absent", "correct"].map(f => `<span class="dp-cell is-${f}"></span>`).join("");
      return `<p>Find the secret <b>flag</b>. Each flag is cut into a grid of colors. Guess one, and each cell shows how that color compares with the secret flag:</p>
        <p>${fbName("correct")}: the secret has the same color in that cell.<br>${fbName("present")}: the secret has that color, in another cell.<br><b>Gray</b>: the secret has none of that color.</p>
        <div class="dp-example"><div class="dp-example-title">Example</div>
          <div class="dp-demo"><span class="dp-fb-grid is-demo" style="--cols:3">${demo}</span></div>
          <p>The two ${colorName("hit")} cells in the top row: the secret flag has those exact colors there. The ${colorName("near")} cell: that color is in the secret flag, just somewhere else. The gray cells: colors the secret flag doesn't have at all.</p>
        </div>`;
    },
    colors: () => {
      const mix = (c, a, b) => `<span class="dp-mix">${paintRow(c, "dp-paints dp-paints-inline")} ${PAINTS[c].name} = ${PAINTS[a].name} + ${PAINTS[b].name}</span>`;
      // Worked example; the feedback is computed by the game's own rule.
      const secret = "NKBNW";
      const guess = "RWPYO";
      const fb = paintFeedback(guess, secret);
      const why = [
        "red is part of the pink there",
        "no white there, but there's white in other spots",
        "purple shares blue with the blue there",
        "no yellow anywhere in the secret",
        "orange shares red with a pink in another spot"
      ];
      const row = (code, marks) => `<span class="dp-ex-row">${[...code].map((c, i) => `<span class="dp-ex-cell"><i style="background:${PAINTS[c].hex}"></i>${marks ? `<b class="is-${marks[i]}"></b>` : ""}<small>${i + 1}</small></span>`).join("")}</span>`;
      return `<p>Each row is five paints: <b>red</b>, <b>yellow</b>, <b>blue</b>, <b>white</b>, <b>black</b>, or a mix of two (black never mixes):</p>
        <div class="dp-mixes">${mix("O", "R", "Y")}${mix("P", "R", "B")}${mix("G", "Y", "B")}${mix("N", "R", "W")}${mix("C", "Y", "W")}${mix("L", "B", "W")}</div>
        <p>For each paint you guess:<br>${fbName("correct")}: it has a color in common with the secret's paint <b>in that spot</b> (it's that color, part of its mix, or a mix sharing one of its colors).<br>${fbName("present")}: it has a color in common with a paint <b>in another spot</b>.<br><b>Gray</b>: nothing in common with the secret.</p>
        <div class="dp-example"><div class="dp-example-title">Example</div>
          <div class="dp-ex-line"><span>Secret</span>${row(secret)}</div>
          <div class="dp-ex-line"><span>Guess</span>${row(guess, fb)}</div>
          <ol class="dp-ex-why">${[...guess].map((c, i) => `<li><b>${PAINTS[c].name[0].toUpperCase() + PAINTS[c].name.slice(1)}</b> is ${fbName(fb[i])}: ${why[i]}.</li>`).join("")}</ol>
        </div>`;
    },
    arrows: () => {
      const secret = "blade";
      const guess = "crane";
      const fb = arrowFeedback(guess, secret);
      const say = (g, a, f) => (f === "same" ? `${g.toUpperCase()} is right` : `the secret's ${a.toUpperCase()} comes ${f === "left" ? "before" : "after"} ${g.toUpperCase()}`);
      return `<p>Words again, but no colors. Under each letter of your guess, an arrow points to where the secret's letter in that spot is in the alphabet:</p>
        <p><b>←</b> it comes earlier (toward A).<br><b>→</b> it comes later (toward Z).<br><b>–</b> it's the right letter.</p>
        <div class="dp-example"><div class="dp-example-title">Example: the secret is BLADE</div>
          <div class="dp-demo"><div class="dp-row">${fb.map((f, i) => `<span class="dp-tile dp-arrow-tile is-${f}">${guess[i]}<small>${ARROWS[f]}</small></span>`).join("")}</div></div>
          <ol class="dp-ex-why">${fb.map((f, i) => `<li><b>${guess[i].toUpperCase()} ${ARROWS[f]}</b> ${say(guess[i], secret[i], f)}.</li>`).join("")}</ol>
        </div>`;
    },
    oneletter: () => {
      const secret = "blade";
      const guesses = ["crane", "slate", "flame"];
      const row = (g, k) => `<div class="dp-row">${feedback(g, secret).map((f, i) => `<span class="dp-tile is-${i === k ? f : "hidden"}">${g[i]}</span>`).join("")}</div>`;
      const said = (g, k) => {
        const f = feedback(g, secret)[k];
        return `${g[k].toUpperCase()} is ${fbName(f)}: ${f === "correct" ? "right letter, right spot" : f === "present" ? "in the word, another spot" : "not in the word"}`;
      };
      return `<p>Find the secret word, but each guess shows feedback for <b>just one letter</b>, in turn: your 1st guess shows letter 1, the 2nd shows letter 2, and so on. The 6th guess goes back to letter 1.</p>
        <p>${fbName("correct")}: right letter, right spot.<br>${fbName("present")}: in the word, another spot.<br><b>Gray</b>: not in the word.</p>
        <div class="dp-example"><div class="dp-example-title">Example: the secret is BLADE</div>
          <div class="dp-ex-rows">${guesses.map((g, k) => row(g, k)).join("")}</div>
          <ol class="dp-ex-why">${guesses.map((g, k) => `<li><b>${g.toUpperCase()}</b> shows letter ${k + 1}: ${said(g, k)}.</li>`).join("")}</ol>
        </div>`;
    },
    auto: () => `<p>You don't pick words here. <b>The game guesses for you</b>: straight away, then every 10 seconds, it guesses a random word that <b>isn't struck out</b> and <b>isn't the secret</b>, and shows its feedback. A big red number counts down to the next one.</p>
      <p>Tap words to <b>strike them out</b> as you rule them out, so they're never guessed. Tap again to bring one back.</p>
      <div class="dp-example"><div class="dp-example-title">How it ends</div>
        <ol class="dp-ex-why">
          <li><b>Solved</b> when the secret is the only word left that's neither struck out nor guessed.</li>
          <li>Your <b>score</b> is how many words the game guessed, so strike fast.</li>
          <li><b>Lost</b> if you've struck out the secret and there's nothing left to guess (counts as ${LOST_SCORE}).</li>
        </ol>
      </div>`,
    choice: () => `<p>You don't pick from the whole grid here. Under it, the game <b>offers two words</b>, never ones you've struck out, and not the secret, until only four or fewer words are left: then the secret can be one of them. Pick one, and you get its feedback; then you're offered the next two.</p>
      <p>Tap words to <b>strike them out</b> as you rule them out, so they're never offered. Tap again to bring one back.</p>
      <div class="dp-example"><div class="dp-example-title">How it ends</div>
        <ol class="dp-ex-why">
          <li><b>Solved</b> when you pick the secret, or when it's the only word left that's neither struck out nor guessed.</li>
          <li>Your <b>score</b> is how many words you guessed.</li>
          <li><b>Lost</b> if you've struck out the secret and there's nothing left to offer (counts as ${LOST_SCORE}).</li>
        </ol>
      </div>`
  };

  // Each Daily rule's full card shows once per device; days after that just
  // get the banner. Anyone who has finished a day before has seen them.
  const RULES_SEEN_KEY = "umt.unstruck.rulesSeen";
  // A newly introduced rule (Arrows on grid 3): the full card once per
  // device, whatever days were played before; the banner after that.
  function newRuleSeen(mode) {
    try {
      const seen = JSON.parse(localStorage.getItem(RULES_SEEN_KEY)) || {};
      if (seen[mode]) return true;
      seen[mode] = 1;
      localStorage.setItem(RULES_SEEN_KEY, JSON.stringify(seen));
    } catch (e) { /* private mode: show it */ }
    return false;
  }

  function ruleSeen(mode) {
    try {
      const seen = JSON.parse(localStorage.getItem(RULES_SEEN_KEY)) || {};
      if (seen[mode]) return true;
      if (Object.keys(JSON.parse(localStorage.getItem(HISTORY_KEY)) || {}).length) return true;
      seen[mode] = 1;
      localStorage.setItem(RULES_SEEN_KEY, JSON.stringify(seen));
    } catch (e) { /* private mode: show it */ }
    return false;
  }

  // A new Daily grid's banner: "Grid 2" and one line on its feedback. It
  // drops in over the board and leaves by itself; play goes on underneath.
  const BANNER_LINES = {
    full: () => `<span class="dp-help-chip" style="background:var(--dp-hit)"></span> right spot <span class="dp-help-chip" style="background:var(--dp-near)"></span> wrong spot`,
    split: () => `<span class="dp-help-chip" style="background:${SPLIT_FILL}"></span> in the word, spot not shown`,
    counts: () => `Only counts: <i class="dp-rule-count is-correct">2</i> right spot <i class="dp-rule-count is-present">1</i> wrong spot`,
    oneletter: () => `One letter per guess: 1st, 2nd, 3rd…`,
    arrows: () => `Arrows: <b>←</b> earlier <b>→</b> later <b>–</b> right letter`
  };
  let bannerTimer = null;
  function showBanner() {
    const banner = $("dpBanner");
    if (!banner) return;
    banner.innerHTML = `<b>Grid ${current + 1}</b><span>${BANNER_LINES[puzzles[current].mode]()}</span>`;
    banner.hidden = false;
    const drop = $("dpDrop")?.getBoundingClientRect(), box = banner.offsetParent?.getBoundingClientRect();
    if (drop && box) banner.style.top = `${Math.round(drop.top - box.top + drop.height / 2 - banner.offsetHeight / 2)}px`;
    banner.classList.remove("is-showing");
    void banner.offsetWidth;
    banner.classList.add("is-showing");
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(hideBanner, 2200);
  }

  // A tap on the banner sends it off early.
  function hideBanner(quick) {
    const banner = $("dpBanner");
    clearTimeout(bannerTimer);
    if (!banner || banner.hidden) return;
    if (!quick) { banner.hidden = true; banner.classList.remove("is-showing", "is-leaving"); return; }
    banner.classList.add("is-leaving");
    bannerTimer = setTimeout(hideBanner, 180);
  }

  function maybeAnnounceRule() {
    const r = round();
    // A Daily grid with an unusual rule (a day's swap, like one-letter
    // feedback) always gets the full card with its worked example, like the
    // Experimental grids, and the clock waits until it's closed.
    const special = dailyLike() && !["full", "split", "counts"].includes(puzzles[current].mode) && !!WEEKLY_RULES[puzzles[current].mode];
    const rule = SET_GAMES.includes(game) ? WEEKLY_RULES[puzzles[current].kind]?.()
      : special ? WEEKLY_RULES[puzzles[current].mode]()
      : game === "speed" ? (current === 0 ? SPEED_RULE : null) : RULES[puzzles[current].mode]?.();
    state.announced = state.announced || [];
    if (playMode !== "daily" || r.guesses.length || state.announced[current] || over()) return;
    // Grids 2 and 3: a short tip the first time, the banner after that.
    if (dailyLike() && !special && ["split", "counts"].includes(puzzles[current].mode)) {
      state.announced[current] = true;
      save();
      return ruleSeen(puzzles[current].mode) ? showBanner() : tipStart(puzzles[current].mode);
    }
    // The Daily: a banner, or the full rule the first time it comes up.
    if (dailyLike() && (special ? newRuleSeen(puzzles[current].mode) : !rule || ruleSeen(puzzles[current].mode))) {
      state.announced[current] = true;
      save();
      return showBanner();
    }
    if (!rule) return;
    state.announced[current] = true;
    save();
    stopClock();
    $("dpRuleCard").dataset.sure = SET_GAMES.includes(game) || special ? "1" : "";
    $("dpRuleCard").innerHTML = `<div class="dp-rule-grid">${game === "speed" ? `Speed · ${SPEED_GRIDS} grids` : `${SET_GAMES.includes(game) ? `Experimental · ${gridLabel(current)} · ` : ""}Grid ${current + 1} of ${puzzles.length}${special ? ` · ${KIND_INFO[puzzles[current].mode]?.label || ""} · new` : ""}`}</div>
      <p>${rule}</p>
      <div class="dp-rule-foot"><button id="dpRuleClose" class="dp-next" type="button">${game === "speed" ? "Start" : "Got it"}</button></div>`;
    $("dpRule").hidden = false;
    $("dpRuleClose").focus({ preventScroll: true });
    $("dpRuleCard").scrollTop = 0; // long cards start at the top
    requestAnimationFrame(updateRuleFade);
  }

  // The fade above the rule card's button only shows while there's more
  // text below to scroll to.
  function updateRuleFade() {
    const card = $("dpRuleCard");
    if (!card) return;
    card.classList.toggle("has-more", card.scrollHeight - card.scrollTop - card.clientHeight > 4);
  }

  // "Got it" asks once more before the rules go away.
  function askSure() {
    $("dpRuleClose").hidden = true;
    $("dpRuleClose").insertAdjacentHTML("afterend", `<div class="dp-sure" id="dpSure">
      <p>Are you sure you understand the rules?</p>
      <button id="dpRuleYes" class="dp-next" type="button">Yes, let's play</button>
      <button id="dpRuleBack" class="dp-link" type="button">Read them again</button></div>`);
    $("dpRuleYes").focus({ preventScroll: true });
    requestAnimationFrame(updateRuleFade);
    $("dpSure").scrollIntoView({ block: "nearest" });
  }

  function unaskSure() {
    $("dpSure")?.remove();
    $("dpRuleClose").hidden = false;
    $("dpRuleCard").scrollTop = 0;
  }

  function closeRule() {
    if (!ruleOpen()) return;
    $("dpRule").hidden = true;
    startClock();
    if (flapPending) { flapPending = false; flapIn(); }
  }

  // Loads (or reloads, when the day or week has turned over) a game's
  // puzzles and saved progress into its slot.
  async function prepare(which) {
    const slot = slots[which];
    const period = GAMES[which].period();
    if (slot.puzzles && slot.state.date === period) return;
    const previous = game;
    game = which; // load() reads the game's own keys
    try {
      if (!wordList) {
        const text = await (await fetch(WORDS_URL)).text();
        wordList = [...new Set(text.split(/\s+/).map(w => w.toLowerCase()).filter(w => /^[a-z]{5}$/.test(w)))].sort();
      }
      if (which === "daily" || which === "archive") {
        slot.state = load();
        slot.puzzles = buildDay(wordList, period);
        // Progress saved on an older version of a day's grids (words no
        // longer in them) starts the day over.
        const fits = slot.state.rounds.every((r, i) => [...r.guesses, ...r.struck].every(w => slot.puzzles[i]?.words.includes(w)));
        if (!fits) slot.state = { date: period, rounds: slot.puzzles.map(() => ({ guesses: [], struck: [], solved: false })) };
      } else if (which === "mini") {
        slot.puzzles = buildMini(wordList, period);
        slot.state = load(PUZZLE_COUNT);
      } else if (which === "twists") {
        slot.puzzles = buildTwists(wordList, period);
        slot.state = load(TWIST_KINDS.length);
      } else if (which === "speed") {
        slot.puzzles = buildSpeed(wordList, period);
        slot.state = load(SPEED_GRIDS);
      } else {
        if (!catalog) {
          catalog = await (await fetch(`${MEDIA_URL}weekly.json`)).json();
          for (const kind of PIC_KINDS) if (catalog[kind]) catalog[kind].byId = Object.fromEntries(catalog[kind].items.map(item => [item.id, item]));
        }
        slot.puzzles = buildWeek(catalog, period, wordList);
        slot.state = load(slot.puzzles.length);
      }
    } finally {
      game = previous;
    }
  }

  async function open(which = game) {
    if ((!WEEKLY_ENABLED && which === "weekly") || (!SPEED_ENABLED && which === "speed") || (!TWISTS_ENABLED && which === "twists") || (!MINI_ENABLED && which === "mini")) which = "daily";
    if (playMode === "practice") leavePractice();
    tipClear();
    closeChooser();
    if (window.showScreen) window.showScreen("dailyPickScreen");
    else $("dailyPickScreen").classList.add("active");
    document.body.classList.add("menu-mode");
    const root = $("dailyPickRoot");
    stopClock();
    clearTimeout(advanceTimer);
    advanceTimer = null;
    if (state) slots[game] = { puzzles, state };
    if (!slots[which].puzzles || slots[which].state.date !== GAMES[which].period()) {
      root.textContent = which === "weekly" ? "Loading this week's puzzles…" : "Loading today's puzzles…";
    }
    try {
      await prepare(which);
    } catch (e) {
      root.innerHTML = `<div class="dp-board-note">Couldn't load the puzzles.<br><button type="button" class="dp-next" data-retry="${which}">Try again</button></div>`;
      return;
    }
    game = which;
    ({ puzzles, state } = slots[which]);
    current = firstUnsolved();
    selected = "";
    render();
    // Once per page load: who this visit is, so the funnel can be read
    // properly (a reload after finishing can never "start").
    if (game === "daily" && playMode === "daily" && !loadTracked) {
      loadTracked = true;
      const kind = !introSeen() && !Object.keys(loadHistory()).length ? "new" : over() ? "finished" : totalGuesses() > 0 || (state.elapsed || 0) > 0 ? "inprogress" : "unplayed";
      track(`load-${kind}`);
      if (FRIEND) track("arrive-friend", `friend scored ${FRIEND.score}`);
    }
    // Opening Unstruck shows the start screen first (not once the day is done).
    if (game === "daily" && playMode === "daily" && !splashDone && !over()) {
      splashDone = true;
      openSplash();
      return;
    }
    beginPlay();
  }

  // Off the start screen: the tutorial for newcomers, else the clock and the
  // grid's banner (or its rule, the first time).
  function beginPlay() {
    if (dailyLike() && !introSeen()) return startCoach();
    startClock();
    maybeAnnounceRule();
  }

  // ---- Experimental: pick Speed or the Flags / Colors / Arrows grids ----------
  // Each choice says whether it's already been played this day (or week).
  function playedNote(which) {
    const g = GAMES[which];
    let done = null;
    try { done = (JSON.parse(localStorage.getItem(g.historyKey)) || {})[g.period()]; } catch (e) { /* none */ }
    if (!done) return "";
    return which === "speed" ? `Today: ${done.score} of ${SPEED_GRIDS} grids ✓` : `This week: ${done.score} guesses ✓`;
  }

  function openChooser() {
    const option = (which, title, text) => `<button type="button" class="dp-choice" data-game="${which}">
      <b>${title}</b><span>${text}</span>${playedNote(which) ? `<em>${playedNote(which)}</em>` : ""}</button>`;
    $("dpChooseCard").innerHTML = `<div class="dp-rule-grid">Experimental</div>
      ${SPEED_ENABLED ? option("speed", "Speed", `3 minutes to solve as many of today's ${SPEED_GRIDS} grids as you can`) : ""}
      ${WEEKLY_ENABLED ? option("weekly", "Flags · Colors · Arrows", "Three new kinds of grid, new every Monday") : ""}
      ${TWISTS_ENABLED ? option("twists", "One letter · Autopilot · Pick two", "Word grids with a twist: one letter of feedback at a time, guesses made for you, or a choice of two. New every Monday") : ""}
      ${MINI_ENABLED ? option("mini", "Unstruck 12", "Today's three kinds of grid, with 12 words instead of 16") : ""}
      <button type="button" class="dp-rate-open" id="dpRateOpen">★ Rate the grids</button>
      <button type="button" class="dp-link" id="dpChooseClose">Not now</button>`;
    $("dpChoose").hidden = false;
  }

  // ---- Rating the grids ------------------------------------------------------
  // 1 to 5 stars for each kind of grid, kept on this device, and shared as
  // text so the ratings can be sent back (WhatsApp, Messages, ...).
  const RATINGS_KEY = "umt.unstruck.ratings";
  const RATE_GROUPS = [
    ["Daily", [["grid1", "Grid 1 · full colors"], ["grid2", "Grid 2 · half colors"], ["grid3", "Grid 3 · counts"]]],
    ...(SPEED_ENABLED ? [["Speed", [["speed", "Speed"]]]] : []),
    ["Experimental 1", [["flags", "Flags"], ["colors", "Colors"], ["arrows", "Arrows"]]],
    ...(TWISTS_ENABLED ? [["Experimental 2", [["oneletter", "One letter"], ["auto", "Autopilot"], ["choice", "Pick two"]]]] : []),
    ...(MINI_ENABLED ? [["Experimental 3", [["mini", "Unstruck 12"]]]] : [])
  ];
  function loadRatings() {
    try { return JSON.parse(localStorage.getItem(RATINGS_KEY)) || {}; } catch (e) { return {}; }
  }

  function openRatings() {
    const ratings = loadRatings();
    const stars = key => [1, 2, 3, 4, 5].map(n => `<button type="button" class="dp-star${ratings[key] >= n ? " is-on" : ""}" data-rate="${key}" data-stars="${n}" aria-label="${n} star${n > 1 ? "s" : ""}">★</button>`).join("");
    $("dpChooseCard").innerHTML = `<div class="dp-rule-grid">Rate the grids</div>
      <div class="dp-rate-note">1 star = okay, 5 stars = great</div>
      ${RATE_GROUPS.map(([group, items]) => `<div class="dp-rate-group"><div class="dp-rate-head">${group}</div>
        ${items.map(([key, label]) => `<div class="dp-rate-row"><span>${label}</span><span class="dp-stars">${stars(key)}</span></div>`).join("")}</div>`).join("")}
      <button type="button" class="dp-next dp-brag" id="dpRateBrag">${SHARE_LABEL}</button>
      <button type="button" class="dp-link" id="dpRateBack">← Back</button>`;
    $("dpChooseCard").scrollTop = 0;
  }

  function rate(key, n) {
    const ratings = loadRatings();
    ratings[key] = ratings[key] === n ? 0 : n; // tapping the same star again clears it
    if (!ratings[key]) delete ratings[key];
    try { localStorage.setItem(RATINGS_KEY, JSON.stringify(ratings)); } catch (e) { /* private mode */ }
    if (ratings[key]) track(`rated-${key}-${n}`, `${key}: ${n} stars`);
    document.querySelectorAll(`.dp-star[data-rate="${key}"]`).forEach(star => star.classList.toggle("is-on", (ratings[key] || 0) >= +star.dataset.stars));
  }

  function ratingsText() {
    const ratings = loadRatings();
    const line = ([key, label]) => `${label}: ${ratings[key] ? `${"⭐".repeat(ratings[key])} ${ratings[key]}/5` : "not rated"}`;
    return ["Unstruck grid ratings (1 = okay, 5 = great)",
      ...RATE_GROUPS.flatMap(([group, items]) => ["", `${group}:`, ...items.map(line)])].join("\n");
  }

  function closeChooser() {
    if ($("dpChoose")) $("dpChoose").hidden = true;
  }

  // ---- Archive ---------------------------------------------------------------
  // Every past day, newest first; tap one to play its three grids.
  const prettyDay = date => new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

  function showArchive() {
    const root = $("dailyPickRoot");
    if (!root) return;
    stopClock();
    clearTimeout(advanceTimer);
    advanceTimer = null;
    if (state) slots[game] = { puzzles, state };
    $("dailyPickScreen").classList.remove("is-results");
    $("dpClock").hidden = true;
    $("dpTitle").innerHTML = `Unstruck <span class="dp-title-grid">Archive</span>`;
    const read = key => { try { return JSON.parse(localStorage.getItem(key)) || {}; } catch (e) { return {}; } };
    const played = read("umt.unstruck.archiveHistory");
    const onTheDay = read(HISTORY_KEY);
    const days = [];
    for (let d = addDays(today(), -1); d >= LAUNCH_DATE; d = addDays(d, -1)) days.push(d);
    const status = date => {
      const done = played[date];
      if (done) return `<em class="is-done">${done.score} guesses · ${golfTerm(done.score - DAY_PAR)}</em>`;
      const saved = read(`umt.unstruck.archive.${date}`);
      if (saved.rounds?.some(r => r.guesses.length)) return `<em>In progress</em>`;
      if (onTheDay[date]) return `<em>Played on the day: ${onTheDay[date].score}</em>`;
      return "";
    };
    root.innerHTML = `<div class="dp-archive">
      <p class="dp-archive-note">Past Dailies. Results here don't count toward your streak or stats.</p>
      ${days.length ? days.map(date => `<button type="button" class="dp-archive-day" data-archive-day="${date}">
        <b>#${puzzleNumber(date)}</b><span>${prettyDay(date)}</span>${status(date)}</button>`).join("")
        : `<p class="dp-archive-note">Nothing here yet: the first past day shows up tomorrow.</p>`}
      <a class="dp-link" href="/">Today's Unstruck →</a>
    </div>`;
    window.scrollTo(0, 0);
  }

  function playArchive(date) {
    archiveDate = date;
    open("archive");
  }

  // ---- Past games: the last few days, from the results --------------------
  function pastCount() {
    let first = null;
    try { first = Object.keys(JSON.parse(localStorage.getItem(HISTORY_KEY)) || {}).sort()[0] || null; } catch (e) { /* none */ }
    const isNew = !first || dayIndex(today()) - dayIndex(first) < NEW_PLAYER_DAYS;
    return isNew ? PAST_DAYS_NEW : PAST_DAYS;
  }
  function pastDays() {
    const days = [];
    for (let d = addDays(today(), -1); d >= LAUNCH_DATE && days.length < pastCount(); d = addDays(d, -1)) days.push(d);
    return days;
  }
  function openPast() {
    track("past-open");
    const read = key => { try { return JSON.parse(localStorage.getItem(key)) || {}; } catch (e) { return {}; } };
    const replayed = read("umt.unstruck.archiveHistory");
    const onTheDay = read(HISTORY_KEY);
    const status = date => {
      if (replayed[date]) return `<em>Replayed: ${replayed[date].score} guesses</em>`;
      if (read(`umt.unstruck.archive.${date}`).rounds?.some(r => r.guesses.length)) return `<em>In progress</em>`;
      if (onTheDay[date]) return `<em>You played it: ${onTheDay[date].score} guesses</em>`;
      return "";
    };
    $("dpChooseCard").innerHTML = `<div class="dp-rule-grid">Past games</div>
      <p class="dp-past-note">${pastDays().length === 1 ? "Missed yesterday? Play it here. It doesn't" : `New here? Catch up on the last ${pastDays().length} days. They don't`} count toward your streak or stats.</p>
      ${pastDays().map(date => `<button type="button" class="dp-choice" data-past-day="${date}">
        <b>Unstruck #${puzzleNumber(date)}</b><span>${prettyDay(date)}</span>${status(date)}</button>`).join("")}
      <button type="button" class="dp-link" id="dpChooseClose">Not now</button>`;
    $("dpChoose").hidden = false;
  }

  function renderArchiveSummary(root) {
    recordDay();
    setTitle(0);
    const diff = totalGuesses() - G().par;
    const grids = state.rounds.map((r, i) => {
      const t = gridTimes()[i];
      const time = t != null ? `<span class="dp-grid-time">${CLOCK_ICON}${formatTime(t)}</span>` : "";
      return `<div class="dp-grid-score"><span class="dp-grid-name">${gridLabel(i)}</span>
        <b>${r.guesses.length}</b><span class="dp-grid-unit">${r.guesses.length === 1 ? "Hole in one!" : "guesses"}</span>${time}</div>`;
    }).join("");
    root.innerHTML = `<div class="dp-summary">
      <div class="dp-archive-tag">From the archive · ${prettyDay(state.date)}</div>
      <div class="dp-score">
        <div class="dp-score-main">
          <div><div class="dp-score-num">${totalGuesses()}</div><div class="dp-score-label">guesses</div></div>
          <div><div class="dp-score-num dp-score-time">${formatTime(elapsed())}</div><div class="dp-score-label">time</div></div>
        </div>
        <div class="dp-score-verdict ${diff <= 0 ? "is-good" : "is-over"}">${golfTerm(diff)} <span>${diff === 0 ? `(even with par ${G().par})` : `(${relToPar(diff)} vs par ${G().par})`}</span></div>
      </div>
      <div class="dp-grid-scores">${grids}</div>
      <div class="dp-brag-row"><button type="button" class="dp-next dp-brag" id="dpBrag">${SHARE_LABEL}</button></div>
      ${ARCHIVE ? `<button type="button" class="dp-link" data-archive-list>← Back to the archive</button>` : `<button type="button" class="dp-link" data-past>Play another past game</button>
      <button type="button" class="dp-link" data-game="daily">← Back to today's Unstruck</button>`}
      <div class="dp-copyright">&copy; 2026 Unstruck. All rights reserved.</div></div>`;
  }

  // ---- Start screen --------------------------------------------------------
  let splashDone = false;
  let loadTracked = false;
  const splashOpen = () => !!$("dpStart") && !$("dpStart").hidden;

  // The start screen's picture: three words struck out one by one, then the
  // one left standing turns green. The whole game in two seconds.
  const HERO_SVG = `<svg class="dp-hero" viewBox="0 0 96 96" aria-hidden="true">
    <rect class="t" x="4" y="4" width="40" height="40" rx="10"/><rect class="t" x="52" y="4" width="40" height="40" rx="10"/><rect class="t" x="4" y="52" width="40" height="40" rx="10"/>
    <rect class="w" x="52" y="52" width="40" height="40" rx="10"/>
    <path class="s" d="M13 24h22"/><path class="s" d="M61 24h22"/><path class="s" d="M13 72h22"/>
    <path class="c" d="M62 72.5l6.5 6.5 13-14"/></svg>`;

  function openSplash() {
    const n = G().number(state.date);
    const streak = computeStats().current;
    const started = totalGuesses() > 0 || (state.elapsed || 0) > 0;
    const day = new Date(`${state.date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
    const isNew = !introSeen() && !Object.keys(loadHistory()).length;
    const label = started ? `Continue Unstruck #${n}` : streak ? `Continue your ${streak}-day streak` : isNew ? "Play" : `Play Unstruck #${n}`;
    const sub = started ? `Grid ${current + 1} of ${puzzles.length}${firstGame() ? "" : ` · ${formatTime(elapsed())}`}` : streak ? `Play Unstruck #${n}` : isNew ? "Starts with a quick 1-minute tutorial" : "";
    const friend = FRIEND && FRIEND.day === n && !started ? `<div class="dp-start-friend">A friend scored <b>${FRIEND.score}</b> today. Can you beat it?</div>` : "";
    $("dpStartCard").innerHTML = `${HERO_SVG}<div class="dp-start-title">Unstruck</div>
      <div class="dp-start-date">#${n} · ${day}</div>
      ${started ? "" : `<div class="dp-start-pitch">Find the secret word among 16.<br>Three grids, about 3 minutes.</div>`}
      ${friend}
      <button type="button" class="dp-next dp-start-play" id="dpStartPlay">${label}</button>
      ${sub ? `<div class="dp-start-sub">${sub}</div>` : ""}
      <button type="button" class="dp-link" id="dpStartHelp">How to play</button>`;
    $("dailyPickScreen").classList.add("is-splash");
    $("dpStart").hidden = false;
    setTitle(0);
  }

  // Help or the tutorial opened from the start screen: it steps aside while
  // they're up, and comes back when they close.
  let splashAside = false;
  function setSplashAside() {
    if (!splashOpen()) return;
    splashAside = true;
    $("dpStart").hidden = true; // the grid stays hidden (is-splash) meanwhile
  }
  function bringSplashBack() {
    if (!splashAside) return false;
    splashAside = false;
    $("dpStart").hidden = false;
    $("dailyPickScreen").classList.add("is-splash");
    setTitle(0);
    return true;
  }

  function closeSplash() {
    if (!splashOpen()) return;
    $("dpStart").hidden = true;
    $("dailyPickScreen").classList.remove("is-splash");
    setTitle(current + 1);
    flapIn();
    beginPlay();
  }

  // ---- Practice grid ----------------------------------------------------------
  // ---- Guided first game -------------------------------------------------------
  // New players learn by playing a hand-made practice grid with a hand that
  // shows each move. Only the word (or button) the hand points at responds,
  // so the explanations always match what's on screen.
  // The pointing hand, with a ripple where the fingertip taps.
  // A simple cartoon hand pointing up: one finger, a rounded fist (one
  // clean outline, drawn as a thicker ink copy under the white), a red cuff.
  // The fingertip is at (22, 0) of its 64 x 76 box.
  const HAND_PARTS = `<rect x="15" y="3" width="14" height="40" rx="7"/><rect x="11" y="28" width="44" height="34" rx="15"/>`;
  const HAND_HTML = `<span class="dp-hand-ripple"></span><svg viewBox="0 0 64 76" aria-hidden="true" stroke-linejoin="round" stroke-linecap="round">
    <g fill="#2b2925" stroke="#2b2925" stroke-width="6.4">${HAND_PARTS}</g>
    <g fill="#fffdf8">${HAND_PARTS}</g>
    <path d="M33 29v9M43 30v8" fill="none" stroke="#2b2925" stroke-width="2.6" opacity=".35"/>
    <rect x="17" y="59" width="32" height="13" rx="6" fill="#e5484d" stroke="#2b2925" stroke-width="3.2"/></svg>`;
  // The tutorial grid: picked so that whatever word a newcomer guesses first,
  // some secret gives a green, a yellow and grays, and leaves 4 to 6 words
  // that still fit. The secret is chosen right after that first guess.
  const COACH_GRIDS = [
    { mode: "full", answer: "fruit", words: ["great", "paint", "exact", "orbit", "flint", "joint", "habit", "fruit",
      "faint", "about", "trunk", "sweat", "think", "eight", "adopt", "sight"] }
  ];
  const up = w => `<b>${w.toUpperCase()}</b>`;
  const cap = t => t[0].toUpperCase() + t.slice(1);
  // A small burst of confetti (instead of an emoji).
  const PARTY = `<svg class="dp-party" viewBox="0 0 32 32" width="22" height="22" aria-hidden="true">
    <path d="M5 27 11.5 9.5 22.5 20.5Z" fill="#f2c14e" stroke="#b8860b" stroke-width="1.4" stroke-linejoin="round"/>
    <path d="M8.2 18.6 13.4 23.8M9.9 13.9 18.1 22.1" stroke="#e5484d" stroke-width="2" stroke-linecap="round"/>
    <path d="M16 6.5c1.5-1.7 3.4-1.8 4.6-.6M24.5 11.5c1.7-1.5 3.6-1.4 4.6-.2M20 2.5v2.3M28.5 6.5l-1.8 1.4M26.5 17.5h2.4" fill="none" stroke="#3b7dd8" stroke-width="2" stroke-linecap="round"/>
    <circle cx="23.2" cy="5.8" r="1.4" fill="#e5484d"/><circle cx="29" cy="14" r="1.3" fill="#3f9d4f"/><circle cx="17.5" cy="10.5" r="1.2" fill="#3f9d4f"/>
  </svg>`;
  // A little feedback tile, to point at the ones on the board.
  const tile = (letter, kind) => `<span class="dp-say-tile is-${kind}">${letter.toUpperCase()}</span>`;
  const ORD = ["1st", "2nd", "3rd", "4th", "5th"];
  const fbKey = (g, s) => feedback(g, s).join();

  // The secret for the tutorial, once the first guess is known: the one
  // whose feedback has a green and a yellow (and grays), leaves 4 to 6
  // words that fit, and has a good second guess among them.
  function coachSecret(words, g) {
    let best = null;
    for (const s of words) {
      if (s === g) continue;
      const f = feedback(g, s);
      const c = f.filter(x => x === "correct").length, p = f.filter(x => x === "present").length;
      const fits = words.filter(w => w !== g && fbKey(g, w) === f.join());
      let score = (c ? 4 : 0) + (p ? 4 : 0) + (c + p <= 3 ? 1 : 0) + (fits.length >= 4 && fits.length <= 6 ? 3 : fits.length >= 3 && fits.length <= 7 ? 1 : 0);
      const others = fits.filter(w => w !== s);
      if (others.length) score += Math.max(...others.map(n => new Set(fits.map(x => fbKey(n, x))).size)) >= fits.length - 1 ? 2 : 0;
      if (!best || score > best.score) best = { s, score };
    }
    return best ? best.s : words.find(w => w !== g);
  }

  // Why a word can't be the secret, from one guess's feedback.
  function whyOut(w, g, f, only) {
    const kept = new Set(g.split("").filter((x, i) => f[i] !== "absent"));
    for (let i = 0; i < 5; i++) {
      if (only && only !== "absent") break;
      if (f[i] === "absent" && !kept.has(g[i]) && w.includes(g[i])) return { kind: "absent", letter: g[i], text: `${up(w)}: has ${/[aefhilmnorsx]/.test(g[i]) ? "an" : "a"} ${g[i].toUpperCase()} (gray)` };
    }
    for (let i = 0; i < 5; i++) {
      if (only && only !== "correct") break;
      if (f[i] === "correct" && w[i] !== g[i]) return { kind: "correct", letter: g[i], text: `${up(w)}: no ${g[i].toUpperCase()} in ${ORD[i]} (${colorName("hit")})` };
    }
    for (let i = 0; i < 5; i++) {
      if (only && only !== "present") break;
      if (f[i] !== "present") continue;
      if (!w.includes(g[i])) return { kind: "present", letter: g[i], text: `${up(w)}: no ${g[i].toUpperCase()} (${colorName("near")} means it's in the word)` };
      if (w[i] === g[i]) return { kind: "present", letter: g[i], text: `${up(w)}: ${g[i].toUpperCase()} in ${ORD[i]} (${colorName("near")} means not there)` };
    }
    return only ? null : { kind: "other", text: `${up(w)}: doesn't match the colors` };
  }

  // The tutorial is a handful of phases, each moved on by what the player
  // does (a tap anywhere moves past a message; the right tap moves on):
  // intro -> pick -> guess -> colors -> cross -> next -> guess2 -> free -> found
  let coach = null; // { phase, prevInput, msg, examples, sug }

  async function startCoach() {
    await startPractice({ grids: COACH_GRIDS });
    if (playMode !== "practice") return;
    coach = { phase: "pick", prevInput: settings.input, msg: "" };
    settings.input = "tap"; // the guided game is played with taps
    selected = "";
    $("dailyPickScreen").classList.add("is-coaching");
    render();
    coachShow();
  }

  function coachEnd(done) {
    if (!coach) return;
    settings.input = coach.prevInput;
    clearTimeout(coach.timer);
    coach = null;
    $("dailyPickScreen")?.classList.remove("is-coaching");
    ["dpCoachHand", "dpCoachSay", "dpCoachDim", "dpCoachSplash", "dpCoachSkipWrap"].forEach(id => $(id)?.remove());
    document.querySelectorAll(".dp-coach-focus").forEach(el => el.classList.remove("dp-coach-focus"));
    try { localStorage.setItem(INTRO_SEEN_KEY, "1"); } catch (e) { /* private mode */ }
    if (done) track("tutorial-done");
  }

  // The words that can't be the secret, given every guess so far.
  function coachOut() {
    const r = round(), p = puzzles[current];
    return p.words.filter(w => !r.guesses.includes(w) && r.guesses.some(g => fbKey(g, w) !== fbKey(g, p.answer)));
  }
  const coachLeft = () => coachOut().filter(w => !round().struck.includes(w));
  const firstGuess = () => round().guesses[0];

  function coachSet(phase, msg = "") {
    coach.phase = phase;
    coach.msg = msg;
    coachShow();
  }
  const coachCanGuess = () => !coach || ["guess", "guess2", "free"].includes(coach.phase);

  // Before a word tap goes through: is it one the tutorial wants now?
  function coachAllows(word) {
    if (!coach) return true;
    const r = round();
    const struck = r.struck.includes(word);
    if (coach.phase === "intro") coach.phase = "pick";
    if (coach.phase === "colors") coach.phase = "cross";
    if (coach.phase === "pick" || coach.phase === "guess") {
      // Only one word on the go before the first guess.
      r.struck = r.struck.filter(w => w === word);
      if (selected && selected !== word) selected = "";
      return true;
    }
    if (coach.phase === "auto") return false;
    if (coach.phase === "cross") {
      if (struck) return coachNo("It's already crossed out.");
      if (!coachOut().includes(word)) return coachNo(`Not ${up(word)}: it still fits, so it could be the secret!`);
      return true;
    }
    if (coach.phase === "next" || coach.phase === "guess2") {
      if (struck && coachOut().includes(word)) return coachNo("That one's out. Pick one that still fits!");
      return true;
    }
    return true;
  }
  function coachNo(msg) {
    const hand = $("dpCoachHand");
    hand?.classList.remove("is-nudge"); void hand?.offsetWidth; hand?.classList.add("is-nudge");
    coach.msg = `<span class="dp-say-no">${msg}</span>`;
    coachShow();
    return false;
  }

  // After a word tap went through.
  function coachAfterTap(word) {
    if (!coach) return;
    const r = round();
    coach.last = word;
    if (coach.phase === "pick" || coach.phase === "guess") return coachSet(selected ? "guess" : "pick", r.struck.includes(word) ? "pickAgain" : "");
    if (coach.phase === "cross" && r.struck.includes(word)) {
      const why = whyOut(word, firstGuess(), feedback(firstGuess(), puzzles[current].answer));
      const yes = (coach.examples || []).some(x => x.w === word) ? "Yes!" : `Yes! ${why.text}.`;
      if (!coachLeft().length) return coachSet("next");
      const exLeft = (coach.examples || []).some(x => !r.struck.includes(x.w));
      return exLeft ? coachSet("cross", yes) : coachAutoCross();
    }
    if (coach.phase === "next" || coach.phase === "guess2") return coachSet(selected ? "guess2" : "next", r.struck.includes(word) && !coachOut().includes(word) ? "again" : "");
  }

  // The lesson's learned after two examples: the rest cross themselves
  // out, one by one, then on to the next guess.
  function coachAutoCross() {
    coachSet("auto");
    clearTimeout(coach.timer);
    const step = () => {
      if (!coach || coach.phase !== "auto") return;
      const w = coachLeft()[0];
      if (!w) return coachSet("next");
      round().struck.push(w);
      toggled = { word: w, kind: "struck" };
      render();
      toggled = null;
      coach.timer = setTimeout(step, 260);
    };
    coach.timer = setTimeout(step, 900);
  }

  // After a guess: the first one decides the secret (before its feedback).
  function coachBeforeGuess() {
    if (coach && coach.phase === "guess" && !round().guesses.length) {
      const p = puzzles[current];
      p.answer = coachSecret(p.words, selected);
      const f = feedback(selected, p.answer);
      // Two worked examples: a word out for a gray letter, one out for a
      // green or yellow one.
      const out = p.words.filter(w => w !== selected && fbKey(selected, w) !== f.join());
      const pickBy = (kind, not) => out.find(w => w !== not && whyOut(w, selected, f, kind));
      const e1 = pickBy("absent");
      const e2 = pickBy("correct", e1) || pickBy("present", e1);
      coach.examples = [e1 && { w: e1, kind: "absent" }, e2 && { w: e2, kind: whyOut(e2, selected, f, "correct") ? "correct" : "present" }].filter(Boolean);
      if (!coach.examples.length && out[0]) coach.examples = [{ w: out[0] }];
      // A good next guess: fits, isn't the secret, splits the rest best.
      const fits = p.words.filter(w => w !== selected && fbKey(selected, w) === f.join());
      const others = fits.filter(w => w !== p.answer);
      coach.sug = others.sort((a, b) => new Set(fits.map(x => fbKey(b, x))).size - new Set(fits.map(x => fbKey(a, x))).size)[0] || p.answer;
    }
  }
  function coachAfterGuess() {
    if (!coach) return;
    const r = round();
    if (r.solved) return coachSet("found");
    if (coach.phase === "guess") return setTimeout(() => coach && coachSet("colors"), 650); // after the tiles flip in
    return coachSet("free");
  }

  // A tap anywhere (not on a word) moves past a message.
  function coachScreenTap(event) {
    if (tip && $("dpTipSay") && !event.target.closest?.(".dp-word")) tipHide();
    if (!coach) return;
    if (event.target.closest?.("#dpCoachSkip")) { event.stopPropagation(); track(`tutorial-skip-${coach.phase}`, `skipped at: ${coach.phase}`); coachEnd(false); endPractice(); return; }
    if (event.target.closest?.(".dp-word, #dpGuess, button")) return;
    if (coach.phase === "intro") coachSet("pick");
    else if (coach.phase === "colors") coachSet("cross");
  }

  function coachEl(id, cls, parent = $("dailyPickScreen")) {
    let el = $(id);
    if (!el) { el = document.createElement("div"); el.id = id; el.className = cls; parent.appendChild(el); }
    return el;
  }
  const wordEl = w => document.querySelector(`#dailyPickRoot .dp-word[data-word="${w}"]`);

  // What the bubble says and points at, for the current phase.
  function coachContent() {
    const r = round(), p = puzzles[current];
    const twice = r.guesses.length || settings.firstPick !== "single";
    const g = firstGuess();
    const f = g ? feedback(g, p.answer) : null;
    const lit = r.guesses.length ? document.querySelector("#dpDrop") : null;
    const unstruck = p.words.filter(w => !r.struck.includes(w) && !r.guesses.includes(w));
    switch (coach.phase) {
      case "intro":
        return { text: `Find the <b>secret word</b> to win!<br>It's one of these 16 words.`, small: "Tap anywhere to start", avoid: unstruck.map(wordEl), board: true };
      case "pick": {
        const demo = p.words[5];
        return { text: coach.msg === "pickAgain" ? `<b>Tap it again</b> to pick it.` : `The <b>secret word</b> is one of these 16.<br>Pick <b>any word</b> to start: ${twice ? "<b>tap it twice</b>" : "<b>tap it</b>"},<br>then press <b>Guess</b>.`,
          target: coach.msg === "pickAgain" ? wordEl(coach.last) : wordEl(demo), double: twice && coach.msg !== "pickAgain", avoid: unstruck.map(wordEl) };
      }
      case "guess":
        return { text: `Now press <b>Guess</b>.`, target: $("dpGuess") };
      case "colors": {
        const kinds = [["correct", `<b>${cap(colorName("hit"))}</b>: right letter, right spot`], ["present", `<b>${cap(colorName("near"))}</b>: right letter, wrong spot`], ["absent", `<b>Gray</b>: not in the word`]];
        const lines = kinds.filter(([k]) => f.includes(k)).map(([k, t]) => `<span class="dp-say-line">${g.split("").filter((x, i) => f[i] === k).map(x => tile(x, k)).join("")} ${t}</span>`).join("");
        return { text: `<span class="dp-say-head">Your guess shows how close it is:</span>${lines}`, small: "Tap anywhere to go on", target: lit, focus: lit, noHand: true };
      }
      case "cross": {
        const exo = (coach.examples || []).find(x => !r.struck.includes(x.w));
        const ex = exo?.w;
        const left = coachLeft().length;
        const lead = coach.msg ? `<span class="dp-say-lead">${coach.msg}</span>` : "";
        const ask = ex
          ? `${r.struck.some(w => !r.guesses.includes(w)) ? "Another one: " : "Now <b>cross out</b> every word that can't be the secret: <b>tap it once</b>.<br>Like this one: "}${(whyOut(ex, g, f, exo.kind) || whyOut(ex, g, f)).text}.`
          : `Cross out the rest that don't fit: <b style="white-space:nowrap">${left} left</b>.`;
        // Once the examples are done: crossing out is a help, not a must.
        return { text: lead + ask, small: ex ? "" : "In a real game you don't have to cross out everything, but it helps.", target: ex ? wordEl(ex) : null, avoid: [lit, ...coachLeft().map(wordEl)], soft: unstruck.map(wordEl) };
      }
      case "auto":
        return { text: `<span class="dp-say-lead">Yes! You've got it.</span>I'll cross out the rest for you.`, small: "In a real game you don't have to cross out everything, but it helps.", avoid: [lit, ...p.words.map(wordEl)] };
      case "next": {
        if (coach.msg === "again") return { text: `<b>Tap it again</b> to pick it.`, target: wordEl(coach.last), avoid: [lit] };
        const lead = coach.msg ? `<span class="dp-say-lead">${coach.msg}</span>` : "";
        return { text: `${lead}All cleared! ${up(coach.sug)} fits everything:<br><b>tap it twice</b> to pick it.`,
          target: wordEl(coach.sug), double: true, avoid: [lit, ...unstruck.map(wordEl)] };
      }
      case "guess2":
        return { text: `Press <b>Guess</b>.`, target: $("dpGuess"), avoid: [lit] };
      case "free":
        return { text: `<b>Your turn!</b><br>Keep crossing out and guessing until you find it.`, avoid: [lit, $("dpGuess"), ...unstruck.map(wordEl)] };
      case "found":
        return { text: `<b>Found it!</b> ${PARTY}`, avoid: [lit] };
    }
    return { text: "" };
  }

  // Draws the bubble (over the screen, never moving the board) and the hand.
  function coachShow() {
    if (!coach || !$("dailyPickRoot")?.querySelector(".dp-board")) return;
    document.querySelectorAll(".dp-coach-focus").forEach(el => el.classList.remove("dp-coach-focus"));
    $("dpCoachDim")?.remove();
    $("dpCoachSplash")?.remove();
    const c = coachContent();
    const say = coachEl("dpCoachSay", "dp-coach-say dp-think");
    const hand = coachEl("dpCoachHand", "dp-coach-hand");
    if (!hand.firstChild) hand.innerHTML = HAND_HTML;
    const skip = coachEl("dpCoachSkipWrap", "dp-coach-skipwrap", $("dailyPickScreen").querySelector(".dp-head") || $("dailyPickScreen"));
    if (!skip.firstChild) skip.innerHTML = `<button type="button" class="dp-coach-skip" id="dpCoachSkip">Skip tutorial</button>`;
    const html = `<span class="dp-say-text">${c.text}</span>${c.small ? `<small>${c.small}</small>` : ""}<i class="dp-think-dot is-1"></i><i class="dp-think-dot is-2"></i>`;
    if (say.dataset.html !== html) { say.innerHTML = html; say.dataset.html = html; say.classList.remove("is-pop"); void say.offsetWidth; say.classList.add("is-pop"); }
    say.hidden = false;
    // A message (no action yet) takes taps; otherwise taps go through it.
    say.classList.toggle("is-passive", !["intro", "colors"].includes(coach.phase));
    c.focus?.classList.add("dp-coach-focus");
    const target = c.target || null;
    const tb = target?.getBoundingClientRect();
    hand.hidden = !tb || !!c.noHand;
    let handBox = null;
    if (tb && !c.noHand) {
      const x = tb.left + tb.width / 2, y = tb.top + tb.height * (target.id === "dpGuess" ? .6 : .62);
      hand.style.left = `${x}px`;
      hand.style.top = `${y}px`;
      hand.classList.toggle("is-double", !!c.double);
      handBox = { left: x - 24, right: x + 46, top: y - 6, bottom: y + 72 };
    }
    placeThink(say, target, [...(handBox ? [{ b: handBox, weight: 12 }] : [])], c.avoid, c.soft);
  }

  // Where a thought bubble goes: the spot that covers the least of what
  // matters now (the thing to tap, the hand, the feedback, words still to
  // tap), as close to the target as it can; its dots trail toward it.
  function placeThink(say, target, extra = [], avoid = [], soft = []) {
    const tb = target?.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight;
    const W = Math.min(350, vw - 16);
    const left = Math.round((vw - W) / 2);
    say.style.width = `${W}px`;
    say.style.left = `${left}px`;
    const H = say.offsetHeight;
    const boxes = [...extra];
    const add = (el, weight) => { const b = el?.getBoundingClientRect?.(); if (b && b.width) boxes.push({ b, weight }); };
    add(target, 12);
    (avoid || []).forEach(el => add(el, 5));
    (soft || []).forEach(el => add(el, 1));
    const ty = tb ? tb.top + tb.height / 2 : vh / 2;
    let best = null;
    for (let top = 8; top <= Math.max(8, vh - H - 8); top += 4) {
      let cost = 0;
      for (const { b, weight } of boxes) {
        const ix = Math.max(0, Math.min(left + W, b.right) - Math.max(left, b.left));
        const iy = Math.max(0, Math.min(top + H, b.bottom) - Math.max(top, b.top));
        cost += ix * iy * weight;
      }
      cost += Math.abs(top + H / 2 - ty) * 8;
      if (!best || cost < best.cost) best = { top, cost };
    }
    say.style.top = `${best.top}px`;
    // (only when it's close: across other things they'd point at the wrong one)
    const below = tb && tb.top > best.top + H && tb.top - (best.top + H) < 70;
    const above = tb && tb.bottom < best.top && best.top - tb.bottom < 70;
    say.classList.toggle("is-tail-down", !!below);
    say.classList.toggle("is-tail-up", !!above);
    if (tb) say.style.setProperty("--tail-x", `${Math.max(26, Math.min(W - 26, tb.left + tb.width / 2 - left))}px`);
  }

  // ---- First time on grid 2 or 3: a short tip in a thought bubble ----------
  // When the grid starts it says what its feedback means (the clock waits
  // until a tap); after the first guess there, it reads that guess's own
  // feedback. Any tap sends it off, and a tap on a word still counts.
  let tip = null; // { mode, grid, stage: "start" | "wait" | "after" }
  function tipStart(mode) {
    tip = { mode, grid: current, stage: "start" };
    stopClock();
    tipShow();
  }
  function tipClear() {
    $("dpTipSay")?.remove();
    tip = null;
  }
  function tipHide() {
    if (!tip || !$("dpTipSay")) return;
    $("dpTipSay").remove();
    if (tip.stage === "start") { tip.stage = "wait"; startClock(); } else tip = null;
  }
  function tipAfterGuess() {
    if (!tip || tip.stage !== "wait" || tip.grid !== current) return;
    if (round().solved) { tip = null; return; }
    tip.stage = "after";
    setTimeout(() => { if (tip?.stage === "after" && tip.grid === current) tipShow(); }, 650);
  }
  const countChip = (n, kind) => `<span class="dp-say-count is-${kind}">${n}</span>`;
  const splitTile = letter => `<span class="dp-say-tile" style="background:${SPLIT_FILL}">${letter.toUpperCase()}</span>`;
  function tipContent() {
    const r = round();
    const tap = "Tap anywhere to start";
    if (tip.stage === "start") {
      return tip.mode === "split"
        ? { text: `<b>Grid 2</b> gives less help:<br>${splitTile("a")} in the word, but <b>the spot isn't shown</b>.<br>${tile("e", "absent")} Gray: not in the word.`, small: tap }
        : { text: `<b>Grid 3</b> gives only counts:<br>${countChip(2, "correct")} letters in the right spot, ${countChip(1, "present")} in the wrong spot.<br>It won't say <b>which</b> letters!`, small: tap };
    }
    const g = r.guesses[0], f = feedback(g, puzzles[current].answer);
    if (tip.mode === "split") {
      const inn = [...new Set(g.split("").filter((x, i) => f[i] !== "absent"))];
      const out = [...new Set(g.split("").filter((x, i) => f[i] === "absent" && !inn.includes(x)))];
      const lines = [inn.length && `${inn.map(splitTile).join("")} ${inn.length === 1 ? "is" : "are"} in the word, somewhere`, out.length && `${out.map(x => tile(x, "absent")).join("")} ${out.length === 1 ? "isn't" : "aren't"}`].filter(Boolean);
      return { text: `${lines.join(".<br>")}.<br>Cross out the words that don't fit.`, small: "Tap anywhere to go on" };
    }
    const c = f.filter(x => x === "correct").length, p = f.filter(x => x === "present").length;
    return { text: `${up(g)} has ${countChip(c, "correct")} ${c === 1 ? "letter" : "letters"} in the right spot<br>and ${countChip(p, "present")} in the wrong spot.<br>Which ones? That's for you to work out!`, small: "Tap anywhere to go on" };
  }
  function tipShow() {
    if (!tip || !$("dailyPickRoot")?.querySelector(".dp-board")) return;
    const c = tipContent();
    let say = $("dpTipSay");
    if (!say) { say = document.createElement("div"); say.id = "dpTipSay"; say.className = "dp-coach-say dp-think is-pop is-tip"; $("dailyPickScreen").appendChild(say); }
    say.innerHTML = `<span class="dp-say-text">${c.text}</span>${c.small ? `<small>${c.small}</small>` : ""}<i class="dp-think-dot is-1"></i><i class="dp-think-dot is-2"></i>`;
    const drop = $("dpDrop");
    placeThink(say, drop, [], [document.querySelector(".dp-key-row")], [...document.querySelectorAll("#dailyPickRoot .dp-word")]);
  }

  async function startPractice(custom) {
    if (game !== "daily" || !wordList) await open("daily");
    if (!wordList) return;
    // Practice from the start screen's help: the start screen doesn't come back.
    setSplashAside();
    splashAside = false;
    $("dailyPickScreen").classList.remove("is-splash");
    closeIntro();
    closeHelp();
    closeRule();
    stopClock();
    clearTimeout(advanceTimer);
    advanceTimer = null;
    if (playMode === "daily") { dailyPuzzles = puzzles; dailyState = state; }
    tipClear();
    playMode = "practice";
    // The tutorial runs as practice; count it on its own (first time or a replay).
    track(custom ? (introSeen() ? "tutorial-replay" : "tutorial-start") : "practice");
    if (coach && !custom) coachEnd(false);
    puzzles = custom?.grids ? custom.grids.map(g => ({ answer: g.answer, words: g.words.slice(), mode: g.mode }))
      : [{ ...buildPuzzle(wordList, PRACTICE_SEED, new Set(), RECIPES[0], PRACTICE_WORDS), ...LEVELS[0] }];
    state = { date: "practice", coached: !!custom, rounds: puzzles.map(() => ({ guesses: [], struck: [], solved: false })) };
    current = 0;
    selected = "";
    render();
    startClock();
  }

  // Back to the day's puzzles exactly where they were left.
  function leavePractice() {
    coachEnd(false);
    stopClock();
    clearTimeout(advanceTimer);
    advanceTimer = null;
    playMode = "daily";
    puzzles = dailyPuzzles;
    state = dailyState;
  }

  function endPractice() {
    leavePractice();
    current = firstUnsolved();
    selected = "";
    render();
    startClock();
    maybeAnnounceRule();
  }

  // ---- Settings (top of the How to play page) ---------------------------------
  function applyColors() {
    $("dailyPickScreen")?.classList.toggle("dp-cb", !!settings.colorblind);
    $("dailyPickScreen")?.classList.toggle("dp-light", !!settings.light);
    // On its own page the whole page goes light too.
    if ("unstruckStandalone" in document.body.dataset) document.body.classList.toggle("dp-light-page", !!settings.light);
    document.querySelectorAll("#dailyPickScreen [data-c]").forEach(el => { el.textContent = colorName(el.dataset.c); });
  }

  function syncSettingsUi() {
    document.querySelectorAll('#dailyPickScreen input[name="dpTheme"]').forEach(el => { el.checked = el.value === (settings.light ? "light" : "dark"); });
    document.querySelectorAll('#dailyPickScreen input[name="dpColors"]').forEach(el => { el.checked = el.value === (settings.colorblind ? "colorblind" : "standard"); });
    document.querySelectorAll('#dailyPickScreen input[name="dpLayout"]').forEach(el => { el.checked = el.value === settings.layout; });
    document.querySelectorAll('#dailyPickScreen input[name="dpInput"]').forEach(el => { el.checked = el.value === settings.input; });
    document.querySelectorAll('#dailyPickScreen input[name="dpFirstPick"]').forEach(el => { el.checked = el.value === settings.firstPick; });
    $("dpFirstPickGroup")?.toggleAttribute("hidden", settings.input !== "tap");
    if ($("dpSetCb")) $("dpSetCb").checked = !!settings.colorblind;
    if ($("dpSetLight")) $("dpSetLight").checked = !!settings.light;
  }

  function onSettingChange(event) {
    if (event.target.name === "dpTheme" || event.target.name === "dpColors") {
      if (event.target.name === "dpTheme") settings.light = event.target.value === "light";
      else settings.colorblind = event.target.value === "colorblind";
      saveSettings();
      applyColors();
      return;
    }
    if (event.target.name === "dpFirstPick") {
      settings.firstPick = event.target.value;
      if (state && !round().guesses.length) selected = "";
      saveSettings();
      return;
    }
    if (event.target.name === "dpLayout" || event.target.name === "dpInput") {
      settings[event.target.name === "dpLayout" ? "layout" : "input"] = event.target.value;
      $("dpFirstPickGroup")?.toggleAttribute("hidden", settings.input !== "tap");
      if (settings.input === "drag") selected = "";
      saveSettings();
      return;
    }
    if (event.target.id === "dpSetCb") {
      settings.colorblind = event.target.checked;
      saveSettings();
      applyColors();
      if (state && $("dailyPickRoot") && !$("dailyPickRoot").hidden) render();
    }
    if (event.target.id === "dpSetLight") {
      settings.light = event.target.checked;
      saveSettings();
      applyColors();
    }
  }

  function close() {
    closeRule();
    closeIntro();
    closeHelp();
    stopClock();
    window.UmtGameHub?.showHub();
  }

  // First visit: a step-by-step tutorial over the grid (also from the "?"
  // page). The full rules live behind "?". The clock waits while either is open.
  const INTRO_SEEN_KEY = "umt.unstruck.tutorialSeen";
  const introOpen = () => !!$("dpIntro") && !$("dpIntro").hidden;
  let tutorialStep = 0;

  // Little tiles for the tutorial's pictures.
  const demoWord = (word, cls = "") => `<span class="dp-demo-word ${cls}">${word}</span>`;
  const demoTiles = (word, kinds) => `<span class="dp-demo-row">${[...word].map((ch, i) => `<span class="dp-tile is-${kinds[i]}">${ch}</span>`).join("")}</span>`;
  // First time: one short card. The full rules live under ?.
  const TUTORIAL = [
    () => ({
      title: "How to play",
      body: `<p class="dp-tut-lead">Find the <b>secret word</b> among the 16.</p>
        <div class="dp-demo dp-demo-cards">
          <span class="dp-word dp-demo-card is-struck"><span class="dp-card-face"><span class="dp-card-word">slate</span></span></span>
          <span class="dp-word dp-demo-card is-guessed"><span class="dp-card-face"><span class="dp-card-fb">${["c", "r", "a", "n", "e"].map((c, i) => `<i class="is-${["absent", "correct", "present", "absent", "absent"][i]}">${c}</i>`).join("")}</span></span></span>
        </div>
        <ol class="dp-tut-steps">
          <li>${settings.input === "xbtn" ? "<b>Tap</b> a word to pick it, then press <b>Guess</b>." : settings.input === "hold" ? "<b>Hold</b> a word until its circle fills to guess it." : settings.input === "tap" ? "<b>Tap</b> a word to pick it, then press <b>Guess</b>." : `<b>Drag</b> a word into the box ${settings.layout === "bottom" ? "under the grid" : "in the middle"} to guess it.`}</li>
          <li>Its letters light up: <b data-c="hit">${colorName("hit")}</b> = right spot, <b data-c="near">${colorName("near")}</b> = wrong spot, <b>gray</b> = not in the word.</li>
          <li><b>Tap</b> the words that can't be it to cross them out (tap again to bring one back), and guess again.</li>
        </ol>
        <p class="dp-tut-small">Three grids a day. Fewer guesses is better. The full rules are under <b>?</b></p>`,
      last: true
    })
  ];

  function renderTutorial() {
    const step = TUTORIAL[tutorialStep]();
    const dots = TUTORIAL.map((_, i) => `<i class="${i === tutorialStep ? "is-on" : ""}"></i>`).join("");
    const many = TUTORIAL.length > 1;
    $("dpIntroCard").innerHTML = `
      ${many ? `<div class="dp-tut-step">Step ${tutorialStep + 1} of ${TUTORIAL.length}</div>` : ""}
      <h3>${step.title}</h3>
      <div class="dp-tut-body">${step.body}</div>
      ${many ? `<div class="dp-tut-dots">${dots}</div>` : ""}
      <div class="dp-tut-nav">
        ${!many ? "" : tutorialStep ? `<button type="button" class="dp-link" data-tut="back">← Back</button>` : `<button type="button" class="dp-link" data-tut="skip">Skip</button>`}
        <button type="button" class="dp-next" data-tut="${step.last ? "done" : "next"}">${step.last ? "Let's play" : "Next →"}</button>
      </div>
      ${step.last ? `<button class="dp-link" type="button" data-practice="start">or try a practice grid first</button>` : ""}`;
  }

  function onTutorialClick(event) {
    const action = event.target.closest?.("[data-tut]")?.dataset.tut;
    if (!action) return;
    if (action === "next") tutorialStep = Math.min(tutorialStep + 1, TUTORIAL.length - 1);
    if (action === "back") tutorialStep = Math.max(tutorialStep - 1, 0);
    if (action === "skip" || action === "done") return closeIntro();
    renderTutorial();
  }
  const helpOpen = () => (!!$("dpHelp") && !$("dpHelp").hidden) || settingsOpen();
  const settingsOpen = () => !!$("dpSettings") && !$("dpSettings").hidden;

  // While Settings is open the gear becomes a red ✕, like the ? does.
  let gearIcon = null;
  function setGearButton(open) {
    const button = $("dpSettingsBtn");
    if (!button) return;
    gearIcon = gearIcon || button.innerHTML;
    button.innerHTML = open ? "✕" : gearIcon;
    button.setAttribute("aria-label", open ? "Close settings" : "Settings");
    button.classList.toggle("is-open", open);
  }

  // Settings take the grid's place, like How to play.
  function openSettings() {
    hideBanner();
    closeHelp();
    setSplashAside();
    closeIntro();
    stopClock();
    syncSettingsUi();
    $("dailyPickRoot").hidden = true;
    $("dpSettings").hidden = false;
    setGearButton(true);
  }
  function closeSettings() {
    if (!settingsOpen()) return;
    $("dpSettings").hidden = true;
    $("dailyPickRoot").hidden = false;
    setGearButton(false);
    if (state) render();
    if (bringSplashBack()) return;
    startClock();
  }

  function introSeen() {
    try { return !!localStorage.getItem(INTRO_SEEN_KEY); } catch (e) { return true; }
  }

  function openIntro() {
    stopClock();
    // From the start screen (or the help opened over it): back there afterwards.
    const back = splashAside || splashOpen();
    splashAside = false;
    closeHelp();
    stopClock(); // closing the help may have started it
    setSplashAside();
    splashAside = back;
    tutorialStep = 0;
    renderTutorial();
    $("dpIntro").hidden = false;
    $("dpIntro").querySelector("[data-tut]")?.focus({ preventScroll: true });
    try { localStorage.setItem(INTRO_SEEN_KEY, "1"); } catch (e) { /* private mode */ }
  }

  function closeIntro() {
    const intro = $("dpIntro");
    if (!intro || intro.hidden) return;
    intro.hidden = true;
    if (bringSplashBack()) return;
    startClock();
    maybeAnnounceRule();
  }

  function openHelp() {
    const help = $("dpHelp");
    if (!help) return;
    if (settingsOpen()) { $("dpSettings").hidden = true; setGearButton(false); }
    hideBanner();
    setSplashAside();
    closeIntro();
    stopClock();
    // It takes the grid's place, so the card grows to fit and nothing scrolls.
    $("dailyPickRoot").hidden = true;
    help.hidden = false;
    setHelpButton(true);
    $("dpHelpClose")?.focus({ preventScroll: true });
  }

  // The "?" becomes an ✕ while the rules are open, and closes them.
  function setHelpButton(open) {
    const button = $("dpHelpBtn");
    if (!button) return;
    button.textContent = open ? "✕" : "?";
    button.setAttribute("aria-label", open ? "Close how to play" : "How to play");
    button.classList.toggle("is-open", open);
  }

  function closeHelp() {
    const help = $("dpHelp");
    if (!help || help.hidden) return;
    help.hidden = true;
    $("dailyPickRoot").hidden = false;
    setHelpButton(false);
    if (bringSplashBack()) return;
    startClock();
  }

  // Switching apps or tabs pauses the clock; coming back resumes it.
  document.addEventListener("visibilitychange", () => {
    if (!state) return;
    if (document.hidden) stopClock();
    // Back after midnight Eastern with Unstruck still open: load the new day.
    else if (playMode === "daily" && state.date !== G().period() && $("dailyPickScreen")?.classList.contains("active")) { splashDone = false; open(); }
    else if (!(tip && tip.stage === "start" && $("dpTipSay"))) startClock(); // a grid's first tip holds the clock
  });
  window.addEventListener("pagehide", () => { if (state) stopClock(); });

  const SPLIT_CHIP = SPLIT_FILL;
  const MARKUP = `
    <div class="menu-center dp-card">
      <div class="dp-head">
        <div id="dpClock" class="dp-clock" aria-label="Time" hidden>0:00</div>
        <h2 id="dpTitle" class="menu-title">UNSTRUCK</h2>
        <div class="dp-head-buttons">
          <button id="dpSettingsBtn" class="dp-help-btn dp-gear-btn" type="button" aria-label="Settings"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1.08-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1.08 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg></button>
          <button id="dpHelpBtn" class="dp-help-btn" type="button" aria-label="How to play">?</button>
          <button id="dpBackBtn" class="dp-close" type="button" aria-label="Close"><svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg></button>
        </div>
      </div>
      <div id="dailyPickRoot"></div>
      <div id="dpIntro" class="dp-intro" role="dialog" aria-modal="true" aria-label="Welcome to Unstruck" hidden>
        <div id="dpIntroCard" class="dp-intro-card dp-tutorial"></div>
      </div>
      <div id="dpBanner" class="dp-banner" role="status" hidden></div>
      <div id="dpChoose" class="dp-intro" role="dialog" aria-modal="true" aria-label="Experimental" hidden>
        <div id="dpChooseCard" class="dp-intro-card dp-choose-card"></div>
      </div>
      <div id="dpStart" class="dp-intro dp-start" role="dialog" aria-modal="true" aria-label="Start Unstruck" hidden>
        <div id="dpStartCard" class="dp-intro-card dp-start-card"></div>
      </div>
      <div id="dpRule" class="dp-intro" role="dialog" aria-modal="true" aria-label="This grid's rule" hidden>
        <div id="dpRuleCard" class="dp-intro-card"></div>
      </div>
      <div id="dpSettings" class="dp-help dp-settings-panel" role="dialog" aria-modal="true" aria-labelledby="dpSettingsTitle" hidden>
        <h3 id="dpSettingsTitle">Settings</h3>
        <div class="dp-setting-group">
          <div class="dp-setting-label">Look</div>
          <div class="dp-seg" role="radiogroup" aria-label="Look">
            <label><input type="radio" name="dpTheme" value="dark"><span>Dark</span></label>
            <label><input type="radio" name="dpTheme" value="light"><span>Light</span></label>
          </div>
        </div>
        <div class="dp-setting-group">
          <div class="dp-setting-label">Colors</div>
          <div class="dp-seg" role="radiogroup" aria-label="Colors">
            <label><input type="radio" name="dpColors" value="standard"><span><i class="dp-sw" style="background:#3f9d4f"></i><i class="dp-sw" style="background:#c9a227"></i>Standard</span></label>
            <label><input type="radio" name="dpColors" value="colorblind"><span><i class="dp-sw" style="background:#f5793a"></i><i class="dp-sw" style="background:#3d8fd9"></i>Color-blind</span></label>
          </div>
        </div>
        <div class="dp-setting-group">
          <div class="dp-setting-label">Feedback and guessing spot</div>
          <div class="dp-seg" role="radiogroup" aria-label="Feedback and guessing spot">
            <label><input type="radio" name="dpLayout" value="middle"><span>In the middle</span></label>
            <label><input type="radio" name="dpLayout" value="bottom"><span>At the bottom</span></label>
          </div>
        </div>
        <div class="dp-setting-group">
          <div class="dp-setting-label">How to guess</div>
          <div class="dp-seg" role="radiogroup" aria-label="How to guess">
            <label><input type="radio" name="dpInput" value="drag"><span>Drag</span></label>
            <label><input type="radio" name="dpInput" value="tap"><span>Tap</span></label>
            <label><input type="radio" name="dpInput" value="hold"><span>Hold</span></label>
            <label><input type="radio" name="dpInput" value="xbtn"><span>✕ button</span></label>
          </div>
          <p class="dp-setting-note"><b>Drag:</b> tap a word to cross it out, drag it to the box to guess.<br><b>Tap:</b> tap once to cross out, twice to pick, a third time to clear, then press <b>Guess</b>.<br><b>Hold:</b> tap a word to cross it out, press and hold it until the circle fills to guess.<br><b>✕ button:</b> tap a word's red ✕ to cross it out, tap the rest of it to pick it, then press <b>Guess</b>.</p>
        </div>
        <div class="dp-setting-group" id="dpFirstPickGroup">
          <div class="dp-setting-label">First pick of a grid (Tap)</div>
          <div class="dp-seg" role="radiogroup" aria-label="First pick of a grid">
            <label><input type="radio" name="dpFirstPick" value="double"><span>Two taps</span></label>
            <label><input type="radio" name="dpFirstPick" value="single"><span>One tap</span></label>
          </div>
          <p class="dp-setting-note"><b>Two taps:</b> the first word works like every other: once crosses out, twice picks.<br><b>One tap:</b> before your first guess, a single tap picks a word.</p>
        </div>
        <button id="dpSettingsClose" class="dp-next" type="button">Done</button>
      </div>
      <div id="dpHelp" class="dp-help" role="dialog" aria-modal="true" aria-labelledby="dpHelpTitle" hidden>
        <h3 id="dpHelpTitle">How to play</h3>
        <p>Find the <b>secret word</b> among the 16.</p>
        <p><b>Tap a word twice</b> to pick it, then press <b>Guess</b>. Your guess shows how close it is. <b>Tap a word once</b> to cross it out when it can't be the secret.</p>
        <ul class="dp-help-grids">
          <li><b>Grid 1:</b> <span class="dp-help-chip" style="background:var(--dp-hit)"></span> right spot, <span class="dp-help-chip" style="background:var(--dp-near)"></span> wrong spot, <span class="dp-help-chip" style="background:var(--dp-miss)"></span> not in the word.</li>
          <li><b>Grid 2:</b> <span class="dp-help-chip" style="background:${SPLIT_CHIP}"></span> in the word, but the spot isn't shown.</li>
          <li><b>Grid 3:</b> only counts: <i class="dp-rule-count is-correct">2</i> right spot, <i class="dp-rule-count is-present">1</i> wrong spot, not which letters.</li>
        </ul>
        <p>Your score is your guesses across all three grids (par is ${DAY_PAR}). Three new grids every day.</p>
        ${EXPERIMENTAL_BUTTON && WEEKLY_ENABLED ? `<p><b>Experimental</b> (the button next to Share once you've finished the Daily) has two extras. <b>Flags · Colors · Arrows</b>, new every Monday, is three different grids: <b>Flags</b>, where each flag is split into a grid of colors; <b>Colors</b>, rows of five paints where a paint matches a tile when they have a color in common (white, red and pink all match pink); and <b>Arrows</b>, words where each letter's arrow points to the secret's letter in the alphabet. Each grid explains itself when it starts.</p>` : ""}
        ${EXPERIMENTAL_BUTTON && TWISTS_ENABLED ? `<p><b>One letter · Autopilot · Pick two</b> (also under Experimental, new every Monday): word grids with a twist. <b>One letter</b> shows feedback for just one letter per guess, in turn. In <b>Autopilot</b> the game guesses for you every 10 seconds while you strike words out, and in <b>Pick two</b> you choose between two words it offers. In both, you solve it when only the secret is left, and lose if you strike the secret out. Each grid explains itself when it starts.</p>` : ""}
        ${EXPERIMENTAL_BUTTON && SPEED_ENABLED ? `<p><b>Speed</b> (also under Experimental): 3 minutes to solve as many of the day's ${SPEED_GRIDS} grids as you can, all with full feedback. Every guess costs 2 seconds, right or wrong.</p>` : ""}
        <button id="dpHelpClose" class="dp-next" type="button">Got it</button>
        <button id="dpTutorialBtn" class="dp-link" type="button">Replay the tutorial</button>
        <button class="dp-link" type="button" data-practice="start">Play the practice grid</button>
        <div class="dp-copyright">&copy; 2026 Unstruck. All rights reserved.</div>
        ${EXPERIMENTAL_BUTTON && WEEKLY_ENABLED ? `<div class="dp-copyright">Flags: <a href="https://github.com/lipis/flag-icons" target="_blank" rel="noopener">flag-icons</a>, MIT.</div>` : ""}
      </div>
    </div>`;

  document.addEventListener("DOMContentLoaded", () => {
    const screen = $("dailyPickScreen");
    if (!screen) return;
    screen.innerHTML = MARKUP;
    applyColors();
    syncSettingsUi();
    screen.addEventListener("change", onSettingChange);
    // Practice buttons live in the pop-up, the rules page and the scorecards.
    screen.addEventListener("click", event => {
      const tab = event.target.closest?.("[data-game]");
      if (tab) {
        if (tab.dataset.game !== game || playMode === "practice") open(tab.dataset.game);
        return;
      }
      if (event.target.closest?.('[data-coach="again"]')) return startCoach();
      const past = event.target.closest?.("[data-past-day]");
      if (past) { track("past-play"); return playArchive(past.dataset.pastDay); }
      if (event.target.closest?.("[data-past]")) return openPast();
      const button = event.target.closest?.("[data-practice]");
      if (!button) return;
      if (button.dataset.practice === "start") startPractice();
      else endPractice();
    });
    const standalone = "unstruckStandalone" in document.body.dataset;
    $("hubDailyPickBtn")?.addEventListener("click", open);
    $("dpBackBtn")?.addEventListener("click", close);
    $("dpHelpBtn")?.addEventListener("click", () => ($("dpHelp") && !$("dpHelp").hidden ? closeHelp() : openHelp()));
    $("dpSettingsBtn")?.addEventListener("click", () => (settingsOpen() ? closeSettings() : openSettings()));
    $("dpSettingsClose")?.addEventListener("click", closeSettings);
    $("dpHelpClose")?.addEventListener("click", closeHelp);
    $("dpIntro")?.addEventListener("click", onTutorialClick);
    $("dpTutorialBtn")?.addEventListener("click", () => { closeHelp(); startCoach(); });
    // The coach: Skip, and a tap anywhere moves past a message.
    document.addEventListener("click", coachScreenTap, true);
    window.addEventListener("resize", () => { if (coach) coachShow(); if (tip && $("dpTipSay")) tipShow(); });
    $("dailyPickScreen").addEventListener("click", event => {
      if (!tour) return;
      if (event.target.closest?.("#dpTourSkip")) { event.stopPropagation(); tourEnd(); return; }
      const st = tour.steps[tour.i];
      if (st.tap) {
        // Only the gear goes on from here (its own handler opens Settings).
        if (event.target.closest?.("#dpSettingsBtn")) { setTimeout(() => { if (!tour) return; tour.i++; tourShow(); }, 50); return; }
        event.stopPropagation(); event.preventDefault(); const h = $("dpTourHand"); h?.classList.remove("is-nudge"); void h?.offsetWidth; h?.classList.add("is-nudge");
        return;
      }
      event.stopPropagation(); event.preventDefault();
      // Done (or the ✕) in Settings: close it and go to the goodbye.
      // (Found by position: the dim sits over the Done button.)
      const hit = el => { const b = el?.getBoundingClientRect(); return !!b && event.clientX >= b.left && event.clientX <= b.right && event.clientY >= b.top && event.clientY <= b.bottom; };
      if (st.settings && (hit($("dpSettingsClose")) || hit($("dpSettingsBtn")))) {
        document.querySelectorAll(".dp-coach-focus").forEach(el => el.classList.remove("dp-coach-focus"));
        closeSettings();
        tour.i = tour.steps.length - 1;
        tourShow();
        return;
      }
      tourNext();
    }, true);
    $("dpRuleCard")?.addEventListener("scroll", updateRuleFade, { passive: true });
    window.addEventListener("resize", updateRuleFade);
    $("dpRule")?.addEventListener("click", event => {
      if (event.target.closest("#dpRuleClose")) return $("dpRuleCard").dataset.sure ? askSure() : closeRule(); // Experimental and unusual grids ask again
      if (event.target.closest("#dpRuleYes")) return closeRule();
      if (event.target.closest("#dpRuleBack")) return unaskSure();
    });
    $("dpBanner")?.addEventListener("click", () => hideBanner(true));
    $("dpChoose")?.addEventListener("click", event => {
      if (event.target.closest("#dpChooseClose") || event.target === $("dpChoose")) closeChooser();
      else if (event.target.closest("#dpRateOpen")) openRatings();
      else if (event.target.closest("#dpRateBack")) openChooser();
      else if (event.target.closest("#dpRateBrag")) { track("ratings-shared"); shareOut(ratingsText(), event.target.closest("#dpRateBrag"), SHARE_LABEL); }
      else {
        const star = event.target.closest("[data-rate]");
        if (star) rate(star.dataset.rate, +star.dataset.stars);
      }
    });
    $("dpStart")?.addEventListener("click", event => {
      if (event.target.closest("#dpStartPlay")) { track("splash-play"); closeSplash(); }
      else if (event.target.closest("#dpStartHelp")) { track("splash-help"); openHelp(); }
    });
    // Keyboard: Enter or Space crosses a word out (or brings it back); G guesses it.
    $("dailyPickRoot")?.addEventListener("keydown", event => {
      const word = event.target.closest?.(".dp-word.is-tappable");
      if (!word) return;
      if (["Enter", " "].includes(event.key)) { event.preventDefault(); onWordClick(word.dataset.word, "strike"); }
      else if ((event.key === "g" || event.key === "G") && !ELIM_KINDS.includes(puzzles[current]?.kind)) { selected = word.dataset.word; guessSelected(); }
    });
    initDrag();
    window.addEventListener("resize", () => requestAnimationFrame(fitWords));
    document.addEventListener("keydown", event => {
      if (event.key === "Escape") { closeRule(); closeIntro(); closeHelp(); closeSettings(); closeChooser(); }
    });
    $("dailyPickRoot")?.addEventListener("submit", event => { if (event.target.id === "dpLbForm") boardSaveName(event); });
    $("dailyPickRoot")?.addEventListener("click", event => {
      if (event.target.closest?.("#dpGuess")) return guessSelected();
      // Taps on the board are handled with dragging (initDrag).
      if (event.target.closest?.(".dp-board")) return;
      const shareButton = event.target.closest?.("#dpBrag");
      if (shareButton) share(shareButton);
      if (event.target.closest?.("#dpExperimental")) openChooser();
      const day = event.target.closest?.("[data-archive-day]");
      if (day) return playArchive(day.dataset.archiveDay);
      if (event.target.closest?.("[data-archive-list]")) return showArchive();
      const retry = event.target.closest?.("[data-retry]");
      if (retry) return open(retry.dataset.retry);
      const pick = event.target.closest?.("[data-pick]");
      if (pick && !round().solved) { selected = pick.dataset.pick; guessSelected(); }
      const view = event.target.closest?.("[data-view]");
      if (view && view.dataset.view !== summaryView) {
        // Both views are always on the page, stacked in the same space, so
        // switching just swaps which one shows and nothing below moves.
        summaryView = view.dataset.view;
        document.querySelectorAll("#dailyPickScreen [data-view]").forEach(b => b.classList.toggle("is-on", b.dataset.view === summaryView));
        document.querySelectorAll("#dailyPickScreen [data-pane]").forEach(pane => pane.dataset.pane === summaryView ? pane.removeAttribute("aria-hidden") : pane.setAttribute("aria-hidden", "true"));
        if (summaryView === "board") { track("board-open"); boardRender(); boardLoad(); }
      }
    });
    // ?reset in the address starts this device's current day (and week) over:
    // saved progress and the current period's results, for every game.
    if (new URLSearchParams(location.search).has("reset")) {
      try {
        for (const key of Object.keys(GAMES)) {
          if (key === "archive") continue;
          const g = GAMES[key];
          localStorage.removeItem(g.storeKey);
          const hist = JSON.parse(localStorage.getItem(g.historyKey) || "null");
          if (hist && hist[g.period()]) { delete hist[g.period()]; localStorage.setItem(g.historyKey, JSON.stringify(hist)); }
        }
        window.history.replaceState(null, "", location.pathname + location.hash);
      } catch (e) { /* storage blocked */ }
    }
    // On its own page there's nothing to close back to, so it just starts.
    if (standalone) {
      $("dpBackBtn").remove();
      if (ARCHIVE) showArchive();
      else open();
    }
  });
}());
