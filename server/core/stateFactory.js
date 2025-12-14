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
    secretPoolSize: 2,       // NEW: number chosen in lobby
    secretPools: { A: [], B: [] },  // NEW: each player’s random secrets
    secret: "",
    currentSecret: null,
    pendingGuess: "",
    guessCount: 0,
    gameOver: false,

    history: [],

    simultaneousGuessSubmitted: false,
    simultaneousSecretSubmitted: false,

    powerUsedThisTurn: false,

    powers: {
      // HIDE TILE
      hideTileUsed: false,
      hideTilePendingCount: 0,

      // REVEAL GREEN
      revealGreenUsed: false,
      revealGreenPos: null,
      revealGreenLetter: null,

      // FREEZE SECRET
      freezeSecretUsed: false,
      freezeActive: false,

      // REUSE LETTERS
      reuseLettersUsed: false,
      reuseLettersPool: [],

      // CONFUSE COLORS
      confuseColorsUsed: false,
      confuseColorsActive: false,

      // COUNT ONLY
      countOnlyUsed: false,
      countOnlyActive: false,

      suggestGuessUsed: false,
      suggestSecretUsed: false,
      forceTimerUsed: false,
      revealHistoryUsed: false,
      blindSpotUsed: false,
      stealthGuessUsed: false,
      
      forceTimerActive: false,
      forceTimerSetterPhase: false,
      forceTimerDeadline: null,
      
      blindSpotIndex: null,
      stealthGuessActive: false,

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
    finalSecret: state.currentSecret,
    roundIndex: state.history.length
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
