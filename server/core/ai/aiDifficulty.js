const { createAI } = require("./genericAI");

// Three genuinely distinct opponents (see bench-ai-skill.js) — the
// previous 1/2/3 config only varied how the same 4 already-strong guess
// pools got blended and how many setter candidates got evaluated (15/30/
// 60), which benchmarking showed produced almost no measurable skill gap:
// every level converged in ~4.2-4.3 guesses on average as both guesser
// and setter. randomGuessProb/randomSecretProb (see genericAI.js) are the
// actual lever now — a real chance of a careless, clue-ignoring move —
// stacked on top of the existing reasoning-quality knobs so Easy isn't
// just "occasionally random" but consistently weaker end to end, and Hard
// is consistently sharper, not just luckier.
const LEVELS = {
  1: { // Easy
    powerUseProb: 0.15,
    guessParams: {
      uninformed: 0.5,
      feasible:   0.35,
      optimal:    0.1,
      optimal2:   0.05,
      randomGuessProb: 0.35
    },
    setterParams: {
      maxSecretChanges: 1,
      maxSecretsEvaluated: 8,
      randomness: 0.6,
      pOverlap: 0.05,
      pReductionGivenNoOverlap: 0.3,
      randomSecretProb: 0.4
    }
  },
  2: { // Medium
    powerUseProb: 0.4,
    guessParams: {
      uninformed: 0.1,
      feasible:   0.3,
      optimal:    0.35,
      optimal2:   0.25,
      randomGuessProb: 0.08
    },
    setterParams: {
      maxSecretChanges: 3,
      maxSecretsEvaluated: 25,
      randomness: 0.25,
      pOverlap: 0.35,
      pReductionGivenNoOverlap: 0.7,
      randomSecretProb: 0.08
    }
  },
  3: { // Hard
    powerUseProb: 0.85,
    guessParams: {
      uninformed: 0,
      feasible:   0.1,
      optimal:    0.2,
      optimal2:   0.7,
      randomGuessProb: 0
    },
    setterParams: {
      maxSecretChanges: 5,
      // Was 200 — the dominant CPU cost in the whole server (see
      // genericAI.js's pickAISecret/REMAINING_SAMPLE_CAP comments): this is
      // a direct multiplier on how many candidates get the expensive
      // "how many secrets would remain" evaluation each setter turn.
      // Combined with the sampling cap added there, 70 keeps a wide,
      // randomly-drawn search (actually LESS biased than the old
      // first-N-in-list-order slice) while cutting worst-case per-turn
      // cost roughly 25-30x.
      maxSecretsEvaluated: 70,
      randomness: 0,
      pOverlap: 0.9,
      pReductionGivenNoOverlap: 0.85,
      randomSecretProb: 0
    }
  }
};

function getAI(state) {
  const config = LEVELS[state.aiDifficulty] || LEVELS[1];
  return createAI(config);
}

module.exports = { getAI };
