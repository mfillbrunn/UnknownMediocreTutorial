// server/powerMetadata.js
module.exports = {
  confuseColors: { label: "Blue Mode", role: "setter" },
  countOnly: { label: "Count Only" , role: "setter"},
  forceGuess: { label: "Force Guess" , role: "setter"},
  fakeFeedback: { label: "Fake Feedback" , role: "setter"},
  forceTimer: { label: "Force Timer" , role: "guesser"},
  freezeSecret: { label: "Freeze Secret" , role: "guesser"},
  hideTile: { label: "Hide Tile", role: "setter" },
  rouletteSecret: { label: "Roulette Secret" , role: "guesser"},
  magicMode: { label: "Magic Mode", role: "guesser" },
  revealGreen: { label: "Sneak Letter" , role: "guesser"},
  revealHistory: { label: "Reveal History", role: "guesser" },
  revealLetter: {
    label: "Reveal Letter", role: "guesser",
    variants: {
      ROW: { label: "Row Master" },
      RARE: { label: "Rare Letter Bonus" }
    }
  },
  stealthGuess: { label: "Stealth Guess" , role: "guesser"},
  suggestGuess: { label: "Suggest Guess" , role: "guesser"},
  suggestSecret: { label: "Suggest Secret" , role: "setter"},
  vowelRefresh: { label: "Vowel Refresh" , role: "setter"},
  assassinWord: { label: "Assassin Word", role: "setter" },
  blindGuess:{ label: "Blind Guess" , role: "setter"},
  blindSpot:{ label: "Blind Spot", role: "setter" },
};
