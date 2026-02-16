const { isConsistentWithHistory } = require("./history");

// /game-engine/validation.js — UNIVERSAL VERSION
const VOWELS = new Set(["A", "E", "I", "O", "U"]);
// CHECK secret

function checkSecret({ secret, state, allowedSecrets }) {
  if (!secret || typeof secret !== "string") {
    return { ok: false, error: "Missing secret", code: "MISSING_SECRET" };
  }
  
  const w = secret.toUpperCase();
  // 1️⃣ Length check
  if (w.length !== 5) {
    return {
      ok: false,
      error: "Secret must be exactly 5 letters",
      code: "INVALID_LENGTH"
    };
  }
  // 2️⃣ Assassin similarity check
  if (state?.powers?.assassinWord) {
    const assassin = state.powers.assassinWord.toUpperCase();
    try {
      const diff = countPositionalDifferences(w, assassin);
      if (diff < 2) {
        return {
          ok: false,
          error: "Too similar to assassin word (needs ≥2 different letters)",
          code: "ASSASSIN_SIMILARITY"
        };
      }
    } catch (err) {
      return {
        ok: false,
        error: "Invalid assassin comparison",
        code: "ASSASSIN_COMPARE_ERROR"
      };
    }
  }
  // 3️⃣ Dictionary check
  if (!hasWord(allowedSecrets, w)) {
    return {
      ok: false,
      error: "Word not in dictionary",
      code: "NOT_IN_DICTIONARY"
    };
  }
    // 4️⃣ History consistency check
  if (!isConsistentWithHistory(state.history, w, state)) {
    return {
      ok: false,
      error: "Incompatible with previous feedback",
      code: "HISTORY_INCONSISTENT"
    };
  }
 // 5 Tutorial check
  if (state.isTutorial && state.history.length < state.state.scriptedTurns) {
    if (w !== state.tutorialSecrets[state.history.length]){
      return {
      ok: false,
      error: "Incompatible with tutorial",
      code: "INCONSISTENT_TUTORIAL"
    };
    }
  }

  // ✅ Passed all checks
  return { ok: true };
}

///GUESS check

function checkGuess({ guess, state, allowedGuesses }) {
  if (!guess || typeof guess !== "string") {
    return { ok: false, error: "Missing guess", code: "MISSING_GUESS" };
  }

  const g = guess.toUpperCase();

  // 1️⃣ Length check
  if (g.length !== 5) {
    return {
      ok: false,
      error: "Guess must be exactly 5 letters",
      code: "INVALID_LENGTH"
    };
  }

  // 2️⃣ Dictionary check (unless nonsense mode active)
  const nonsenseActive = !!state?.powers?.nonsenseActive;

  if (!nonsenseActive && !hasWord(allowedGuesses, g)) {
    return {
      ok: false,
      error: "Not in dictionary",
      code: "NOT_IN_DICTIONARY"
    };
  }

  // 3️⃣ Forced-guess constraints
  const forceGuessOptions = state?.powers?.forceGuessOptions;

  if (forceGuessOptions && forceGuessOptions.length > 0) {
    const satisfiesOne = forceGuessOptions.some(opt =>
      satisfiesForceGuess(g, opt)
    );

    if (!satisfiesOne) {
      return {
        ok: false,
        error: "Guess must satisfy at least one forced condition",
        code: "FORCE_GUESS_VIOLATION"
      };
    }
  }

   // 4 Tutorial check
  if (state.isTutorial && state.history.length < state.state.scriptedTurns) {
    if (g !== state.tutorialGuesses[state.history.length]){
      return {
      ok: false,
      error: "Incompatible with tutorial",
      code: "INCONSISTENT_TUTORIAL"
    };
    }
  }
  
  // ✅ Passed all checks
  return { ok: true };
}
function parseWordlist(raw) {
  return raw
    .split(/\r?\n/)
    .map(w => w.trim().toUpperCase())
    .filter(w => w.length === 5);
}
//HELPER FCTS
function hasWord(container, wordUpper) {
  if (!container) return true; // allow if no dictionary
  if (container instanceof Set) return container.has(wordUpper);
  if (Array.isArray(container)) return container.includes(wordUpper.toUpperCase());
  return false;
}

function countPositionalDifferences(a, b) {
  if (
    typeof a !== "string" ||
    typeof b !== "string" ||
    a.length !== b.length
  ) {
    throw new Error(
      "countPositionalDifferences: inputs must be strings of equal length"
    );
  }

  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) diff++;
  }

  return diff;
}

function isValidWord(w, allowedList) {
  if (!w || w.length !== 5) return false;
  if (!allowedList || allowedList.length === 0) return true;
  return allowedList.includes(w.toUpperCase());
}

function satisfiesForceGuess(g, forceGuess) {
  switch (forceGuess.type) {
    case "startsWith":
      return g.startsWith(forceGuess.letter.toUpperCase());

    case "endsWith":
      return g.endsWith(forceGuess.letter.toUpperCase());

    case "doubleLetter":
      return hasDoubleLetter(g);

    case "minVowels":
      return countVowels(g) >= forceGuess.count;

    case "maxVowels":
      return countVowels(g) <= forceGuess.count;

    case "firstLastSame":
      return g[0] === g[g.length - 1];

    case "palindrome":
      return isPalindrome(g);

    default:
      return false;
  }
}

function countVowels(word) {
  return [...word].filter(c => VOWELS.has(c.toUpperCase())).length;
}

function isPalindrome(word) {
  return word === word.split("").reverse().join("");
}

function hasDoubleLetter(word) {
  return /(.)\1/.test(word);
}
module.exports = { checkSecret,checkGuess, parseWordlist,satisfiesForceGuess  };
