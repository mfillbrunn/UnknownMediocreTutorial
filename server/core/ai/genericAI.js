const { isConsistentWithHistory } = require("../../game-engine/history");
const { satisfiesForceGuess } = require("../../game-engine/validation");
const { scoreGuess } = require("../../game-engine/scoring");

/* ===============================
   ENTRY POINTS
   =============================== */

function pickGuess(state, allowedGuesses, secretRows, guessParams) {
  return pickAIGuess(state, allowedGuesses, secretRows, guessParams);
}

function pickSecret(state, secretRows, setterParams) {
  const secret = pickAISecret(state, secretRows, setterParams);
   if (secret === state.pendingGuess) { return state.secret;}
   return secret;
}

function createAI({ guessParams, setterParams }) {
  return {
    pickGuess(state, words, secrets) {
      return pickGuess(state, words, secrets, guessParams);
    },
    pickSecret(state, secrets) {
      return pickSecret(state, secrets, setterParams);
    }
  };
}

/* ===============================
   SHARED UTILITIES
   =============================== */

function weightedRandom(items, weightFn) {
  if (!items.length) return null;
  const total = items.reduce((s, x) => s + weightFn(x), 0);
  if (total <= 0) {
    return items[Math.floor(Math.random() * items.length)];
  }
  let r = Math.random() * total;
  for (const item of items) {
    r -= weightFn(item);
    if (r <= 0) return item;
  }
  return items[items.length - 1];
}

function weightedChoice(weights) {
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (const [key, w] of Object.entries(weights)) {
    r -= w;
    if (r <= 0) return key;
  }
  return Object.keys(weights)[0];
}

function getUsedLetters(state) {
  const used = new Set();
  for (const h of state.history) {
    for (const c of h.guess.toUpperCase()) used.add(c);
  }
  return used;
}

function countNewLetters(word, usedLetters) {
  let c = 0;
  for (const ch of new Set(word.toUpperCase())) {
    if (!usedLetters.has(ch)) c++;
  }
  return c;
}

// Standard English letter-frequency order (ETAOIN SHRDLU, extended to all
// 26) — the "common letters" category several power heuristics below fall
// back on when there isn't enough game-specific info to do better.
const COMMON_LETTER_ORDER = "ETAOINSHRDLCUMWFGYPBVKJXQZ".split("");

function shuffleArray(arr) {
  const copy = arr.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// Words from `secretRows` still consistent with everything shown to the
// GUESSER so far (fbGuesser view) — the guesser's own belief about which
// secrets remain possible. Shared by every power heuristic below that
// needs to reason about "the remaining words," so they all agree on what
// that means instead of each recomputing a slightly different notion of
// it.
function feasibleSecretsFor(state, secretRows) {
  return secretRows.filter(r =>
    isConsistentWithHistory(state.history, r.word, state, { fbGuesser: true })
  );
}

// For each letter, how many of the given words contain it at least once —
// "how many remaining candidates would this letter help distinguish,"
// the standard information-value heuristic for probes that don't have to
// be a real dictionary word.
function letterFrequencyAmong(words) {
  const counts = new Map();
  for (const r of words) {
    for (const ch of new Set(r.word.toUpperCase())) {
      counts.set(ch, (counts.get(ch) || 0) + 1);
    }
  }
  return counts;
}

function topLettersByFrequency(counts, excludeLetters, n) {
  return [...counts.entries()]
    .filter(([letter]) => !excludeLetters.has(letter))
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([letter]) => letter);
}

// Letter Lockout (setter): three candidate categories to ban from —
// generic common English letters, letters actually in the setter's own
// secret (banning one denies the guesser a chance to confirm it green
// this turn), and letters drawn from the remaining feasible words (only
// meaningful, and only computed, once that pool has already narrowed
// below 5 — with many candidates left almost every letter appears in some
// of them, so the category wouldn't say anything a random letter didn't).
// One category is picked at random each activation; if it turns out to
// have nothing available (already banned, or category 3 not applicable
// yet), the next category is tried.
function pickLetterLockoutLetter(state, secretRows) {
  const used = new Set(state.powers?.letterLockoutUsedLetters || []);

  const commonAvailable = COMMON_LETTER_ORDER.filter(l => !used.has(l));

  const secretLetters = [...new Set((state.secret || "").toUpperCase().split(""))]
    .filter(l => !used.has(l));

  const feasible = feasibleSecretsFor(state, secretRows);
  const remainingWordLetters = feasible.length > 0 && feasible.length < 5
    ? [...new Set(feasible.flatMap(r => r.word.toUpperCase().split("")))].filter(l => !used.has(l))
    : [];

  const categories = shuffleArray([commonAvailable, secretLetters, remainingWordLetters]);
  for (const pool of categories) {
    if (pool.length) return pool[Math.floor(Math.random() * pool.length)];
  }
  return null;
}

// Signal Scramble (nonsense, guesser): this round's guess doesn't need to
// be a real word, so build one from scratch out of whichever letters are
// most common among the still-feasible secrets — pure information
// gathering, unconstrained by the dictionary.
function pickSignalScrambleGuess(state, secretRows) {
  const usedLetters = getUsedLetters(state);
  const feasible = feasibleSecretsFor(state, secretRows);
  const counts = letterFrequencyAmong(feasible);

  const letters = topLettersByFrequency(counts, usedLetters, 5);

  // Not enough distinct high-value letters left unused — pad with the
  // next-best by raw frequency (even if already tested), then finally
  // generic common letters, so a full 5-letter guess is always produced.
  if (letters.length < 5) {
    const byFrequency = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([l]) => l);
    for (const l of byFrequency) {
      if (letters.length >= 5) break;
      if (!letters.includes(l)) letters.push(l);
    }
  }
  if (letters.length < 5) {
    for (const l of COMMON_LETTER_ORDER) {
      if (letters.length >= 5) break;
      if (!letters.includes(l)) letters.push(l);
    }
  }

  return letters.slice(0, 5).join("");
}

// Recon Sweep (letterProbe, guesser): test the 5 most common untested
// letters among the remaining feasible secrets. If none of the remaining
// candidates share any untested letter (nothing left to learn this way),
// returns null so the caller skips using the power this turn rather than
// burning it on a probe that can't teach it anything.
function pickReconSweepLetters(state, secretRows) {
  const usedLetters = getUsedLetters(state);
  const feasible = feasibleSecretsFor(state, secretRows);
  const counts = letterFrequencyAmong(feasible);

  const top = topLettersByFrequency(counts, usedLetters, 5);
  if (!top.length) return null;

  if (top.length < 5) {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
    for (const l of alphabet) {
      if (top.length >= 5) break;
      if (!usedLetters.has(l) && !top.includes(l)) top.push(l);
    }
  }

  return top.slice(0, 5).join("");
}

// Caps the pool used for the AI's expensive "how many secrets would this
// leave" estimates (see pickAISecret below) — a fixed-size random sample
// instead of the full feasible set, so per-turn cost stops growing with
// dictionary/feasible-set size. Used only to RANK candidates against each
// other, never for anything that needs to be exact, so a representative
// sample costs the AI a little precision, not correctness.
const REMAINING_SAMPLE_CAP = 400;

function sampleArray(arr, cap) {
  if (arr.length <= cap) return arr;
  // Partial Fisher-Yates: only the first `cap` positions need to end up
  // randomized, so this touches every element once (O(n), same order as
  // the feasibility scan that produced `arr`) rather than fully sorting.
  const copy = arr.slice();
  const n = Math.min(cap, copy.length);
  for (let i = 0; i < n; i++) {
    const j = i + Math.floor(Math.random() * (copy.length - i));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
}

/* ===============================
   SETTER LOGIC
   =============================== */

function computeRemainingForSecret(state, secret, secrets) {
  const guess = state.pendingGuess;
  if (!guess || guess.includes("?")) return null;

  const fb = scoreGuess(secret.toUpperCase(), guess.toUpperCase());
  const newHistory = [...state.history,{ guess, fb, ignoreConstraints: false }];
  let count = 0;
  for (const w of secrets) {
    // How many secrets would still look plausible to the GUESSER — the
    // same quantity the "remaining words" box shows a human setter — so
    // this has to read what the guesser is actually shown (fbGuesser),
    // not the setter's own true knowledge.
    if (isConsistentWithHistory(newHistory, w, state, { fbGuesser: true })) {
      count++;
    }
  }
  return count;
}

function countColors(secret, guess) {
  const fb = scoreGuess(secret.toUpperCase(), guess.toUpperCase());
  let score = 0;

  for (const c of fb) {
    if (c === "🟨") score += 0.5;
    else if (c === "⬛") score += 1;
    // 🟩 contributes 0
  }

  return score;
}

function pickAISecret(
  state,
  secretRows,
  {
    maxSecretChanges,
    maxSecretsEvaluated,
    randomness, 
    pOverlap ,
    pReductionGivenNoOverlap 
  }
) {
  state.aiSecretChangeCount ??= 0;

  // ---------- Early exits ----------
  if (!state.history || state.history.length === 0) {
    return weightedRandom(secretRows, r => r.probability || 1).word;
  }

  if (state.aiSecretChangeCount >= maxSecretChanges) {
    return state.secret;
  }

  // ---------- Noise ----------
  if (Math.random() < randomness) {
    return state.secret;
  }

  const allSecrets = secretRows.map(r => r.word);

  // Every word not consistent with the guesses so far can never become
  // consistent by adding MORE history — state.history only grows. So
  // scanning feasibleSecrets instead of the full allSecrets list below
  // gives identical results, for free. Guesser view (see
  // computeRemainingForSecret above) — this is still "what looks possible
  // to my opponent", the setter's own remaining-secrets estimate.
  const feasibleSecrets = allSecrets.filter(secret =>
    isConsistentWithHistory(state.history, secret, state, { fbGuesser: true })
  );

  if (!feasibleSecrets.length) return state.secret;

  // computeRemainingForSecret rescans the pool it's given for EVERY
  // candidate evaluated below (up to maxSecretsEvaluated times) — with
  // the full feasible set that's O(maxSecretsEvaluated * feasibleSecrets
  // .length), the single biggest CPU cost anywhere in the server (it was
  // measured blocking the shared Node event loop for hundreds of ms on a
  // single AI turn, which stalls every other room's game and connection
  // at the same time). A fixed-size random sample bounds that regardless
  // of how large the feasible set is; it's only used to RANK candidates
  // against each other, so the approximation costs a little precision,
  // not correctness. reductionCandidates and colorCandidates below both
  // draw from this SAME pool (rather than colorCandidates scanning the
  // full feasible set) so reductionChoice.secret is always found when
  // checking for a Path-3 overlap.
  const samplePool = sampleArray(feasibleSecrets, REMAINING_SAMPLE_CAP);

  const currentRemaining =
    computeRemainingForSecret(state, state.secret, samplePool);

  if (!currentRemaining || currentRemaining === 0) {
    return state.secret;
  }

  // ---------- Path 1: reduction ----------
  const reductionCandidates = samplePool
    .slice(0, Math.min(maxSecretsEvaluated, samplePool.length))
    .map(secret => {
      const remaining =
        computeRemainingForSecret(state, secret, samplePool);
      if (remaining === null) return null;
      return {
        secret,
        reduction: (currentRemaining - remaining) / currentRemaining
      };
    })
    .filter(Boolean);

  if (!reductionCandidates.length) return state.secret;

  const reductionChoice = weightedRandom(
    reductionCandidates,
    c => c.reduction
  );

  // ---------- Path 2 & 3: color-adversarial ----------
  const guess = state.pendingGuess;

  if (guess && !guess.includes("?")) {
    // score current secret
    let currentColorScore = 0;
    for (const c of scoreGuess(
      state.secret.toUpperCase(),
      guess.toUpperCase()
    )) {
      if (c === "🟨") currentColorScore += 0.5;
      else if (c === "⬛") currentColorScore += 1;
    }

    // score sampled feasible secrets
    const colorCandidates = samplePool
      .map(secret => {
        let score = 0;
        for (const c of scoreGuess(
          secret.toUpperCase(),
          guess.toUpperCase()
        )) {
          if (c === "🟨") score += 0.5;
          else if (c === "⬛") score += 1;
        }
        return {
          secret,
          score,
          delta: score - currentColorScore
        };
      })
      .filter(x => x.delta > 0);

    if (colorCandidates.length) {
      const overlapCandidates = colorCandidates.filter(
        x => x.secret === reductionChoice.secret
      );

      const bestOverlap =
        overlapCandidates.length
          ? overlapCandidates.reduce((a, b) =>
              b.score > a.score ? b : a
            )
          : null;

      state.aiSecretChangeCount++;

      // ---------- Decision ----------
      if (bestOverlap && Math.random() < pOverlap) {
        return bestOverlap.secret; // Path 3
      }

      if (Math.random() < pReductionGivenNoOverlap) {
        return reductionChoice.secret; // Path 1
      }

      // Path 2: weighted by improvement
      const totalDelta = colorCandidates.reduce(
        (s, x) => s + x.delta,
        0
      );

      let r = Math.random() * totalDelta;
      for (const x of colorCandidates) {
        r -= x.delta;
        if (r <= 0) return x.secret;
      }

      return colorCandidates[0].secret;
    }
  }

  // ---------- Fallback ----------
  state.aiSecretChangeCount++;
  return reductionChoice.secret;
}



/* ===============================
   GUESSER LOGIC
   =============================== */

function pickAIGuess(state, wordRows, allowedSecrets, strategyWeights) {
  if (!state || !state.history) {
    return weightedRandom(wordRows, r => r.probability || 1).word;
  }

  const history = state.history;
  const usedGuesses = new Set(history.map(h => h.guess.toUpperCase()));
  const usedLetters = getUsedLetters(state);

  const remaining = wordRows.filter(r => !usedGuesses.has(r.word));
  if (!remaining.length) {
    return weightedRandom(wordRows, r => r.probability || 1).word;
  }

  // ----- Total Blackout power -----
  // Hides all feedback and keyboard colors for THIS guess — a human
  // guesser has to pick with no visible history at all. Every pool below
  // (feasible/optimal/uninformed) is built from that same history, so
  // using any of them would let the AI reason with information it isn't
  // actually shown. Match the human experience: an unweighted random pick
  // among words not yet guessed.
  if (state.powers?.blindGuessActive) {
    return weightedRandom(remaining, r => r.probability || 1).word;
  }

   const remaining_ideal = allowedSecrets.filter(r => !usedGuesses.has(r.word));

  // ----- Force guess power -----
  const forceOptions = state?.powers?.forceGuessOptions;
  if (forceOptions?.length) {
    let forced = remaining.filter(r =>
      forceOptions.some(opt => satisfiesForceGuess(r.word, opt))
    );
    if (!forced.length) forced = wordRows;
    return weightedRandom(forced, r => r.probability || 1).word;
  }

  // ----- Leak Info (revealGreen) / Informant (revealLocation) -----
  // Both hand the guesser a letter+position that's accurate for THIS guess
  // only — neither locks it into extraConstraints (the setter is free to
  // switch away right after, see revealGreenServer.js/
  // revealLocationServer.js), so it's not something isConsistentWithHistory
  // enforces on its own. The strategy pools below don't all filter on it
  // either (uninformed/optimal2's "5 new letters" case only cares about
  // unused letters, not this), so without this a real free, guaranteed
  // letter could just go unused. A human would obviously type it in — make
  // the AI do the same instead of possibly guessing right past it.
  const greenHint = state.revealGreenInfo
    ? { idx: state.revealGreenInfo.pos, letter: state.revealGreenInfo.letter }
    : state.powers?.revealLocationPeek
    ? { idx: state.powers.revealLocationPeek.index, letter: state.powers.revealLocationPeek.letter }
    : null;

  if (greenHint && Number.isInteger(greenHint.idx) && greenHint.letter) {
    const matching = remaining.filter(
      r => r.word[greenHint.idx]?.toUpperCase() === greenHint.letter.toUpperCase()
    );
    if (matching.length) {
      // Prefer a match that's also still consistent with everything else
      // known so far; fall back to any match rather than none at all.
      const matchingFeasible = matching.filter(r =>
        isConsistentWithHistory(history, r.word, state, { fbGuesser: true })
      );
      const pool = matchingFeasible.length ? matchingFeasible : matching;
      return pool[Math.floor(Math.random() * pool.length)].word;
    }
  }

  // ----- Solve Cold Case (revealHistory) -----
  // Just revealed a real secret from a few rounds back — if it's still
  // consistent with everything learned since, it's a free, pre-validated
  // guess; no reason to reason about anything else this turn.
  const oldSecret = state.powers?.revealHistoryPending;
  if (oldSecret) {
    const upperOld = oldSecret.toUpperCase();
    if (!usedGuesses.has(upperOld) && isConsistentWithHistory(history, upperOld, state, { fbGuesser: true })) {
      return upperOld;
    }
  }

  // ----- Field Report (fieldReport) -----
  // Just revealed 3 conditions for this exact guess — meeting 2 of 3 gives
  // a free yellow letter, all 3 gives a free green one. Worth deliberately
  // aiming for instead of hoping the normal strategy pools happen to land
  // on a word that qualifies.
  if (state.powers?.fieldReportActive && state.powers?.fieldReportConditions?.length) {
    const conditions = state.powers.fieldReportConditions;
    const meetsAll = (word) => conditions.every((c) => satisfiesForceGuess(word, c));
    const qualifying = remaining.filter((r) => meetsAll(r.word));
    if (qualifying.length) {
      const feasibleQualifying = qualifying.filter((r) =>
        isConsistentWithHistory(history, r.word, state, { fbGuesser: true })
      );
      const pool = feasibleQualifying.length ? feasibleQualifying : qualifying;
      return pool[Math.floor(Math.random() * pool.length)].word;
    }
  }

  // ----- Signal Scramble (nonsense) -----
  // This guess doesn't have to be a real word this round — build one out
  // of whichever letters are most common among the remaining feasible
  // secrets instead of leaving that freedom on the table.
  if (state.powers?.nonsenseActive) {
    const scramble = pickSignalScrambleGuess(state, allowedSecrets);
    if (scramble) return scramble;
  }

  // ----- Strategy pools -----
  // The feasible set (words still consistent with every clue) MUST be
  // computed over the full secret list, not a sample: a sample can omit
  // the actual secret, and then the AI keeps guessing feasible-LOOKING
  // words that can never be right and never finishes the game. This is a
  // single O(secrets * history) pass of fast isConsistentWithHistory
  // checks (~1ms), so there's no reason to cap it — the expensive
  // O(candidates * secrets) blow-up that sampling was added for lives in
  // pickAISecret (the setter side), not here.
  // Guesser view: this is the AI's own belief about which secrets are
  // still possible, so it has to read what it was actually shown
  // (fbGuesser) — reading the true fb here would let the AI see straight
  // through any masking power (Redact Report, Hide Evidence, Falsify
  // Intel) used against it.
  const feasible = remaining_ideal.filter(r =>
    isConsistentWithHistory(history, r.word, state, { fbGuesser: true })
  );

  // Closing move: once only a handful of secrets remain consistent, stop
  // gathering information and actually take a shot at winning by guessing
  // one of them — otherwise the AI can circle indefinitely on "high
  // information" words that are themselves already ruled out, never
  // guessing the real secret. (The setter can still dodge by switching
  // secrets, but only up to its per-match change limit; after that this
  // guarantees the game converges.)
  if (feasible.length > 0 && feasible.length <= 2) {
    return feasible[Math.floor(Math.random() * feasible.length)].word;
  }

  const uninformed = remaining.filter(r =>
    countNewLetters(r.word, usedLetters) >= 1
  );

  const optimal = (() => {
    if (!feasible.length) return [];
    const maxNew = Math.max(
      ...feasible.map(r => countNewLetters(r.word, usedLetters))
    );
    return feasible.filter(
      r => countNewLetters(r.word, usedLetters) === maxNew
    );
  })();

  const optimal2 = (() => {
    // Case 1: many feasible → pure information gain (5 unused letters)
    if (feasible.length > 10) {
      const allFiveNew = remaining.filter(
        r => countNewLetters(r.word, usedLetters) === 5
      );
      return allFiveNew;
    }

    // Case 2: few feasible → restrict to feasible and maximize unused letters
    if (!feasible.length) return [];
    const maxNew = Math.max(
      ...feasible.map(r => countNewLetters(r.word, usedLetters))
    );
    return feasible.filter(
      r => countNewLetters(r.word, usedLetters) === maxNew
    );
  })();

  const pools = {
    uninformed,
    feasible,
    optimal,
    optimal2
  };

  // Remove empty strategies
  const availableWeights = {};
  for (const [k, w] of Object.entries(strategyWeights)) {
    if (pools[k]?.length) availableWeights[k] = w;
  }

  const strategy = weightedChoice(availableWeights);
  const pool = pools[strategy];

  // Late in a long game every letter can already appear in some past guess
  // (emptying `uninformed`) while the feedback so far rules out every
  // remaining dictionary word (emptying `feasible`, and with it `optimal`/
  // `optimal2`) — e.g. after an opponent power injects a contradictory
  // constraint. All four pools end up empty, `strategy` comes back
  // `undefined`, and indexing into `pools[undefined]` used to throw. That
  // throw happened inside runAI's setTimeout callback, which has no
  // try/catch around it, so it crashed the whole Node process and dropped
  // every connected socket. Fall back to any still-unused word instead.
  if (!pool || !pool.length) {
    return weightedRandom(remaining.length ? remaining : wordRows, r => r.probability || 1).word;
  }

  return pool[Math.floor(Math.random() * pool.length)].word;
}


/* ===============================
   EXPORT
   =============================== */

module.exports = {
  createAI,
  pickLetterLockoutLetter,
  pickReconSweepLetters,
  feasibleSecretsFor,
  COMMON_LETTER_ORDER
};
