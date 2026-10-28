// client/daily-pick.js — Daily Pick: one shared puzzle a day, played once.
//
// Sixteen five-letter words sit in a 4x4 grid. One is the secret. Pick a word and
// the panel below shows Wordle feedback for it; strike out the words that feedback
// rules out, then pick again, until the secret is picked. The puzzle comes
// from the UTC date alone (no server state), and the result is kept in
// localStorage under that date, so it resets daily and can't be replayed.
// It needs no server API, account or Supabase: the word list is a static file.

(function () {
  const WORD_COUNT = 16;
  const STORE_KEY = "umt.dailyPick.v1";

  let words = null; // [{ word, struck }]
  let secret = "";
  let state = null; // { date, guesses: [], struck: [], solved }
  let phase = "pick"; // "pick" | "strike"

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

  function buildPuzzle(pool, date) {
    const rand = mulberry32(hash(`daily-pick:${date}`));
    const list = pool.filter(w => /^[a-z]{5}$/.test(w)).sort();
    const answer = list[Math.floor(rand() * list.length)];
    const letters = new Set(answer);
    const shared = w => [...new Set(w)].filter(c => letters.has(c)).length;
    const key = w => [...w].sort().join("");
    const used = new Set([key(answer)]);
    const picked = [];
    // Prefer words that share letters with the answer, so the feedback
    // actually separates them; top up from the rest if too few exist.
    const ordered = shuffle(list.filter(w => w !== answer), rand);
    const related = ordered.filter(w => shared(w) >= 2);
    for (const w of related.concat(ordered)) {
      if (picked.length === WORD_COUNT - 1) break;
      if (picked.includes(w) || used.has(key(w))) continue;
      used.add(key(w));
      picked.push(w);
    }
    return { answer, words: shuffle([answer, ...picked], rand) };
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
    return { date, guesses: [], struck: [], solved: false };
  }

  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* private mode */ }
  }

  function render() {
    const root = $("dailyPickRoot");
    if (!root) return;
    const lastGuess = state.guesses[state.guesses.length - 1];
    const ring = words.map((word, i) => {
      const struck = state.struck.includes(word);
      const guessed = state.guesses.includes(word);
      return { word, struck, guessed };
    });
    const done = state.solved;
    const buttons = ring.map(({ word, struck, guessed }) => {
      const disabled = done || (phase === "pick" && (struck || guessed));
      return `<button type="button" class="dp-word${struck ? " is-struck" : ""}${guessed ? " is-guessed" : ""}" data-word="${word}"${disabled ? " disabled" : ""}>${word}</button>`;
    }).join("");

    const tiles = guess => `<div class="dp-row">${[...guess].map((ch, i) =>
      `<span class="dp-tile is-${feedback(guess, secret)[i]}">${ch}</span>`).join("")}</div>`;

    // The panel always holds the same three rows (tiles, hint, action) so
    // the screen doesn't shift as the game moves along.
    const blank = `<div class="dp-row">${"<span class=\"dp-tile is-empty\"></span>".repeat(5)}</div>`;
    let hint;
    let action = `<button type="button" class="dp-next" tabindex="-1" aria-hidden="true" style="visibility:hidden">Pick another word</button>`;
    if (done) {
      hint = `<strong class="dp-result">Solved in ${state.guesses.length}!</strong> Come back tomorrow.`;
    } else if (!lastGuess) {
      hint = "Pick a word to see how close it is to the secret.";
    } else if (phase === "strike") {
      hint = "Tap the words this rules out.";
      action = `<button type="button" class="dp-next" id="dpNext">Pick another word</button>`;
    } else {
      hint = "Choose your next word.";
    }

    root.innerHTML = `<div class="dp-board">${buttons}</div>
      <div class="dp-center">${lastGuess ? tiles(lastGuess) : blank}<div class="dp-hint">${hint}</div>${action}</div>
      <div class="dp-count">Guesses: ${state.guesses.length}</div>`;
  }

  function onWordClick(word) {
    if (state.solved) return;
    if (phase === "strike") {
      const i = state.struck.indexOf(word);
      if (i >= 0) state.struck.splice(i, 1);
      else if (!state.guesses.includes(word)) state.struck.push(word);
      save();
      render();
      return;
    }
    if (state.struck.includes(word) || state.guesses.includes(word)) return;
    state.guesses.push(word);
    if (word === secret) state.solved = true;
    else {
      state.struck.push(word);
      phase = "strike";
    }
    save();
    render();
  }

  async function open() {
    window.showScreen("dailyPickScreen");
    document.body.classList.add("menu-mode");
    const root = $("dailyPickRoot");
    if (!words) {
      root.textContent = "Loading today's puzzle…";
      try {
        const text = await (await fetch("wordlists/daily-pick-words.txt")).text();
        const pool = text.split(/\s+/).map(w => w.toLowerCase()).filter(Boolean);
        state = load();
        const puzzle = buildPuzzle(pool, state.date);
        secret = puzzle.answer;
        words = puzzle.words;
      } catch (e) {
        root.textContent = "Couldn't load today's puzzle. Please try again.";
        return;
      }
    } else if (state.date !== today()) {
      words = null;
      return open();
    }
    phase = state.guesses.length && !state.solved ? "pick" : phase;
    render();
  }

  document.addEventListener("DOMContentLoaded", () => {
    $("hubDailyPickBtn")?.addEventListener("click", open);
    $("dpBackBtn")?.addEventListener("click", () => window.UmtGameHub?.showHub());
    $("dailyPickRoot")?.addEventListener("click", event => {
      const word = event.target.closest?.(".dp-word");
      if (word) return onWordClick(word.dataset.word);
      if (event.target.closest?.("#dpNext")) { phase = "pick"; render(); }
    });
  });
}());
