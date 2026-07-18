// utils/letterProfile.js — shared math for the "Letter Profile" guesser
// power: a category (alphabet half / keyboard row / vowel-consonant) is
// chosen once for the whole match, and both sides get to see how a given
// 5-letter word's letters break down across that category.
//
// This module only ever returns small derived counts, never the word
// itself — callers that expose the guesser-facing result (computed from
// the real state.secret) rely on that to avoid leaking the secret.

const MODES = ["halves", "rows", "vowels"];

const VOWELS = new Set(["A", "E", "I", "O", "U"]);
// Same QWERTY row groupings used by the revealLetter power's ROW variant
// (server/powers/powers/revealLetterServer.js) — there's no shared export
// for it there, so this is its own copy.
const ROW_TOP = new Set("QWERTYUIOP");
const ROW_HOME = new Set("ASDFGHJKL");
const ROW_BOTTOM = new Set("ZXCVBNM");

function pickLetterProfileMode() {
  return MODES[Math.floor(Math.random() * MODES.length)];
}

function computeLetterProfileStats(word, mode) {
  if (!word || word.length !== 5 || !MODES.includes(mode)) return null;
  const letters = word.toUpperCase().split("");

  if (mode === "halves") {
    let am = 0, nz = 0;
    for (const ch of letters) {
      if (ch >= "A" && ch <= "M") am++;
      else if (ch >= "N" && ch <= "Z") nz++;
    }
    return { mode, am, nz };
  }

  if (mode === "rows") {
    let top = 0, home = 0, bottom = 0;
    for (const ch of letters) {
      if (ROW_TOP.has(ch)) top++;
      else if (ROW_HOME.has(ch)) home++;
      else if (ROW_BOTTOM.has(ch)) bottom++;
    }
    return { mode, top, home, bottom };
  }

  // vowels
  let vowels = 0, consonants = 0;
  for (const ch of letters) {
    if (VOWELS.has(ch)) vowels++;
    else consonants++;
  }
  return { mode, vowels, consonants };
}

module.exports = { MODES, pickLetterProfileMode, computeLetterProfileStats };
