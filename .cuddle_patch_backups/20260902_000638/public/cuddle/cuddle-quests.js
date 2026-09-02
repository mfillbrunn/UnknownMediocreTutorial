// public/cuddle/cuddle-quests.js
// Quest definitions and Cuddle-adapted versions of the existing guesser rewards.
(function () {
  "use strict";

  const VOWELS = new Set(["A", "E", "I", "O", "U"]);
  const EXISTING_QUEST_KEYS = Object.freeze({
    fullSweep: "ROW",
    rareLetters: "RARE",
    inOrder: "ALPHA",
    doubleTrouble: "DOUBLES",
    wordChain: "CHAIN",
    hardModeStreak: "HARDMODE",
    fieldReport: "FIELDREPORT"
  });

  const QUESTS = [
    {
      id: "fullSweep",
      icon: "🧹",
      title: "Full Sweep",
      description: "Play a word with five different letters.",
      test: ({ word }) => new Set(word).size === 5
    },
    {
      id: "rareLetters",
      icon: "💎",
      title: "Rare Find",
      description: quest => `Use at least one rare letter: ${quest.rareLetters.join(", ")}.`,
      test: ({ word, quest }) => quest.rareLetters.some(letter => word.includes(letter))
    },
    {
      id: "inOrder",
      icon: "📈",
      title: "In Order",
      description: "Include an alphabetically rising run of three letters.",
      test: ({ word }) => {
        for (let i = 0; i <= word.length - 3; i += 1) {
          if (word.charCodeAt(i) < word.charCodeAt(i + 1)
              && word.charCodeAt(i + 1) < word.charCodeAt(i + 2)) return true;
        }
        return false;
      }
    },
    {
      id: "doubleTrouble",
      icon: "👯",
      title: "Double Trouble",
      description: "Play a word containing a repeated letter.",
      test: ({ word }) => new Set(word).size < word.length
    },
    {
      id: "wordChain",
      icon: "🔗",
      title: "Word Chain",
      description: quest => `Start with ${quest.chainLetter}, the final letter of your previous guess.`,
      test: ({ word, quest }) => word.startsWith(quest.chainLetter)
    },
    {
      id: "fieldReport",
      icon: "📋",
      title: "Field Report",
      description: "Reveal at least two colored tiles (green or yellow).",
      test: ({ feedback }) => feedback.filter(result => result !== "grey").length >= 2
    },
    {
      id: "hardModeStreak",
      icon: "🔥",
      title: "Hold the Clues",
      description: "Reuse every green or yellow letter learned so far.",
      test: ({ word, requiredLetters }) => {
        const remaining = word.split("");
        return requiredLetters.every(letter => {
          const index = remaining.indexOf(letter);
          if (index < 0) return false;
          remaining.splice(index, 1);
          return true;
        });
      }
    },
    {
      id: "vowelRun",
      icon: "🎵",
      title: "Vowel Run",
      description: "Play a word containing at least three vowels.",
      test: ({ word }) => word.split("").filter(letter => VOWELS.has(letter)).length >= 3
    },
    {
      id: "cleanHit",
      icon: "✨",
      title: "Clean Hit",
      description: "Submit a guess with no grey tiles.",
      test: ({ feedback }) => feedback.every(result => result !== "grey")
    },
    {
      id: "greenLight",
      icon: "🟩",
      title: "Green Light",
      description: "Find at least one green tile.",
      test: ({ feedback }) => feedback.includes("green")
    }
  ];

  // These retain IDs from the main game's guesser reward pool so the mode can
  // reuse POWER_METADATA labels when present. freezeSecret is intentionally
  // absent. rouletteSecret is adapted to a draw effect: Cuddle's secret never changes.
  const REWARDS = [
    {
      id: "suggestGuess",
      icon: "💡",
      title: "Suggested Draw",
      description: "Show a playable dictionary word and replace one finite hand card with a useful letter."
    },
    {
      id: "rouletteSecret",
      icon: "🎰",
      title: "Roulette Draw",
      description: "Refresh up to three finite cards without changing the fixed secret."
    },
    {
      id: "revealHistory",
      icon: "↩️",
      title: "Recover",
      description: "Replace finite cards with up to two copies from your discard pile."
    },
    {
      id: "stealthGuess",
      icon: "🥷",
      title: "Stealth Guess",
      description: "Your next guess has no grey-letter score penalty."
    },
    {
      id: "revealGreen",
      icon: "🟩",
      title: "Reveal Green",
      description: "Reveal one hidden position and make its letter unlimited."
    },
    {
      id: "nonsense",
      icon: "🎲",
      title: "Nonsense",
      description: "Replace finite cards with two random letters."
    },
    {
      id: "letterProbe",
      icon: "📡",
      title: "Letter Probe",
      description: "Probe a hand letter to learn how often it occurs in the secret."
    },
    {
      id: "revealLocation",
      icon: "📍",
      title: "Reveal Location",
      description: "Reveal one hidden position and make its letter unlimited."
    },
    {
      id: "letterProfile",
      icon: "🔬",
      title: "Letter Profile",
      description: "Profile a hand letter; matching letters become unlimited."
    }
  ];

  function shuffle(items, random = Math.random) {
    const copy = items.slice();
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function questMeta(definition, extra) {
    const existingKey = EXISTING_QUEST_KEYS[definition.id];
    const existing = existingKey && window.QUEST_METADATA && window.QUEST_METADATA[existingKey];
    return {
      id: definition.id,
      sourceQuestId: existingKey || null,
      icon: existing?.emoji || definition.icon,
      title: existing?.label || existing?.title || definition.title,
      description: typeof definition.description === "function"
        ? definition.description(extra)
        : definition.description,
      ...extra
    };
  }

  function buildContext(word, secret, history, rareLetters, quest) {
    const feedback = evaluateFeedback(secret, word);
    const requiredLetters = [];
    history.forEach(entry => {
      entry.word.split("").forEach((letter, index) => {
        if (entry.feedback[index] !== "grey") requiredLetters.push(letter);
      });
    });
    return { word, feedback, history, rareLetters, requiredLetters, quest };
  }

  function evaluateFeedback(secret, guess) {
    if (typeof window.scoreGuess === "function") {
      return window.scoreGuess(secret, guess).map(value => (
        value === "🟩" ? "green" : value === "🟨" ? "yellow" : "grey"
      ));
    }
    const result = Array(guess.length).fill("grey");
    const remaining = Object.create(null);
    secret.split("").forEach(letter => {
      remaining[letter] = (remaining[letter] || 0) + 1;
    });
    for (let i = 0; i < guess.length; i += 1) {
      if (guess[i] === secret[i]) {
        result[i] = "green";
        remaining[guess[i]] -= 1;
      }
    }
    for (let i = 0; i < guess.length; i += 1) {
      if (result[i] === "green") continue;
      if ((remaining[guess[i]] || 0) > 0) {
        result[i] = "yellow";
        remaining[guess[i]] -= 1;
      }
    }
    return result;
  }

  function createQuest({ feasibleWords, secret, history, rareLetters, random = Math.random }) {
    if (!Array.isArray(feasibleWords) || !feasibleWords.length) return null;
    const candidates = [];

    QUESTS.forEach(definition => {
      const extra = {};
      if (definition.id === "rareLetters") {
        extra.rareLetters = (rareLetters || []).slice(0, 4);
        if (!extra.rareLetters.length) return;
      }
      if (definition.id === "wordChain") {
        const previous = history[history.length - 1];
        if (!previous) return;
        extra.chainLetter = previous.word.slice(-1);
      }
      const meta = questMeta(definition, extra);
      const possible = feasibleWords.some(word => definition.test(
        buildContext(word, secret, history, rareLetters, meta)
      ));
      if (possible) candidates.push(meta);
    });

    if (!candidates.length) {
      return {
        id: "validPlay",
        icon: "🃏",
        title: "Make It Count",
        description: "Submit any valid five-letter word this turn."
      };
    }
    return candidates[Math.floor(random() * candidates.length)];
  }

  function evaluateQuest(quest, context) {
    if (!quest) return false;
    if (quest.id === "validPlay") return true;
    const definition = QUESTS.find(item => item.id === quest.id);
    if (!definition) return false;
    return definition.test({ ...context, quest });
  }

  function getReward(id) {
    const base = REWARDS.find(item => item.id === id);
    if (!base) return null;
    const existing = window.POWER_METADATA && window.POWER_METADATA[id];
    return {
      ...base,
      icon: existing?.emoji || base.icon,
      title: existing?.label || existing?.name || existing?.title || base.title
    };
  }

  function rewardChoices(count = 3, random = Math.random) {
    return shuffle(REWARDS, random).slice(0, Math.min(count, REWARDS.length)).map(item => getReward(item.id));
  }

  window.CuddleQuestBook = Object.freeze({
    QUESTS,
    REWARDS,
    createQuest,
    evaluateQuest,
    getReward,
    rewardChoices,
    evaluateFeedback
  });
}());
