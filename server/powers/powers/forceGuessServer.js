const engine = require("../powerEngineServer");
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const VOWELS = new Set(["A", "E", "I", "O", "U"]);
const COMMON = [
  "containsTwo",
  "startsWith",
  "endsWith",
  "doubleLetter",
  "firstLastSame"
];

const UNCOMMON = [
  "minVowels",
  "maxVowels"
];

const RARE = [
  "palindrome"
];

function generateForceGuessOptions(state) {
  const roll = Math.random();
  let types = [];

  if (roll < 0.05) {
    // rare
    types = [
      ...shuffle(COMMON).slice(0, 2),
      "palindrome"
    ];
  } else if (roll < 0.30) {
    // uncommon
    types = [
      ...shuffle(COMMON).slice(0, 2),
      shuffle(UNCOMMON)[0]
    ];
  } else {
    // common
    types = shuffle(COMMON).slice(0, 3);
  }

  return types.map(type => {
    if (type === "containsTwo") {
      const [a, b] = pickLetters(state, 2);
      return { type, letters: [a, b] };
    }
    if (type === "startsWith" || type === "endsWith") {
      const [l] = pickLetters(state, 1);
      return { type, letter: l };
    }
    if (type === "minVowels") {
      return { type, count: 3 };
    }
    if (type === "maxVowels") {
      return { type, count: 1 };
    }
    return { type };
  });
}


function getUsedLetters(state) {
  const used = new Set();
  for (const h of state.history || []) {
    if (!h?.guess) continue;
    for (const c of h.guess.toUpperCase()) used.add(c);
  }
  return used;
}

function pickLetters(state, count) {
  const used = getUsedLetters(state);
  let pool = ALPHABET.filter(l => !used.has(l));

  if (pool.length < count) {
    pool = ALPHABET.slice(); // fallback
  }

  const out = [];
  while (out.length < count) {
    const l = pool[Math.floor(Math.random() * pool.length)];
    if (!out.includes(l)) out.push(l);
  }
  return out;
}



function randomDistinctLetters(n = 3) {
  const letters = [];
  while (letters.length < n) {
    const l = String.fromCharCode(65 + Math.floor(Math.random() * 26));
    if (!letters.includes(l)) letters.push(l);
  }
  return letters;
}

engine.registerPower("forceGuess", {
  apply(state, action, roomId, io) {
    if (state.powers.forceGuessUsed) return;

    state.powers.forceGuessUsed = true;
    state.powers.forcedGuessOptions = generateForceGuessOptions(state);

    io.to(roomId).emit("forceGuessOptions", {
      options: state.powers.forcedGuessOptions
    });
  }
});
;
