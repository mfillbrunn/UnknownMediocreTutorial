// server/utils/dailyConfig.js
// Deterministic daily config generated from the date string.
// Same input → same output forever (no randomness involved at call time).

const SETTER_POWERS = [
  "hideTile", "suggestSecret", "confuseColors", "countOnly", "blindSpot",
  "vowelRefresh", "assassinWord", "forceGuess", "blindGuess", "fakeFeedback", "revealPenalty",
];
const GUESSER_POWERS = [
  "suggestGuess", "rouletteSecret", "forceTimer", "revealHistory", "stealthGuess",
  "revealGreen", "freezeSecret", "magicMode", "revealLetter", "nonsense", "betMiss",
];

function seededRandom(seed) {
  let s = (seed ^ 0x9e3779b9) >>> 0;
  return function () {
    s = Math.imul(s ^ (s >>> 16), 0x45d9f3b);
    s = Math.imul(s ^ (s >>> 16), 0x45d9f3b);
    s = (s ^ (s >>> 16)) >>> 0;
    return s / 4294967296;
  };
}

function seededShuffle(arr, rng) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function getDailyConfig(dateStr) {
  // dateStr: "YYYY-MM-DD" — produces a consistent integer seed
  const seed = parseInt(dateStr.replace(/-/g, ""), 10);
  const rng = seededRandom(seed);
  const aiDifficulty = Math.floor(rng() * 3) + 1; // 1 | 2 | 3
  const setterPowers = seededShuffle(SETTER_POWERS, rng).slice(0, 2);
  const guesserPowers = seededShuffle(GUESSER_POWERS, rng).slice(0, 2);
  return { date: dateStr, aiDifficulty, setterPowers, guesserPowers };
}

module.exports = { getDailyConfig };
