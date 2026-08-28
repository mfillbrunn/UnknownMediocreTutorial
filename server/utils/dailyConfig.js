// server/utils/dailyConfig.js
//
// Fully deterministic Daily Challenge configuration, generated from the
// date string alone. Every player attempting a given date's challenge must
// get an identical configuration -- play mode, role order, AI difficulty,
// predefined opening words, the AI's fixed opening move, every quest, and
// every reward offer (including card order and rarity) -- so the server
// always recomputes this from `dateStr` rather than trusting anything a
// client supplies (see lobby.js's ADD_AI/SET_DAILY_POWERS handlers, and the
// public /api/daily route in server/index.js, which recomputes this same
// way before responding).
//
// Determinism strategy: every individual field is drawn from its OWN
// namespaced RNG stream (`${date}:${namespace}`, hashed independently),
// never one shared sequential stream. That means adding a brand-new field
// (a new namespace) later can never shift or reorder what an EXISTING
// field draws for a date that's already been played -- each namespace's
// seed depends only on its own name, not on how many other streams were
// consumed before it. See namespacedRng below.
"use strict";

const {
  QUEST_TYPES,
  rewardRarityProbabilities,
  makeQuest,
  setterRewardPool,
  guesserRewardPool
} = require("../power-choice/powerChoiceServer");

const PLAY_MODES = ["both", "setter", "guesser"];
const ROLES = ["setter", "guesser"];
const REWARD_MILESTONES = [1, 2, 3];
// Mirrors powerChoiceServer.js's INSPECTOR_MAX_QUESTS -- the Guesser gets
// exactly 3 quests per round (one per reward milestone), so that's exactly
// how many quest objects each round needs precomputed.
const QUESTS_PER_ROUND = 3;
// Mirrors DailyMode's "both" play mode -- at most 2 rounds ever happen in a
// Daily Challenge match, so that's how many rounds' worth of quests/opening
// words are worth precomputing. "setter"/"guesser" challenges only ever use
// round 1 of this.
const MAX_ROUNDS = 2;

// FNV-1a: a small, fast, well-distributed string hash -- used only to turn
// a namespace string into a 32-bit seed, not for anything security-
// sensitive.
function hashNamespace(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// mulberry32: a small, fast, deterministic 0..1 PRNG. Same seed in -> the
// exact same sequence of draws out, forever -- the entire guarantee this
// module rests on.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function mulberry32Next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function namespacedRng(date, namespace) {
  return mulberry32(hashNamespace(`${date}:${namespace}`));
}

function pickFrom(rng, list) {
  return Array.isArray(list) && list.length ? list[Math.floor(rng() * list.length)] : null;
}

// Word lists on disk are lowercase; every other part of the engine treats
// secrets/guesses as uppercase (state.secret, action.guess.toUpperCase(),
// etc.), so words drawn here are normalized at the source rather than
// leaving every caller to remember to upcase them.
function pickWord(rng, list) {
  const word = pickFrom(rng, list);
  return typeof word === "string" ? word.toUpperCase() : word;
}

function seededShuffle(list, rng) {
  const out = [...(list || [])];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function weightedPickSeeded(items, weightFor, rng) {
  const weighted = items.map(item => ({ item, weight: Math.max(0, Number(weightFor(item)) || 0) }));
  const total = weighted.reduce((sum, entry) => sum + entry.weight, 0);
  if (!total) return items[0] ?? null;
  let roll = rng() * total;
  for (const entry of weighted) {
    roll -= entry.weight;
    if (roll <= 0) return entry.item;
  }
  return weighted[weighted.length - 1]?.item ?? null;
}

// Draws a word from `words`, retrying (bounded) if it collides with
// `forbid`. Used to keep a predefined opening word from being identical to
// the OPPOSING side's fixed opening word for that same round -- e.g. the
// human's predefined opening guess landing on exactly the AI's fixed
// secret would resolve the round in a single, unplayed move the instant it
// starts. Gives up after `attempts` retries (treated the same as "no
// predefined word that day") rather than looping forever on a pathologically
// small word list.
function wordFrom(rng, words, attempts, forbid) {
  let word = pickWord(rng, words);
  let tries = 0;
  while (forbid && word && word === forbid && tries < attempts) {
    word = pickWord(rng, words);
    tries += 1;
  }
  return word && word === forbid ? null : word;
}

function generatePlayMode(date) {
  return pickFrom(namespacedRng(date, "mode"), PLAY_MODES) || "both";
}

function generateFirstRole(date) {
  return pickFrom(namespacedRng(date, "first-role"), ROLES) || "guesser";
}

function generateAiDifficulty(date) {
  return Math.floor(namespacedRng(date, "difficulty")() * 3) + 1; // 1 | 2 | 3
}

function generateAiOpeningGuess(date, allowedGuesses) {
  return pickWord(namespacedRng(date, "ai-opening-guess"), allowedGuesses);
}

function generateAiOpeningSecret(date, allowedSecrets) {
  return pickWord(namespacedRng(date, "ai-opening-secret"), allowedSecrets);
}

// Human opening words are independent of playMode: a "setter"-only
// challenge simply never reads humanOpeningGuess, a "guesser"-only
// challenge never reads humanOpeningSecret, and "both" can use either or
// both. Roughly half the days predefine the word at all (drawn from the
// same per-field stream, so it's still fully deterministic); the other
// half leave it null so the player picks freely (see simultaneousOpening.js).
function generateHumanOpeningGuess(date, allowedGuesses, aiOpeningSecret) {
  const rng = namespacedRng(date, "human-guesser-opening");
  if (rng() >= 0.5) return null;
  return wordFrom(rng, allowedGuesses, 25, aiOpeningSecret);
}

function generateHumanOpeningSecret(date, allowedSecrets, aiOpeningGuess) {
  const rng = namespacedRng(date, "human-setter-opening");
  if (rng() >= 0.5) return null;
  return wordFrom(rng, allowedSecrets, 25, aiOpeningGuess);
}

// One quest object per reward milestone (3) per round (2) -- generated with
// makeQuest's own seeded-rng support (see powerChoiceServer.js) so the
// EXACT same quest shape (type, letters, avoidRow, vowelTarget, Field
// Report conditions, id) comes out for every player. Stored here as full
// objects, not just a type string, so a reconnect/state-rebuild reads the
// same conditions back out (via dailyQuestAt) instead of regenerating.
function generateQuestsByRound(date) {
  const rounds = [];
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const rng = namespacedRng(date, `quest:round-${round + 1}`);
    const quests = [];
    let previousType = null;
    for (let i = 0; i < QUESTS_PER_ROUND; i++) {
      const quest = makeQuest(previousType, rng);
      quests.push(quest);
      previousType = quest.type;
    }
    rounds.push(quests);
  }
  return rounds;
}

// Mirrors powerChoiceServer.js's rewardPickRarityOptions exactly (roll one
// rarity for the whole offering from REWARD_RARITY_PROBABILITIES, prefer a
// full 3-card same-rarity bucket, fall back to a partial one only if no
// rarity has 3), except seeded and WITHOUT rewardOptionApplicable
// filtering -- Daily Challenge reward offers are a fixed schedule that
// deliberately bypasses current-state eligibility (see
// powerChoiceServer.js's dailyRewardOptions/applyChoice for how an
// infeasible daily card still resolves safely instead of being swapped
// out). Also precomputes which of the 3 cards the AI deterministically
// takes if it earns that same milestone (aiPickIndex).
function generateRewardOffers(date) {
  const rewardOffers = { setter: [], guesser: [] };
  const aiPickIndex = { setter: [], guesser: [] };

  for (const role of ROLES) {
    for (const rewardNumber of REWARD_MILESTONES) {
      const pool = role === "setter" ? setterRewardPool() : guesserRewardPool(rewardNumber);
      const byTier = { 1: [], 2: [], 3: [] };
      for (const option of pool) {
        const tier = option.tier === 2 || option.tier === 3 ? option.tier : 1;
        byTier[tier].push(option);
      }

      const probabilities = rewardRarityProbabilities(rewardNumber);
      const tierWeight = { 1: probabilities.common, 2: probabilities.rare, 3: probabilities.legendary };
      const fullTiers = [1, 2, 3].filter(tier => byTier[tier].length >= 3);
      const candidateTiers = fullTiers.length
        ? fullTiers
        : [1, 2, 3].filter(tier => byTier[tier].length > 0);

      const tierRng = namespacedRng(date, `reward:${role}:${rewardNumber}:tier`);
      const rolledTier = candidateTiers.length
        ? weightedPickSeeded(candidateTiers, tier => tierWeight[tier], tierRng) || candidateTiers[0]
        : 1;

      const cardsRng = namespacedRng(date, `reward:${role}:${rewardNumber}:cards`);
      const picked = seededShuffle(byTier[rolledTier] || [], cardsRng).slice(0, 3);
      const rarity = rolledTier === 3 ? "legendary" : rolledTier === 2 ? "rare" : "common";

      rewardOffers[role].push({ rarity, optionIds: picked.map(option => option.id) });

      const pickRng = namespacedRng(date, `reward:${role}:${rewardNumber}:ai-pick`);
      aiPickIndex[role].push(picked.length ? Math.floor(pickRng() * picked.length) : 0);
    }
  }

  return { rewardOffers, aiPickIndex };
}

// allowedSecrets/allowedGuesses should always be the server's authoritative
// word lists (server/index.js's ALLOWED_SECRETS/ALLOWED_GUESSES) -- unlike
// the previous version of this module, omitting them no longer hides the
// day's secret from a caller: quest and reward generation don't depend on
// them at all, and the AI's fixed opening word/secret are safe to compute
// either way (server/index.js's /api/daily route whitelists its RESPONSE
// fields instead -- see there for what's actually safe to expose).
function getDailyConfig(dateStr, allowedSecrets, allowedGuesses) {
  const date = dateStr;
  const secrets = Array.isArray(allowedSecrets) ? allowedSecrets : [];
  const guesses = Array.isArray(allowedGuesses) ? allowedGuesses : [];

  const playMode = generatePlayMode(date);
  const firstRole = generateFirstRole(date);
  const aiDifficulty = generateAiDifficulty(date);
  const aiOpeningGuess = generateAiOpeningGuess(date, guesses);
  const aiOpeningSecret = generateAiOpeningSecret(date, secrets);
  const humanOpeningGuess = generateHumanOpeningGuess(date, guesses, aiOpeningSecret);
  const humanOpeningSecret = generateHumanOpeningSecret(date, secrets, aiOpeningGuess);
  const questsByRound = generateQuestsByRound(date);
  const { rewardOffers, aiPickIndex } = generateRewardOffers(date);

  return {
    date,
    playMode,
    firstRole,
    aiDifficulty,
    humanOpeningGuess,
    humanOpeningSecret,
    aiOpeningGuess,
    aiOpeningSecret,
    questsByRound,
    rewardOffers,
    aiPickIndex
  };
}

module.exports = { getDailyConfig, QUEST_TYPES };
