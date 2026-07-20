// /game-engine/scoring.js — UNIVERSAL VERSION (Browser + Node)

/**
 * Score a guess against a secret word.
 * Produces array: ["🟩","🟨","⬛",...]
 */
function scoreGuess(secret, guess) {
  const fb = ["", "", "", "", ""];
  const rem = secret.split("");

  // Greens
  for (let i = 0; i < 5; i++) {
    if (guess[i] === secret[i]) {
      fb[i] = "🟩";
      rem[i] = null;
    }
  }

  // Yellows / Blacks
  for (let i = 0; i < 5; i++) {
    if (fb[i] === "") {
      const pos = rem.indexOf(guess[i]);
      if (pos !== -1) {
        fb[i] = "🟨";
        rem[pos] = null;
      } else {
        fb[i] = "⬛";
      }
    }
  }

  return fb;
}

// secretlength is accepted for backward compatibility but unused --
// "known" is now judged per-position (any real letter counts, a blank/
// space or a missing character doesn't) rather than by a single prefix
// length, since Drag Mode and locked tiles can leave a draft filled out
// of order (e.g. only position 3 known).
function scoreGuessIncomplete(secret, guess, secretlength) {
  const fb = ["", "", "", "", ""];
  const rem = secret.split("");
  const isKnown = c => !!c && c !== " ";
  // Greens
  for (let i = 0; i < 5; i++) {
    if (isKnown(secret[i]) && guess[i] === secret[i]) {
      fb[i] = "🟩";
      rem[i] = null;
    }
  }
  // Yellows / Blacks
  for (let i = 0; i < 5; i++) {
    if (fb[i] === "") {
      const pos = rem.findIndex(c => isKnown(c) && c === guess[i]);
      if (pos !== -1) {
        fb[i] = "🟨";
        rem[pos] = null;
      } else {
        fb[i] = "⬛";
      }
    }
  }
  return fb;
}

// Expose for browser
if (typeof window !== "undefined") {
  window.scoreGuess = scoreGuess;
}

// Export for Node.js backend
if (typeof module !== "undefined") {
  module.exports = { scoreGuess };
}
