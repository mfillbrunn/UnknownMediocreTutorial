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
    maxSecretChanges: 2,
      maxSecretsEvaluated: 20,
      randomness: 0.5, 
      pOverlap: 0.1 ,
      pReductionGivenNoOverlap: 0.5 
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
    maxSecretChanges: 3,
      maxSecretsEvaluated: 50,
      randomness: 0.2, 
      pOverlap: 0.4 ,
      pReductionGivenNoOverlap: 0.5 
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
   maxSecretChanges: 6,
      maxSecretsEvaluated: 200,
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
