// server/single-player/stages/chapter-1-2.js
//
// The rich sample stage: two rounds (Guesser then Secretkeeper), a scripted
// quest, the yellowToGreen custom rule, a survival-based star ranking, and
// a choose-one power learned from the opponent. Unlocked by completing
// chapter-1-1. If no further stage is ever added, this is the campaign's
// current endpoint (see rewards.setFlags.campaignComplete below) -- the
// graph still validates because chapter-1-2.map.next is simply empty.

"use strict";

module.exports = {
  id: "chapter-1-2",
  version: 1,
  chapter: 1,
  order: 20,
  title: "Both Sides of the Table",
  summary: "Guess a trickier secret, then set one of your own and see how long it holds.",

  map: {
    label: "1.2",
    x: 42,
    y: 46,
    next: []
  },

  prerequisites: ["chapter-1-1"],

  preStory: {
    frames: [
      {
        id: "meeting",
        image: null,
        alt: "A figure in a long coat waiting beside a second chalkboard, already mid-puzzle.",
        beats: [
          { id: "b1", speaker: "Archivist", text: "So you're the one the Guide's been talking about.", side: "left" },
          { id: "b2", speaker: "Player", text: "Word travels fast.", side: "right" },
          { id: "b3", speaker: "Archivist", text: "In a room this small? Always. I keep a harder secret than most -- let's see if that still holds.", side: "left" }
        ]
      },
      {
        id: "the-catch",
        image: null,
        alt: "The Archivist taps the board twice, underlining a rule scrawled in the corner.",
        beats: [
          { id: "b1", speaker: "Archivist", text: "One rule tonight: a near-miss reads kinder than usual. Yellow tends to turn green when it's your own guess.", side: "left" },
          { id: "b2", speaker: "Player", text: "And after I've guessed yours?", side: "right" },
          { id: "b3", speaker: "Archivist", text: "Then we trade chairs. You set the secret, and I do the guessing. Fair's fair.", side: "left" }
        ]
      }
    ]
  },

  game: {
    roles: "both",
    firstRole: "guesser",
    difficulty: 2,
    human: {
      guesserStart: { mode: "free", word: null },
      setterStart: { mode: "free", word: null }
    },
    ai: {
      // Round 1: human guesses, AI sets. Round 2: human sets, AI guesses.
      guesserOpeningGuessesByAttempt: ["TRAIN", "STARE", "ROAST"],
      setterSecretsByAttempt: ["FREAK", "PLANK", "SHUCK"],
      guesserTurnScript: [],
      setterSecretScript: []
    },
    quests: {
      guesserByRound: ["ROW"],
      setterByRound: []
    },
    rules: [
      // "player" -- a yellow the human themself earns (round 1, guessing)
      // turns green. Doesn't touch round 2, since the human is setting
      // then, not guessing.
      { id: "yellowToGreen", params: { target: "player" } }
    ],
    powerPolicy: {
      playerUsesUnlocks: true,
      playerFixed: { guesser: [], setter: [] },
      opponentFixed: { guesser: [], setter: [] },
      rewardsUseUnlocks: true
    }
  },

  objectives: [
    { id: "win", required: true, label: "Win both rounds", expression: { type: "completeStage" } },
    { id: "efficientGuess", required: false, label: "Solve round 1 in 8 guesses or fewer", expression: { type: "guessWithin", params: { maxGuesses: 8 } } },
    { id: "questDone", required: false, label: "Complete your Quest as Guesser", expression: { type: "completeQuestsAtLeast", params: { count: 1, role: "guesser" } } }
  ],

  ranking: {
    score: { base: 150, perPointDifferential: 5, perOptionalObjective: 30, turnPenaltyPerGuess: 1 },
    // The Secretkeeper round is the one being ranked here: how many
    // guesses it took the AI to find the human's secret.
    bands: [
      { stars: 3, expression: { type: "surviveTurnsAtLeast", params: { turns: 8 } } },
      { stars: 2, expression: { type: "surviveTurnsAtLeast", params: { turns: 6 } } },
      { stars: 1, expression: { type: "surviveTurnsAtLeast", params: { turns: 4 } } }
    ],
    rankLabels: { "3": "Unbreakable", "2": "Held Firm", "1": "Cracked Late", "0": "Not Yet" }
  },

  rewards: {
    unlockPowers: [],
    chooseOne: [
      {
        id: "learn-opponent-power",
        options: [
          { role: "guesser", powerId: "wiretap" },
          { role: "setter", powerId: "delayedIntel" }
        ]
      }
    ],
    unlockStages: [],
    setFlags: { campaignComplete: true }
  },

  postStory: {
    frames: [
      {
        id: "farewell",
        image: null,
        alt: "The Archivist closes the ledger with a satisfied nod.",
        beats: [
          { id: "b1", speaker: "Archivist", text: "Held longer than most. I'll remember that.", side: "left" },
          { id: "b2", speaker: "Player", text: "Same time next chapter?", side: "right" },
          { id: "b3", speaker: "Archivist", text: "When there's a next chapter to write, you'll be the first to know.", side: "left" }
        ]
      }
    ]
  }
};
