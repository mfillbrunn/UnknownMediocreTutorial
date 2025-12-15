// powerRules.js — CENTRALIZED POWER RULE ENGINE

window.POWER_RULES = {

  // ======================
  // SETTER POWERS
  // ======================

  hideTile: {
    once: false,
    allowed(state, role) {
      return (
        state.phase === "normal" &&
        role === state.setter &&
        !state.powerUsedThisTurn
      );
    }
  },
  rowMaster: {
  once: true,
  allowed(state, role) {
    return (
      state.phase === "normal" &&
      role === state.guesser &&
      !state.powerUsedThisTurn
    );
  }
},

rareLetterBonus: {
  once: true,
  allowed(state, role) {
    return (
      state.phase === "normal" &&
      role === state.guesser &&
      !state.powerUsedThisTurn
    );
  }
},

suggestGuess: {
  once: true,
  allowed(state, role) {
    return (
      state.phase === "normal" &&
      role === state.guesser &&
      !state.powerUsedThisTurn
    );
  }
},
vowelRefresh: {
  once: true,
  allowed(state, role) {
    return (
      state.phase === "normal" &&
      role === state.setter &&
      !state.powerUsedThisTurn
    );
  }
},

suggestSecret: {
  once: true,
  allowed(state, role) {
    return (
      state.phase === "normal" &&
      role === state.setter &&
      !state.powerUsedThisTurn &&
      !state.powers.freezeActive       // cannot be used while frozen
    );
  }
},
confuseColors: {
  once: true,
  allowed(state, role) {
    return (
      state.phase === "normal" &&
      role === state.setter &&
      !state.powerUsedThisTurn &&
      !state.powers.magicModeJustUsed
    );
  }
},


  countOnly: {
    once: true,
    allowed(state, role) {
      return (
        state.phase === "normal" &&
        role === state.setter &&
        !state.powerUsedThisTurn
      );
    }
  },
forceTimer: {
  once: true,
  allowed(state, role) {
    return state.phase === "normal" &&
           role === state.guesser &&
           !state.powerUsedThisTurn;
  }
},

revealHistory: {
  once: true,
  allowed(state, role) {
    return state.phase === "normal" &&
           role === state.guesser &&
           state.history.length >= 2 &&
           !state.powerUsedThisTurn;
  }
},

blindSpot: {
  once: true,
  allowed(state, role) {
    return state.phase === "normal" &&
           role === state.setter &&
           !state.powerUsedThisTurn;
  }
},

stealthGuess: {
  once: true,
  allowed(state, role) {
    return state.phase === "normal" &&
           role === state.guesser &&
           !state.powerUsedThisTurn;
  }
},

  // ======================
  // GUESSER POWERS
  // ======================

  revealGreen: {
    once: true,
    allowed(state, role) {
      return (
        state.phase === "normal" &&
        role === state.guesser &&
        !state.powerUsedThisTurn 
      );
    }
  },
magicMode: {
  once: true,
  allowed(state, role) {
    return (
      state.phase === "normal" &&
      role === state.guesser &&
      !state.powerUsedThisTurn
    );
  }
},

  freezeSecret: {
    once: true,
    allowed(state, role) {
      return (
        state.phase === "normal" &&
        role === state.guesser &&
        !state.powerUsedThisTurn &&
        state.firstSecretSet          // setter has set at least one secret
      );
    },
    effects: {
      setterNewDisabled: true,
      setterFrozenBar: true
    }
  }
};
