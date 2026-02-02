window.POWER_METADATA = {
  confuseColors: {
    label: "Jam Signals",
    desc: "Turn all green and yellow feedback blue for one round.",
    icon: "palette-swap",
    emoji: "📡",
    color: "#3B82F6"
  },
  betMiss: {
    label: "Risky Maneuver",
    desc: "The Inspector makes a bet on how many misses the next guess will have; if correct, they get rewarded with a green letter.",
    icon: "casino",
    emoji: "🎯",
    color: "#F59E0B"
  },
  fakeFeedback: {
    label: "Falsify Intel",
    desc: "The Inspector will see two feedbacks—one real, one fabricated.",
    icon: "mask",
    emoji: "🎭",
    color: "#6B7280"
  },

  countOnly: {
    label: "Redact Report",
    desc: "Redact the positions and show only only the total number of greens and yellows.",
    icon: "tally",
    emoji: "📄",
    color: "#6B7280"
  },

  rouletteSecret: {
    label: "Break Cover",
    desc: "The spy's next secret is randomly selected.",
    icon: "roulette",
    emoji: "🎰",
    color: "#6B7280"
  },

  nonsense: {
    label: "Signal Scramble",
    desc: "This round’s guess does not need to be a real word.",
    icon: "shuffle",
    emoji: "🌀",
    color: "#7C3AED"
  },

  forceGuess: {
    label: "Force a Move",
    desc: "Force the next guess to follow one of three randomly chosen restrictions.",
    icon: "lock-input",
    emoji: "🔒",
    color: "#F97316"
  },

  forceTimer: {
    label: "Time Pressure",
    desc: "The spy has only a short time to submit a new secret.",
    icon: "hourglass",
    emoji: "⏳",
    color: "#EF4444"
  },

  freezeSecret: {
    label: "Lockdown",
    desc: "Prevent the spy from changing the secret next round.",
    icon: "snowflake",
    emoji: "❄️",
    color: "#38BDF8"
  },

  hideTile: {
    label: "Hide Evidence",
    desc: "Hide the feedback on one random tile for one round.",
    icon: "hidden-tile",
    emoji: "⬛",
    color: "#1e1eba"
  },

  magicMode: {
    label: "Inside Job",
    desc: "Turn each yellow tile next round green.",
    icon: "wand",
    emoji: "✨",
    color: "#A855F7"
  },

  revealGreen: {
    label: "Leak Info",
    desc: "Reveal one letter of the current secret—the spy may still change it.",
    icon: "peek-letter",
    emoji: "👁️",
    color: "#22C55E"
  },

  revealHistory: {
    label: "Solve Cold Case",
    desc: "Reveals a secret from several rounds ago. Can only be used after 3 rounds.",
    icon: "rewind",
    emoji: "⏪",
    color: "#64748B"
  },

  revealLetter: {
    label: "Confirm Lead",
    desc: "Earn a guaranteed green letter by meeting specific usage criteria.",
    icon: "letter-plus",
    emoji: "🟩",
    color: "#16A34A",

    variants: {
      ROW: {
        label: "Full Sweep",
        desc: "Reveal a green letter by using all letters in a keyboard row.",
        icon: "keyboard-row",
        emoji: "⌨️"
      },
      RARE: {
        label: "High-Value Target",
        desc: "Reveal a rare green letter by using at least 4 of QWYJKXVZ.",
        icon: "diamond-letter",
        emoji: "💎"
      }
    }
  },

  stealthGuess: {
    label: "Move in Shadows",
    desc: "Hide the guess from the spy next turn.",
    icon: "ghost",
    emoji: "👻",
    color: "#4B5563"
  },

  suggestGuess: {
    label: "Analyst Tip",
    desc: "Receive a valid guess that fits all known constraints.",
    icon: "lightbulb",
    emoji: "💡",
    color: "#FACC15"
  },

  suggestSecret: {
    label: "Profiler Insight",
    desc: "Receive a valid secret consistent with all feedback.",
    icon: "brain",
    emoji: "🧠",
    color: "#E879F9"
  },

  vowelRefresh: {
    label: "Signal Refresh",
    desc: "Reset all vowels used in the last round if they were unused before.",
    icon: "vowel-cycle",
    emoji: "🔁",
    color: "#0EA5E9"
  },

  blindSpot: {
    label: "Create Dead Zone",
    desc: "Hide feedback for one tile for the rest of the round.",
    icon: "fog",
    emoji: "🌫️",
    color: "#374151"
  },
  revealPenalty: {
    label: "Marked Weakness",
    desc: "Reveal an unknown letter. For every time it appears in the final secret, the spy will score two extra points.",
    icon: "warning",
    emoji: "⚠️",
    color: "#B45309"
  },
  assassinWord: {
    label: "Set Kill Phrase",
    desc: "Choose a word that instantly ends the game if guessed. The earlier it’s planted, the greater the reward—but it can’t be too similar to your secret.",
    icon: "skull-word",
    emoji: "☠️",
    color: "#991B1B"
  },

  blindGuess: {
    label: "Total Blackout",
    desc: "Hide all feedback and keyboard colors for the next guess.",
    icon: "blindfold",
    emoji: "🙈",
    color: "#000000"
  }
};
