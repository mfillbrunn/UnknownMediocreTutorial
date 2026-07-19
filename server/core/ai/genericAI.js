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

module.exports = { createAI };
