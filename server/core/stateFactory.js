// core/stateFactory.js

const { scoreGuess } = require("../game-engine/scoring");
const { isConsistentWithHistory } = require("../game-engine/history");

/**
 * Creates the initial game state for a room.
 */
function createInitialState() {
  return {
    phase: "lobby",
    turn: null,
    setter: "A",
    guesser: "B",
    ready: { A: false, B: false },

    secret: "",
    pendingGuess: "",
    guessCount: 0,
    gameOver: false,

    history: [],

    simultaneousGuessSubmitted: false,
    simultaneousSecretSubmitted: false,

    powerUsedThisTurn: false,

    powers: {
      hideTileUsed: false,
      hideTilePendingCount: 0,

      revealGreenUsed: false,
      revealGreenPos: null,

      reuseLettersUsed: false,
      reuseLettersPool: [],

      confuseColorsUsed: false,
      confuseColorsActive: false,

      countOnlyUsed: false,
      countOnlyActive: false
    }
  };
}

/**
 * Applies the scoring pipeline:
 *   1. preScore power hooks
 *   2. base scoring
 *   3. postScore power hooks
 *   4. create history entry
 */
function finalizeFeedback(state, powerEngine) {
  const guess = state.pendingGuess;

  // Step 1: allow powers to hook BEFORE scoring
  powerEngine.preScore(state, guess);

  // Step 2: base scoring
  const fb = scoreGuess(state.secret, guess);

  // Build history entry
  const entry = {
    guess,
    fb,
    fbGuesser: [...fb], // will be modified by powers later if needed
    extraInfo: null,
    finalSecret: state.secret
  };

  // Step 3: allow powers to modify feedback entry
  powerEngine.postScore(state, entry);

  // Step 4: commit entry to history
  state.history.push(entry);

  state.pendingGuess = "";
  state.guessCount++;
}

module.exports = {
  createInitialState,
  finalizeFeedback
};
