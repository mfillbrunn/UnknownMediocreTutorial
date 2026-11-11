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
  const WEEKLY_KINDS = ["flags", "animals", "food"];
  // Switches the Weekly (Daily/Weekly tabs, Weekly rules and credits) on or
  // off; keep it in step with WEEKLY in scripts/build-unstruck.js.
  const WEEKLY_ENABLED = false;

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
  const slots = { daily: { puzzles: null, state: null }, weekly: { puzzles: null, state: null } };
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
  let settings = { colorblind: false };
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
      storeKey: "umt.unstruck.weekly.v2", historyKey: "umt.unstruck.weeklyHistory", par: DAY_PAR, step: 7,
      period: () => weekStart(today()), number: weekNumber, title: "Unstruck Weekly", unit: "week", scoreLabel: "guesses this week",
      next: () => msUntilNextWeek(), nextLabel: "Next Weekly in"
    }
  };
  const G = () => GAMES[game];

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
  function buildPuzzle(list, seed, taken, recipe) {
    const rand = mulberry32(hash(seed));
    const key = w => countsOf(w).join("");
    const free = list.filter(w => !taken.has(w));
    for (let attempt = 0; attempt < 50; attempt++) {
      const start = free[Math.floor(rand() * free.length)];
      const chain = [start];
      const used = new Set([key(start)]);
      let tip = start;
      let stuck = 0;
      while (chain.length < WORD_COUNT && stuck < WORD_COUNT) {
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
      if (chain.length === WORD_COUNT) {
        const answer = chain[Math.floor(rand() * chain.length)];
        return { answer, words: shuffle(chain, rand), recipe: recipe.name };
      }
    }
    // Never seen in testing, but a recipe that can't fill a grid falls back
    // to random words rather than leaving the day unplayable.
    if (recipe !== RECIPES[RECIPES.length - 1]) return buildPuzzle(list, `${seed}:fallback`, taken, RECIPES[RECIPES.length - 1]);
    throw new Error("Unstruck: couldn't build a grid");
  }

  function buildDay(pool, date) {
    const list = [...new Set(pool.filter(w => /^[a-z]{5}$/.test(w)))].sort();
    // Every word on the day's three grids is different, not just the answers.
    const taken = new Set();
    return Array.from({ length: PUZZLE_COUNT }, (_, i) => {
      const level = Math.min(i, LEVELS.length - 1);
      const seed = `griddle-4:${date}:${i + 1}`;
      const recipe = pickRecipe(mulberry32(hash(`${seed}:recipe`)));
      const puzzle = buildPuzzle(list, seed, taken, recipe);
      puzzle.words.forEach(w => taken.add(w));
      return { ...puzzle, ...LEVELS[level] };
    });
  }

  // The Weekly: one grid per kind of picture. Sixteen pictures whose color
  // grids all differ (some flags look the same once reduced), and a secret.
  const KIND_INFO = {
    flags: { label: "Flags", noun: "flag" },
    animals: { label: "Animals", noun: "animal" },
    food: { label: "Food", noun: "food" }
  };

  function buildWeek(cat, date) {
    // A kind only plays once it has enough distinct pictures for a grid.
    const ready = WEEKLY_KINDS.filter(kind => new Set((cat[kind]?.items || []).map(item => item.cells)).size >= WORD_COUNT);
    return ready.map((kind, i) => {
      const rand = mulberry32(hash(`unstruck-weekly-1:${date}:${kind}`));
      const seen = new Set();
      const picks = [];
      for (const item of shuffle(cat[kind].items, rand)) {
        if (picks.length === WORD_COUNT) break;
        if (seen.has(item.cells)) continue;
        seen.add(item.cells);
        picks.push(item.id);
      }
      const answer = picks[Math.floor(rand() * picks.length)];
      return { kind, answer, words: picks, mode: "full", number: i + 1 };
    });
  }

  const itemOf = (kind, id) => catalog[kind].byId[id];
  // The thing a puzzle's tile shows by name: the word, or the picture's name.
  const labelOf = (puzzle, id) => (puzzle.kind ? itemOf(puzzle.kind, id).name : id.toUpperCase());

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
    try { window.goatcounter?.count?.({ path: `unstruck-${game === "weekly" ? "weekly-" : ""}${name}`, title: title || name, event: true }); } catch (e) { /* never break the game */ }
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
    history[state.date] = { score: totalGuesses(), time: Math.round(elapsed()), grids: state.rounds.map(r => r.guesses.length) };
    track("finished", golfTerm(totalGuesses() - G().par));
    try { localStorage.setItem(G().historyKey, JSON.stringify(history)); } catch (e) { /* private mode */ }
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
  const totalGuesses = () => state.rounds.reduce((sum, r) => sum + r.guesses.length, 0);

  const elapsed = () => (state.elapsed || 0) + (runningSince ? Date.now() - runningSince : 0);
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
    clock.hidden = allSolved() && !advanceTimer;
    clock.textContent = formatTime(elapsed());
  }

  function startClock() {
    if (runningSince || allSolved() || !$("dailyPickScreen")?.classList.contains("active") || helpOpen() || introOpen() || ruleOpen()) return;
    runningSince = Date.now();
    ticker = setInterval(showClock, 250);
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
    const number = state ? ` <span class="dp-title-grid">#${G().number(state.date)}</span>` : "";
    const kind = game === "weekly" && grid ? KIND_INFO[puzzles[grid - 1].kind].label : "Grid";
    if (playMode === "practice") title.innerHTML = `Unstruck <span class="dp-title-grid">Practice</span>`;
    else title.innerHTML = grid ? `Unstruck <span class="dp-title-grid">${kind} ${grid}/${puzzles.length}</span>` : `Unstruck${number}`;
    document.querySelectorAll("#dailyPickScreen .dp-tab").forEach(tab => tab.classList.toggle("is-on", tab.dataset.game === game));
  }

  let countdownTimer = null;

  // Past results by how they went against par, for the scorecard's chart.
  const BUCKETS = [
    { label: "Eagle or better", test: d => d <= -2 },
    { label: "Birdie", test: d => d === -1 },
    { label: "Par", test: d => d === 0 },
    { label: "Bogey", test: d => d === 1 },
    { label: "Double bogey", test: d => d === 2 },
    { label: "Triple bogey +", test: d => d >= 3 }
  ];

  function distributionChart(todayDiff) {
    const history = loadHistory();
    const counts = BUCKETS.map(bucket => Object.values(history).filter(day => bucket.test(day.score - G().par)).length);
    const most = Math.max(1, ...counts);
    const rows = BUCKETS.map((bucket, i) => {
      const mine = bucket.test(todayDiff);
      const width = Math.max(8, Math.round(100 * counts[i] / most));
      return `<div class="dp-dist-row${mine ? " is-today" : ""}"><span class="dp-dist-label">${bucket.label}</span>
        <span class="dp-dist-track"><span class="dp-dist-bar" style="width:${counts[i] ? width : 0}%"></span><b>${counts[i]}</b></span></div>`;
    }).join("");
    return `<div class="dp-dist"><div class="dp-dist-title">Your scores</div>${rows}</div>`;
  }

  function renderPracticeSummary(root) {
    setTitle(0);
    const n = state.rounds[0].guesses.length;
    root.innerHTML = `<div class="dp-summary">
      <div class="dp-verdict">Practice solved!</div>
      <div class="dp-verdict-sub">${n} ${n === 1 ? "guess" : "guesses"} · ${formatTime(elapsed())} · doesn't count toward your stats</div>
      <button type="button" class="dp-next dp-share" data-practice="start">Play it again</button>
      <button type="button" class="dp-next" data-practice="end">Today's Unstruck →</button>
    </div>`;
  }

  function renderSummary(root) {
    if (playMode === "practice") return renderPracticeSummary(root);
    recordDay();
    setTitle(0);
    const stats = computeStats();
    const stat = (value, label) => `<div class="dp-stat"><b>${value}</b><span>${label}</span></div>`;
    const diff = totalGuesses() - G().par;
    const gridName = i => (game === "weekly" ? KIND_INFO[puzzles[i].kind].label : `Grid ${i + 1}`);
    // Today's guesses lead: the total, big, then each grid as its own card.
    const grids = state.rounds.map((r, i) => {
      const n = r.guesses.length;
      return `<div class="dp-grid-score"><span class="dp-grid-name">${gridName(i)}</span>
        <b>${n}</b><span class="dp-grid-unit">${n === 1 ? "Hole in one!" : "guesses"}</span></div>`;
    }).join("");
    // The score and Share come first, so sharing never needs a scroll.
    root.innerHTML = `<div class="dp-summary">
      <div class="dp-score">
        <div class="dp-score-num">${totalGuesses()}</div>
        <div class="dp-score-label">${G().scoreLabel}</div>
        <div class="dp-score-verdict">${golfTerm(diff)} <span>(${relToPar(diff)}) · par ${G().par} · ${formatTime(elapsed())}</span></div>
      </div>
      <div class="dp-grid-scores">${grids}</div>
      <button type="button" class="dp-next dp-share" id="dpShare">Share</button>
      <div class="dp-stats-title">Your stats</div>
      <div class="dp-stats">
        ${stat(stats.played, "Played")}
        ${stat(stats.current, "Streak")}
        ${stat(stats.best, "Best streak")}
        ${stat(stats.average ? stats.average.toFixed(1) : "–", "Average")}
        ${stat(stats.bestScore || "–", "Best score")}
      </div>
      ${distributionChart(diff)}
      <div class="dp-countdown">${G().nextLabel} <b id="dpCountdown">${formatCountdown(G().next())}</b></div>
      ${game === "daily" ? `<button type="button" class="dp-link" data-practice="start">Play the practice grid</button>` : `<button type="button" class="dp-link" data-game="daily">Play today's Daily →</button>`}
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
      clearInterval(countdownTimer);
      open();
      return;
    }
    label.textContent = formatCountdown(G().next());
  }

  function render() {
    const root = $("dailyPickRoot");
    if (!root) return;
    showClock();
    if (allSolved() && !advanceTimer) return renderSummary(root);
    clearInterval(countdownTimer);
    setTitle(current + 1);
    const puzzle = puzzles[current];
    const { answer: secret, words, mode, kind } = puzzle;
    const pics = !!kind;
    const info = pics ? catalog[kind] : null;
    const r = round();
    const lastGuess = r.guesses[r.guesses.length - 1];
    const done = r.solved;
    // What's compared: a word's letters, or a picture's color cells.
    const code = id => (pics ? itemOf(kind, id).cells : id);
    const name = id => labelOf(puzzle, id);
    // What a guess reveals under this grid's rule, letter (or cell) by letter.
    const compare = (g, a) => (pics ? colorFeedback(g, a) : feedback(g, a));
    const shownResult = guess => compare(code(guess), code(secret)).map(f => (mode === "split" && guess !== secret && f !== "absent" ? "in" : f));
    const counts = guess => {
      const result = compare(code(guess), code(secret));
      return [result.filter(f => f === "correct").length, result.filter(f => f === "present").length];
    };
    // A guessed word carries its own feedback in miniature, so all the
    // evidence stays on the board.
    const mini = guess => {
      if (pics) return `<span class="dp-mini dp-mini-grid" style="--cols:${info.cols}">${shownResult(guess).map(f => `<i class="is-${f}"></i>`).join("")}</span>`;
      if (mode === "counts") {
        const [g, y] = counts(guess);
        return `<span class="dp-mini"><i class="is-correct is-count">${g}</i><i class="is-present is-count">${y}</i></span>`;
      }
      return `<span class="dp-mini">${shownResult(guess).map(f => `<i class="is-${f}"></i>`).join("")}</span>`;
    };
    const face = id => (pics
      ? `<img class="dp-pic" src="${MEDIA_URL}${itemOf(kind, id).img}" alt="" draggable="false"><span class="dp-pic-name">${name(id)}</span>`
      : id);

    const buttons = words.map(word => {
      const struck = r.struck.includes(word);
      const guessed = r.guesses.includes(word);
      // Words already guessed stay struck for good, so they can't be tapped.
      const disabled = done || guessed;
      const won = done && word === secret;
      const snap = toggled && toggled.word === word ? ` just-${toggled.kind}` : "";
      const fresh = revealing && word === lastGuess ? " just-guessed" : "";
      const classes = `dp-word${won ? " is-solved" : struck ? " is-struck" : ""}${guessed && !won ? " is-guessed" : ""}${word === selected ? " is-selected" : ""}${snap}${fresh}`;
      return `<button type="button" class="${classes}" data-word="${word}"${disabled ? " disabled" : ""} aria-label="${name(word)}">${face(word)}${guessed && !won ? mini(word) : ""}</button>`;
    }).join("");

    const SPLIT_TILE = SPLIT_FILL;
    const swatch = (color, label, round) =>
      `<span><i class="${round ? "is-round" : ""}" style="background:${color}"></i>${label}</span>`;
    const key = pics
      ? swatch("var(--dp-hit)", "Same color, same spot") + swatch("var(--dp-near)", "Color is elsewhere") + swatch("#555b63", "Color not in it")
      : {
        full: swatch("var(--dp-hit)", "Right spot") + swatch("var(--dp-near)", "Wrong spot") + swatch("#555b63", "Not in word"),
        split: swatch(SPLIT_TILE, "In the word (any spot)") + swatch("#555b63", "Not in word"),
        counts: swatch("var(--dp-hit)", "How many in the right spot", true) + swatch("var(--dp-near)", "How many in the wrong spot", true)
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
    const blank = pics ? "" : `<div class="dp-row">${"<span class=\"dp-tile is-empty\"></span>".repeat(5)}</div>`;
    const noun = pics ? KIND_INFO[kind].noun : "word";
    let hint;
    let action = "";
    if (done) {
      hint = `<strong class="dp-result${revealing ? " is-new" : ""}">Solved in ${r.guesses.length}!</strong> ${allSolved() ? "" : "Next grid…"}`;
    } else {
      const aNoun = /^[aeiou]/.test(noun) ? `an ${noun}` : `a ${noun}`;
      // The tutorial covers tapping, so after the first guess there's no hint.
      hint = r.guesses.length ? "" : `Tap ${noun === "food" ? "one" : aNoun} to pick your first guess`;
      action = `<button type="button" class="dp-next" id="dpGuess"${selected ? "" : " disabled"}>${selected ? `Guess ${pics ? name(selected) : selected.toUpperCase()}` : "Guess"}</button>`;
    }
    // Keeps the panel the same height once the button is gone.
    if (!action) action = `<button type="button" class="dp-next" tabindex="-1" aria-hidden="true" style="visibility:hidden">&nbsp;</button>`;

    const exit = playMode === "practice" ? `<button type="button" class="dp-link" data-practice="end">← Back to today's Unstruck</button>` : "";
    root.innerHTML = `<div class="dp-board${pics ? ` is-pics is-${kind}` : ""}" style="${pics ? `--ratio:${info.ratio}` : ""}">${buttons}</div>
      <div class="dp-center">${lastGuess ? tiles(lastGuess) : blank}<div class="dp-key">${key}</div><div class="dp-hint">${hint}</div>${action}</div>${exit}`;
  }

  function onWordClick(word) {
    const r = round();
    if (r.solved || r.guesses.includes(word)) return;
    const struckAt = r.struck.indexOf(word);
    if (!r.guesses.length) {
      // Nothing to rule out yet, so the first guess of a grid is a plain pick:
      // one tap picks a word (dropping any other pick), a second tap clears it.
      selected = selected === word ? "" : word;
      toggled = { word, kind: selected ? "selected" : "freed" };
    } else if (word === selected) {
      // third tap: back to normal
      selected = "";
      toggled = { word, kind: "freed" };
    } else if (struckAt >= 0) {
      // second tap: from struck out to picked (any earlier pick goes back to normal)
      r.struck.splice(struckAt, 1);
      selected = word;
      toggled = { word, kind: "selected" };
    } else {
      // first tap: strike it out
      r.struck.push(word);
      toggled = { word, kind: "struck" };
      navigator.vibrate?.(8); // the faintest tick, on phones that support it
    }
    save();
    render();
    toggled = null;
  }

  function guessSelected() {
    const r = round();
    if (!selected || r.solved) return;
    if (playMode === "daily" && totalGuesses() === 0) track("started");
    r.guesses.push(selected);
    if (selected === puzzles[current].answer) {
      r.solved = true;
      if (allSolved()) stopClock();
      advanceTimer = setTimeout(nextPuzzle, ADVANCE_MS);
    } else if (!r.struck.includes(selected)) {
      r.struck.push(selected);
    }
    selected = "";
    save();
    revealing = true;
    render();
    revealing = false;
  }

  // Three short lines: the result, each grid's guesses with time and
  // streak, and the link (without https://, which apps add back anyway).
  //   Unstruck #5: Birdie, 6 guesses (−1)
  //   🟩 2 · 3 · 1  ⏱ 2:41  🔥 3
  //   play.unstruck.workers.dev
  function shareText() {
    const diff = totalGuesses() - G().par;
    const streak = computeStats().current;
    const grids = state.rounds.map(r => r.guesses.length).join(" · ");
    const link = (location.host + location.pathname).replace(/index\.html$/, "").replace(/\/$/, "");
    return [
      `${G().title} #${G().number(state.date)}: ${golfTerm(diff)}, ${totalGuesses()} guesses (${relToPar(diff)})`,
      `${settings.colorblind ? "🟧" : "🟩"} ${grids}  ⏱ ${formatTime(elapsed())}${streak > 1 ? `  🔥 ${streak}` : ""}`,
      link
    ].join("\n");
  }

  // The phone's own share sheet (WhatsApp, Messages, Instagram, ...) where
  // there is one; otherwise the result is copied for pasting anywhere.
  async function share(button) {
    track("shared");
    const text = shareText();
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
    setTimeout(() => { button.textContent = "Share"; }, 2500);
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
    current = firstUnsolved();
    selected = "";
    render();
    maybeAnnounceRule();
  }

  // ---- A new grid's rule ---------------------------------------------------
  // Grids 2 and 3 change what the feedback shows, so as each starts a short
  // card says how, once per day. The clock waits while it's up.
  const RULES = {
    split: () => `Letters in the word show <span class="dp-help-chip" style="background:${SPLIT_FILL}"></span> half ${colorName("hit")}, half ${colorName("near")} &ndash; you won't know if they're in the right spot. Gray means not in the word.`,
    counts: () => `You only see <i class="dp-rule-count is-correct">2</i> how many letters are in the right spot and <i class="dp-rule-count is-present">1</i> how many are in the wrong spot &ndash; not which ones.`
  };
  const ruleOpen = () => !!$("dpRule") && !$("dpRule").hidden;

  // The first time anyone opens the Weekly: how picture feedback works.
  const WEEKLY_INTRO_KEY = "umt.unstruck.weeklyIntroSeen";
  function maybeAnnounceWeekly() {
    try { if (localStorage.getItem(WEEKLY_INTRO_KEY)) return; localStorage.setItem(WEEKLY_INTRO_KEY, "1"); } catch (e) { return; }
    stopClock();
    const demo = ["absent", "correct", "correct", "present", "absent", "correct"].map(f => `<span class="dp-cell is-${f}"></span>`).join("");
    $("dpRuleCard").innerHTML = `<div class="dp-rule-grid">The Weekly</div>
      <p>Three grids of pictures, new every Monday: <b>flags</b>, <b>animals</b> and <b>food</b>.</p>
      <p>Each picture is split into a grid of colors. Guess one, and each cell of the feedback shows how that color compares with the secret picture:</p>
      <div class="dp-demo"><span class="dp-fb-grid is-demo" style="--cols:3">${demo}</span></div>
      <p><b data-c="hit">${colorName("hit")}</b>: same color in the same spot. <b data-c="near">${colorName("near")}</b>: that color is somewhere else in it. <b>Gray</b>: the secret has none of that color.</p>
      <button id="dpRuleClose" class="dp-next" type="button">Got it</button>`;
    $("dpRule").hidden = false;
    $("dpRuleClose").focus({ preventScroll: true });
  }

  function maybeAnnounceRule() {
    if (game === "weekly") return maybeAnnounceWeekly();
    const r = round();
    const rule = RULES[puzzles[current].mode]?.();
    state.announced = state.announced || [];
    if (playMode !== "daily" || !rule || r.guesses.length || state.announced[current] || allSolved()) return;
    state.announced[current] = true;
    save();
    stopClock();
    $("dpRuleCard").innerHTML = `<div class="dp-rule-grid">Grid ${current + 1} of ${PUZZLE_COUNT}</div>
      <p>${rule}</p>
      <button id="dpRuleClose" class="dp-next" type="button">Got it</button>`;
    $("dpRule").hidden = false;
    $("dpRuleClose").focus({ preventScroll: true });
  }

  function closeRule() {
    if (!ruleOpen()) return;
    $("dpRule").hidden = true;
    startClock();
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
      if (which === "daily") {
        if (!wordList) {
          const text = await (await fetch(WORDS_URL)).text();
          wordList = [...new Set(text.split(/\s+/).map(w => w.toLowerCase()).filter(w => /^[a-z]{5}$/.test(w)))].sort();
        }
        slot.state = load();
        slot.puzzles = buildDay(wordList, period);
      } else {
        if (!catalog) {
          catalog = await (await fetch(`${MEDIA_URL}weekly.json`)).json();
          for (const kind of WEEKLY_KINDS) catalog[kind].byId = Object.fromEntries(catalog[kind].items.map(item => [item.id, item]));
        }
        slot.puzzles = buildWeek(catalog, period);
        slot.state = load(slot.puzzles.length);
      }
    } finally {
      game = previous;
    }
  }

  async function open(which = game) {
    if (!WEEKLY_ENABLED) which = "daily";
    if (playMode === "practice") leavePractice();
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
      root.textContent = "Couldn't load the puzzles. Please try again.";
      return;
    }
    game = which;
    ({ puzzles, state } = slots[which]);
    current = firstUnsolved();
    selected = "";
    render();
    if (game === "daily" && !introSeen()) openIntro();
    else startClock();
    maybeAnnounceRule();
  }

  // ---- Practice grid ----------------------------------------------------------
  async function startPractice() {
    if (game !== "daily" || !wordList) await open("daily");
    if (!wordList) return;
    closeIntro();
    closeHelp();
    closeRule();
    stopClock();
    clearTimeout(advanceTimer);
    advanceTimer = null;
    if (playMode === "daily") { dailyPuzzles = puzzles; dailyState = state; }
    playMode = "practice";
    track("practice");
    puzzles = [{ ...buildPuzzle(wordList, PRACTICE_SEED, new Set(), RECIPES[0]), ...LEVELS[0] }];
    state = { date: "practice", rounds: [{ guesses: [], struck: [], solved: false }] };
    current = 0;
    selected = "";
    render();
    startClock();
  }

  // Back to the day's puzzles exactly where they were left.
  function leavePractice() {
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
    document.querySelectorAll("#dailyPickScreen [data-c]").forEach(el => { el.textContent = colorName(el.dataset.c); });
  }

  function syncSettingsUi() {
    if ($("dpSetCb")) $("dpSetCb").checked = !!settings.colorblind;
  }

  function onSettingChange(event) {
    if (event.target.id === "dpSetCb") {
      settings.colorblind = event.target.checked;
      saveSettings();
      applyColors();
      if (state && $("dailyPickRoot") && !$("dailyPickRoot").hidden) render();
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
  const TUTORIAL = [
    () => ({
      title: "Welcome to Unstruck",
      body: `<p>Each grid has <b>16 words</b>. One of them is the <b>secret word</b>.</p>
        <p>Find it in as few guesses as you can. There are <b>3 grids</b> a day, and your score is the total number of guesses (par is 7).</p>`
    }),
    () => ({
      title: "Your first guess",
      body: `<p>You start with nothing to go on, so just <b>tap a word</b> to pick it, then press <b>Guess</b>.</p>
        <div class="dp-demo">${demoWord("CRANE", "is-selected")} <span class="dp-demo-arrow">→</span> <span class="dp-demo-btn">Guess CRANE</span></div>
        <p>Lucky? It was the secret and you're done in one. If not, you get feedback.</p>`
    }),
    () => ({
      title: "Reading the feedback",
      body: `<p>Feedback compares your guess with the secret word:</p>
        <div class="dp-demo">${demoTiles("CRANE", ["absent", "correct", "present", "absent", "absent"])}</div>
        <p><b>${colorName("hit")}</b>: right letter, right spot. <b>${colorName("near")}</b>: in the word, wrong spot. <b>Gray</b>: not in the word.</p>
        <p>Use it to work out which words <b>can't</b> be the secret.</p>`
    }),
    () => ({
      title: "Tapping words",
      body: `<p>After your first guess, each tap moves a word along:</p>
        <div class="dp-demo dp-demo-flow">
          <span class="dp-flow-tile">${demoWord("SLATE")}<small>start</small></span>
          <span class="dp-flow-arrow"><b>→</b><small>tap</small></span>
          <span class="dp-flow-tile">${demoWord("SLATE", "is-struck")}<small>struck out</small></span>
          <span class="dp-flow-arrow"><b>→</b><small>tap</small></span>
          <span class="dp-flow-tile">${demoWord("SLATE", "is-selected")}<small>picked</small></span>
          <span class="dp-flow-arrow"><b>→</b><small>tap</small></span>
          <span class="dp-flow-tile">${demoWord("SLATE")}<small>cleared</small></span>
        </div>
        <p>Strike out the words the feedback rules out. When you've <b>picked</b> a word, press <b>Guess</b> to submit it.</p>
        <p>Only one word can be picked: picking a second word resets the first.</p>`
    }),
    () => ({
      title: "Grid 2: less to go on",
      body: `<p>Letters in the word show <b>half ${colorName("hit")}, half ${colorName("near")}</b>, so you don't learn whether they're in the right spot.</p>
        <div class="dp-demo">${demoTiles("CRANE", ["absent", "in", "in", "absent", "absent"])}</div>
        <p>Gray still means not in the word.</p>`
    }),
    () => ({
      title: "Grid 3: just counts",
      body: `<p>You only see <b>how many</b> letters are in the right spot and how many are in the wrong spot, not which ones.</p>
        <div class="dp-demo"><span class="dp-demo-row"><span class="dp-plain-word">CRANE</span>
          <span class="dp-tile is-correct dp-count-tile">1</span><span class="dp-tile is-present dp-count-tile">1</span></span></div>
        <p>Here 1 letter is right where it should be and 1 is in the word but elsewhere.</p>`
    }),
    () => ({
      title: "Ready?",
      body: `<p>Fewer guesses and a faster time make a better score. Share it with friends when you're done!</p>
        <p>The full rules are always under <b>?</b>.</p>`,
      last: true
    })
  ];

  function renderTutorial() {
    const step = TUTORIAL[tutorialStep]();
    const dots = TUTORIAL.map((_, i) => `<i class="${i === tutorialStep ? "is-on" : ""}"></i>`).join("");
    $("dpIntroCard").innerHTML = `
      <div class="dp-tut-step">Step ${tutorialStep + 1} of ${TUTORIAL.length}</div>
      <h3>${step.title}</h3>
      <div class="dp-tut-body">${step.body}</div>
      <div class="dp-tut-dots">${dots}</div>
      <div class="dp-tut-nav">
        ${tutorialStep ? `<button type="button" class="dp-link" data-tut="back">← Back</button>` : `<button type="button" class="dp-link" data-tut="skip">Skip</button>`}
        <button type="button" class="dp-next" data-tut="${step.last ? "done" : "next"}">${step.last ? "Play" : "Next →"}</button>
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
  const helpOpen = () => !!$("dpHelp") && !$("dpHelp").hidden;

  function introSeen() {
    try { return !!localStorage.getItem(INTRO_SEEN_KEY); } catch (e) { return true; }
  }

  function openIntro() {
    stopClock();
    closeHelp();
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
    startClock();
  }

  function openHelp() {
    const help = $("dpHelp");
    if (!help) return;
    closeIntro();
    stopClock();
    // It takes the grid's place, so the card grows to fit and nothing scrolls.
    $("dailyPickRoot").hidden = true;
    help.hidden = false;
    $("dpHelpClose")?.focus({ preventScroll: true });
  }

  function closeHelp() {
    const help = $("dpHelp");
    if (!help || help.hidden) return;
    help.hidden = true;
    $("dailyPickRoot").hidden = false;
    startClock();
  }

  // Switching apps or tabs pauses the clock; coming back resumes it.
  document.addEventListener("visibilitychange", () => {
    if (!state) return;
    if (document.hidden) stopClock();
    // Back after midnight Eastern with Unstruck still open: load the new day.
    else if (playMode === "daily" && state.date !== G().period() && $("dailyPickScreen")?.classList.contains("active")) open();
    else startClock();
  });
  window.addEventListener("pagehide", () => { if (state) stopClock(); });

  const SPLIT_CHIP = SPLIT_FILL;
  const MARKUP = `
    <div class="menu-center dp-card">
      <div class="dp-head">
        <div id="dpClock" class="dp-clock" aria-label="Time" hidden>0:00</div>
        <h2 id="dpTitle" class="menu-title">UNSTRUCK</h2>
        <div class="dp-head-buttons">
          <button id="dpHelpBtn" class="dp-help-btn" type="button" aria-label="How to play">?</button>
          <button id="dpBackBtn" class="dp-close" type="button" aria-label="Close"><svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg></button>
        </div>
      </div>
      ${WEEKLY_ENABLED ? `      <div class="dp-tabs" role="tablist">
        <button type="button" class="dp-tab is-on" data-game="daily" role="tab">Daily</button>
        <button type="button" class="dp-tab" data-game="weekly" role="tab">Weekly</button>
      </div>` : ""}
      <div id="dailyPickRoot"></div>
      <div id="dpIntro" class="dp-intro" role="dialog" aria-modal="true" aria-label="Welcome to Unstruck" hidden>
        <div id="dpIntroCard" class="dp-intro-card dp-tutorial"></div>
      </div>
      <div id="dpRule" class="dp-intro" role="dialog" aria-modal="true" aria-label="This grid's rule" hidden>
        <div id="dpRuleCard" class="dp-intro-card"></div>
      </div>
      <div id="dpHelp" class="dp-help" role="dialog" aria-modal="true" aria-labelledby="dpHelpTitle" hidden>
        <div class="dp-settings">
          <label class="dp-switch"><input type="checkbox" id="dpSetCb"><span class="dp-switch-ui"></span><span>Color-blind colors</span></label>
        </div>
        <h3 id="dpHelpTitle">How to play</h3>
        <p>You get a grid of 16 five-letter words, and one of them is the secret word you have to find. To do that, you start by picking one word; if it's already the correct one, lucky &ndash; you've solved the grid! If not, you'll get feedback on how the word you picked compares against the secret word.</p>
        <p>You then use that info to eliminate words that don't match and narrow down the possible solutions before picking your next word; rinse and repeat.</p>
        <p>For your first guess in each grid, a single tap picks a word. After that, tapping a word once strikes it out, twice picks it as your next guess, and a third time clears it. Picking another word resets the first one. Press <b>Guess</b> to submit your pick.</p>
        <p>There are three new grids every day, and they differ in what feedback you get:</p>
        <ul>
          <li>In the first grid, each letter is
            <span class="dp-help-chip" style="background:var(--dp-hit)"></span> <span data-c="hit">green</span> (correct letter and position),
            <span class="dp-help-chip" style="background:var(--dp-near)"></span> <span data-c="near">yellow</span> (letter is in the word but not in that position), or
            <span class="dp-help-chip" style="background:#555b63"></span> gray (letter not in the word at all).</li>
          <li>In the second grid, a letter that's in the word is
            <span class="dp-help-chip" style="background:${SPLIT_CHIP}"></span> half <span data-c="hit">green</span>, half <span data-c="near">yellow</span> &ndash; so you don't find out whether it's in the right position. Letters not in the word are gray.</li>
          <li>In the third grid, you only see how many letters are <span data-c="hit">green</span> and how many are <span data-c="near">yellow</span> (say, 1 <span data-c="hit">green</span> and 2 <span data-c="near">yellow</span>), but not which ones.</li>
        </ul>
        ${WEEKLY_ENABLED ? `<p><b>The Weekly</b> (new every Monday) works the same way with pictures: flags, animal emoji and food emoji. Each picture is split into a grid of colors. A cell is <span data-c="hit">green</span> if the secret has the same color in the same spot, <span data-c="near">yellow</span> if that color is somewhere else in it, and gray if the secret doesn't have that color at all.</p>` : ""}
        <p>The total number of guesses across all three grids is your score (par is 7), and the time you took is recorded too. So the fewer guesses and the shorter the time, the better!</p>
        <p>Want to warm up first? The practice grid is the same for everyone and doesn't count toward your stats.</p>
        <button id="dpHelpClose" class="dp-next" type="button">Got it</button>
        <button id="dpTutorialBtn" class="dp-link" type="button">Replay the tutorial</button>
        <button class="dp-link" type="button" data-practice="start">Play the practice grid</button>
        <div class="dp-copyright">&copy; 2026 Unstruck. All rights reserved.</div>
        ${WEEKLY_ENABLED ? `<div class="dp-copyright">Emoji graphics: <a href="https://github.com/jdecked/twemoji" target="_blank" rel="noopener">Twemoji</a>, CC-BY 4.0. Flags: <a href="https://github.com/lipis/flag-icons" target="_blank" rel="noopener">flag-icons</a>, MIT.</div>` : ""}
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
      const button = event.target.closest?.("[data-practice]");
      if (!button) return;
      if (button.dataset.practice === "start") startPractice();
      else endPractice();
    });
    const standalone = "unstruckStandalone" in document.body.dataset;
    $("hubDailyPickBtn")?.addEventListener("click", open);
    $("dpBackBtn")?.addEventListener("click", close);
    $("dpHelpBtn")?.addEventListener("click", openHelp);
    $("dpHelpClose")?.addEventListener("click", closeHelp);
    $("dpIntro")?.addEventListener("click", onTutorialClick);
    $("dpTutorialBtn")?.addEventListener("click", openIntro);
    $("dpRule")?.addEventListener("click", event => { if (event.target.closest("#dpRuleClose")) closeRule(); });
    document.addEventListener("keydown", event => {
      if (event.key === "Escape") { closeRule(); closeIntro(); closeHelp(); }
    });
    $("dailyPickRoot")?.addEventListener("click", event => {
      const word = event.target.closest?.(".dp-word");
      if (word) return onWordClick(word.dataset.word);
      if (event.target.closest?.("#dpGuess")) guessSelected();
      const shareButton = event.target.closest?.("#dpShare");
      if (shareButton) share(shareButton);
    });
    // On its own page there's nothing to close back to, so it just starts.
    if (standalone) {
      $("dpBackBtn").remove();
      open();
    }
  });
}());
