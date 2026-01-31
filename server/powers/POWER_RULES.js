// server/powerRules.js
function isPowerAllowed(powerId, state) {
  const rule = POWER_RULES[powerId];
  return rule ? rule.allowed(state) === true : false;
}
const POWER_RULES = {
  hideTile: {
    allowed(state) {
      return (        
        state.turn === state.setter &&
        !state.powers.hideTileUsed
      );
    }
  },

  fakeFeedback: {
    allowed(state) {
      return (
        state.turn === state.setter &&
        !state.powers.fakeFeedbackUsed
      );
    }
  },

  blindGuess: {
    allowed(state) {
      return (
        state.turn === state.setter &&
        !state.powers.blindGuessUsed
      );
    }
  },
 rouletteSecret: {
    allowed(state) {
      return (
        state.turn === state.guesser &&
        !state.powers.rouletteSecretUsed
      );
    }
  },

  nonsense: {
    allowed(state) {
      return (
        state.turn === state.guesser &&
        !state.powers.nonsenseUsed
      );
    }
  },

  forceGuess: {
    allowed(state) {
      return (
        state.turn === state.setter &&
        !state.powers.forceGuessUsed
      );
    }
  },

  revealLetter: {
    allowed(state) {
      const p = state.powers.revealLetter;
      if (!p) return false;
      return (
        state.turn === state.guesser &&
        state.activePowers?.includes("revealLetter") &&
        p.ready === true &&
        p.used !== true
      );
    }
  },

  assassinWord: {
    allowed(state) {
      return (
        state.turn === state.setter &&
        !state.powers.assassinWordUsed
      );
    }
  },

  suggestGuess: {
    allowed(state) {
      return (
        state.turn === state.guesser &&
        !state.powers.suggestGuessUsed
      );
    }
  },

  vowelRefresh: {
    allowed(state) {
      return (
        state.turn === state.setter &&
        !state.powers?.rouletteSecretActive &&
        !state.powers.vowelRefreshUsed
      );
    }
  },

  suggestSecret: {
    allowed(state) {
      return (
        state.turn === state.setter &&
        !state.powers?.freezeActive &&
        !state.powers.suggestSecretUsed
      );
    }
  },

  confuseColors: {
    allowed(state) {
      return (
        state.turn === state.setter &&
        !state.powers.confuseColorsUsed
      );
    }
  },

  countOnly: {
    allowed(state) {
      return (
        state.turn === state.setter &&
        !state.powers.countOnlyUsed
      );
    }
  },

  forceTimer: {
    allowed(state) {
      return (
        state.turn === state.guesser &&
        !state.powers.forceTimerUsed
      );
    }
  },

  revealHistory: {
    allowed(state) {
      return (
        state.turn === state.guesser &&
        !state.powers.revealHistoryUsed &&
        state.history.length >= 3
      );
    }
  },

  blindSpot: {
    allowed(state) {
      return (
        state.turn === state.setter &&
        !state.powers.blindSpotUsed
      );
    }
  },

  stealthGuess: {
    allowed(state) {
        return (
            state.turn === state.guesser &&
            !state.powers.stealthGuessUsed
      );
    }
  },

  revealGreen: {
    allowed(state) {
      return (
        state.turn === state.guesser &&
        !state.powers.revealGreenUsed
      );
    }
  },

  magicMode: {
    allowed(state) {
      return (
        state.turn === state.guesser &&
        !state.powers.magicModeUsed
      );
    }
  },

  freezeSecret: {
    allowed(state) {
      return (
        state.turn === state.guesser&&
        !state.powers.freezeSecretUsed
      );
    }
  }
};


module.exports = {isPowerAllowed};

