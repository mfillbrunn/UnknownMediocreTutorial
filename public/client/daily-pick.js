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
  const STORE_KEY = "umt.dailyPick.v5";

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

  // How alike a word is to the answer: what its Wordle feedback against the
  // answer would show, a green counting 2 and a yellow 1 (0 to 10).
  const likeness = (word, answer) =>
    feedback(word, answer).reduce((sum, f) => sum + (f === "correct" ? 2 : f === "present" ? 1 : 0), 0);

  // Each puzzle of the day is harder than the last: the words around the
  // answer go from random, to related (sharing a few letters), to near
  // misses (mostly the same letters, mostly in the same places).
  const LEVELS = [
    { min: 0, max: 10 }, // puzzle 1: any words
    { min: 3, max: 5 }, //  puzzle 2: related
    { min: 6, max: 10 } //  puzzle 3: very similar
  ];

  function buildPuzzle(list, seed, taken, level) {
    const rand = mulberry32(hash(seed));
    let answer = list[Math.floor(rand() * list.length)];
    while (taken.has(answer)) answer = list[Math.floor(rand() * list.length)];
    const key = w => [...w].sort().join("");
    const used = new Set([key(answer)]);
    const picked = [];
    // Words in the level's likeness range come first, in random order; if
    // there aren't enough, the rest follow closest-to-the-range first.
    const { min, max } = LEVELS[level];
    const distance = score => (score < min ? min - score : score > max ? score - max : 0);
    const ordered = shuffle(list.filter(w => w !== answer), rand)
      .map(word => ({ word, off: distance(likeness(word, answer)) }))
      .sort((x, y) => x.off - y.off)
      .map(entry => entry.word);
    for (const w of ordered) {
      if (picked.length === WORD_COUNT - 1) break;
      if (used.has(key(w))) continue;
      used.add(key(w));
      picked.push(w);
    }
    return { answer, words: shuffle([answer, ...picked], rand) };
  }

  function buildDay(pool, date) {
    const list = [...new Set(pool.filter(w => /^[a-z]{5}$/.test(w)))].sort();
    const taken = new Set();
    return Array.from({ length: PUZZLE_COUNT }, (_, i) => {
      const puzzle = buildPuzzle(list, `griddle:${date}:${i + 1}`, taken, Math.min(i, LEVELS.length - 1));
      taken.add(puzzle.answer);
      return puzzle;
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
  function renderSummary(root) {
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
    const { answer: secret, words } = puzzles[current];
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

    const tiles = guess => `<div class="dp-row">${[...guess].map((ch, i) =>
      `<span class="dp-tile is-${feedback(guess, secret)[i]}">${ch}</span>`).join("")}</div>`;

    // The panel always holds the same three rows (tiles, hint, action) so
    // the screen doesn't shift as the game moves along.
    const blank = `<div class="dp-row">${"<span class=\"dp-tile is-empty\"></span>".repeat(5)}</div>`;
    let hint;
    let action = "";
    if (done) {
      hint = `<strong class="dp-result">Solved in ${r.guesses.length}!</strong> ${allSolved() ? "" : "Next puzzle…"}`;
    } else if (phase === "strike") {
      hint = "Now exclude words: tap the ones this rules out.";
      action = `<button type="button" class="dp-next" id="dpNext">Pick next word</button>`;
    } else {
      hint = lastGuess ? "Tap the word you want to guess next." : "Tap a word to pick it as your first guess.";
      action = `<button type="button" class="dp-next" id="dpGuess"${selected ? "" : " disabled"}>${selected ? `Guess ${selected.toUpperCase()}` : "Select a word"}</button>`;
    }
    // Keeps the panel the same height once the button is gone.
    if (!action) action = `<button type="button" class="dp-next" tabindex="-1" aria-hidden="true" style="visibility:hidden">&nbsp;</button>`;

    root.innerHTML = `<div class="dp-board">${buttons}</div>
      <div class="dp-center">${lastGuess ? tiles(lastGuess) : blank}<div class="dp-hint">${hint}</div>${action}</div>
      <div class="dp-count">Puzzle ${current + 1} of ${PUZZLE_COUNT} · Guesses: ${r.guesses.length} · Total: ${totalGuesses()}</div>`;
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
