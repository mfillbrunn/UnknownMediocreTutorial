module.exports = {
  hideTile: {
    role: "guesser",
    aiUsable: true,
    isUsed: s => s.powers.hideTileUsed,
    buildAction: () => ({
      type: "USE_POWER",
      power: "hideTile"
    })
  },

  blindGuess: {
    role: "guesser",
    aiUsable: true,
    isUsed: s => s.powers.blindGuessUsed,
    buildAction: () => ({
      type: "USE_POWER",
      power: "blindGuess"
    })
  },

  forceGuess: {
    role: "setter",
    aiUsable: true,
    isUsed: s => s.powers.forceGuessUsed,
    buildAction: () => ({
      type: "USE_POWER",
      power: "forceGuess"
    })
  },

  revealGreen: {
    role: "guesser",
    aiUsable: true,
    isUsed: s => s.powers.revealGreenUsed,
    buildAction: s => ({
      type: "USE_POWER",
      power: "revealGreen",
      index: Math.floor(Math.random() * 5)
    })
  },

  freezeSecret: {
    role: "setter",
    aiUsable: true,
    isUsed: s => s.powers.freezeSecretUsed,
    buildAction: () => ({
      type: "USE_POWER",
      power: "freezeSecret"
    })
  },

  confuseColors: {
    role: "setter",
    aiUsable: true,
    isUsed: s => s.powers.confuseColorsUsed,
    buildAction: () => ({
      type: "USE_POWER",
      power: "confuseColors"
    })
  },

  countOnly: {
    role: "setter",
    aiUsable: true,
    isUsed: s => s.powers.countOnlyUsed,
    buildAction: s => ({
      type: "USE_POWER",
      power: "countOnly",
      word: s.pendingGuess
    })
  },

  suggestGuess: {
    role: "guesser",
    aiUsable: true,
    isUsed: s => s.powers.suggestGuessUsed,
    buildAction: () => ({
      type: "USE_POWER",
      power: "suggestGuess"
    })
  },

  suggestSecret: {
    role: "setter",
    aiUsable: true,
    isUsed: s => s.powers.suggestSecretUsed,
    buildAction: () => ({
      type: "USE_POWER",
      power: "suggestSecret"
    })
  },

  revealHistory: {
    role: "guesser",
    aiUsable: true,
    isUsed: s => s.powers.revealHistoryUsed,
    buildAction: () => ({
      type: "USE_POWER",
      power: "revealHistory"
    })
  },

  blindSpot: {
    role: "guesser",
    aiUsable: true,
    isUsed: s => s.powers.blindSpotUsed,
    buildAction: s => ({
      type: "USE_POWER",
      power: "blindSpot",
      index: Math.floor(Math.random() * s.history.length)
    })
  },

  stealthGuess: {
    role: "guesser",
    aiUsable: true,
    isUsed: s => s.powers.stealthGuessUsed,
    buildAction: () => ({
      type: "USE_POWER",
      power: "stealthGuess"
    })
  },

  forceTimer: {
    role: "setter",
    aiUsable: true,
    isUsed: s => s.powers.forceTimerUsed,
    buildAction: () => ({
      type: "USE_POWER",
      power: "forceTimer"
    })
  },

  magicMode: {
    role: "guesser",
    aiUsable: true,
    isUsed: s => s.powers.magicModeUsed,
    buildAction: () => ({
      type: "USE_POWER",
      power: "magicMode"
    })
  },

  vowelRefresh: {
    role: "guesser",
    aiUsable: true,
    isUsed: s => s.powers.vowelRefreshUsed,
    buildAction: () => ({
      type: "USE_POWER",
      power: "vowelRefresh"
    })
  },

 assassinWord: {
    role: "setter",
    aiUsable: false,
    isUsed: s => s.powers.assassinWordUsed,
    buildAction: () => ({
      type: "USE_POWER",
      power: "assassinWord"
    })
  },

  revealLetter: {
    role: "guesser",
    aiUsable: true,
    isUsed: s => s.powers.revealLetter.used,
    buildAction: () => ({
      type: "USE_POWER",
      power: "revealLetter"
    })
  }
};
