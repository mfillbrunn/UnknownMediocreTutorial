// server/single-player/stages/chapter-1-1.js
//
// Stage one of the campaign. A standard, author-defined stage using the
// same schema as every other stage -- not a wrapper around the existing
// tutorial. Meant to be easy to read and easy to modify: one round, the
// human as Guesser, an easy AI Secretkeeper with a short scripted opener.

"use strict";

module.exports = {
  id: "chapter-1-1",
  version: 1,
  chapter: 1,
  order: 10,
  title: "First Contact",
  summary: "Crack an easy opponent's secret and get your footing.",

  map: {
    label: "1.1",
    x: 18,
    y: 72,
    next: ["chapter-1-2"]
  },

  prerequisites: [],

  preStory: {
    frames: [
      {
        id: "arrival",
        image: null,
        alt: "A quiet room with a single lamp and a chalkboard covered in five-letter grids.",
        beats: [
          { id: "b1", speaker: "Guide", text: "Someone's picked a word. Five letters, one secret.", side: "left" },
          { id: "b2", speaker: "Guide", text: "Every guess you make tells you a little more -- green means right spot, yellow means right letter, wrong spot.", side: "left" },
          { id: "b3", speaker: "Player", text: "And if I get it wrong?", side: "right" },
          { id: "b4", speaker: "Guide", text: "Then you learn something and try again. Let's see how fast you can close in.", side: "left" }
        ]
      }
    ]
  },

  game: {
    roles: "guesser",
    firstRole: "guesser",
    difficulty: 1,
    human: {
      guesserStart: { mode: "free", word: null },
      setterStart: { mode: "free", word: null }
    },
    ai: {
      guesserOpeningGuessesByAttempt: [],
      setterSecretsByAttempt: ["CRANE", "SLATE", "AUDIO"],
      guesserTurnScript: [],
      setterSecretScript: []
    },
    quests: {
      guesserByRound: [],
      setterByRound: []
    },
    rules: [],
    powerPolicy: {
      playerUsesUnlocks: true,
      playerFixed: { guesser: [], setter: [] },
      opponentFixed: { guesser: [], setter: [] },
      rewardsUseUnlocks: true
    }
  },

  objectives: [
    { id: "win", required: true, expression: { type: "completeStage" } },
    { id: "efficient", required: false, expression: { type: "guessWithin", params: { maxGuesses: 6 } } }
  ],

  ranking: {
    score: { base: 100, perPointDifferential: 5, perOptionalObjective: 25, turnPenaltyPerGuess: 2 },
    bands: [
      { stars: 3, expression: { type: "guessWithin", params: { maxGuesses: 4 } } },
      { stars: 2, expression: { type: "guessWithin", params: { maxGuesses: 6 } } },
      { stars: 1, expression: { type: "completeStage" } }
    ],
    rankLabels: { "3": "Flawless", "2": "Sharp", "1": "Solved", "0": "Not Yet" }
  },

  rewards: {
    unlockPowers: [{ role: "guesser", powerId: "revealHistory" }],
    chooseOne: [],
    unlockStages: ["chapter-1-2"],
    setFlags: {}
  },

  postStory: {
    frames: [
      {
        id: "debrief",
        image: null,
        alt: "The Guide nods approvingly at a solved grid.",
        beats: [
          { id: "b1", speaker: "Guide", text: "Not bad. You're already reading the board like someone who's done this before.", side: "left" },
          { id: "b2", speaker: "Player", text: "What's next?", side: "right" },
          { id: "b3", speaker: "Guide", text: "Someone who plays both sides. Come find out.", side: "left" }
        ]
      }
    ]
  }
};
