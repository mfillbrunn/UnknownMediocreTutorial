window.POWER_METADATA = {
  confuseColors: {
    label: "Color Swap",
    desc: "The Secretkeeper turns every green and yellow tile blue for one round, so the Guesser can't tell which clues were good or bad. This buys the Secretkeeper a safe round to hide the secret.",
    short: "Turns green and yellow tiles blue for a round so the Guesser can't read them.",
    icon: "palette-swap",
    emoji: "📡",
    color: "#3B82F6"
  },
  betMiss: {
    label: "Miss Bet",
    desc: "The Guesser predicts how many misses (gray tiles) their next guess will have. Guess the number right, and they win a free green letter!",
    short: "Predict your next guess's miss count correctly to win a free green letter.",
    icon: "casino",
    emoji: "🎯",
    color: "#F59E0B"
  },
  spyChargeReset: {
    label: "Cover Reset",
    desc: "The Secretkeeper wipes one letter's clue off of every guess made so far this round, like it was never revealed. Great for erasing a clue that was helping the Guesser too much.",
    short: "Erases one letter's clue from every guess this round, covering the Secretkeeper's tracks.",
    emoji: "↺",
    color: "#22d3ee"
  },
  fieldReport: {
    label: "Field Report",
    desc: "The Guesser gets 3 secret rules for their next guess. Follow 2 of them for a free yellow letter, or all 3 for a free green letter!",
    short: "Follow secret rules in your next guess to earn a free yellow or green letter.",
    icon: "clipboard",
    emoji: "📋",
    color: "#0EA5E9"
  },
  fakeFeedback: {
    label: "Fake Clue",
    desc: "The Secretkeeper makes the Guesser's next result show two possible answers — one true, one made up. The Guesser has to guess which to trust, which protects the real secret.",
    short: "Shows the Guesser a true result and a fake one, so they can't be sure which to trust.",
    icon: "mask",
    emoji: "🎭",
    color: "#6B7280"
  },

  countOnly: {
    label: "Counts Only",
    desc: "The Secretkeeper hides exactly where the green and yellow tiles are. The Guesser only learns how many greens and yellows they got — much harder to piece the secret together.",
    short: "The Guesser only learns how many greens/yellows they got, not which letters.",
    icon: "tally",
    emoji: "📄",
    color: "#6B7280"
  },

  rouletteSecret: {
    label: "Secret Spin",
    desc: "The Guesser forces the Secretkeeper's next secret word to be picked completely at random, so the Secretkeeper can't hand-pick something extra tricky.",
    short: "Forces the Secretkeeper's next secret to be chosen at random instead of hand-picked.",
    icon: "roulette",
    emoji: "🎰",
    color: "#6B7280"
  },

  nonsense: {
    label: "Silly Word",
    desc: "For this round, the Guesser's guess doesn't need to be a real word — any 5 letters work! Great for testing letters without worrying about spelling.",
    short: "Lets your next guess be any 5 letters, real word or not.",
    icon: "shuffle",
    emoji: "🌀",
    color: "#7C3AED"
  },

  forceGuess: {
    label: "Force a Move",
    desc: "The Secretkeeper picks one surprise rule the Guesser's next guess must follow, cutting down their options and steering them away from the real secret.",
    short: "Forces one surprise rule onto the Guesser's next guess.",
    icon: "lock-input",
    emoji: "🔒",
    color: "#F97316"
  },

  forceTimer: {
    label: "Time Pressure",
    desc: "The Secretkeeper puts the Guesser's next guess on a short clock. If time runs out, the Guesser's old guess gets resubmitted automatically — no time to think it through.",
    short: "Puts a short time limit on the Guesser's next guess.",
    icon: "hourglass",
    emoji: "⏳",
    color: "#EF4444"
  },

  freezeSecret: {
    label: "Lockdown",
    desc: "The Guesser locks the Secretkeeper into their current secret for next round — the Secretkeeper can't switch to a new one to dodge what's already been learned.",
    short: "Locks the Secretkeeper's secret so they can't change it next round.",
    icon: "snowflake",
    emoji: "❄️",
    color: "#38BDF8"
  },

  hideTile: {
    label: "Hide Evidence",
    desc: "The Secretkeeper picks one letter and wipes its clue off of every guess so far this round, for both players, and locks that key on the keyboard. Usable twice per match.",
    short: "Erases one letter's clues from every guess so far and locks that key.",
    icon: "hidden-tile",
    emoji: "⬛",
    color: "#1e1eba"
  },

  magicMode: {
    label: "Color Upgrade",
    desc: "The Guesser upgrades every yellow tile to a green tile for next round's results — same guess, way more information.",
    short: "Upgrades every yellow tile to green for next round's results.",
    icon: "wand",
    emoji: "✨",
    color: "#A855F7"
  },

  revealGreen: {
    label: "Letter Peek",
    desc: "The Guesser instantly learns one letter and its exact position in the secret. The Secretkeeper can still change their secret later, so use the clue quickly!",
    short: "Reveals one letter and its exact position in the current secret.",
    icon: "peek-letter",
    emoji: "👁️",
    color: "#22C55E"
  },

  revealHistory: {
    label: "Time Rewind",
    desc: "The Guesser learns what the secret word was three rounds ago — a peek into the past that can reveal patterns in how the Secretkeeper picks secrets.",
    short: "Reveals what the secret word was three rounds ago.",
    icon: "rewind",
    emoji: "⏪",
    color: "#64748B"
  },

  revealLetter: {
    label: "Letter Challenge",
    desc: "The Guesser completes a hidden challenge using their guesses to earn a free green letter:",
    short: "Complete a hidden challenge with your guesses to earn a free green letter.",
    icon: "letter-plus",
    emoji: "🟩",
    color: "#16A34A",

    variants: {
      ROW: {
        label: "Full Sweep",
        desc: "Use every letter from one full keyboard row (top, middle, or bottom) across your guesses to win a free green letter.",
        icon: "keyboard-row",
        emoji: "⌨️"
      },
      RARE: {
        label: "Rare Letters",
        desc: "Use at least 4 of these tricky letters — Q, J, X, Z, W, K, V — across your guesses to win a free green letter.",
        icon: "diamond-letter",
        emoji: "💎"
      },
      ALPHA: {
        label: "In Order",
        desc: "Make 3 guesses whose letters are in A-to-Z order, like ABHOR, to win a free green letter.",
        icon: "sort-asc",
        emoji: "🔤"
      },
      DOUBLES: {
        label: "Double Trouble",
        desc: "Make 3 guesses that each have two matching letters in a row, like SPEED or GLOSS, to win a free green letter — just don't repeat the same double letter twice.",
        icon: "twin-letters",
        emoji: "👯"
      },
      CHAIN: {
        label: "Word Chain",
        desc: "Make 2 guesses in a row where the second one starts with the last letter of the first, to win a free green letter.",
        icon: "link",
        emoji: "🔗"
      }
    }
  },

  stealthGuess: {
    label: "Sneaky Guess",
    desc: "Hides the Guesser's next guess from the Secretkeeper, so the Secretkeeper can't peek at it and plan around what the Guesser is thinking.",
    short: "Hides your next guess from the Secretkeeper.",
    icon: "ghost",
    emoji: "👻",
    color: "#4B5563"
  },

  suggestGuess: {
    label: "Smart Guess Tip",
    desc: "Gives the Guesser a solid guess that already fits every clue learned so far — perfect for when they're stuck.",
    short: "Suggests a guess that already fits everything you know.",
    icon: "lightbulb",
    emoji: "💡",
    color: "#FACC15"
  },

  suggestSecret: {
    label: "Secret Word Helper",
    desc: "Gives the Secretkeeper a fresh secret word idea that still fits everything they've already revealed to the Guesser. Handy when the Secretkeeper is stuck picking a secret that keeps their story straight.",
    short: "Suggests a new secret for the Secretkeeper that still matches all clues given so far.",
    icon: "brain",
    emoji: "🧠",
    color: "#E879F9"
  },

  vowelRefresh: {
    label: "Vowel Reset",
    desc: "The Secretkeeper erases what the Guesser learned about vowels from their last guess, even letters the Guesser already knew were right. Fresh cover for the secret after a strong guess.",
    short: "Un-teaches the Guesser everything they learned about vowels from their last guess.",
    icon: "vowel-cycle",
    emoji: "🔁",
    color: "#0EA5E9"
  },

  blindSpot: {
    label: "Foggy Tile",
    desc: "The Secretkeeper fogs up one tile's clue for the rest of the round, keeping that one piece of information hidden from the Guesser.",
    short: "Hides one tile's clue from the Guesser for the rest of the round.",
    icon: "fog",
    emoji: "🌫️",
    color: "#374151"
  },
  revealPenalty: {
    label: "Letter Bluff",
    desc: "The Secretkeeper claims a letter is in the secret. If the Guesser believes it, the Secretkeeper scores 1 point. If the Guesser calls it a bluff but the Secretkeeper was telling the truth, the Secretkeeper scores 2 points instead. Only a real bluff earns the Guesser a free yellow letter — so the Secretkeeper comes out ahead either way it plays.",
    short: "Claim a letter is in the secret and dare the Guesser to call the bluff.",
    icon: "warning",
    emoji: "⚠️",
    color: "#B45309"
  },
  assassinWord: {
    label: "Trap Word",
    desc: "The Secretkeeper secretly plants a trap word. If the Guesser ever guesses it, the game ends immediately in the Secretkeeper's favor! Planting it early scores bigger — but it can't look too much like the real secret.",
    short: "Plants a hidden word that instantly ends the game if the Guesser guesses it.",
    icon: "skull-word",
    emoji: "☠️",
    color: "#991B1B"
  },

  blindGuess: {
    label: "Total Blackout",
    desc: "The Secretkeeper blacks out every clue and keyboard color for the Guesser's next guess, so it goes in completely blind.",
    short: "Hides all feedback and keyboard colors for the Guesser's next guess.",
    icon: "blindfold",
    emoji: "🙈",
    color: "#000000"
  },

  wiretap: {
    label: "Listen In",
    desc: "The Guesser always sees the same 'secrets still possible' count the Secretkeeper sees. In fast games, they can also tap it once a round to watch that number update live while typing!",
    short: "See the same remaining-secrets count the Secretkeeper sees.",
    icon: "headphones",
    emoji: "🎧",
    color: "#38BDF8"
  },

  letterProbe: {
    label: "Letter Scan",
    desc: "The game tests 5 random letters (weighted toward ones still unknown, including one that's in the secret) and the Guesser learns how many of them are in the secret — not which ones or where, but still a useful head start.",
    short: "Tests 5 random letters at once and learns how many are in the secret.",
    icon: "radar",
    emoji: "🔎",
    color: "#22D3EE"
  },

  revealLocation: {
    label: "Informant",
    desc: "A secret informant watches one unknown spot in the secret and tells the Guesser its letter right away. It keeps watching that spot until the Guesser guesses it correctly, then moves on to a new one!",
    short: "A hidden informant reveals the letter at one unknown position, until you guess it.",
    icon: "flashlight",
    emoji: "🔦",
    color: "#34D399"
  },

  doubleGuess: {
    label: "Double Guess",
    desc: "The Guesser fires two guesses at once. The Secretkeeper only ever sees one of them, picked at random — but the Guesser gets clues back for both, doubling their information for the turn.",
    short: "Submit two guesses at once and get feedback on both.",
    icon: "double-tap",
    emoji: "🔫",
    color: "#F472B6"
  },

  letterProfile: {
    label: "Secret Vowel Count",
    desc: "From now on, the Guesser can always see how many of the secret's 5 letters are vowels.",
    short: "Always shows how many of the secret's letters are vowels.",
    icon: "bar-chart",
    emoji: "🔤",
    color: "#818CF8"
  },

  delayedIntel: {
    label: "Delayed Clue",
    desc: "The Secretkeeper holds back this round's clues — the Guesser won't see them until after their next guess. Forces the Guesser to guess blind for a turn.",
    short: "Delays this round's clues until after the Guesser's next guess.",
    icon: "clock-delay",
    emoji: "🕰️",
    color: "#A78BFA"
  },

  letterLockout: {
    label: "Letter Lockout",
    desc: "Works from the very start. On each of the Secretkeeper's turns, they can ban one more letter — the Guesser's next guess can't use any banned letter.",
    short: "Bans one more letter from the Guesser's next guess, every turn.",
    icon: "letter-ban",
    emoji: "🚫",
    color: "#FB7185"
  }
};
