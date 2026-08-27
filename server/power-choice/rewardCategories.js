"use strict";

// Canonical reward-category metadata for Power Choice reward cards. This is
// the single source of truth: the server attaches `category` directly to
// every built option (see powerChoiceServer.js's powerOption() and its
// fixed-reward pool builders), and the client only maps that trusted field
// to a color -- it never infers a category from display text.
//
// Keyed by the reward's semantic id: a power-kind reward uses its bare
// powerId (e.g. "vowelRefresh"), a fixed-kind reward uses its literal id
// (e.g. "spy-reset-positive-1").
const REWARD_CATEGORIES = Object.freeze({
  // information: reveal/informant/peek/location/intelligence
  "inspector-yellow-1": "information",
  revealGreen: "information",
  magicMode: "information",
  revealLocation: "information",
  letterProfile: "information",
  suggestGuess: "information",
  letterProbe: "information",
  revealHistory: "information",
  firstLetterReveal: "information",

  // letter-control: reset/reopen/replace/restore/remove/manipulate letters or positions
  "spy-reset-positive-1": "letter-control",
  "spy-reset-known-2": "letter-control",
  "spy-yellow-smudge": "letter-control",
  "spy-trade-yellow": "letter-control",
  "spy-trade-green": "letter-control",
  "inspector-remove-unused-2": "letter-control",
  vowelRefresh: "letter-control",

  // feedback-disruption: obscure/alter/mask/scramble/delay feedback
  blindSpot: "feedback-disruption",
  confuseColors: "feedback-disruption",
  countOnly: "feedback-disruption",
  fakeFeedback: "feedback-disruption",
  blindGuess: "feedback-disruption",
  delayedIntel: "feedback-disruption",

  // constraint-defense: lock/shield/block/protect/force/ban/constrain
  freezeSecret: "constraint-defense",
  rouletteSecret: "constraint-defense",

  // choice-tempo: reroll/refresh/extra choice/extra action/skip/timing/economy
  "spy-add-point-1": "choice-tempo",
  "inspector-remove-point-1": "choice-tempo",
  forceTimer: "choice-tempo",
  nonsense: "choice-tempo"
});

const KNOWN_REWARD_CATEGORIES = Object.freeze([
  "information",
  "letter-control",
  "feedback-disruption",
  "constraint-defense",
  "choice-tempo",
  "utility"
]);

const KNOWN_REWARD_CATEGORY_SET = new Set(KNOWN_REWARD_CATEGORIES);

// utility is a neutral fallback only -- every reward actually offered
// through setterRewardPool/guesserRewardPool/fixedOptions is expected to
// have a real entry above; see the isolated coverage test in
// rewardCategories.test.js.
function categoryForRewardId(id) {
  const category = REWARD_CATEGORIES[id];
  return KNOWN_REWARD_CATEGORY_SET.has(category) ? category : "utility";
}

module.exports = {
  REWARD_CATEGORIES,
  KNOWN_REWARD_CATEGORIES,
  categoryForRewardId
};
