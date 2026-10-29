// client/daily-pick.js — Griddle: three shared puzzles a day, played once.
//
// Each puzzle is sixteen five-letter words in a 4x4 grid, one of them the
// secret. Select a word and confirm it, and the panel below shows Wordle
// feedback for it; exclude the words that feedback rules out, then pick again,
// until the secret is picked. Solving one moves on to the next; the score is
// the total number of guesses across all three. The puzzles come from the UTC
// date alone (no server state), and progress is kept in localStorage under
// that date, so it resets daily and can't be replayed.
// It needs no server API, account or Supabase: the word list is a static file.

(function () {
  const WORD_COUNT = 16;
  const PUZZLE_COUNT = 3;
  const ADVANCE_MS = 1600;
  const STORE_KEY = "umt.dailyPick.v9";

  let puzzles = null; // [{ answer, words }]
  let state = null; // { date, rounds: [{ guesses: [], struck: [], solved }] }
  let current = 0; // index of the puzzle on screen
  let advanceTimer = null;
  // "pick": tap a word to select it (tap another to change your mind), then
  // confirm it with the button. "strike": after the feedback, tap words to
  // exclude them, then "Pick next word" goes back to "pick".
  let phase = "pick"; // "pick" | "strike"
  let selected = "";

  const $ = id => document.getElementById(id);
  const today = () => new Date().toISOString().slice(0, 10);

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
  const CHAIN_LINK = 3;

  // Each grid sets how much the feedback gives away:
  //   "full"   - Wordle tiles: green right spot, yellow wrong spot, grey not in it
  //   "blue"   - blue if the letter is in the word at all, grey if not
  //   "counts" - only how many greens and how many yellows, no positions
  const LEVELS = [
    { mode: "full" },
    { mode: "blue" },
    { mode: "counts" }
  ];

  // A grid is a chain of words rather than a cluster around the answer: start
  // anywhere, then each new word shares at least CHAIN_LINK tiles with the one
  // before it. Words a few links apart can have little in common, so there's
  // no obvious hub word that splits the grid, and the answer is any link.
  // At a dead end the chain branches off an earlier word instead.
  function buildPuzzle(list, seed, taken) {
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
        const options = free.filter(w => !used.has(key(w)) && sharedTiles(w, tip) >= CHAIN_LINK);
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
        return { answer, words: shuffle(chain, rand) };
      }
    }
    throw new Error("Griddle: couldn't build a word chain");
  }

  function buildDay(pool, date) {
    const list = [...new Set(pool.filter(w => /^[a-z]{5}$/.test(w)))].sort();
    // Every word on the day's three grids is different, not just the answers.
    const taken = new Set();
    return Array.from({ length: PUZZLE_COUNT }, (_, i) => {
      const level = Math.min(i, LEVELS.length - 1);
      const puzzle = buildPuzzle(list, `griddle-3:${date}:${i + 1}`, taken);
      puzzle.words.forEach(w => taken.add(w));
      return { ...puzzle, ...LEVELS[level] };
    });
  }

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

  const round = () => state.rounds[current];
  const firstUnsolved = () => {
    const i = state.rounds.findIndex(r => !r.solved);
    return i < 0 ? PUZZLE_COUNT - 1 : i;
  };
  const allSolved = () => state.rounds.every(r => r.solved);
  const totalGuesses = () => state.rounds.reduce((sum, r) => sum + r.guesses.length, 0);

  // Once all three are solved (and the last one's feedback has had its
  // moment), the grid gives way to the day's scorecard.
  function setTitle(grid) {
    const title = $("dpTitle");
    if (title) title.innerHTML = grid ? `Griddle <span class="dp-title-grid">Grid ${grid}/${PUZZLE_COUNT}</span>` : "Griddle";
  }

  function renderSummary(root) {
    setTitle(0);
    const rows = state.rounds.map((r, i) =>
      `<div class="dp-sum-row"><span>Grid ${i + 1}</span><span>${r.guesses.length}</span></div>`).join("");
    root.innerHTML = `<div class="dp-summary">${rows}
      <div class="dp-sum-row dp-sum-total"><span>Total</span><span>${totalGuesses()}</span></div>
      <button type="button" class="dp-next dp-share" id="dpShare">Share on WhatsApp</button>
      <div class="dp-hint">Come back tomorrow for three new grids.</div></div>`;
  }

  function render() {
    const root = $("dailyPickRoot");
    if (!root) return;
    if (allSolved() && !advanceTimer) return renderSummary(root);
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
    const buttons = ring.map(({ word, struck, guessed }) => {
      const disabled = done || (phase === "pick" && (struck || guessed));
      return `<button type="button" class="dp-word${struck ? " is-struck" : ""}${guessed ? " is-guessed" : ""}${word === selected ? " is-selected" : ""}" data-word="${word}"${disabled ? " disabled" : ""}>${word}</button>`;
    }).join("");

    const swatch = (color, label, round) =>
      `<span><i class="${round ? "is-round" : ""}" style="background:${color}"></i>${label}</span>`;
    const key = {
      full: swatch("#3f9d4f", "Right spot") + swatch("#c9a227", "Wrong spot") + swatch("#555b63", "Not in word"),
      blue: swatch("#3b7dd8", "In the word (right or wrong spot)") + swatch("#555b63", "Not in word"),
      counts: swatch("#3f9d4f", "How many in the right spot", true) + swatch("#c9a227", "How many in the wrong spot", true)
    }[mode];

    const tiles = guess => {
      const result = feedback(guess, secret);
      if (mode === "counts" && guess !== secret) {
        const count = kind => result.filter(f => f === kind).length;
        return `<div class="dp-row">${[...guess].map(ch => `<span class="dp-tile is-plain">${ch}</span>`).join("")}
          <span class="dp-tile is-correct dp-count-tile">${count("correct")}</span>
          <span class="dp-tile is-present dp-count-tile">${count("present")}</span></div>`;
      }
      const shown = f => (mode === "blue" && guess !== secret && f !== "absent" ? "in" : f);
      return `<div class="dp-row">${[...guess].map((ch, i) =>
        `<span class="dp-tile is-${shown(result[i])}">${ch}</span>`).join("")}</div>`;
    };

    // The panel always holds the same three rows (tiles, hint, action) so
    // the screen doesn't shift as the game moves along.
    const blank = `<div class="dp-row">${"<span class=\"dp-tile is-empty\"></span>".repeat(5)}</div>`;
    let hint;
    let action = "";
    if (done) {
      hint = `<strong class="dp-result">Solved in ${r.guesses.length}!</strong> ${allSolved() ? "" : "Next puzzle…"}`;
    } else if (phase === "strike") {
      hint = "Now tap the words this rules out.";
      action = `<button type="button" class="dp-next" id="dpNext">Pick next word</button>`;
    } else {
      hint = lastGuess ? "Tap the word you want to guess next." : "Tap a word to start.";
      action = `<button type="button" class="dp-next" id="dpGuess"${selected ? "" : " disabled"}>${selected ? `Guess ${selected.toUpperCase()}` : "Select a word"}</button>`;
    }
    // Keeps the panel the same height once the button is gone.
    if (!action) action = `<button type="button" class="dp-next" tabindex="-1" aria-hidden="true" style="visibility:hidden">&nbsp;</button>`;

    // The latest guess sits in the panel; the ones before it, newest first,
    // go in a smaller list underneath so the panel itself never grows.
    const history = r.guesses.slice(0, -1).reverse().map(tiles).join("");

    root.innerHTML = `<div class="dp-board">${buttons}</div>
      <div class="dp-center">${lastGuess ? tiles(lastGuess) : blank}<div class="dp-key">${key}</div><div class="dp-hint">${hint}</div>${action}</div>
      ${history ? `<div class="dp-history">${history}</div>` : ""}`;
  }

  function onWordClick(word) {
    const r = round();
    if (r.solved) return;
    if (phase === "strike") {
      const i = r.struck.indexOf(word);
      if (i >= 0) r.struck.splice(i, 1);
      else if (!r.guesses.includes(word)) r.struck.push(word);
      save();
    } else if (!r.struck.includes(word) && !r.guesses.includes(word)) {
      selected = selected === word ? "" : word;
    }
    render();
  }

  function guessSelected() {
    const r = round();
    if (!selected || r.solved) return;
    r.guesses.push(selected);
    if (selected === puzzles[current].answer) {
      r.solved = true;
      phase = "pick";
      advanceTimer = setTimeout(nextPuzzle, ADVANCE_MS);
    } else {
      r.struck.push(selected);
      phase = "strike";
    }
    selected = "";
    save();
    render();
  }

  // One row per puzzle: a white square per wrong guess, then the green one.
  function shareText() {
    const date = new Date(`${state.date}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
    const rows = state.rounds.map((r, i) =>
      `Grid ${i + 1}: ${"⬜".repeat(r.guesses.length - 1)}🟩 ${r.guesses.length}`);
    return [`Griddle ${date}`, ...rows, `Total: ${totalGuesses()}`, location.origin].join("\n");
  }

  function share() {
    window.open(`https://wa.me/?text=${encodeURIComponent(shareText())}`, "_blank", "noopener");
  }

  function nextPuzzle() {
    advanceTimer = null;
    current = firstUnsolved();
    phase = "pick";
    selected = "";
    render();
  }

  async function open() {
    window.showScreen("dailyPickScreen");
    document.body.classList.add("menu-mode");
    const root = $("dailyPickRoot");
    if (!puzzles || state.date !== today()) {
      root.textContent = "Loading today's puzzles…";
      try {
        const text = await (await fetch("wordlists/daily-pick-words.txt")).text();
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
    const r = round();
    phase = r.guesses.length && !r.solved ? "strike" : "pick";
    selected = "";
    render();
  }

  document.addEventListener("DOMContentLoaded", () => {
    $("hubDailyPickBtn")?.addEventListener("click", open);
    $("dpBackBtn")?.addEventListener("click", () => window.UmtGameHub?.showHub());
    $("dailyPickRoot")?.addEventListener("click", event => {
      const word = event.target.closest?.(".dp-word");
      if (word) return onWordClick(word.dataset.word);
      if (event.target.closest?.("#dpNext")) { phase = "pick"; render(); }
      if (event.target.closest?.("#dpGuess")) guessSelected();
      if (event.target.closest?.("#dpShare")) share();
    });
  });
}());
