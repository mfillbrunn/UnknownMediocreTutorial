// SERVER VERSION

const { scoreGuess } = require("./scoring.js");

function normalizeEmoji(e) {
  switch (e) {
    case "🟩": return "G";
    case "🟨": return "Y";
    case "⬛": 
    case "⬜": return "B";
    default: return e;
  }
}

function isConsistentWithHistory(history, proposedSecret, state) {
  const eff = state?.powers?.vowelRefreshEffect;
  const forcedGreens = state?.powers?.forcedGreens || {};

  for (const entry of history) {
    if (entry.ignoreConstraints) continue;

    const guess = entry.guess.toUpperCase();

    // Canonical expected scoring (in G/Y/B)
    const expected = scoreGuess(proposedSecret.toUpperCase(), guess);

    // Actual feedback (use fbGuesser if present)
    const rawActual = entry.fbGuesser || entry.fb;

    // Normalize emojis → G/Y/B
    const actual = rawActual.map(normalizeEmoji);

    // Apply forced greens (revealLetter power)
    for (const pos in forcedGreens) {
      const i = Number(pos);
      if (proposedSecret[i].toUpperCase() !== forcedGreens[pos]) return false;
    }

    // Apply vowelRefresh overrides
    if (eff && entry.roundIndex === eff.guessIndex) {
      for (const pos of eff.indices) {
        expected[pos] = actual[pos];
      }
    }

    // Compare
    for (let i = 0; i < 5; i++) {
      
      // Skip vowelRefresh positions
      if (eff && entry.roundIndex === eff.guessIndex && eff.indices.includes(i))
        continue;

      if (expected[i] !== actual[i]) return false;
    }
  }

  return true;
}

module.exports = { isConsistentWithHistory };
