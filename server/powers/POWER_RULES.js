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
        (state.powers.hideTileUses || 0) < 2
      );
    }
  },

  betMiss: {
    allowed(state) {
      return (
        state.turn === state.guesser &&
        !state.powers.betMissUsed
      );
    }
  },

  fieldReport: {
    allowed(state) {
      return (
        state.turn === state.guesser &&
        !state.powers.fieldReportUsed
      );
    }
  },

  letterProbe: {
    allowed(state) {
      return (
        state.turn === state.guesser &&
        !state.powers.letterProbeUsed
      );
    }
  },

  wiretap: {
    allowed(state) {
      // Active live-tap only in bullet/blitz, once per round.
      return (
        state.turn === state.guesser &&
        !state.powers.wiretapUsed &&
        (state.rankMode === "bullet" || state.rankMode === "blitz")
      );
    }
  },

  doubleGuess: {
    allowed(state) {
      return (
        state.turn === state.guesser &&
        !state.pendingGuess &&
        !state.powers.doubleGuessUsed
      );
    }
  },
    revealPenalty: {
    allowed(state) {
      return (
        state.turn === state.setter &&
        !state.powers.revealPenaltyUsed
      );
    }
  },
  letterLockout: {
    allowed(state) {
      const used = state.powers?.letterLockoutUsedLetters || [];
      return (
        state.turn === state.setter &&
        !!state.pendingGuess &&
        used.length < 26
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
        (state.powers.suggestGuessUses || 0) < 2
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
        !state.powers?.suggestSecretUsed
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
        state.turn === state.setter &&
        !state.powers.forceTimerUsed &&
        // Expiry resubmits the guesser's most recent guess this round --
        // guaranteed to exist by the time the setter is on the clock,
        // since a guesser turn always precedes the setter's first turn.
        state.history.length >= 1
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
        (state.powers.revealGreenUses || 0) < 2
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
  },

  delayedIntel: {
    allowed(state) {
      return (
        state.turn === state.setter &&
        !!state.pendingGuess &&
        !state.powers.delayedIntelUsed
      );
    }
  }
};


module.exports = {isPowerAllowed};

