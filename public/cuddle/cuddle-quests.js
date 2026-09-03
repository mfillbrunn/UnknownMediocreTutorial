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

  // HARDMODE_COUNT_KNOWLEDGE_FIX_2026_09
  // Cuddle's Hold the Clues quest keeps letter-count knowledge per visible,
  // trustworthy feedback row. Seeing one colored E on two different turns still
  // proves only one E; seeing two colored Es together proves at least two. A
  // grey extra copy caps how many copies later guesses may use.
  function cuddleHardModeLetterCounts(word) {
    const counts = new Map();
    for (const letter of String(word || "").toUpperCase()) {
      counts.set(letter, (counts.get(letter) || 0) + 1);
    }
    return counts;
  }

  function cuddleHardModeCountConstraints(history) {
    const minCounts = new Map();
    const maxCounts = new Map();

    for (const entry of history || []) {
      if (entry?.fakeFeedback) continue;
      const guessedWord = String(entry?.word || entry?.guess || "").toUpperCase();
      const feedback = Array.isArray(entry?.shownFeedback)
        ? entry.shownFeedback
        : entry?.feedback || entry?.fbGuesser || entry?.fb;
      if (!guessedWord || !Array.isArray(feedback)) continue;

      const guessCounts = new Map();
      const positiveCounts = new Map();
      const greyCounts = new Map();
      for (let i = 0; i < guessedWord.length; i += 1) {
        const letter = guessedWord[i];
        const result = feedback[i];
        guessCounts.set(letter, (guessCounts.get(letter) || 0) + 1);
        if (result === "green" || result === "yellow" || result === "blue"
            || result === "🟩" || result === "🟨") {
          positiveCounts.set(letter, (positiveCounts.get(letter) || 0) + 1);
        } else if (result === "grey" || result === "gray" || result === "⬛") {
          greyCounts.set(letter, (greyCounts.get(letter) || 0) + 1);
        }
      }

      for (const [letter, positiveCount] of positiveCounts) {
        minCounts.set(letter, Math.max(minCounts.get(letter) || 0, positiveCount));
      }
      for (const [letter, greyCount] of greyCounts) {
        // Cuddle's quest historically ignored wholly absent letters. Preserve
        // that scope and only learn an upper bound from a mixed duplicate row
        // where at least one copy was colored and an extra copy was grey.
        if ((positiveCounts.get(letter) || 0) === 0) continue;
        const rowMaximum = (guessCounts.get(letter) || 0) - greyCount;
        const previousMaximum = maxCounts.get(letter);
        if (previousMaximum === undefined || rowMaximum < previousMaximum) {
          maxCounts.set(letter, rowMaximum);
        }
      }
    }
    return { minCounts, maxCounts };
  }

  function isCuddleHardModeCountCompliant(word, history) {
    const actualCounts = cuddleHardModeLetterCounts(word);
    const { minCounts, maxCounts } = cuddleHardModeCountConstraints(history);

    for (const [letter, minimum] of minCounts) {
      if ((actualCounts.get(letter) || 0) < minimum) return false;
    }
    for (const [letter, maximum] of maxCounts) {
      const effectiveMaximum = Math.max(maximum, minCounts.get(letter) || 0);
      if ((actualCounts.get(letter) || 0) > effectiveMaximum) return false;
    }
    return true;
  }

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
      description: "Keep every known green in place, move known yellows away from ruled-out positions, and avoid eliminated grey letters.",
      test: ({
        word,
        history = [],
        knownAbsent = [],
        knownPresent = [],
        revealedPositions = []
      }) => {
        const candidate = String(word || "").toUpperCase();
        if (!/^[A-Z]{5}$/.test(candidate)) return false;

        const fixed = Array(5).fill(null);
        const forbiddenAt = Array.from({ length: 5 }, () => new Set());
        const minimumCounts = Object.create(null);
        const greySeen = new Set();
        const eliminated = new Set(
          (Array.isArray(knownAbsent) ? knownAbsent : [])
            .map(letter => String(letter || "").toUpperCase())
            .filter(letter => /^[A-Z]$/.test(letter))
        );
        const present = new Set(
          (Array.isArray(knownPresent) ? knownPresent : [])
            .map(letter => String(letter || "").toUpperCase())
            .filter(letter => /^[A-Z]$/.test(letter))
        );
        const requireAtLeast = (letter, count = 1) => {
          minimumCounts[letter] = Math.max(minimumCounts[letter] || 0, count);
          present.add(letter);
          eliminated.delete(letter);
        };

        (Array.isArray(revealedPositions) ? revealedPositions : []).forEach((rawLetter, index) => {
          const letter = String(rawLetter || "").toUpperCase();
          if (!/^[A-Z]$/.test(letter) || index >= fixed.length) return;
          fixed[index] = letter;
          requireAtLeast(letter);
        });

        (Array.isArray(history) ? history : []).forEach(entry => {
          if (!entry || entry.fakeFeedback) return;
          const guess = String(entry.word || "").toUpperCase();
          const shown = Array.isArray(entry.shownFeedback) ? entry.shownFeedback : [];
          const visible = shown.length
            ? shown
            : (Array.isArray(entry.feedback) ? entry.feedback : []);
          const rowPositiveCounts = Object.create(null);

          for (let index = 0; index < Math.min(5, guess.length); index += 1) {
            const letter = guess[index];
            if (!/^[A-Z]$/.test(letter)) continue;
            const status = visible[index];
            if (status === "green") {
              fixed[index] = letter;
              rowPositiveCounts[letter] = (rowPositiveCounts[letter] || 0) + 1;
              requireAtLeast(letter);
            } else if (status === "yellow") {
              forbiddenAt[index].add(letter);
              rowPositiveCounts[letter] = (rowPositiveCounts[letter] || 0) + 1;
              requireAtLeast(letter);
            } else if (status === "blue") {
              // Blue confirms presence but intentionally reveals no position.
              rowPositiveCounts[letter] = (rowPositiveCounts[letter] || 0) + 1;
              requireAtLeast(letter);
            } else if (status === "grey") {
              greySeen.add(letter);
            }
          }

          Object.entries(rowPositiveCounts).forEach(([letter, count]) => {
            requireAtLeast(letter, count);
          });
        });

        present.forEach(letter => requireAtLeast(letter));
        greySeen.forEach(letter => {
          if (!present.has(letter)) eliminated.add(letter);
        });
        present.forEach(letter => eliminated.delete(letter));

        for (let index = 0; index < fixed.length; index += 1) {
          if (fixed[index] && candidate[index] !== fixed[index]) return false;
          if (forbiddenAt[index].has(candidate[index])) return false;
        }
        if (candidate.split("").some(letter => eliminated.has(letter))) return false;

        const candidateCounts = Object.create(null);
        candidate.split("").forEach(letter => {
          candidateCounts[letter] = (candidateCounts[letter] || 0) + 1;
        });
        return Object.entries(minimumCounts).every(([letter, count]) => (
          (candidateCounts[letter] || 0) >= count
        ));
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
      id: "greenLight",
      icon: "🟩",
      title: "Green Light",
      description: "Find at least one green tile.",
      test: ({ feedback }) => feedback.includes("green")
    }
  ];

  // Internal IDs remain compatible with older Cuddle saves, while the names,
  // descriptions, and effects below are owned by single-player Cuddle.
  const REWARDS = [
    {
      id: "suggestGuess",
      icon: "💡",
      title: "Guided Letter",
      description: "Show a word you can play right now."
    },
    {
      id: "stealthGuess",
      icon: "🔁",
      title: "Extra Mulligan",
      description: "Gain one additional mulligan for the current round."
    },
    {
      id: "revealGreen",
      icon: "📍",
      title: "Position Peek",
      description: "Reveal one hidden position and make that letter reusable for this round."
    },
    {
      id: "letterProbe",
      icon: "🔎",
      title: "Letter Count",
      description: "Show how many times each of your five consonants appears in the secret."
    },
    {
      id: "sillyWord",
      icon: "🤪",
      title: "Silly Word",
      description: "This turn only, your guess does not have to be a real word."
    },
    {
      id: "extraLetters",
      icon: "🎁",
      title: "Extra Letters",
      description: "Add three extra consonants to your hand for this turn."
    }
  ];

  // Boss rounds. Each one applies a feedback/timing constraint for part of
  // the round and carries a fixed permanent reward, shown on the option card
  // before the player commits -- so the choice is between two known
  // difficulty/reward trades, not a blind pick. A boss round is pass/fail
  // only: it never scores and never counts toward a threshold.
  //
  // `turns` is how many guesses the constraint covers (hideFeedback and
  // quickMode run the whole round, so they leave it at MAX_GUESSES).
  const BOSSES = [
    {
      id: "countOnly",
      icon: "🔢",
      title: "Count Only",
      description: "For the first three guesses you only learn HOW MANY greens and yellows you hit, not which letters.",
      turns: 3,
      rewardId: "cullRare"
    },
    {
      id: "delayedFeedback",
      icon: "⏳",
      title: "Delayed Feedback",
      description: "The first three guesses give no feedback at all. Everything you missed is revealed at once on the fourth.",
      turns: 3,
      rewardId: "doubleMulligans"
    },
    {
      id: "hideFeedback",
      icon: "🙈",
      title: "Hide Feedback",
      description: "One position stays hidden for the whole round. You never learn what it was.",
      turns: 6,
      rewardId: "biggerMulligans"
    },
    {
      id: "blueMode",
      icon: "🔵",
      title: "Blue Mode",
      description: "For the first four guesses every hit shows as blue. You learn the letter is in the secret, but not whether it is in the right place.",
      turns: 4,
      rewardId: "richerColours"
    },
    {
      id: "fakeFeedback",
      icon: "🃏",
      title: "Fake Feedback",
      description: "For the first four guesses the colours lie. Trust nothing you see until the fifth.",
      turns: 4,
      rewardId: "freeVowelSweep"
    },
    {
      id: "quickMode",
      icon: "⚡",
      title: "Quick Mode",
      description: "One minute per guess. Run out of time and the guess is lost.",
      turns: 6,
      rewardId: "questHead"
    }
  ];

  // Permanent run upgrades granted when a boss is cleared. A boss does not
  // also open the ordinary post-round reward screen.
  const BOSS_REWARDS = [
    {
      id: "cullRare",
      icon: "✂️",
      title: "Deep Cull",
      description: "Remove two rare letters from the deck and from every future secret."
    },
    {
      id: "doubleMulligans",
      icon: "🔁",
      title: "Double Mulligans",
      description: "Double the number of mulligans you get each round."
    },
    {
      id: "biggerMulligans",
      icon: "🖐️",
      title: "Full Hand Mulligan",
      description: "Every mulligan can now replace up to five cards."
    },
    {
      id: "richerColours",
      icon: "💰",
      title: "Richer Colours",
      description: "Every yellow and green tile is worth 2 more points."
    },
    {
      id: "freeVowelSweep",
      icon: "🅰️",
      title: "Free Vowel Sweep",
      description: "Each round opens with one random vowel already tested in every position, for free."
    },
    {
      id: "questHead",
      icon: "🏅",
      title: "Quest Head Start",
      description: "Quests are worth 10 more points for the rest of the run."
    }
  ];

  function getBoss(id) {
    const base = BOSSES.find(item => item.id === id);
    return base ? { ...base } : null;
  }

  function getBossReward(id) {
    const base = BOSS_REWARDS.find(item => item.id === id);
    return base ? { ...base } : null;
  }

  // Two distinct bosses to choose between, each carrying its own reward.
  function bossChoices(random = Math.random, excludeIds = []) {
    const skip = new Set(excludeIds);
    let pool = BOSSES.filter(boss => !skip.has(boss.id));
    // Every boss already used -- fall back to the full list rather than
    // offering nothing at all.
    if (pool.length < 2) pool = BOSSES.slice();
    return shuffle(pool, random).slice(0, 2).map(boss => ({
      ...boss,
      reward: getBossReward(boss.rewardId)
    }));
  }

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

  function buildContext(word, secret, history, rareLetters, quest, knowledge = {}) {
    const feedback = evaluateFeedback(secret, word);
    const safeHistory = Array.isArray(history) ? history : [];
    const requiredLetters = [];
    safeHistory.forEach(entry => {
      if (!entry || entry.fakeFeedback) return;
      const shown = Array.isArray(entry.shownFeedback) ? entry.shownFeedback : [];
      const visible = shown.length
        ? shown
        : (Array.isArray(entry.feedback) ? entry.feedback : []);
      String(entry.word || "").split("").forEach((letter, index) => {
        if (["green", "yellow", "blue"].includes(visible[index])) requiredLetters.push(letter);
      });
    });
    return {
      word,
      feedback,
      history: safeHistory,
      rareLetters,
      requiredLetters,
      knownAbsent: Array.isArray(knowledge.knownAbsent) ? knowledge.knownAbsent : [],
      knownPresent: Array.isArray(knowledge.knownPresent) ? knowledge.knownPresent : [],
      revealedPositions: Array.isArray(knowledge.revealedPositions)
        ? knowledge.revealedPositions
        : [],
      quest
    };
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

  function createQuest({ feasibleWords, secret, history, rareLetters, knownAbsent = [], knownPresent = [], revealedPositions = [], random = Math.random }) {
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
        buildContext(word, secret, history, rareLetters, meta, {
          knownAbsent,
          knownPresent,
          revealedPositions
        })
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
    // Cuddle owns these names and descriptions. Do not inherit labels from the
    // multiplayer power catalog, which may describe a different effect.
    return base ? { ...base } : null;
  }
  function rewardChoices(count = 3, random = Math.random) {
    return shuffle(REWARDS, random).slice(0, Math.min(count, REWARDS.length)).map(item => getReward(item.id));
  }

  window.CuddleQuestBook = Object.freeze({
    QUESTS,
    REWARDS,
    BOSSES,
    BOSS_REWARDS,
    createQuest,
    evaluateQuest,
    getReward,
    rewardChoices,
    getBoss,
    getBossReward,
    bossChoices,
    evaluateFeedback
  });
}());
