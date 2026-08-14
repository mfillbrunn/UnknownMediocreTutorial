(() => {
  "use strict";

  const copy = {
    ROW: "Use every letter from one keyboard row across your guesses.",
    RARE: "Use 6 different rare letters from this match's drawn set of 7.",
    ALPHA: "Make 3 guesses whose letters go in alphabetical or reverse order.",
    DOUBLES: "Make 3 guesses with different doubled letters.",
    CHAIN: "Make 2 word-chain links between consecutive guesses.",
    HARDMODE: "Make 4 guesses that follow every clue already shown.",
    FIELDREPORT: "Complete 6 conditions for a yellow, or 8 for a green.",
    ALTERNATING: "Make 3 guesses that alternate consonants and vowels.",
    BOOKENDS: "Make 3 guesses that start and end with the same letter.",
    HALF_AM: "Make 3 guesses using only letters A to P.",
    HALF_NZ: "Make 3 guesses using only letters K to Z.",
    VOWELSHORTAGE: "Make 4 guesses with exactly one vowel."
  };

  const metadata = window.QUEST_METADATA;
  if (!metadata) return;

  for (const [type, meta] of Object.entries(metadata)) {
    if (!meta) continue;
    if (copy[type]) meta.desc = copy[type];
    delete meta.examples;
  }
})();
