window.POWER_METADATA = {
  confuseColors: {
    label: "Jam Signals",
    desc: "Turn all green and yellow feedback blue for one round.",
    short: "Green/yellow feedback turns blue for a round.",
    icon: "palette-swap",
    emoji: "📡",
    color: "#3B82F6"
  },
  betMiss: {
    label: "Risky Maneuver",
    desc: "The Inspector makes a bet on how many misses the next guess will have; if correct, they get rewarded with a green letter.",
    short: "Bet on your miss count for a free green letter.",
    icon: "casino",
    emoji: "🎯",
    color: "#F59E0B"
  },
  fieldReport: {
    label: "Field Report",
    desc: "Reveals 3 conditions for your next guess. Meet 2 of 3 for a free yellow letter; meet all 3 for a free green letter.",
    short: "Meet hidden conditions for a free yellow or green letter.",
    icon: "clipboard",
    emoji: "📋",
    color: "#0EA5E9"
  },
  fakeFeedback: {
    label: "Falsify Intel",
    desc: "The Inspector will see two feedbacks—one real, one fabricated.",
    short: "Inspector sees one real and one fake feedback.",
    icon: "mask",
    emoji: "🎭",
    color: "#6B7280"
  },

  countOnly: {
    label: "Redact Report",
    desc: "Redact the positions and show only only the total number of greens and yellows.",
    short: "Feedback shown only as green/yellow totals, no positions.",
    icon: "tally",
    emoji: "📄",
    color: "#6B7280"
  },

  rouletteSecret: {
    label: "Break Cover",
    desc: "The spy's next secret is randomly selected.",
    short: "The Spy's next secret is picked at random.",
    icon: "roulette",
    emoji: "🎰",
    color: "#6B7280"
  },

  nonsense: {
    label: "Signal Scramble",
    desc: "This round’s guess does not need to be a real word.",
    short: "This round's guess doesn't need to be a real word.",
    icon: "shuffle",
    emoji: "🌀",
    color: "#7C3AED"
  },

  forceGuess: {
    label: "Force a Move",
    desc: "Force the next guess to follow one of three randomly chosen restrictions.",
    short: "Forces a random restriction on the next guess.",
    icon: "lock-input",
    emoji: "🔒",
    color: "#F97316"
  },

  forceTimer: {
    label: "Time Pressure",
    desc: "The Inspector has only a short time to submit their next guess. If time runs out, their last guess is resubmitted automatically.",
    short: "The Inspector gets only a short time for their next guess.",
    icon: "hourglass",
    emoji: "⏳",
    color: "#EF4444"
  },

  freezeSecret: {
    label: "Lockdown",
    desc: "Prevent the spy from changing the secret next round.",
    short: "The Spy can't change their secret next round.",
    icon: "snowflake",
    emoji: "❄️",
    color: "#38BDF8"
  },

  hideTile: {
    label: "Hide Evidence",
    desc: "Tap a tile in the pending guess to erase its feedback for that round — the result at that position is gone for both sides, not shown to either.",
    short: "Pick a tile whose feedback is erased for both sides.",
    icon: "hidden-tile",
    emoji: "⬛",
    color: "#1e1eba"
  },

  magicMode: {
    label: "Inside Job",
    desc: "Turn each yellow tile next round green.",
    short: "Turns every yellow tile green next round.",
    icon: "wand",
    emoji: "✨",
    color: "#A855F7"
  },

  revealGreen: {
    label: "Leak Info",
    desc: "Reveal one letter of the current secret—the spy may still change it.",
    short: "Reveals one letter's position in the secret.",
    icon: "peek-letter",
    emoji: "👁️",
    color: "#22C55E"
  },

  revealHistory: {
    label: "Solve Cold Case",
    desc: "Reveals a secret from several rounds ago. Can only be used after 3 rounds.",
    short: "Reveals a secret from several rounds ago.",
    icon: "rewind",
    emoji: "⏪",
    color: "#64748B"
  },

  revealLetter: {
    label: "Confirm Lead",
    desc: "Earn a guaranteed green letter by meeting one randomly-assigned usage condition:",
    short: "Complete a hidden challenge for a free green letter.",
    icon: "letter-plus",
    emoji: "🟩",
    color: "#16A34A",

    variants: {
      ROW: {
        label: "Full Sweep",
        desc: "Reveal a green letter by using every letter in one keyboard row (top, home, or bottom).",
        icon: "keyboard-row",
        emoji: "⌨️"
      },
      RARE: {
        label: "High-Value Target",
        desc: "Reveal a rare green letter by using at least 4 of Q, J, X, Z, W, K, V.",
        icon: "diamond-letter",
        emoji: "💎"
      },
      ALPHA: {
        label: "In Order",
        desc: "Reveal a green letter by submitting 3 guesses whose letters are in strict alphabetical order (e.g. ABHOR).",
        icon: "sort-asc",
        emoji: "🔤"
      },
      DOUBLES: {
        label: "Double Trouble",
        desc: "Reveal a green letter by submitting 3 guesses with distinct double letters (e.g. SPEED, GLOSS, MAMMY — no repeating the same doubled letter).",
        icon: "twin-letters",
        emoji: "👯"
      },
      CHAIN: {
        label: "Word Chain",
        desc: "Reveal a green letter by submitting 2 guesses that each start with the last letter of your previous guess.",
        icon: "link",
        emoji: "🔗"
      }
    }
  },

  stealthGuess: {
    label: "Move in Shadows",
    desc: "Hide the guess from the spy next turn.",
    short: "Hides your guess from the Spy next turn.",
    icon: "ghost",
    emoji: "👻",
    color: "#4B5563"
  },

  suggestGuess: {
    label: "Analyst Tip",
    desc: "Receive a valid guess that fits all known constraints.",
    short: "Gives you a valid guess that fits all clues.",
    icon: "lightbulb",
    emoji: "💡",
    color: "#FACC15"
  },

  suggestSecret: {
    label: "Profiler Insight",
    desc: "Receive a valid secret consistent with all feedback.",
    short: "Gives you a valid secret that fits all feedback.",
    icon: "brain",
    emoji: "🧠",
    color: "#E879F9"
  },

  vowelRefresh: {
    label: "Signal Refresh",
    desc: "Reset all vowels used in the last round if they were unused before.",
    short: "Resets last round's previously-unused vowels.",
    icon: "vowel-cycle",
    emoji: "🔁",
    color: "#0EA5E9"
  },

  blindSpot: {
    label: "Create Dead Zone",
    desc: "Hide feedback for one tile for the rest of the round.",
    short: "Hides one tile's feedback for the rest of the round.",
    icon: "fog",
    emoji: "🌫️",
    color: "#374151"
  },
  revealPenalty: {
    label: "Marked Weakness",
    desc: "Claim an unknown letter is in the secret. If the Inspector accepts, the Spy scores 1 point. If they call it a bluff and the claim was true, the Spy scores 2 points. If it really was a bluff, the Inspector gets a free yellow letter instead.",
    short: "Claim a letter is in the secret -- the Inspector can accept it or call your bluff.",
    icon: "warning",
    emoji: "⚠️",
    color: "#B45309"
  },
  assassinWord: {
    label: "Set Kill Phrase",
    desc: "Choose a word that instantly ends the game if guessed. The earlier it’s planted, the greater the reward—but it can’t be too similar to your secret.",
    short: "Plant a word that instantly wins the game if guessed.",
    icon: "skull-word",
    emoji: "☠️",
    color: "#991B1B"
  },

  blindGuess: {
    label: "Total Blackout",
    desc: "Hide all feedback and keyboard colors for the next guess.",
    short: "Hides all feedback and keyboard colors for one guess.",
    icon: "blindfold",
    emoji: "🙈",
    color: "#000000"
  },

  wiretap: {
    label: "Wiretap",
    desc: "Always see how many possible secrets are still left — the same count the Spy sees — at the start of each turn. In blitz & bullet games you can also tap it once a round to make that count update live as you type, so you can home in on the secret. No live tap in longer games.",
    short: "See the same remaining-secrets count the Spy sees.",
    icon: "headphones",
    emoji: "🎧",
    color: "#38BDF8"
  },

  letterProbe: {
    label: "Recon Sweep",
    desc: "Test any 5 letters. You learn only how many of them are in the secret — just the number, not which ones or where.",
    short: "Test 5 letters, learn how many are in the secret.",
    icon: "radar",
    emoji: "🔎",
    color: "#22D3EE"
  },

  revealLocation: {
    label: "Informant",
    desc: "An informant peeks one unknown position and shows you the letter that's there right now. That position stays fixed until you confirm it green yourself — then the informant moves on to another unknown spot. No activation needed.",
    short: "Passively reveals the letter at one unknown position.",
    icon: "flashlight",
    emoji: "🔦",
    color: "#34D399"
  },

  doubleGuess: {
    label: "Double Tap",
    desc: "Fire two guesses at once against the same secret. The Spy sees only one of them (chosen at random) but knows you used the power. You get the feedback for both. If either is the secret, you win the round.",
    short: "Submit two guesses at once and get feedback on both.",
    icon: "double-tap",
    emoji: "🔫",
    color: "#F472B6"
  },

  letterProfile: {
    label: "Letter Profile",
    desc: "From the start of the match, one category is randomly chosen and shown to both sides — alphabet half (A–M / N–Z), keyboard row (top / home / bottom), or vowel vs. consonant. You always see how the secret's letters break down across it: for the Spy it updates live while drafting; for you it's revealed once you're on the clock each turn. No activation needed.",
    short: "Shows how the secret's letters break down by category.",
    icon: "bar-chart",
    emoji: "📊",
    color: "#818CF8"
  },

  delayedIntel: {
    label: "Delayed Intel",
    desc: "One-time use. Delay this round's feedback — the Inspector won't see the result until they've submitted their next guess. A correct guess still wins instantly no matter what's been revealed yet — this only affects what the Inspector gets to see.",
    short: "Delays this round's feedback until the Inspector's next guess.",
    icon: "clock-delay",
    emoji: "🕰️",
    color: "#A78BFA"
  },

  letterLockout: {
    label: "Letter Lockout",
    desc: "Active from the start. On each of your turns (once the simultaneous round is over), you may ban one letter you haven't banned before — the Inspector's next guess cannot contain it. Only one letter is locked out at a time. Once every letter has been used, the power simply has nothing left to ban.",
    short: "Ban one letter from the Inspector's next guess.",
    icon: "letter-ban",
    emoji: "🚫",
    color: "#FB7185"
  }
};
