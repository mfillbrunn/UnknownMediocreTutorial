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
  fakeFeedback: {
    once: false,
    allowed(state, role) {
      return (
        computeRemainingAfterIndex(state.history.length - 1) >= 2 &&
        state.phase === "normal" &&
        role === state.setter &&
        !state.powerUsedThisTurn 
      );
    }
  },
  blindGuess: {
  once: true,
  allowed(state, role) {
    return (
      state.phase === "normal" &&
      role === state.setter &&
      !state.powerUsedThisTurn &&
      !state.powers.blindGuessUsed
    );
  }
},
  rouletteSecret: {
  once: true,
  allowed(state, role) {
    return (
      state.phase === "normal" &&
      role === state.guesser &&
      !state.powerUsedThisTurn &&
      !state.powers.rouletteSecretUsed
    );
  }
},
   nonsense: {
  once: true,
  allowed(state, role) {
    return (
      state.phase === "normal" &&
      role === state.guesser &&
      !state.powerUsedThisTurn &&
      !state.powers.nonsenseUsed
    );
  }
},
forceGuess: {
  once: true,
  allowed(state, role) {
    return (      
      state.phase === "normal" &&
      role === state.setter &&
      !state.powerUsedThisTurn &&
      !state.powers.forceGuessUsed
    );
  }
},

revealLetter: {
  once: true,
  allowed(state, role) {
    const p = state.powers.revealLetter;
    if (!p) return false;

    return (
      state.phase === "normal" &&
      role === state.guesser &&
      !state.powerUsedThisTurn &&
      state.activePowers?.includes("revealLetter") &&
      p.ready === true &&
      p.used !== true
    );
  }
},


assassinWord: {
  once: true,
  allowed(state, role) {
    return (
      state.phase === "normal" &&
      role === state.setter &&
      !state.powerUsedThisTurn &&
      !state.powers.assassinWordUsed &&
      state.activePowers?.includes("assassinWord")
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
      !state.powerUsedThisTurn &&
      state.powers?.rouletteSecretActive
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
           state.history.length >= 3 &&
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
