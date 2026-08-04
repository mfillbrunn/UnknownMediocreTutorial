// powerRules.js — CENTRALIZED POWER RULE ENGINE

window.POWER_RULES = {

  // Setter powers
betMiss: {
    once: false,
    allowed(state, role) {
      return (
        state.phase === "normal" &&
        role === "guesser" &&
        !state.powerUsedThisTurn
      );
    }
  },
  fieldReport: {
    once: true,
    allowed(state, role) {
      return (
        state.phase === "normal" &&
        role === "guesser" &&
        !state.powerUsedThisTurn
      );
    }
  },
  letterProbe: {
    once: true,
    allowed(state, role) {
      return (
        state.phase === "normal" &&
        role === "guesser" &&
        !state.powerUsedThisTurn
      );
    }
  },
  wiretap: {
    once: false,
    allowed(state, role) {
      return (
        state.phase === "normal" &&
        role === "guesser" &&
        !state.powerUsedThisTurn &&
        !state.powers?.wiretapUsed &&
        (state.rankMode === "bullet" || state.rankMode === "blitz")
      );
    }
  },
  doubleGuess: {
    once: true,
    allowed(state, role) {
      return (
        state.phase === "normal" &&
        role === "guesser" &&
        !state.pendingGuess &&
        !state.powerUsedThisTurn
      );
    }
  },
  revealPenalty: {
    once: false,
    allowed(state, role) {
      return (
        state.phase === "normal" &&
        role === "setter" &&
        !state.powerUsedThisTurn
      );
    }
  },
  hideTile: {
    allowed(state, role) {
      return (
        state.phase === "normal" &&
        role === "setter" &&
        !state.powerUsedThisTurn &&
        (state.powers?.hideTileUses || 0) < 2
      );
    }
  },
  fakeFeedback: {
    once: false,
    allowed(state, role) {
      return (
        state.phase === "normal" &&
        role === "setter" &&
        !state.powerUsedThisTurn 
      );
    }
  },
  blindGuess: {
  once: true,
  allowed(state, role) {
    return (
      state.phase === "normal" &&
      role === "setter" &&
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
      role === "guesser" &&
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
      role === "guesser" &&
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
      role === "setter" &&
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
      role === "guesser" &&
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
      role === "setter" &&
      !state.powerUsedThisTurn &&
      !state.powers.assassinWordUsed 
    );
  }
},

suggestGuess: {
  once: true,
  allowed(state, role) {
    return (
      state.phase === "normal" &&
      role === "guesser" &&
      !state.powerUsedThisTurn
    );
  }
},
vowelRefresh: {
  once: true,
  allowed(state, role) {
    return (
      state.phase === "normal" &&
      role === "setter" &&
      !state.powerUsedThisTurn 
    );
  }
},

suggestSecret: {
  once: true,
  allowed(state, role) {
    return (
      state.phase === "normal" &&
      role === "setter" &&
      !state.powerUsedThisTurn &&
      !state.powers?.freezeActive       // cannot be used while frozen
    );
  }
},
confuseColors: {
  once: true,
  allowed(state, role) {
    return (
      state.phase === "normal" &&
      role === "setter" &&
      !state.powerUsedThisTurn &&
      !state.powers?.magicModeJustUsed
    );
  }
},


  countOnly: {
    once: true,
    allowed(state, role) {
      return (
        state.phase === "normal" &&
        role === "setter" &&
        !state.powerUsedThisTurn
      );
    }
  },
forceTimer: {
  once: true,
  allowed(state, role) {
    return state.phase === "normal" &&
           role === "setter" &&
           state.history.length >= 1 &&
           !state.powerUsedThisTurn;
  }
},

revealHistory: {
  once: true,
  allowed(state, role) {
    return state.phase === "normal" &&
           role === "guesser" &&
           state.history.length >= 3 &&
           !state.powerUsedThisTurn;
  }
},

blindSpot: {
  once: true,
  allowed(state, role) {
    return state.phase === "normal" &&
           role === "setter" &&
           !state.powerUsedThisTurn;
  }
},

stealthGuess: {
  once: true,
  allowed(state, role) {
    return state.phase === "normal" &&
           role === "guesser" &&
           !state.powerUsedThisTurn;
  }
},

delayedIntel: {
  once: true,
  allowed(state, role) {
    return state.phase === "normal" &&
           role === "setter" &&
           !!state.pendingGuess &&
           !state.powerUsedThisTurn;
  }
},

  // Guesser powers
  revealGreen: {
    allowed(state, role) {
      return (
        state.phase === "normal" &&
        role === "guesser" &&
        !state.powerUsedThisTurn &&
        (state.powers?.revealGreenUses || 0) < 2
      );
    }
  },
magicMode: {
  once: true,
  allowed(state, role) {
    return (
      state.phase === "normal" &&
      role === "guesser" &&
      !state.powerUsedThisTurn
    );
  }
},

  freezeSecret: {
    once: true,
    allowed(state, role) {
      return (
        state.phase === "normal" &&
        role === "guesser" &&
        !state.powerUsedThisTurn 
      );
    },
    effects: {
      setterNewDisabled: true,
      setterFrozenBar: true
    }
  }
};
