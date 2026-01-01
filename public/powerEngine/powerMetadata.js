window.POWER_METADATA = {
  confuseColors: {
    label: "Blue Mode",
    desc: "Turns all green and yellow feedback blue for one round.",
    icon: "palette-swap",
    emoji: "🔵",
    color: "#3B82F6"
  },

  countOnly: {
    label: "Count Only",
    desc: "Shows only the total number of greens and yellows, not their positions.",
    icon: "tally",
    emoji: "📊",
    color: "#6B7280"
  },

  forceGuess: {
    label: "Force Guess",
    desc: "Forces the next guess to satisfy a special restriction.",
    icon: "lock-input",
    emoji: "🔒",
    color: "#F97316"
  },

  forceTimer: {
    label: "Force Timer",
    desc: "The setter has only a short time to submit a new secret.",
    icon: "hourglass",
    emoji: "⏳",
    color: "#EF4444"
  },

  freezeSecret: {
    label: "Freeze Secret",
    desc: "Prevents the setter from changing the secret next round.",
    icon: "snowflake",
    emoji: "❄️",
    color: "#38BDF8"
  },

  hideTile: {
    label: "Hide Tile",
    desc: "Hides the feedback on one random tile for one round.",
    icon: "hidden-tile",
    emoji: "⬛",
    color: "#111827"
  },

  magicMode: {
    label: "Magic Mode",
    desc: "Each yellow tile reveals one green letter next round.",
    icon: "wand",
    emoji: "✨",
    color: "#A855F7"
  },

  revealGreen: {
    label: "Sneak Letter",
    desc: "Reveals one letter of the current secret — the setter may still change it.",
    icon: "peek-letter",
    emoji: "👁️",
    color: "#22C55E"
  },

  revealHistory: {
    label: "Reveal History",
    desc: "Reveals a secret from several rounds ago.",
    icon: "rewind",
    emoji: "⏪",
    color: "#64748B"
  },

  revealLetter: {
    label: "Reveal Letter",
    desc: "Earn a guaranteed green letter by meeting a condition.",
    icon: "letter-plus",
    emoji: "🟩",
    color: "#16A34A",

    variants: {
      ROW: {
        label: "Row Master",
        desc: "Reveal a green letter by having used all letters in a row.",
        icon: "keyboard-row",
        emoji: "⌨️"
      },
      RARE: {
        label: "Rare Letter Bonus",
        desc: "Reveal a rare green letter by having used at least 5 out of QWYJKXVZ.",
        icon: "diamond-letter",
        emoji: "💎"
      }
    }
  },

  stealthGuess: {
    label: "Stealth Guess",
    desc: "The setter cannot see the next guess.",
    icon: "ghost",
    emoji: "👻",
    color: "#4B5563"
  },

  suggestGuess: {
    label: "Suggest Guess",
    desc: "Suggests a valid guess that fits all known constraints.",
    icon: "lightbulb",
    emoji: "💡",
    color: "#FACC15"
  },

  suggestSecret: {
    label: "Suggest Secret",
    desc: "Suggests a valid secret consistent with all feedback.",
    icon: "brain",
    emoji: "🧠",
    color: "#E879F9"
  },

  vowelRefresh: {
    label: "Vowel Refresh",
    desc: "Resets all vowels used in the last round if they were unused before.",
    icon: "vowel-cycle",
    emoji: "🔁",
    color: "#0EA5E9"
  },

  blindSpot: {
    label: "Blind Spot",
    desc: "Hides feedback for one tile for the rest of the round.",
    icon: "fog",
    emoji: "🌫️",
    color: "#374151"
  },

  assassinWord: {
    label: "Assassin Word",
    desc: "Choose a word that instantly ends the game if guessed.",
    icon: "skull-word",
    emoji: "☠️",
    color: "#991B1B"
  },

  blindGuess: {
    label: "Blind Guess",
    desc: "Hides all feedback and keyboard colors for the next guess.",
    icon: "blindfold",
    emoji: "🙈",
    color: "#000000"
  }
};
