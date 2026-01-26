window.POWER_METADATA = {
  confuseColors: {
    label: "Signal Jam",
    desc: "Turns all green and yellow feedback blue for one round.",
    icon: "palette-swap",
    emoji: "📡",
    color: "#3B82F6"
  },

  fakeFeedback: {
    label: "False Intel",
    desc: "Two feedbacks are shown—one real, one fabricated.",
    icon: "mask",
    emoji: "🎭",
    color: "#6B7280"
  },

  countOnly: {
    label: "Redacted Report",
    desc: "Shows only the total number of greens and yellows, not their positions.",
    icon: "tally",
    emoji: "📄",
    color: "#6B7280"
  },

  rouletteSecret: {
    label: "Burner Word",
    desc: "The next secret is randomly selected.",
    icon: "roulette",
    emoji: "🎰",
    color: "#6B7280"
  },

  nonsense: {
    label: "Cover Noise",
    desc: "This round’s guess does not need to be a real word.",
    icon: "shuffle",
    emoji: "🌀",
    color: "#7C3AED"
  },

  forceGuess: {
    label: "Compelled Move",
    desc: "Forces the next guess to follow one of three randomly chosen restrictions.",
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
    desc: "Prevents the spy from changing the secret next round.",
    icon: "snowflake",
    emoji: "❄️",
    color: "#38BDF8"
  },

  hideTile: {
    label: "Blackout Tile",
    desc: "Hides the feedback on one random tile for one round.",
    icon: "hidden-tile",
    emoji: "⬛",
    color: "#1e1eba"
  },

  magicMode: {
    label: "Inside Job",
    desc: "Each yellow tile reveals one green letter next round.",
    icon: "wand",
    emoji: "✨",
    color: "#A855F7"
  },

  revealGreen: {
    label: "Leaked Letter",
    desc: "Reveals one letter of the current secret—the spy may still change it.",
    icon: "peek-letter",
    emoji: "👁️",
    color: "#22C55E"
  },

  revealHistory: {
    label: "Cold Case",
    desc: "Reveals a secret from several rounds ago. Can only be used after 3 rounds.",
    icon: "rewind",
    emoji: "⏪",
    color: "#64748B"
  },

  revealLetter: {
    label: "Confirmed Lead",
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
    label: "Ghost Move",
    desc: "The spy cannot see the next guess.",
    icon: "ghost",
    emoji: "👻",
    color: "#4B5563"
  },

  suggestGuess: {
    label: "Analyst Tip",
    desc: "Suggests a valid guess that fits all known constraints.",
    icon: "lightbulb",
    emoji: "💡",
    color: "#FACC15"
  },

  suggestSecret: {
    label: "Profiler Insight",
    desc: "Suggests a valid secret consistent with all feedback.",
    icon: "brain",
    emoji: "🧠",
    color: "#E879F9"
  },

  vowelRefresh: {
    label: "Signal Refresh",
    desc: "Resets all vowels used in the last round if they were unused before.",
    icon: "vowel-cycle",
    emoji: "🔁",
    color: "#0EA5E9"
  },

  blindSpot: {
    label: "Dead Zone",
    desc: "Hides feedback for one tile for the rest of the round.",
    icon: "fog",
    emoji: "🌫️",
    color: "#374151"
  },

  assassinWord: {
    label: "Kill Phrase",
    desc: "Choose a word that instantly ends the game if guessed. The earlier it’s planted, the greater the reward—but it can’t be too similar to your secret.",
    icon: "skull-word",
    emoji: "☠️",
    color: "#991B1B"
  },

  blindGuess: {
    label: "Total Blackout",
    desc: "Hides all feedback and keyboard colors for the next guess.",
    icon: "blindfold",
    emoji: "🙈",
    color: "#000000"
  }
};
