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
// Marks go on tiles that aren't green first, since those are the ones an
// arrow says something new about, and never on a tile a boss or challenge
// is hiding (entry.maskedIndices) -- that would give the hidden result away.
(function () {
  "use strict";

  const STACK_KEY = "alphabet-compass";
  const MAX_TILES = 4;

  function copiesOwned(state) {
    const economy = window.CuddleEconomyRarityV8;
    const stacked = economy && typeof economy.stack === "function" ? Number(economy.stack(state, STACK_KEY)) || 0 : 0;
    const picked = (state.rewardBookHistory || []).filter(entry => entry && entry.id === STACK_KEY).length;
    return Math.min(MAX_TILES, Math.max(stacked, picked));
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

  function markEntry(game, entry) {
    const state = game.state;
    const count = copiesOwned(state);
    if (!count || !entry || entry.umtCompass) return;
    const secret = String(state.secret || "").toUpperCase();
    const word = String(entry.word || "").toUpperCase();
    if (secret.length !== 5 || word.length !== 5 || word === secret) return;
    const masked = new Set(Array.isArray(entry.maskedIndices) ? entry.maskedIndices : []);
    const random = typeof game.random === "function" ? () => game.random() : Math.random;
    const open = [0, 1, 2, 3, 4].filter(index => !masked.has(index));
    const notGreen = shuffled(open.filter(index => word[index] !== secret[index]), random);
    const green = shuffled(open.filter(index => word[index] === secret[index]), random);
    entry.umtCompass = notGreen.concat(green).slice(0, count)
      .sort((a, b) => a - b)
      .map(index => ({ index, dir: reading(secret[index], word[index]) }));
  }

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
