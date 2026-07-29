window.POWER_METADATA = {
  confuseColors: {
    label: "Color Swap",
    desc: "For one round, every green and yellow tile turns blue instead. The Inspector can't tell the colors apart!",
    short: "Green and yellow tiles turn blue for one round.",
    icon: "palette-swap",
    emoji: "📡",
    color: "#3B82F6"
  },
  betMiss: {
    label: "Miss Bet",
    desc: "The Inspector guesses how many misses their next try will have. Guess it right, and they win a free green letter!",
    short: "Guess your miss count right to win a free green letter.",
    icon: "casino",
    emoji: "🎯",
    color: "#F59E0B"
  },
  fieldReport: {
    label: "Field Report",
    desc: "Shows 3 secret rules for your next guess. Follow 2 of them for a free yellow letter, or all 3 for a free green letter!",
    short: "Follow secret rules to win a free yellow or green letter.",
    icon: "clipboard",
    emoji: "📋",
    color: "#0EA5E9"
  },
  fakeFeedback: {
    label: "Fake Clue",
    desc: "The Inspector sees two answers for their guess — one is true and one is made up. They have to figure out which is which!",
    short: "The Inspector sees one true answer and one fake one.",
    icon: "mask",
    emoji: "🎭",
    color: "#6B7280"
  },

  countOnly: {
    label: "Counts Only",
    desc: "Hides where the green and yellow tiles are. The Inspector only learns how many greens and yellows they got, not which letters.",
    short: "Shows only how many greens and yellows — not where they are.",
    icon: "tally",
    emoji: "📄",
    color: "#6B7280"
  },

  rouletteSecret: {
    label: "Secret Spin",
    desc: "Picks the Spy's next secret word for them at random. They don't get to choose it!",
    short: "Randomly picks the Spy's next secret word.",
    icon: "roulette",
    emoji: "🎰",
    color: "#6B7280"
  },

  nonsense: {
    label: "Silly Word",
    desc: "This round, the guess doesn't have to be a real word. Any 5 letters will work!",
    short: "This round's guess doesn't need to be a real word.",
    icon: "shuffle",
    emoji: "🌀",
    color: "#7C3AED"
  },

  forceGuess: {
    label: "Force a Move",
    desc: "Picks one surprise rule that the next guess has to follow.",
    short: "Adds one surprise rule to the next guess.",
    icon: "lock-input",
    emoji: "🔒",
    color: "#F97316"
  },

  forceTimer: {
    label: "Time Pressure",
    desc: "Gives the Inspector only a little time to make their next guess. If time runs out, their old guess gets used again automatically.",
    short: "The Inspector gets only a short time for their next guess.",
    icon: "hourglass",
    emoji: "⏳",
    color: "#EF4444"
  },

  freezeSecret: {
    label: "Lockdown",
    desc: "Stops the Spy from picking a new secret next round. They're stuck with the one they have!",
    short: "The Spy can't change their secret next round.",
    icon: "snowflake",
    emoji: "❄️",
    color: "#38BDF8"
  },

  hideTile: {
    label: "Hide Evidence",
    desc: "Pick a letter on your keyboard. Its clue disappears from every guess so far this round, on both sides -- usable twice per match.",
    short: "Pick a letter; every guess's clue for it is erased and the keyboard key goes unused.",
    icon: "hidden-tile",
    emoji: "⬛",
    color: "#1e1eba"
  },

  magicMode: {
    label: "Color Upgrade",
    desc: "Turns every yellow tile into a green tile next round!",
    short: "Turns every yellow tile green next round.",
    icon: "wand",
    emoji: "✨",
    color: "#A855F7"
  },

  revealGreen: {
    label: "Letter Peek",
    desc: "Shows you one letter from the secret word right now. The Spy can still change their secret later, though!",
    short: "Reveals one letter's position in the secret.",
    icon: "peek-letter",
    emoji: "👁️",
    color: "#22C55E"
  },

  revealHistory: {
    label: "Time Rewind",
    desc: "Shows you what the secret word was three rounds ago.",
    short: "Reveals a secret from three rounds ago.",
    icon: "rewind",
    emoji: "⏪",
    color: "#64748B"
  },

  revealLetter: {
    label: "Letter Challenge",
    desc: "Do a special challenge with your guesses to win a free green letter:",
    short: "Complete a hidden challenge for a free green letter.",
    icon: "letter-plus",
    emoji: "🟩",
    color: "#16A34A",

    variants: {
      ROW: {
        label: "Full Sweep",
        desc: "Use every letter from one row of the keyboard (top, middle, or bottom) to win a green letter.",
        icon: "keyboard-row",
        emoji: "⌨️"
      },
      RARE: {
        label: "Rare Letters",
        desc: "Use at least 4 of these tricky letters — Q, J, X, Z, W, K, V — to win a green letter.",
        icon: "diamond-letter",
        emoji: "💎"
      },
      ALPHA: {
        label: "In Order",
        desc: "Make 3 guesses whose letters are in ABC order, like ABHOR, to win a green letter.",
        icon: "sort-asc",
        emoji: "🔤"
      },
      DOUBLES: {
        label: "Double Trouble",
        desc: "Make 3 guesses that each have two matching letters in a row, like SPEED or GLOSS — just don't repeat the same double letter twice.",
        icon: "twin-letters",
        emoji: "👯"
      },
      CHAIN: {
        label: "Word Chain",
        desc: "Make 2 guesses where the second one starts with the last letter of the first one.",
        icon: "link",
        emoji: "🔗"
      }
    }
  },

  stealthGuess: {
    label: "Sneaky Guess",
    desc: "Hides your next guess so the Spy can't see it.",
    short: "Hides your guess from the Spy next turn.",
    icon: "ghost",
    emoji: "👻",
    color: "#4B5563"
  },

  suggestGuess: {
    label: "Smart Guess Tip",
    desc: "Gives you a good guess that already fits everything you know so far.",
    short: "Gives you a valid guess that fits all known clues.",
    icon: "lightbulb",
    emoji: "💡",
    color: "#FACC15"
  },

  suggestSecret: {
    label: "Secret Word Helper",
    desc: "Gives you a secret word that still fits everything you've told the Inspector so far.",
    short: "Gives you a valid secret that fits all feedback.",
    icon: "brain",
    emoji: "🧠",
    color: "#E879F9"
  },

  vowelRefresh: {
    label: "Vowel Reset",
    desc: "Un-marks the vowels from your last guess, but only the ones you hadn't used before.",
    short: "Resets last round's previously-unused vowels.",
    icon: "vowel-cycle",
    emoji: "🔁",
    color: "#0EA5E9"
  },

  blindSpot: {
    label: "Foggy Tile",
    desc: "Hides the clue for one tile for the rest of the round.",
    short: "Hides one tile's feedback for the rest of the round.",
    icon: "fog",
    emoji: "🌫️",
    color: "#374151"
  },
  revealPenalty: {
    label: "Letter Bluff",
    desc: "Say a letter you think is in the secret. If the Inspector believes you, the Spy gets 1 point. If they call it a bluff but you were right, the Spy gets 2 points instead. If it really was a bluff, the Inspector gets a free yellow letter!",
    short: "Claim a letter is in the secret - the Inspector can accept it or call your bluff.",
    icon: "warning",
    emoji: "⚠️",
    color: "#B45309"
  },
  assassinWord: {
    label: "Trap Word",
    desc: "Pick a secret trap word. If the Inspector ever guesses it, the game ends right away! Plant it early for a bigger reward — but it can't look too much like your real secret.",
    short: "Plant a word that instantly wins the game if guessed.",
    icon: "skull-word",
    emoji: "☠️",
    color: "#991B1B"
  },

  blindGuess: {
    label: "Total Blackout",
    desc: "Hides all the clues and keyboard colors for your next guess.",
    short: "Hides all feedback and keyboard colors for one guess.",
    icon: "blindfold",
    emoji: "🙈",
    color: "#000000"
  },

  wiretap: {
    label: "Listen In",
    desc: "Always shows how many secret words are still possible — the same number the Spy sees. In fast games, you can also tap it once a round to watch that number update live as you type!",
    short: "See the same remaining-secrets count the Spy sees.",
    icon: "headphones",
    emoji: "🎧",
    color: "#38BDF8"
  },

  letterProbe: {
    label: "Letter Scan",
    desc: "Pick any 5 letters to test. You'll only learn how many of them are in the secret — not which ones or where.",
    short: "Test 5 letters, learn how many are in the secret.",
    icon: "radar",
    emoji: "🔎",
    color: "#22D3EE"
  },

  revealLocation: {
    label: "Informant",
    desc: "A secret helper peeks at one unknown spot and tells you the letter there right now. It keeps watching that spot until you guess it right — then it moves on to a new one!",
    short: "Passively reveals the letter at one unknown position.",
    icon: "flashlight",
    emoji: "🔦",
    color: "#34D399"
  },

  doubleGuess: {
    label: "Double Guess",
    desc: "Fire two guesses at once at the same secret. The Spy only sees one of them, picked at random — but you get clues back for both!",
    short: "Submit two guesses at once and get feedback on both.",
    icon: "double-tap",
    emoji: "🔫",
    color: "#F472B6"
  },

  letterProfile: {
    label: "Letter Profile",
    desc: "From the start of the match, both players can always see one fact about the secret's letters — like whether they're A-M or N-Z, which keyboard row they're on, or how many are vowels.",
    short: "Shows how the secret's letters break down by category.",
    icon: "bar-chart",
    emoji: "📊",
    color: "#818CF8"
  },

  delayedIntel: {
    label: "Delayed Clue",
    desc: "Holds back this round's clues. The Inspector won't see them until after their next guess!",
    short: "Delays this round's feedback until the Inspector's next guess.",
    icon: "clock-delay",
    emoji: "🕰️",
    color: "#A78BFA"
  },

  letterLockout: {
    label: "Letter Lockout",
    desc: "Works from the very start. On each of your turns, you can ban one new letter — the Inspector's next guess can't use it!",
    short: "Ban one letter from the Inspector's next guess.",
    icon: "letter-ban",
    emoji: "🚫",
    color: "#FB7185"
  }
};
