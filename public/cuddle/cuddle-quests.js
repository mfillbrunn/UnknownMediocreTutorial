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
      description: "Five different letters.",
      detail: "Play a word whose five letters are all different: no letter may appear twice.",
      test: ({ word }) => new Set(word).size === 5
    },
    {
      id: "rareLetters",
      icon: "💎",
      title: "Rare Find",
      description: quest => `Use a rare letter: ${quest.rareLetters.join(", ")}.`,
      detail: quest => `Include at least one of these rare letters anywhere in your word: ${quest.rareLetters.join(", ")}. They are the least common letters still in your deck.`,
      test: ({ word, quest }) => quest.rareLetters.some(letter => word.includes(letter))
    },
    {
      id: "inOrder",
      icon: "📈",
      title: "In Order",
      description: "Three letters in a row rising A→Z.",
      detail: "Somewhere in your word, three neighbouring letters must climb through the alphabet, each later than the one before. In GHOST, G → H → O does it.",
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
      description: "Use a letter twice.",
      detail: "Play a word that uses at least one letter more than once, like LEVEL or APPLE.",
      test: ({ word }) => new Set(word).size < word.length
    },
    {
      id: "wordChain",
      icon: "🔗",
      title: "Word Chain",
      description: quest => `Start with ${quest.chainLetter} (your last word's end).`,
      detail: quest => `Your word must start with ${quest.chainLetter}, the last letter of your previous guess.`,
      test: ({ word, quest }) => word.startsWith(quest.chainLetter)
    },
    {
      id: "fieldReport",
      icon: "📋",
      title: "Field Report",
      description: "Get 2+ greens or yellows.",
      detail: "Your guess must turn at least two tiles green or yellow.",
      test: ({ feedback }) => feedback.filter(result => result !== "grey").length >= 2
    },
    {
      id: "hardModeStreak",
      icon: "🔥",
      title: "Hold the Clues",
      description: "Keep greens, move yellows, skip greys.",
      detail: "Play by hard-mode rules: every letter you have seen green stays in its spot, every letter you have seen yellow is used again but not where it was yellow, and no letter you have seen grey is played again.",
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
      description: "Use 3+ vowels.",
      detail: "Use at least three vowels (A, E, I, O, U) in your word. Repeats count, so EERIE has four.",
      test: ({ word }) => word.split("").filter(letter => VOWELS.has(letter)).length >= 3
    },
    {
      id: "freshLetters",
      icon: "🌳",
      title: "Fresh Letters",
      description: "No letter you've played this stage.",
      detail: "Use five letters that appear in none of your earlier guesses this stage.",
      needsHistory: true,
      test: ({ word, history = [] }) => {
        const played = new Set();
        history.forEach(entry => {
          const earlier = String(entry?.word || "").toUpperCase();
          if (earlier && earlier !== word) earlier.split("").forEach(letter => played.add(letter));
        });
        return played.size > 0 && word.split("").every(letter => !played.has(letter));
      }
    },
    {
      id: "vowelStart",
      icon: "🅰",
      title: "Open Vowel",
      description: "Start with a vowel.",
      detail: "Your word must begin with A, E, I, O or U.",
      test: ({ word }) => VOWELS.has(word[0])
    },
    {
      id: "oneVowel",
      icon: "🥨",
      title: "Lean Word",
      description: "At most one vowel.",
      detail: "Use no more than one vowel (A, E, I, O, U) in the whole word. Y does not count as a vowel, so NYMPH and CRYPT pass.",
      test: ({ word }) => word.split("").filter(letter => VOWELS.has(letter)).length <= 1
    },
    {
      id: "sameEnds",
      icon: "📚",
      title: "Bookends",
      description: "Same first and last letter.",
      detail: "Your word must start and end with the same letter, like SALTS or TRACT.",
      test: ({ word }) => word.length === 5 && word[0] === word[4]
    },
    {
      id: "newGreen",
      icon: "🎯",
      title: "New Ground",
      description: "Find a new green.",
      detail: "Turn a tile green in a position you had not pinned down yet. A green you already knew does not count.",
      test: ({ feedback, revealedPositions = [] }) => feedback.some((result, index) => result === "green" && !revealedPositions[index])
    },
    {
      id: "yellowPair",
      icon: "🟨",
      title: "Two Yellows",
      description: "Get 2+ yellows.",
      detail: "Your guess must show at least two yellow tiles: letters that are in the word but in the wrong spot.",
      test: ({ feedback }) => feedback.filter(result => result === "yellow").length >= 2
    },
    {
      id: "greenLight",
      icon: "🟩",
      title: "Green Light",
      description: "Get a green.",
      detail: "Your guess must turn at least one tile green: a right letter in the right spot.",
      test: ({ feedback }) => feedback.includes("green")
    }
  ];

  // Internal IDs remain compatible with older Cuddle saves, while the names,
  // descriptions, and effects below are owned by single-player Cuddle.
  const REWARDS = [
    {
      id: "stealthGuess",
      icon: "🔁",
      title: "Extra Mulligan",
      description: "Gain one additional mulligan for this stage."
    },
    {
      id: "letterProbe",
      icon: "🔎",
      title: "Letter Count",
      description: "Show how many times two of your consonants appear in the secret."
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
    },
    {
      id: "jokerToken",
      icon: "🃏",
      title: "Joker",
      description: "Gain a Joker: a wildcard tile that becomes the right letter when you submit. It stays until you use it."
    }
  ];

  // The one list of constraints bosses and challenges are built from. Each
  // works on single guesses (the "per guess" kinds) or on a whole round:
  //   boss      -- can be a boss on its own
  //   challenge -- can be a stage challenge (reward = its $ bonus)
  //   mix       -- can be one guess of a mixed boss (Chimera)
  //   curse     -- can be the curse a beaten boss leaves on later stages
  // `text` reads after "Guess N:" or "On your first guesses,".
  const CONSTRAINTS = Object.freeze([
    { id: "countOnly", icon: "🔢", title: "Count Only", kind: "mask", boss: true, challenge: true, mix: true, curse: true, reward: 28,
      text: "the marked tiles only say how many of them are green and yellow, not which." },
    { id: "delayedFeedback", icon: "⏳", title: "Delayed Feedback", kind: "mask", boss: true, challenge: true, mix: true, curse: true, reward: 26,
      text: "the marked tiles show their colours one guess late." },
    { id: "hiddenMargins", icon: "🫥", title: "Hidden Tiles", kind: "mask", boss: true, challenge: true, mix: true, curse: true, reward: 24,
      text: "two marked positions show no colour (the same two all stage)." },
    { id: "blueMode", icon: "🔵", title: "Blue Mode", kind: "mask", boss: true, challenge: true, mix: true, curse: true, reward: 26,
      text: "a green or yellow on the marked tiles shows blue: in the word, place unknown." },
    { id: "fakeFeedback", icon: "🤥", title: "Fake Feedback", kind: "mask", boss: true, challenge: true, mix: true, curse: true, reward: 20,
      text: "the marked tiles show a wrong colour." },
    { id: "arrowMode", icon: "🧭", title: "Arrow Signs", kind: "mask", boss: true, challenge: true, mix: true, curse: true, reward: 26,
      text: "the marked tiles show only an alphabet arrow toward the answer's letter; a dash means green." },
    { id: "quickMode", icon: "⏱️", title: "Quick Mode", kind: "rule", boss: true, challenge: true, mix: true, curse: true, reward: 24,
      text: "you have one minute; run out and the guess is lost." },
    { id: "noMulligans", icon: "✋", title: "Steady Hand", kind: "rule", boss: true, challenge: true, mix: true, curse: true, reward: 23,
      text: "no mulligans before it." },
    { id: "questEndurance", icon: "🏃", title: "Endurance Trial", kind: "rule", boss: true, challenge: true, mix: true, curse: true, reward: 26,
      text: "a quest rides on it; miss it and your hand is one letter smaller for the stage." },
    { id: "perfectOpener", icon: "🧩", title: "Perfect Opener", kind: "rule", boss: false, challenge: true, mix: true, curse: false, reward: 22,
      text: "the word must use five different letters." },
    { id: "consonantCrunch", icon: "🥨", title: "Consonant Crunch", kind: "rule", boss: false, challenge: true, mix: true, curse: false, reward: 25,
      text: "the word may contain at most one vowel." },
    { id: "shortHand", icon: "✂️", title: "Short Hand", kind: "round", boss: true, challenge: false, mix: false, curse: true, reward: 0,
      text: "ten consonants not in the answer leave your deck, and you get four guesses." },
    { id: "presetWordsTrial", icon: "🎴", title: "Preset Trial", kind: "round", boss: true, challenge: false, mix: false, curse: true, reward: 0,
      text: "the answer is one of a few words shown on screen, but you get that many fewer guesses." },
    { id: "rareWord", icon: "💎", title: "Rare Word", kind: "round", boss: false, challenge: true, mix: false, curse: false, reward: 40,
      text: "the answer is a rare, unusual word." }
  ]);

  function getConstraint(id) {
    return CONSTRAINTS.find(item => item.id === id) || null;
  }

  // A mixed boss: every guess of its window carries a different
  // constraint, drawn from the "mix" kinds. Its curse is one of them.
  function mixedBoss(random = Math.random, turns = 2) {
    const pool = CONSTRAINTS.filter(item => item.mix);
    const plan = shuffle(pool, random).slice(0, Math.max(2, turns)).map(item => item.id);
    const cursable = plan.filter(id => getConstraint(id).curse);
    const curseId = cursable[Math.floor(random() * cursable.length)] || "countOnly";
    return {
      id: "chimera",
      icon: "🧬",
      title: "Chimera",
      plan,
      curseId,
      turns: plan.length,
      description: mixedBossDescription(plan),
      rewardId: "questCadence"
    };
  }

  function mixedBossDescription(plan) {
    return plan.map((id, index) => {
      const item = getConstraint(id);
      return item ? `Guess ${index + 1}: ${item.title} -- ${item.text}` : "";
    }).filter(Boolean).join(" ");
  }

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
      description: "For the first three guesses, the marked tiles only tell you HOW MANY of them are green and yellow, not which. The rest of the row reports normally.",
      turns: 3,
      rewardId: "cullRare"
    },
    {
      id: "delayedFeedback",
      icon: "⏳",
      title: "Delayed Feedback",
      description: "For the first three guesses, the marked tiles hold back their colours for one guess: each row's hidden tiles are revealed when you submit the next guess.",
      turns: 3,
      rewardId: "doubleMulligans"
    },
    {
      id: "arrowMode",
      icon: "🧭",
      title: "Arrow Signs",
      description: "For the first guesses, the marked tiles show no colour, only an arrow: whether the answer's letter there comes earlier or later in the alphabet. A dash means it's green.",
      turns: 3,
      rewardId: "questCadence"
    },
    {
      id: "blueMode",
      icon: "🔵",
      title: "Blue Mode",
      description: "For the first four guesses, a hit on a marked tile shows as blue. You learn the letter is in the secret, but not whether it is in the right place. The rest of the row reports normally.",
      turns: 4,
      rewardId: "questCadence"
    },
    {
      id: "fakeFeedback",
      icon: "🃏",
      title: "Fake Feedback",
      description: "For the first four guesses, the marked tiles lie about their colour. The rest of the row reports normally.",
      turns: 4,
      rewardId: "freeVowelSweep"
    },
    {
      id: "quickMode",
      icon: "⚡",
      title: "Quick Mode",
      description: "One minute per guess. Run out of time and the guess is lost.",
      turns: 6,
      rewardId: "secondCup"
    },
    {
      id: "shortHand",
      icon: "🥊",
      title: "Short Hand",
      description: "Ten consonants that aren't in the answer are pulled from your deck before this round starts, and you only get four guesses to find it.",
      turns: 0,
      rewardId: "revealGreen"
    },
    {
      id: "hiddenMargins",
      icon: "🫥",
      title: "Hidden Tiles",
      description: "For the first few guesses, two marked positions hide their feedback. They behave normally afterward.",
      turns: 6,
      rewardId: "goldenThread"
    },
    {
      id: "noMulligans",
      icon: "✋",
      title: "Steady Hand",
      description: "Mulligans are locked for your opening guesses.",
      turns: 0,
      rewardId: "questDoublePick"
    },
    // (Quest Trial -- a quest on every guess, 5 points lost for each one
    // missed -- was retired: more chore than challenge.)
    {
      id: "questEndurance",
      icon: "🏃",
      title: "Endurance Trial",
      description: "A quest rides on every guess this round. Miss any and lose one hand size for the round.",
      turns: 0,
      rewardId: "questPersistReward"
    },
    {
      id: "presetWordsTrial",
      icon: "🎴",
      title: "Preset Trial",
      description: "The answer is one of a few words shown on screen, but you get that many fewer guesses.",
      turns: 0,
      rewardId: "umtAllThemes"
    }
  ];

  // Permanent run upgrades granted when a boss is cleared. A boss does not
  // also open the ordinary post-round reward screen.
  const BOSS_REWARDS = [
    {
      id: "cullRare",
      icon: "✂️",
      title: "Deep Cull",
      description: "Remove four rare letters from the deck and from every future secret."
    },
    {
      id: "doubleMulligans",
      icon: "🔁",
      title: "Double Mulligans",
      description: "Permanently doubles every mulligan you get: each stage's starting mulligans and every one you gain along the way."
    },
    {
      id: "biggerMulligans",
      icon: "🖐️",
      title: "Full Hand Mulligan",
      description: "Every mulligan can now replace up to five letters."
    },
    {
      id: "freeVowelSweep",
      icon: "🅰️",
      title: "Free Vowel Sweep",
      description: "Each stage opens with one random vowel tested for free: you learn whether it's in the answer, not where."
    },
    {
      id: "revealGreen",
      icon: "📍",
      title: "Position Peek",
      description: "The stage after this boss opens with one letter of the answer already in its exact place."
    },
    {
      id: "questDoublePick",
      icon: "✌️",
      title: "Double Pick",
      description: "Quest reward screens let you choose two options instead of one, for the rest of the run."
    },
    {
      id: "questCadence",
      icon: "❗",
      title: "Quest Cadence",
      description: "Quests come more often (every second guess, then every guess) and one more can be active at a time. Stacks twice."
    },
    {
      id: "questPersistReward",
      icon: "⏳",
      title: "Lasting Quests",
      description: "A quest you don't complete stays active for the rest of the stage instead of expiring after one guess, boss fights included."
    }
    // Second Cup and Golden Thread are listed by cuddle-coach-expansion.js,
    // All-Seeing Atlas by cuddle-rebalance-v5.js.
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
      detail: typeof definition.detail === "function"
        ? definition.detail(extra)
        : definition.detail || null,
      ...extra
    };
  }

  // The full explanation of a live quest, shown when it is tapped. Quests
  // saved before details existed are rebuilt from their definition.
  function questDetail(quest) {
    if (!quest) return "";
    if (quest.detail) return quest.detail;
    if (quest.id === "validPlay") return "Any real five-letter word completes this quest.";
    const definition = QUESTS.find(item => item.id === quest.id);
    if (!definition || !definition.detail) return quest.description || "";
    return typeof definition.detail === "function" ? definition.detail(quest) : definition.detail;
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
      if (definition.needsHistory && !(history || []).some(entry => entry?.word)) return;
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
        description: "Any valid word.",
        detail: "Any real five-letter word completes this quest."
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
    CONSTRAINTS,
    getConstraint,
    mixedBoss,
    mixedBossDescription,
    createQuest,
    evaluateQuest,
    questDetail,
    getReward,
    rewardChoices,
    getBoss,
    getBossReward,
    bossChoices,
    evaluateFeedback
  });
}());
