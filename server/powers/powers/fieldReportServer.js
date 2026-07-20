// powers/powers/fieldReportServer.js
//
// Guesser power modeled on Force Move (forceGuessServer.js)'s condition
// vocabulary, but passive instead of forced: activating it reveals 3
// conditions, then the very next guess is checked against them. 2 of 3
// met -> a free yellow letter (present, position unknown). All 3 met ->
// a free green letter at a random unrevealed position.
//
// Evaluated via onGuessSubmitted, not postScore: whether the guess meets
// the conditions depends only on the guess word itself, never on the
// secret or its feedback, so there's no reason to wait for the setter's
// Keep/New decision to know the answer. Firing here also means any GREEN
// extraConstraint this grants is already in place before that decision,
// so isConsistentWithHistory (game-engine/history.js) automatically
// binds the setter to a secret consistent with it — no separate
// enforcement needed. Both the activation and the result are reported
// from this single hook, in that order, so they land as one action-log
// line instead of two.
//
// The 3 conditions are derived FROM a real allowed-guess word, not picked
// independently at random — that guarantees at least one valid word (the
// one they were derived from) satisfies all three simultaneously, however
// mismatched the conditions look at a glance. That word doesn't need to
// be consistent with prior feedback/history; it only has to be a valid
// guess in general.

const path = require("path");
const fs = require("fs");
const { parseWordlist, satisfiesForceGuess } = require("../../game-engine/validation");
const engine = require("../powerEngineServer");

let ALLOWED_GUESSES = [];
try {
  const allowedPath = path.join(__dirname, "../../wordlists/allowed_guesses.txt");
  const raw = fs.readFileSync(allowedPath, "utf8");
  ALLOWED_GUESSES = parseWordlist(raw);
} catch (err) {
  console.warn("Could not load allowed guesses for fieldReport:", err.message);
}

const VOWELS = new Set(["A", "E", "I", "O", "U"]);
const CONDITION_TYPES = [
  "startsWith",
  "endsWith",
  "doubleLetter",
  "minVowels",
  "maxVowels",
  "firstLastSame",
  "palindrome"
];

function countVowels(word) {
  return [...word].filter(c => VOWELS.has(c)).length;
}

function isPalindrome(word) {
  return word === word.split("").reverse().join("");
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function optionKey(o) {
  switch (o.type) {
    case "startsWith":
    case "endsWith":
    case "doubleLetter":
      return `${o.type}:${o.letter}`;
    case "minVowels":
    case "maxVowels":
      return `${o.type}:${o.count}`;
    default:
      return o.type;
  }
}

// Builds a condition of `type` that is true for `word` — or null if `type`
// doesn't apply to this particular word (e.g. no double letter, not a
// palindrome). startsWith/endsWith/minVowels/maxVowels are always
// derivable for any word, so at least 4 of the 7 types are always
// available — 3 valid, distinct conditions are guaranteed on every call.
function conditionForWord(type, word) {
  switch (type) {
    case "startsWith":
      return { type, letter: word[0] };
    case "endsWith":
      return { type, letter: word[4] };
    case "doubleLetter": {
      for (let i = 0; i < 4; i++) {
        if (word[i] === word[i + 1]) return { type, letter: word[i] };
      }
      return null;
    }
    case "minVowels":
      return { type, count: countVowels(word) };
    case "maxVowels":
      return { type, count: countVowels(word) };
    case "firstLastSame":
      return word[0] === word[4] ? { type } : null;
    case "palindrome":
      return isPalindrome(word) ? { type } : null;
    default:
      return null;
  }
}

function generateConditions() {
  if (!ALLOWED_GUESSES.length) return [];

  const word = ALLOWED_GUESSES[Math.floor(Math.random() * ALLOWED_GUESSES.length)].toUpperCase();
  const seen = new Set();
  const conditions = [];

  for (const type of shuffle(CONDITION_TYPES)) {
    if (conditions.length >= 3) break;
    const c = conditionForWord(type, word);
    if (!c) continue;
    const key = optionKey(c);
    if (seen.has(key)) continue;
    seen.add(key);
    conditions.push(c);
  }

  // startsWith/endsWith/minVowels/maxVowels never return null, so this
  // only recurses in the vanishingly rare case those 4 collapse to fewer
  // than 3 distinct keys (e.g. a word whose vowel count as both min and
  // max dedupes down) — just pick a different word.
  return conditions.length >= 3 ? conditions : generateConditions();
}

engine.registerPower("fieldReport", {
  apply(state, action, roomId, io) {
    if (state.powers.fieldReportUsed) return false;
    if (state.turn !== state.guesser) return false;

    state.powers.fieldReportUsed = true;
    state.powers.fieldReportActive = true;
    state.powers.fieldReportConditions = generateConditions();

    // No public emit here on purpose — activation and result now report
    // together from onGuessSubmitted (see file header), so there's a
    // single log line instead of an empty "used" line followed by the
    // real result. The InfoBadgeEngine status bar already shows the 3
    // conditions the instant this fires, which is confirmation enough.
  },

  onGuessSubmitted(state, guess, roomId, io) {
    if (!state.powers?.fieldReportActive) return;

    const conditions = state.powers.fieldReportConditions || [];
    guess = guess.toUpperCase();
    const metCount = conditions.filter(c => satisfiesForceGuess(guess, c)).length;

    // One shot: only the guess made right after activation is evaluated.
    state.powers.fieldReportActive = false;

    io.to(roomId).emit("powerUsed", { type: "fieldReport" });

    if (metCount >= 3) {
      const greenPositions = new Set();
      for (const past of state.history ?? []) {
        if (!past?.fb) continue;
        for (let i = 0; i < 5; i++) {
          if (past.fb[i] === "🟩") greenPositions.add(i);
        }
      }
      for (const c of state.extraConstraints ?? []) {
        if (c.type === "GREEN") greenPositions.add(c.index);
      }

      const options = [0, 1, 2, 3, 4].filter(i => !greenPositions.has(i));
      if (!options.length) {
        io.to(roomId).emit("fieldReportResult", { metCount, reward: "none-left", conditions });
        return;
      }

      const index = options[Math.floor(Math.random() * options.length)];
      const letter = state.secret[index].toUpperCase();

      state.extraConstraints ??= [];
      if (!state.extraConstraints.some(c => c.type === "GREEN" && c.index === index)) {
        state.extraConstraints.push({ type: "GREEN", index, letter });
        io.to(roomId).emit("greenLetterRevealed", { index, letter, source: "fieldReport" });
      }
      io.to(roomId).emit("fieldReportResult", { metCount, reward: "green", letter, index, conditions });
      return;
    }

    if (metCount === 2) {
      const known = new Set();
      for (const past of state.history ?? []) {
        if (!past?.fb) continue;
        for (let i = 0; i < 5; i++) {
          if (past.fb[i] === "🟩" || past.fb[i] === "🟨") known.add(past.guess[i]);
        }
      }
      for (const c of state.extraConstraints ?? []) {
        if (c.letter) known.add(c.letter.toUpperCase());
      }

      const secretLetters = [...new Set(state.secret.toUpperCase().split(""))];
      const options = secretLetters.filter(l => !known.has(l));

      if (!options.length) {
        io.to(roomId).emit("fieldReportResult", { metCount, reward: "none-left", conditions });
        return;
      }

      const letter = options[Math.floor(Math.random() * options.length)];
      state.extraConstraints ??= [];
      state.extraConstraints.push({ type: "YELLOW", letter });
      io.to(roomId).emit("fieldReportResult", { metCount, reward: "yellow", letter, conditions });
      return;
    }

    io.to(roomId).emit("fieldReportResult", { metCount, reward: "none", conditions });
  }
});

// Reused by the Quest system (server/powers/powers/questServer.js) for its
// own FIELDREPORT-style objective -- same condition vocabulary and
// generation, just evaluated across multiple guesses instead of one.
module.exports = { generateConditions };
