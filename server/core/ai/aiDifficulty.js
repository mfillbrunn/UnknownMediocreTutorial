const { createAI } = require("./genericAI");

const LEVELS = {
  1: {
    guessParams: {
      uninformed: 0.6,
      feasible:   0.3,
      optimal:    0.1
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
      uninformed: 0.3,
      feasible:   0.4,
      optimal:    0.3
    },
    setterParams: {
      maxSecretChanges: 1,
      maxSecretsEvaluated: 30,
      minReductionThreshold: 0.25,
      randomness: 0.4
    }
  },
  3: {
    guessParams: {
      uninformed: 0.1,
      feasible:   0.4,
      optimal:    0.5
    },
    setterParams: {
      maxSecretChanges: 2,
      maxSecretsEvaluated: 60,
      minReductionThreshold: 0.15,
      randomness: 0.15
    }
  }
};

function getAI(state) {
  const config = LEVELS[state.aiDifficulty] || LEVELS[1];
  return createAI(config);
}

module.exports = { getAI };
