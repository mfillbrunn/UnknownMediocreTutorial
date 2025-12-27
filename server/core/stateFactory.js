// core/stateFactory.js

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
    powerCount: 10,       // NEW: number chosen in lobby
    activePowers: [],  // NEW: each player’s random secrets
    secret: "",
    currentSecret: "",
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

      // MAGIC MODE
      magicModeUsed: false,
      magicModeActive: false,
      magicModeJustUsed: false,
      
      // VOWEL REFRESH
      vowelRefreshUsed: false,
      vowelRefreshLetters: null,
      vowelRefreshPending: false,


      
      // ASSASSIN WORD
      assassinWordUsed: false,
      assassinWord: null,
      // UNIFIED REVEAL LETTER POWER (combines Row Master + Rare Bonus)
      revealLetter: {
        mode: null,            // "RARE" or "ROW" — set at match start
        ready: false,          // power is unlocked
        used: false,           // power has been consumed
        pendingReveal: null    // { index, letter, mode }
      },
    }
  };
}
module.exports = {  createInitialState};
