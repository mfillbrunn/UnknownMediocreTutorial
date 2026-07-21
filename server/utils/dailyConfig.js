// server/utils/dailyConfig.js
// Deterministic daily config generated from the date string.
// Same input → same output forever (no randomness involved at call time).

const { QUEST_TYPES } = require("../powers/powers/questServer");

const SETTER_POWERS = [
  "hideTile", "suggestSecret", "confuseColors", "countOnly", "blindSpot",
  "vowelRefresh", "forceGuess", "blindGuess", "fakeFeedback", "revealPenalty",
];
// revealLetter and fieldReport excluded -- see lobby.js's GUESSER_POWERS
// comment: their condition-based mechanics live on in the Quest system
// instead (server/powers/powers/questServer.js).
const GUESSER_POWERS = [
  "suggestGuess", "rouletteSecret", "forceTimer", "revealHistory", "stealthGuess",
  "revealGreen", "freezeSecret", "magicMode", "nonsense", "betMiss",
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

function getDailyConfig(dateStr, allowedSecrets, allowedGuesses) {
  // dateStr: "YYYY-MM-DD" — produces a consistent integer seed
  const seed = parseInt(dateStr.replace(/-/g, ""), 10);
  const rng = seededRandom(seed);
  const aiDifficulty = Math.floor(rng() * 3) + 1; // 1 | 2 | 3
  const setterPowers = seededShuffle(SETTER_POWERS, rng).slice(0, 2);
  // Guesser gets exactly 1 power (plus their always-on Quest) -- the daily
  // challenge is meant to be a tighter, more comparable puzzle than a
  // regular casual match, not a second full loadout.
  const guesserPowers = seededShuffle(GUESSER_POWERS, rng).slice(0, 1);

  // Every guesser always has a Quest (see questServer.js) -- pick it from
  // the same seeded stream so every player gets the same one that day,
  // same as the powers above. Note: if this lands on FIELDREPORT, its 3
  // sub-conditions are still generated with plain Math.random() by
  // fieldReportServer.js's generateConditions() -- not worth threading a
  // seeded rng through that path just for one quest type in thirteen.
  const questType = QUEST_TYPES[Math.floor(rng() * QUEST_TYPES.length)];

  // Continuing the SAME rng stream keeps everything deterministic from one
  // seed. These two are server-only -- never returned by the public
  // /api/daily route (see server/index.js, which whitelists fields before
  // responding) -- so the human's opponent's opening secret/guess is the
  // same for every player that day without ever being exposed to the
  // client ahead of time. Callers that don't need them (the public route)
  // simply omit allowedSecrets/allowedGuesses and get undefined back.
  const secretWord = Array.isArray(allowedSecrets) && allowedSecrets.length
    ? allowedSecrets[Math.floor(rng() * allowedSecrets.length)]
    : null;
  const openingGuess = Array.isArray(allowedGuesses) && allowedGuesses.length
    ? allowedGuesses[Math.floor(rng() * allowedGuesses.length)]
    : null;

  return { date: dateStr, aiDifficulty, setterPowers, guesserPowers, questType, secretWord, openingGuess };
}

module.exports = { getDailyConfig };
