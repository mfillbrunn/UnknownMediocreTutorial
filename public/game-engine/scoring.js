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

// Expose for browser
if (typeof window !== "undefined") {
  window.scoreGuess = scoreGuess;
}

// Export for Node.js backend
if (typeof module !== "undefined") {
  module.exports = { scoreGuess };
}
