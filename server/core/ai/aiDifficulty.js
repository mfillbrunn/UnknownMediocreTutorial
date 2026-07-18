const { createAI } = require("./genericAI");

const LEVELS = {
  1: {
    powerUseProb: 0.1,
    guessParams: {
      uninformed: 0.1,
      feasible:   0.4,
      optimal:    0.3,
      optimal2: 0.2
    },
    setterParams: {
    maxSecretChanges: 2,
      maxSecretsEvaluated: 15,
      randomness: 0.5,
      pOverlap: 0.1 ,
      pReductionGivenNoOverlap: 0.5
    }
  },
  2: {
     powerUseProb: 0.3,
    guessParams: {
      uninformed: 0,
      feasible:   0.2,
      optimal:    0.4,
      optimal2: 0.4
    },
    setterParams: {
  maxSecretChanges: 3,
      maxSecretsEvaluated: 30,
      randomness: 0.2,
      pOverlap: 0.3 ,
      pReductionGivenNoOverlap: 0.8
    }
  },
  3: {
     powerUseProb: 1,
    guessParams: {
      uninformed: 0,
      feasible:   0,
      optimal:    0,
      optimal2: 1
    },
    setterParams: {
   maxSecretChanges: 4,
      // Was 200 — the dominant CPU cost in the whole server (see
      // genericAI.js's pickAISecret/REMAINING_SAMPLE_CAP comments): this is
      // a direct multiplier on how many candidates get the expensive
      // "how many secrets would remain" evaluation each setter turn.
      // Combined with the sampling cap added there, 60 keeps a wide,
      // randomly-drawn search (actually LESS biased than the old
      // first-N-in-list-order slice) while cutting worst-case per-turn
      // cost roughly 25-30x.
      maxSecretsEvaluated: 60,
      randomness: 0,
      pOverlap: 1 ,
      pReductionGivenNoOverlap: 0.5
    }
  }
};

function getAI(state) {
  const config = LEVELS[state.aiDifficulty] || LEVELS[1];
  return createAI(config);
}

module.exports = { getAI };
