// Alphabet Compass (Rare between-stage upgrade, stacks to 4).
//
// After every guess, one of its tiles per copy owned gets a small compass
// mark comparing the guessed letter with the secret's letter in that same
// spot: "←" the secret's letter comes earlier in the alphabet, "→" later,
// "–" they match. The reward itself lives in the economy layer
// (cuddle-economy-rarity-v8.js, "alphabet-compass" stacks); this module
// records the marks on each history entry (entry.umtCompass) and
// cuddle-ui.js's renderBoard draws them.
//
// Marks only go where the letter isn't known yet: never on a tile that is
// green, nor on a spot an earlier green or a hint already settled (an
// arrow there says nothing), and never on a tile a boss or challenge is
// hiding (entry.maskedIndices) -- that would give the hidden result away.
// With fewer such tiles than copies, fewer arrows show.
(function () {
  "use strict";

  const STACK_KEY = "alphabet-compass";
  // Copies held: one or two tiles per guess, and the third copy (Full
  // Alphabet Compass) covers all five.
  const MAX_COPIES = 3;

  function copiesOwned(state) {
    const economy = window.CuddleEconomyRarityV8;
    const stacked = economy && typeof economy.stack === "function" ? Number(economy.stack(state, STACK_KEY)) || 0 : 0;
    const picked = (state.rewardBookHistory || []).filter(entry => entry && entry.id === STACK_KEY).length;
    return Math.min(MAX_COPIES, Math.max(stacked, picked));
  }

  function reading(secretLetter, guessLetter) {
    if (secretLetter === guessLetter) return "G";
    return secretLetter < guessLetter ? "L" : "R";
  }

  function shuffled(items, random) {
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  // Hints rank I (cuddle-schools.js): one more arrow on a stage's first guess.
  function hintsRankArrow(game, entry) {
    const schools = window.CuddleSchools;
    // The player's own first guess (a Duel's history holds the AI's rows too).
    const history = (game.state && Array.isArray(game.state.history) ? game.state.history : []).filter(row => !row || row.actor !== "ai");
    if (!schools || typeof schools.rankOf !== "function" || history[0] !== entry) return 0;
    try { return Number(schools.rankOf(game, "prism")) >= 1 ? 1 : 0; } catch (_error) { return 0; }
  }

  // Spots whose letter is already certain: green on an earlier guess, or
  // shown by a hint (state.revealedPositions). An arrow there says nothing.
  function knownPositions(state, entry) {
    const known = new Set();
    const revealed = Array.isArray(state.revealedPositions) ? state.revealedPositions : [];
    revealed.forEach((letter, index) => { if (typeof letter === "string" && letter.length === 1) known.add(index); });
    (Array.isArray(state.history) ? state.history : []).forEach(item => {
      if (!item || item === entry) return;
      // What the player was shown (a boss may hide or fake a tile).
      const shown = Array.isArray(item.shownFeedback) && item.shownFeedback.length ? item.shownFeedback : item.feedback;
      if (!Array.isArray(shown)) return;
      const hidden = new Set(Array.isArray(item.maskedIndices) ? item.maskedIndices : []);
      shown.forEach((mark, index) => {
        if (mark === "green" && !hidden.has(index) && Array.isArray(item.feedback) && item.feedback[index] === "green") known.add(index);
      });
    });
    return known;
  }

  function markEntry(game, entry) {
    const state = game.state;
    const copies = copiesOwned(state);
    const schoolArrow = hintsRankArrow(game, entry);
    const count = copies >= MAX_COPIES ? 5 : Math.min(5, copies + schoolArrow);
    if (!count || !entry || entry.umtCompass) return;
    const secret = String(state.secret || "").toUpperCase();
    const word = String(entry.word || "").toUpperCase();
    if (secret.length !== 5 || word.length !== 5 || word === secret) return;
    const masked = new Set(Array.isArray(entry.maskedIndices) ? entry.maskedIndices : []);
    const random = typeof game.random === "function" ? () => game.random() : Math.random;
    const known = knownPositions(state, entry);
    const open = [0, 1, 2, 3, 4].filter(index => !masked.has(index) && !known.has(index) && word[index] !== secret[index]);
    entry.umtCompass = shuffled(open, random).slice(0, count)
      .sort((a, b) => a - b)
      .map(index => ({ index, dir: reading(secret[index], word[index]) }));
    // Where the arrows came from, for the note a tap on one shows.
    entry.umtCompassSource = copies && schoolArrow ? "both" : copies ? "badge" : "hints";
  }

  // A tap on an arrow says what it means and where it came from: an arrow
  // on the first guess can come from the Hints school without any badge.
  const SOURCES = {
    badge: "From your Alphabet Compass badge.",
    hints: "From the Hints school (rank I): your Hints badges unlocked one arrow on each stage's first guess. No badge of its own.",
    both: "From your Alphabet Compass badge, plus one from the Hints school (rank I) on your first guess.",
    boss: "From Arrow Signs: these tiles show an arrow instead of a colour."
  };
  function meaning(dir) {
    return dir === "L" ? "← The answer's letter here comes earlier in the alphabet."
      : dir === "R" ? "→ The answer's letter here comes later in the alphabet."
        : "– This letter is right here (green).";
  }
  let bubble = null;
  let bubbleTimer = 0;
  function closeBubble() {
    if (bubble) bubble.remove();
    bubble = null;
    clearTimeout(bubbleTimer);
  }
  document.addEventListener("click", event => {
    const mark = event.target instanceof Element ? event.target.closest("#cuddleRoot .umt-compass-mark") : null;
    if (!mark) { if (bubble && !(event.target instanceof Element && event.target.closest(".umt-compass-note"))) closeBubble(); return; }
    event.preventDefault();
    event.stopPropagation();
    closeBubble();
    bubble = document.createElement("div");
    bubble.className = "umt-compass-note";
    bubble.setAttribute("role", "status");
    bubble.innerHTML = `<strong>${meaning(mark.dataset.dir)}</strong><span>${SOURCES[mark.dataset.source] || SOURCES.badge}</span>`;
    document.body.appendChild(bubble);
    const box = mark.getBoundingClientRect();
    const width = Math.min(260, window.innerWidth - 24);
    bubble.style.width = `${width}px`;
    bubble.style.left = `${Math.round(Math.max(12, Math.min(window.innerWidth - width - 12, box.left + box.width / 2 - width / 2)))}px`;
    bubble.style.top = `${Math.round(box.bottom + 8)}px`;
    bubbleTimer = setTimeout(closeBubble, 6000);
  }, true);

  function install() {
    const Game = window.CuddleEngine && window.CuddleEngine.CuddleGame;
    if (!Game || Game.prototype.__umtCompass) return Boolean(Game && Game.prototype.__umtCompass);
    const original = Game.prototype.submitDraft;
    Game.prototype.submitDraft = function submitDraftWithCompass() {
      const before = Array.isArray(this.state && this.state.history) ? this.state.history.length : 0;
      const finish = value => {
        const history = this.state && this.state.history;
        if (Array.isArray(history) && history.length > before) {
          try { markEntry(this, history[history.length - 1]); }
          catch (error) { console.warn("Cuddle Alphabet Compass: could not mark the guess.", error); }
        }
        return value;
      };
      const result = original.apply(this, arguments);
      return result && typeof result.then === "function" ? result.then(finish) : finish(result);
    };
    Game.prototype.__umtCompass = true;
    return true;
  }

  if (!install()) {
    let tries = 0;
    const timer = setInterval(() => {
      if (install() || (tries += 1) > 80) clearInterval(timer);
    }, 50);
  }

  window.CuddleCompass = Object.freeze({ markEntry, copiesOwned, reading });
})();
