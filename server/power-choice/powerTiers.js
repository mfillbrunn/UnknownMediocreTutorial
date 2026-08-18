"use strict";

// Power Choice tier registry. Change ALLOWED_RANDOM_TIERS later to restrict
// which tiers can appear in the random three-card milestones.
const POWER_TIERS = Object.freeze({
  confuseColors: { role: "setter", tier: 1 },
  countOnly: { role: "setter", tier: 1 },
  fakeFeedback: { role: "setter", tier: 3 },
  blindGuess: { role: "setter", tier: 2 },
  forceTimer: { role: "setter", tier: 2 },
  delayedIntel: { role: "setter", tier: 2 },
  hideTile: { role: "setter", tier: 2 },
  blindSpot: { role: "setter", tier: 2 },
  suggestSecret: { role: "setter", tier: 2 },
  vowelRefresh: { role: "setter", tier: 2 },
  forceGuess: { role: "setter", tier: 2 },
  revealPenalty: { role: "setter", tier: 2 },
  letterLockout: { role: "setter", tier: 3 },
  assassinWord: { role: "setter", tier: 3 },

  revealGreen: { role: "guesser", tier: 2 },
  freezeSecret: { role: "guesser", tier: 2 },
  rouletteSecret: { role: "guesser", tier: 3 },
  stealthGuess: { role: "guesser", tier: 1 },
  nonsense: { role: "guesser", tier: 1 },
  magicMode: { role: "guesser", tier: 3 },
  suggestGuess: { role: "guesser", tier: 2 },
  revealHistory: { role: "guesser", tier: 2 },
  letterProbe: { role: "guesser", tier: 2 },
  revealLocation: { role: "guesser", tier: 2 },
  letterProfile: { role: "guesser", tier: 2 },
  betMiss: { role: "guesser", tier: 2 },
  wiretap: { role: "guesser", tier: 3 },
  doubleGuess: { role: "guesser", tier: 3 },
  fieldReport: { role: "guesser", tier: 3 }
});

const ALLOWED_RANDOM_TIERS = Object.freeze({
  setter: [1, 2, 3],
  guesser: [1, 2, 3]
});

// These pools favor powers that can be activated cleanly at turn start.
// Tier filtering is applied after this list, so it is easy to narrow later.
const RANDOM_POWER_POOLS = Object.freeze({
  setter: [
    "confuseColors", "countOnly", "fakeFeedback", "blindGuess",
    "forceTimer", "delayedIntel", "hideTile", "blindSpot",
    "suggestSecret", "vowelRefresh", "forceGuess", "revealPenalty",
    "letterLockout"
  ],
  guesser: [
    "revealGreen", "freezeSecret", "rouletteSecret", "stealthGuess",
    "nonsense", "magicMode", "suggestGuess", "revealHistory",
    "letterProbe", "revealLocation", "letterProfile", "betMiss"
  ]
});

function tierFor(powerId) {
  return POWER_TIERS[powerId]?.tier || 1;
}

function roleFor(powerId) {
  return POWER_TIERS[powerId]?.role || null;
}

function randomPool(role) {
  const allowed = new Set(ALLOWED_RANDOM_TIERS[role] || []);
  return (RANDOM_POWER_POOLS[role] || []).filter(
    id => roleFor(id) === role && allowed.has(tierFor(id))
  );
}

module.exports = {
  POWER_TIERS,
  ALLOWED_RANDOM_TIERS,
  RANDOM_POWER_POOLS,
  tierFor,
  roleFor,
  randomPool
};
