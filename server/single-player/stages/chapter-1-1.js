// server/single-player/stages/chapter-1-1.js
//
// CUDDLE CAMPAIGN STAGE
// Noah's first game with Penelope. The story remains ordinary stage data;
// the reusable fixed-secret and no-quest behavior is implemented by the
// isolated Single Player runtime.

"use strict";

module.exports = {
  id: "chapter-1-1",
  version: 2,
  chapter: 1,
  order: 10,
  title: "Cuddle",
  summary: "Noah learns Penelope's new word game beneath a sky full of stars.",

  map: {
    label: "1.1",
    x: 18,
    y: 72,
    next: ["chapter-1-2"]
  },

  prerequisites: [],

  cast: {
    human: "Noah",
    opponent: "Penelope"
  },

  preStory: {
    frames: [
      {
        id: "under-the-stars",
        image: null,
        alt: "Noah and Penelope sit together beneath a cold, star-filled sky.",
        beats: [
          {
            id: "stars-1",
            speaker: "Penelope",
            text: `Have you ever thought about how small the chance was that we are here at the same time in the universe, you and me?`,
            side: "left"
          },
          {
            id: "stars-2",
            speaker: "Noah",
            text: `Her slender fingers pointed towards the stars shining above, drawing an imaginary star in the sky.`,
            side: "right"
          },
          {
            id: "stars-3",
            speaker: "Penelope",
            text: `Life is already so improbable. It's like...magic.`,
            side: "left"
          },
          {
            id: "stars-4",
            speaker: "Noah",
            text: `My eyes glide over to her face, and, for a moment, I can feel the magic she's talking about. Her nose twinkles and she sneezes. The cold air clouds around her.`,
            side: "right"
          },
          {
            id: "stars-5",
            speaker: "Noah",
            text: `Bless you, my love.`,
            side: "right"
          },
          {
            id: "stars-6",
            speaker: "Noah",
            text: `She turns her face over to me, and a familiar smile plays around her lips. A mischievous smile. Time for cute play is over.`,
            side: "right"
          },
          {
            id: "stars-7",
            speaker: "Penelope",
            text: `Let's play a game.`,
            side: "left"
          },
          {
            id: "stars-8",
            speaker: "Noah",
            text: `She loves games; that's how we first met. Could never stop with them.`,
            side: "right"
          },
          {
            id: "stars-9",
            speaker: "Noah",
            text: `No, I sigh, and try to pull her closer. Come cuddle me.`,
            side: "right"
          },
          {
            id: "stars-10",
            speaker: "Noah",
            text: `But her arms were stiff as she keeps me from embracing her.`,
            side: "right"
          },
          {
            id: "stars-11",
            speaker: "Penelope",
            text: `It's a new game I came up with. I think you'll like it - you like those word games.`,
            side: "left"
          },
          {
            id: "stars-12",
            speaker: "Noah",
            text: `The battle is lost, I realize. Fine. How do you play your game?`,
            side: "right"
          }
        ]
      },
      {
        id: "penelope-explains",
        image: null,
        alt: "Penelope explains a five-letter word game to Noah.",
        beats: [
          {
            id: "rules-1",
            speaker: "Penelope",
            text: `Easy. I choose a five-letter secret, and you try to find it by guessing five-letter words of your own.`,
            side: "left"
          },
          {
            id: "rules-2",
            speaker: "Penelope",
            text: `A green tile means the letter is exactly where it belongs. Yellow means the letter is in my word, but in another position. A dark tile means it is not in my word.`,
            side: "left"
          },
          {
            id: "rules-3",
            speaker: "Penelope",
            text: `A Secretkeeper may normally change to another word after a guess, but only if the new word still agrees with every clue already shown.`,
            side: "left"
          },
          {
            id: "rules-4",
            speaker: "Penelope",
            text: `But this is your first game, so I promise I will keep the same word. No tricks.`,
            side: "left"
          },
          {
            id: "rules-5",
            speaker: "Penelope",
            text: `Keep guessing until every tile is green. Then you win. Ready, Noah?`,
            side: "left"
          }
        ]
      }
    ]
  },

  game: {
    roles: "guesser",
    firstRole: "guesser",
    difficulty: 1,

    // This introductory stage teaches the core game without random reward
    // or quest interruptions. Later stages can leave this true/default.
    powerChoice: false,
    completion: { requireCorrectGuess: true },

    human: {
      guesserStart: { mode: "free", word: null },
      setterStart: { mode: "free", word: null }
    },

    ai: {
      fixedSetterSecret: "MAGIC",
      lockSetterSecret: true,
      guesserOpeningGuessesByAttempt: [],
      setterSecretsByAttempt: ["MAGIC"],
      guesserTurnScript: [],
      setterSecretScript: []
    },

    quests: {
      disabled: true,
      guesserByRound: [],
      setterByRound: []
    },

    rules: [],

    powerPolicy: {
      playerUsesUnlocks: false,
      playerFixed: { guesser: ["suggestGuess"], setter: [] },
      opponentFixed: { guesser: [], setter: [] },
      rewardsUseUnlocks: false
    }
  },

  objectives: [
    {
      id: "win",
      required: true,
      label: "Guess Penelope's secret word",
      expression: { type: "completeStage" }
    },
    {
      id: "efficient",
      required: false,
      label: "Solve it in 6 guesses or fewer",
      expression: { type: "guessWithin", params: { maxGuesses: 6 } }
    }
  ],

  ranking: {
    score: {
      base: 100,
      perPointDifferential: 5,
      perOptionalObjective: 25,
      turnPenaltyPerGuess: 2
    },
    bands: [
      { stars: 3, expression: { type: "guessWithin", params: { maxGuesses: 4 } } },
      { stars: 2, expression: { type: "guessWithin", params: { maxGuesses: 6 } } },
      { stars: 1, expression: { type: "completeStage" } }
    ],
    rankLabels: {
      "3": "Made for This",
      "2": "Quick Learner",
      "1": "First Game",
      "0": "Try Again"
    }
  },

  rewards: {
    unlockPowers: [{ role: "guesser", powerId: "revealHistory" }],
    chooseOne: [],
    unlockStages: ["chapter-1-2"],
    setFlags: { cuddleIntroduced: true }
  },

  postStory: {
    frames: [
      {
        id: "name-the-game",
        image: null,
        alt: "Noah draws Penelope closer after their first game.",
        beats: [
          {
            id: "after-1",
            speaker: "Noah",
            text: `You let me win.`,
            side: "right"
          },
          {
            id: "after-2",
            speaker: "Noah",
            text: `She just smiles at that accusation.`,
            side: "right"
          },
          {
            id: "after-3",
            speaker: "Penelope",
            text: `Of course - if I wouldn't, you'd never play again, Mr. Sore Loser.`,
            side: "left"
          },
          {
            id: "after-4",
            speaker: "Noah",
            text: `This time, I succeed in drawing her closer.`,
            side: "right"
          },
          {
            id: "after-5",
            speaker: "Noah",
            text: `No matter if I win or lose, if you cuddle me enough, I'd play any game with you.`,
            side: "right"
          },
          {
            id: "after-6",
            speaker: "Noah",
            text: `I hear a small giggle.`,
            side: "right"
          },
          {
            id: "after-7",
            speaker: "Penelope",
            text: `Okay, then let's call this game... Cuddle.`,
            side: "left"
          }
        ]
      }
    ]
  }
};
