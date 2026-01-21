const { createAI } = require("./genericAI");

const LEVELS = {
  1: {
    guessParams: {
      uninformed: 0.1,
      feasible:   0.4,
      optimal:    0.3,
      optimal2: 0.2
    },
    setterParams: {
      maxSecretChanges: 0,
      maxSecretsEvaluated: 10,
      minReductionThreshold: 0.4,
      randomness: 1.0
    }
  },
  2: {
    guessParams: {
      uninformed: 0,
      feasible:   0.1,
      optimal:    0.8,
      optimal2: 0.1
    },
    setterParams: {
      maxSecretChanges: 4,
      maxSecretsEvaluated: 100,
      minReductionThreshold: 0.05,
      randomness: 0.1
    }
  },
  3: {
    guessParams: {
      uninformed: 0,
      feasible:   0.1,
      optimal:    0.1,
      optimal2: 0.8
    },
    setterParams: {
      maxSecretChanges: 4,
      maxSecretsEvaluated: 100,
      minReductionThreshold: 0.05,
      randomness: 0.1
    }
  }
};

function getAI(state) {
  const config = LEVELS[state.aiDifficulty] || LEVELS[1];
  return createAI(config);
}

module.exports = { getAI };
