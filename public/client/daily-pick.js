// client/daily-pick.js — Winnow: three shared puzzles a day, played once.
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
// screen) and on its own page, winnow/index.html, which marks its <body> with
// data-winnow-standalone and starts the game straight away. The game's markup
// is built here so both pages share it; a <script data-words="..."> attribute
// says where the word list lives relative to the page.

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
  const HISTORY_KEY = "umt.winnow.history";
  // Puzzle #1 is the first Winnow day; the number counts days from there.
  const LAUNCH_DATE = "2026-11-07";
  const WORDS_URL = document.currentScript?.dataset.words || "wordlists/daily-pick-words.txt";

  let puzzles = null; // [{ answer, words }]
  let state = null; // { date, rounds: [{ guesses: [], struck: [], solved }] }
  let current = 0; // index of the puzzle on screen
  let advanceTimer = null;
  // The clock runs from the moment Winnow opens until the last grid is
  // solved, only while Winnow is on screen. state.elapsed holds the time
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

  const $ = id => document.getElementById(id);
  // The day turns over at midnight US Eastern time (daylight saving
  // included), for everyone wherever they are. "en-CA" formats as YYYY-MM-DD.
  const dayFormat = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" });
  const today = () => dayFormat.format(new Date());

  // Whole days between two YYYY-MM-DD dates.
  const dayIndex = date => Math.round(Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10)) / 86400000);
  const addDays = (date, n) => new Date((dayIndex(date) + n) * 86400000).toISOString().slice(0, 10);
  const puzzleNumber = date => dayIndex(date) - dayIndex(LAUNCH_DATE) + 1;

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
  //   "full"   - Wordle tiles: green right spot, yellow wrong spot, grey not in it
  //   "split"  - half green, half yellow if the letter is in the word at all
  //              (right or wrong spot, not saying which), grey if not
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
    throw new Error("Winnow: couldn't build a grid");
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

  // Golf names for a score relative to par.
  function golfTerm(diff) {
    const names = { "-3": "Albatross", "-2": "Eagle", "-1": "Birdie", 0: "Par", 1: "Bogey", 2: "Double bogey", 3: "Triple bogey", 4: "Quadruple bogey" };
    return names[diff] || (diff < 0 ? "Albatross" : "Over par");
  }
  const relToPar = diff => (diff === 0 ? "even" : `${diff > 0 ? "+" : "−"}${Math.abs(diff)}`);

  function feedback(guess, answer) {
    const result = Array(5).fill("absent");
    const left = {};
    for (let i = 0; i < 5; i++) {
      if (guess[i] === answer[i]) result[i] = "correct";
      else left[answer[i]] = (left[answer[i]] || 0) + 1;
    }
    for (let i = 0; i < 5; i++) {
      if (result[i] === "correct") continue;
      if (left[guess[i]] > 0) { result[i] = "present"; left[guess[i]]--; }
    }
    return result;
  }

  function load() {
    const date = today();
    try {
      const saved = JSON.parse(localStorage.getItem(STORE_KEY));
      if (saved && saved.date === date) return saved;
    } catch (e) { /* fall through */ }
    const rounds = Array.from({ length: PUZZLE_COUNT }, () => ({ guesses: [], struck: [], solved: false }));
    return { date, rounds };
  }

  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* private mode */ }
  }

  // ---- Streaks and stats -------------------------------------------------
  // HISTORY_KEY holds { "YYYY-MM-DD": { score, time, grids: [n, n, n] } } for
  // every finished day on this device.
  function loadHistory() {
    try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || {}; } catch (e) { return {}; }
  }

  function recordDay() {
    const history = loadHistory();
    if (history[state.date]) return;
    history[state.date] = { score: totalGuesses(), time: Math.round(elapsed()), grids: state.rounds.map(r => r.guesses.length) };
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(history)); } catch (e) { /* private mode */ }
  }

  function computeStats() {
    const history = loadHistory();
    const dates = Object.keys(history).sort();
    const scores = dates.map(d => history[d].score);
    // Current streak: days in a row up to today (or up to yesterday, if
    // today isn't finished yet, so a streak doesn't look broken all morning).
    let current = 0;
    let day = history[today()] ? today() : addDays(today(), -1);
    while (history[day]) { current++; day = addDays(day, -1); }
    let best = 0;
    let run = 0;
    dates.forEach((d, i) => {
      run = i && dayIndex(d) - dayIndex(dates[i - 1]) === 1 ? run + 1 : 1;
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
    return i < 0 ? PUZZLE_COUNT - 1 : i;
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
    const number = state ? ` <span class="dp-title-grid">#${puzzleNumber(state.date)}</span>` : "";
    title.innerHTML = grid ? `Winnow <span class="dp-title-grid">Grid ${grid}/${PUZZLE_COUNT}</span>` : `Winnow${number}`;
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
    const counts = BUCKETS.map(bucket => Object.values(history).filter(day => bucket.test(day.score - DAY_PAR)).length);
    const most = Math.max(1, ...counts);
    const rows = BUCKETS.map((bucket, i) => {
      const mine = bucket.test(todayDiff);
      const width = Math.max(8, Math.round(100 * counts[i] / most));
      return `<div class="dp-dist-row${mine ? " is-today" : ""}"><span class="dp-dist-label">${bucket.label}</span>
        <span class="dp-dist-track"><span class="dp-dist-bar" style="width:${counts[i] ? width : 0}%"></span><b>${counts[i]}</b></span></div>`;
    }).join("");
    return `<div class="dp-dist"><div class="dp-dist-title">Your scores</div>${rows}</div>`;
  }

  function renderSummary(root) {
    recordDay();
    setTitle(0);
    const stats = computeStats();
    const stat = (value, label) => `<div class="dp-stat"><b>${value}</b><span>${label}</span></div>`;
    const diff = totalGuesses() - DAY_PAR;
    const grids = state.rounds.map((r, i) => {
      const n = r.guesses.length;
      return `<div class="dp-stat"><b>${n}</b><span>Grid ${i + 1}${n === 1 ? "<br>Hole in one!" : ""}</span></div>`;
    }).join("");
    // The verdict and Share come first, so sharing never needs a scroll.
    root.innerHTML = `<div class="dp-summary">
      <div class="dp-verdict">${golfTerm(diff)} <span>(${relToPar(diff)})</span></div>
      <div class="dp-verdict-sub">${totalGuesses()} guesses · par ${DAY_PAR}</div>
      <button type="button" class="dp-next dp-share" id="dpShare">Share</button>
      <div class="dp-stats dp-stats-4">${grids}${stat(formatTime(elapsed()), "Time")}</div>
      <div class="dp-stats">
        ${stat(stats.played, "Played")}
        ${stat(stats.current, "Streak")}
        ${stat(stats.best, "Best streak")}
        ${stat(stats.average ? stats.average.toFixed(1) : "–", "Average")}
        ${stat(stats.bestScore || "–", "Best score")}
      </div>
      ${distributionChart(diff)}
      <div class="dp-countdown">Next Winnow in <b id="dpCountdown">${formatTime(msUntilNextDay())}</b></div>
      <div class="dp-copyright">&copy; 2026 Winnow. All rights reserved.</div></div>`;
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
    if (state.date !== today()) {
      clearInterval(countdownTimer);
      open();
      return;
    }
    label.textContent = formatTime(msUntilNextDay());
  }

  function render() {
    const root = $("dailyPickRoot");
    if (!root) return;
    showClock();
    if (allSolved() && !advanceTimer) return renderSummary(root);
    clearInterval(countdownTimer);
    setTitle(current + 1);
    const { answer: secret, words, mode } = puzzles[current];
    const r = round();
    const lastGuess = r.guesses[r.guesses.length - 1];
    const ring = words.map((word, i) => {
      const struck = r.struck.includes(word);
      const guessed = r.guesses.includes(word);
      return { word, struck, guessed };
    });
    const done = r.solved;
    // What a guess reveals under this grid's rule, letter by letter.
    const shownResult = guess => feedback(guess, secret).map(f => (mode === "split" && guess !== secret && f !== "absent" ? "in" : f));
    const counts = guess => {
      const result = feedback(guess, secret);
      return [result.filter(f => f === "correct").length, result.filter(f => f === "present").length];
    };
    // A guessed word carries its own feedback in miniature, so all the
    // evidence stays on the board.
    const mini = guess => {
      if (mode === "counts") {
        const [g, y] = counts(guess);
        return `<span class="dp-mini"><i class="is-correct is-count">${g}</i><i class="is-present is-count">${y}</i></span>`;
      }
      return `<span class="dp-mini">${shownResult(guess).map(f => `<i class="is-${f}"></i>`).join("")}</span>`;
    };

    const buttons = ring.map(({ word, struck, guessed }) => {
      // Words already guessed stay struck for good, so they can't be tapped.
      const disabled = done || guessed;
      const won = done && word === secret;
      const snap = toggled && toggled.word === word ? ` just-${toggled.kind}` : "";
      const fresh = revealing && word === lastGuess ? " just-guessed" : "";
      const classes = `dp-word${won ? " is-solved" : struck ? " is-struck" : ""}${guessed && !won ? " is-guessed" : ""}${word === selected ? " is-selected" : ""}${snap}${fresh}`;
      return `<button type="button" class="${classes}" data-word="${word}"${disabled ? " disabled" : ""}>${word}${guessed && !won ? mini(word) : ""}</button>`;
    }).join("");

    const SPLIT_TILE = "linear-gradient(135deg, #3f9d4f 0 49%, rgba(0,0,0,.2) 49% 51%, #c9a227 51% 100%)";
    const swatch = (color, label, round) =>
      `<span><i class="${round ? "is-round" : ""}" style="background:${color}"></i>${label}</span>`;
    const key = {
      full: swatch("#3f9d4f", "Right spot") + swatch("#c9a227", "Wrong spot") + swatch("#555b63", "Not in word"),
      split: swatch(SPLIT_TILE, "In the word (any spot)") + swatch("#555b63", "Not in word"),
      counts: swatch("#3f9d4f", "How many in the right spot", true) + swatch("#c9a227", "How many in the wrong spot", true)
    }[mode];

    // The latest guess, large. Right after a guess its tiles flip in one by
    // one (--i staggers them), and hop if it was the secret.
    const tiles = guess => {
      const rowClass = `dp-row${revealing ? " is-revealing" : ""}${revealing && guess === secret ? " is-win" : ""}`;
      if (mode === "counts" && guess !== secret) {
        const [g, y] = counts(guess);
        return `<div class="${rowClass}"><span class="dp-plain-word" style="--i:0">${guess}</span>
          <span class="dp-tile is-correct dp-count-tile" style="--i:3">${g}</span>
          <span class="dp-tile is-present dp-count-tile" style="--i:4">${y}</span></div>`;
      }
      return `<div class="${rowClass}">${shownResult(guess).map((f, i) =>
        `<span class="dp-tile is-${f}" style="--i:${i}">${guess[i]}</span>`).join("")}</div>`;
    };

    // The panel always holds the same three rows (tiles, hint, action) so
    // the screen doesn't shift as the game moves along.
    const blank = `<div class="dp-row">${"<span class=\"dp-tile is-empty\"></span>".repeat(5)}</div>`;
    let hint;
    let action = "";
    if (done) {
      hint = `<strong class="dp-result${revealing ? " is-new" : ""}">Solved in ${r.guesses.length}!</strong> ${allSolved() ? "" : "Next grid…"}`;
    } else {
      hint = "Tap a word: strike out → pick → clear";
      action = `<button type="button" class="dp-next" id="dpGuess"${selected ? "" : " disabled"}>${selected ? `Guess ${selected.toUpperCase()}` : "Guess"}</button>`;
    }
    // Keeps the panel the same height once the button is gone.
    if (!action) action = `<button type="button" class="dp-next" tabindex="-1" aria-hidden="true" style="visibility:hidden">&nbsp;</button>`;

    root.innerHTML = `<div class="dp-board">${buttons}</div>
      <div class="dp-center">${lastGuess ? tiles(lastGuess) : blank}<div class="dp-key">${key}</div><div class="dp-hint">${hint}</div>${action}</div>`;
  }

  function onWordClick(word) {
    const r = round();
    if (r.solved || r.guesses.includes(word)) return;
    const struckAt = r.struck.indexOf(word);
    if (word === selected) {
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

  // One row per puzzle: a white square per wrong guess, then the green one.
  function shareText() {
    const rows = state.rounds.map((r, i) =>
      `Grid ${i + 1}: ${"⬜".repeat(r.guesses.length - 1)}🟩 ${r.guesses.length}`);
    const diff = totalGuesses() - DAY_PAR;
    const verdict = `${golfTerm(diff)} (${totalGuesses()}; ${diff === 0 ? "even" : `${diff > 0 ? "+" : "-"}${Math.abs(diff)}`} par)`;
    const streak = computeStats().current;
    const link = location.origin + location.pathname.replace(/index\.html$/, "");
    return [
      `Winnow #${puzzleNumber(state.date)}`,
      ...rows,
      `Total: ${verdict}`,
      `Time: ${formatTime(elapsed())}`,
      ...(streak > 1 ? [`🔥 ${streak}-day streak`] : []),
      link
    ].join("\n");
  }

  // The phone's own share sheet (WhatsApp, Messages, Instagram, ...) where
  // there is one; otherwise the result is copied for pasting anywhere.
  async function share(button) {
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
    split: `Letters in the word show <span class="dp-help-chip" style="background:${"linear-gradient(135deg,#3f9d4f 0 49%,rgba(0,0,0,.2) 49% 51%,#c9a227 51% 100%)"}"></span> half green, half yellow &ndash; you won't know if they're in the right spot. Grey means not in the word.`,
    counts: `You only see <i class="dp-rule-count is-correct">2</i> how many letters are in the right spot and <i class="dp-rule-count is-present">1</i> how many are in the wrong spot &ndash; not which ones.`
  };
  const ruleOpen = () => !!$("dpRule") && !$("dpRule").hidden;

  function maybeAnnounceRule() {
    const r = round();
    const rule = RULES[puzzles[current].mode];
    state.announced = state.announced || [];
    if (!rule || r.guesses.length || state.announced[current] || allSolved()) return;
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

  async function open() {
    if (window.showScreen) window.showScreen("dailyPickScreen");
    else $("dailyPickScreen").classList.add("active");
    document.body.classList.add("menu-mode");
    const root = $("dailyPickRoot");
    if (!puzzles || state.date !== today()) {
      root.textContent = "Loading today's puzzles…";
      try {
        const text = await (await fetch(WORDS_URL)).text();
        const pool = text.split(/\s+/).map(w => w.toLowerCase()).filter(Boolean);
        state = load();
        puzzles = buildDay(pool, state.date);
      } catch (e) {
        root.textContent = "Couldn't load today's puzzles. Please try again.";
        return;
      }
    }
    clearTimeout(advanceTimer);
    advanceTimer = null;
    current = firstUnsolved();
    selected = "";
    render();
    if (!introSeen()) openIntro();
    else startClock();
    maybeAnnounceRule();
  }

  function close() {
    closeRule();
    closeIntro();
    closeHelp();
    stopClock();
    window.UmtGameHub?.showHub();
  }

  // First visit: a short pop-up over the grid. The full rules live behind
  // the "?" button. The clock waits while either is open.
  const INTRO_SEEN_KEY = "umt.griddle.introSeen";
  const OLD_HELP_SEEN_KEY = "umt.griddle.helpSeen"; // saw the full rules first, before the pop-up existed
  const introOpen = () => !!$("dpIntro") && !$("dpIntro").hidden;
  const helpOpen = () => !!$("dpHelp") && !$("dpHelp").hidden;

  function introSeen() {
    try { return !!(localStorage.getItem(INTRO_SEEN_KEY) || localStorage.getItem(OLD_HELP_SEEN_KEY)); } catch (e) { return true; }
  }

  function openIntro() {
    stopClock();
    $("dpIntro").hidden = false;
    $("dpIntroClose")?.focus({ preventScroll: true });
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
    // Back after midnight Eastern with Winnow still open: load the new day.
    else if (state.date !== today() && $("dailyPickScreen")?.classList.contains("active")) open();
    else startClock();
  });
  window.addEventListener("pagehide", () => { if (state) stopClock(); });

  const SPLIT_CHIP = "linear-gradient(135deg,#3f9d4f 0 49%,rgba(0,0,0,.2) 49% 51%,#c9a227 51% 100%)";
  const MARKUP = `
    <div class="menu-center dp-card">
      <div class="dp-head">
        <div id="dpClock" class="dp-clock" aria-label="Time" hidden>0:00</div>
        <h2 id="dpTitle" class="menu-title">WINNOW</h2>
        <div class="dp-head-buttons">
          <button id="dpHelpBtn" class="dp-help-btn" type="button" aria-label="How to play">?</button>
          <button id="dpBackBtn" class="dp-close" type="button" aria-label="Close"><svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg></button>
        </div>
      </div>
      <div id="dailyPickRoot"></div>
      <div id="dpIntro" class="dp-intro" role="dialog" aria-modal="true" aria-label="Welcome to Winnow" hidden>
        <div class="dp-intro-card">
          <p>Find the secret word out of these 16. Use the feedback to narrow it down.</p>
          <p>Do it 3 times and you're done!</p>
          <button id="dpIntroClose" class="dp-next" type="button">Play</button>
          <div class="dp-intro-more">Full rules anytime under <b>?</b></div>
        </div>
      </div>
      <div id="dpRule" class="dp-intro" role="dialog" aria-modal="true" aria-label="This grid's rule" hidden>
        <div id="dpRuleCard" class="dp-intro-card"></div>
      </div>
      <div id="dpHelp" class="dp-help" role="dialog" aria-modal="true" aria-labelledby="dpHelpTitle" hidden>
        <h3 id="dpHelpTitle">How to play</h3>
        <p>You get a grid of 16 five-letter words, and one of them is the secret word you have to find. To do that, you start by picking one word; if it's already the correct one, lucky &ndash; you've solved the grid! If not, you'll get feedback on how the word you picked compares against the secret word.</p>
        <p>You then use that info to eliminate words that don't match and narrow down the possible solutions before picking your next word; rinse and repeat.</p>
        <p>Tapping a word once strikes it out, twice picks it as your next guess, and a third time clears it. Press <b>Guess</b> to submit your pick.</p>
        <p>There are three new grids every day, and they differ in what feedback you get:</p>
        <ul>
          <li>In the first grid, each letter is
            <span class="dp-help-chip" style="background:#3f9d4f"></span> green (correct letter and position),
            <span class="dp-help-chip" style="background:#c9a227"></span> yellow (letter is in the word but not in that position), or
            <span class="dp-help-chip" style="background:#555b63"></span> grey (letter not in the word at all).</li>
          <li>In the second grid, a letter that's in the word is
            <span class="dp-help-chip" style="background:${SPLIT_CHIP}"></span> half green, half yellow &ndash; so you don't find out whether it's in the right position. Letters not in the word are grey.</li>
          <li>In the third grid, you only see how many letters are green and how many are yellow (say, 1 green and 2 yellow), but not which ones.</li>
        </ul>
        <p>The total number of guesses across all three grids is your score (par is 7), and the time you took is recorded too. So the fewer guesses and the shorter the time, the better!</p>
        <button id="dpHelpClose" class="dp-next" type="button">Got it</button>
        <div class="dp-copyright">&copy; 2026 Winnow. All rights reserved.</div>
      </div>
    </div>`;

  document.addEventListener("DOMContentLoaded", () => {
    const screen = $("dailyPickScreen");
    if (!screen) return;
    screen.innerHTML = MARKUP;
    const standalone = "winnowStandalone" in document.body.dataset;
    $("hubDailyPickBtn")?.addEventListener("click", open);
    $("dpBackBtn")?.addEventListener("click", close);
    $("dpHelpBtn")?.addEventListener("click", openHelp);
    $("dpHelpClose")?.addEventListener("click", closeHelp);
    $("dpIntroClose")?.addEventListener("click", closeIntro);
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
