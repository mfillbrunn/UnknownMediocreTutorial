// powers/powers/fieldReportServer.js
//
// Guesser power modeled on Force Move (forceGuessServer.js)'s condition
// vocabulary, but passive instead of forced: activating it reveals 3
// conditions, then the very next guess is checked against them (postScore,
// mirroring betMissServer.js's "evaluate the next scored guess, once"
// pattern). 2 of 3 met -> a free yellow letter (present, position
// unknown). All 3 met -> a free green letter at a random unrevealed
// position.

const engine = require("../powerEngineServer");
const { satisfiesForceGuess } = require("../../game-engine/validation");

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const CONDITION_TYPES = [
  "startsWith",
  "endsWith",
  "doubleLetter",
  "minVowels",
  "maxVowels",
  "firstLastSame",
  "palindrome"
];

function randomLetter() {
  return ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
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

function buildCondition(type) {
  switch (type) {
    case "startsWith":
    case "endsWith":
    case "doubleLetter":
      return { type, letter: randomLetter() };
    case "minVowels":
      return { type, count: 3 };
    case "maxVowels":
      return { type, count: 1 };
    default:
      return { type };
  }
}

function generateConditions() {
  const shuffled = CONDITION_TYPES.slice().sort(() => Math.random() - 0.5);
  const seen = new Set();
  const conditions = [];

  for (const type of shuffled) {
    if (conditions.length >= 3) break;
    const c = buildCondition(type);
    const key = optionKey(c);
    if (seen.has(key)) continue;
    seen.add(key);
    conditions.push(c);
  }

  return conditions;
}

engine.registerPower("fieldReport", {
  apply(state, action, roomId, io) {
    if (state.powers.fieldReportUsed) return false;
    if (state.turn !== state.guesser) return false;

    state.powers.fieldReportUsed = true;
    state.powers.fieldReportActive = true;
    state.powers.fieldReportConditions = generateConditions();

    io.to(roomId).emit("powerUsed", { type: "fieldReport" });
  },

  postScore(state, entry, roomId, io) {
    if (!state.powers?.fieldReportActive || state.turn !== state.setter) {
      return;
    }

    const conditions = state.powers.fieldReportConditions || [];
    const guess = entry.guess.toUpperCase();
    const metCount = conditions.filter(c => satisfiesForceGuess(guess, c)).length;

    // One shot: only the guess made right after activation is evaluated.
    state.powers.fieldReportActive = false;

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
        io.to(roomId).emit("toast", "Field Report: all 3 conditions met, but every position is already known.");
        return;
      }

      const index = options[Math.floor(Math.random() * options.length)];
      const letter = state.secret[index].toUpperCase();

      state.extraConstraints ??= [];
      if (!state.extraConstraints.some(c => c.type === "GREEN" && c.index === index)) {
        state.extraConstraints.push({ type: "GREEN", index, letter });
        io.to(roomId).emit("greenLetterRevealed", { index, letter, source: "fieldReport" });
      }
      io.to(roomId).emit("toast", `Field Report: all 3 conditions met! Revealed ${letter} in position ${index + 1}.`);
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
        io.to(roomId).emit("toast", "Field Report: 2 of 3 conditions met, but every letter is already known.");
        return;
      }

      const letter = options[Math.floor(Math.random() * options.length)];
      state.extraConstraints ??= [];
      state.extraConstraints.push({ type: "YELLOW", letter });
      io.to(roomId).emit("toast", `Field Report: 2 of 3 conditions met! ${letter} is somewhere in the secret.`);
      return;
    }

    io.to(roomId).emit("toast", `Field Report: only ${metCount} of 3 conditions met — no reveal this time.`);
  }
});
