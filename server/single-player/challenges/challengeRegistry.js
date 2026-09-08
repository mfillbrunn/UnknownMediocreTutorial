// UMT_CHALLENGES_V2
"use strict";

function goal(type, target, label) {
  return Object.freeze({ type, target, label });
}

function challenge(config) {
  return Object.freeze({
    ...config,
    playerStartsAs: config.powerRole === "setter" ? "guesser" : "setter"
  });
}

// Each challenge names one AI power. The powered AI role is always played
// first; the role-swap round has no AI power, player power, or quest.
const CHALLENGES = Object.freeze([
  challenge({
    id: "count-only",
    title: "Count Only",
    icon: "#",
    powerId: "countOnly",
    powerRole: "setter",
    summary: "Color feedback is hidden; you only learn the total number of matching letters.",
    effect: "On each powered turn, green and yellow positions are replaced by a single match count.",
    counterplay: "Use high-information guesses and track possible positions yourself.",
    specialGoal: goal("guessLimit", 4, "Solve the powered round in 4 guesses or fewer")
  }),
  challenge({
    id: "delayed-intel",
    title: "Delayed Intel",
    icon: "T+1",
    powerId: "delayedIntel",
    powerRole: "setter",
    summary: "Your newest feedback arrives one guess late.",
    effect: "The powered row stays hidden until you submit the following guess.",
    counterplay: "Plan from older confirmed evidence instead of waiting for the latest row.",
    specialGoal: goal("guessLimit", 4, "Solve the powered round in 4 guesses or fewer")
  }),
  challenge({
    id: "blue-mode",
    title: "Blue Mode",
    icon: "BLUE",
    powerId: "confuseColors",
    powerRole: "setter",
    summary: "Every matching tile turns blue, hiding whether it is green or yellow.",
    effect: "You still learn which letters match, but not whether each match is already in the correct position.",
    counterplay: "Keep several position layouts alive and test placements with deliberate follow-up guesses.",
    specialGoal: goal("guessLimit", 4, "Solve the powered round in 4 guesses or fewer")
  }),
  challenge({
    id: "fake-feedback",
    title: "Fake Feedback",
    icon: "2X",
    powerId: "fakeFeedback",
    powerRole: "setter",
    summary: "The AI gives you a true feedback pattern and a convincing decoy.",
    effect: "Each powered row presents two possible readings without revealing which one is genuine.",
    counterplay: "Carry both branches forward until a later guess proves which reading can still be true.",
    specialGoal: goal("guessLimit", 4, "Solve the powered round in 4 guesses or fewer")
  }),
  challenge({
    id: "feedback-lie",
    title: "Feedback Lie",
    icon: "LIE",
    powerId: "feedbackLie",
    powerRole: "setter",
    summary: "Every displayed color on the powered row is deliberately wrong.",
    effect: "The row looks normal, but no shown tile color is its real result and the keyboard receives no false evidence.",
    counterplay: "Treat the row as an inverse clue: every shown color is excluded, but the real color remains uncertain.",
    specialGoal: goal("guessLimit", 4, "Solve the powered round in 4 guesses or fewer")
  }),
  challenge({
    id: "vowel-refresh",
    title: "Vowel Refresh",
    icon: "AEIOU",
    powerId: "vowelRefresh",
    powerRole: "setter",
    summary: "The AI repeatedly erases your accumulated information about vowels.",
    effect: "Each activation removes vowel feedback from the full round history and clears matching vowel constraints.",
    counterplay: "Remember vowel results yourself and use consonant structure to keep the candidate set manageable.",
    specialGoal: goal("guessLimit", 4, "Solve the powered round in 4 guesses or fewer")
  }),
  challenge({
    id: "magic-mode",
    title: "Magic Mode",
    icon: "MAGIC",
    powerId: "magicMode",
    powerRole: "guesser",
    summary: "The AI converts yellow discoveries into exact-position green constraints.",
    effect: "After an eligible powered guess, every yellow letter can become locked to its real position for the AI.",
    counterplay: "Avoid giving away easy yellow clusters and preserve several secrets that satisfy any forced greens.",
    specialGoal: goal("setterStars", 12, "Earn at least 12 Secretkeeper stars in the powered round")
  }),
  challenge({
    id: "roulette-secret",
    title: "Roulette Secret",
    icon: "SPIN",
    powerId: "rouletteSecret",
    powerRole: "guesser",
    summary: "The AI forces your next secret to rotate to another feasible word.",
    effect: "On each powered turn, your Secretkeeper choice is constrained by an automatic secret switch.",
    counterplay: "Maintain a broad family of consistent secrets so a forced switch does not collapse your defense.",
    specialGoal: goal("setterStars", 12, "Earn at least 12 Secretkeeper stars in the powered round")
  }),
  challenge({
    id: "reveal-history",
    title: "Reveal History",
    icon: "CASE",
    powerId: "revealHistory",
    powerRole: "guesser",
    summary: "Once enough history exists, the AI uncovers a real secret from three turns earlier.",
    effect: "The revealed old secret becomes an immediate high-confidence guess when it is still consistent.",
    counterplay: "Change secrets strategically so an older reveal is less likely to remain a valid finishing move.",
    specialGoal: goal("setterStars", 12, "Earn at least 12 Secretkeeper stars in the powered round")
  }),
  challenge({
    id: "bet-miss",
    title: "Risky Maneuver",
    icon: "BET",
    powerId: "betMiss",
    powerRole: "guesser",
    summary: "Before guessing, the AI predicts how many tiles will miss completely.",
    effect: "A correct prediction awards the AI an additional exact-position green constraint.",
    counterplay: "Vary the overlap profile of your feasible secrets so the AI cannot reliably predict the miss count.",
    specialGoal: goal("setterStars", 12, "Earn at least 12 Secretkeeper stars in the powered round")
  }),
  challenge({
    id: "nonsense",
    title: "Signal Scramble",
    icon: "A?Z",
    powerId: "nonsense",
    powerRole: "guesser",
    summary: "The AI may submit a five-letter information probe that is not a dictionary word.",
    effect: "It combines high-value untested letters to gather more information than an ordinary legal guess may allow.",
    counterplay: "Keep candidate secrets diverse and expect broad letter coverage instead of a normal word pattern.",
    specialGoal: goal("setterStars", 12, "Earn at least 12 Secretkeeper stars in the powered round")
  })
]);

const DIFFICULTIES = Object.freeze({
  easy: Object.freeze({
    id: "easy",
    label: "Easy",
    aiDifficulty: 1,
    powerTurns: 2,
    summary: "2 powered turns"
  }),
  medium: Object.freeze({
    id: "medium",
    label: "Medium",
    aiDifficulty: 2,
    powerTurns: 3,
    summary: "3 powered turns"
  }),
  hard: Object.freeze({
    id: "hard",
    label: "Hard",
    aiDifficulty: 3,
    powerTurns: 4,
    summary: "4 powered turns"
  })
});

function getChallenge(id) {
  return CHALLENGES.find(item => item.id === id) || null;
}

function getDifficulty(id) {
  return DIFFICULTIES[id] || null;
}

function publicCatalog() {
  return {
    challenges: CHALLENGES.map(item => ({
      ...item,
      specialGoal: { ...item.specialGoal }
    })),
    difficulties: Object.values(DIFFICULTIES).map(item => ({ ...item }))
  };
}

module.exports = {
  CHALLENGES,
  DIFFICULTIES,
  getChallenge,
  getDifficulty,
  publicCatalog
};
