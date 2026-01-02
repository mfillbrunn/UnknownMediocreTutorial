// core/stateFactory.js

/**
 * Creates the initial game state for a room.
 */
function createInitialState() {
  return {
    phase: "lobby",

  // --- MODE / MATCH CONTROL (NEW, GENERIC) ---
    mode: null,          // instance of mode controller
    matchMeta: {},       // owned entirely by the mode
    gameOverView: "match",
    canNextRound: false,
    matchRounds: [],
    timeUsed: {
    A: 0,
    B: 0
    },
    roundTimeouts: {
    A: 0,
    B: 0
    },
    ///TIMER
    timeControl: {
    initialSeconds: 300,  // default 5 min
    incrementSeconds: 10,
      enabled: true,
      roundSeconds: 60,
      mode: "round",
      },
      
      timeRemaining: {
        A: 0,
        B: 0
      },
    roundstarttime:null,
  timeExpired: null, // "A" | "B" | null
  activeTimer: null, // "A" | "B" | "both" | null
  timeoutLoser: null,
    isTimerRunning: false,
    
    turn: null,
    setter: "A",
    guesser: "B",
    ready: { A: false, B: false },
    powerCount: 2,       // NEW: number chosen in lobby
    activePowers: [],  // NEW: each player’s random secrets
    secret: "",
    currentSecret: "",
    pendingGuess: "",
    guessCount: 0,
    gameOver: false,
    extraConstraints: [],
    playerNames: {
      A: "",
      B: ""
    },

    history: [],
    powersUsedThisRoundGuesser: [],
    powersUsedThisRoundSetter: [],
    simultaneousGuessSubmitted: false,
    simultaneousSecretSubmitted: false,

    powerUsedThisTurn: false,

    powers: {
      // HIDE TILE
      hideTileUsed: false,
      hideTilePendingCount: 0,
      hideTileActive: 0,
      // BLIND GUESS
      blindGuessUsed: false,
      blindGuessArmed: false,
      blindGuessActive: false,
      // FORCE GUESS
      forceGuessUsed: false,
      forcedGuess: null,          // active constraint
      forcedGuessOptions: null,    // temporary options shown in setter modal
      forcedGuessActive: false,    
      // REVEAL GREEN
      revealGreenUsed: false,
      revealGreenPos: null,
      revealGreenLetter: null,
      revealGreenActive: false,
      // FREEZE SECRET
      freezeSecretUsed: false,
      freezeActive: false,
      // CONFUSE COLORS
      confuseColorsUsed: false,
      confuseColorsActive: false,
      // COUNT ONLY
      countOnlyUsed: false,
      countOnlyWord: "",
      countOnlyActive: false,
      // SUGGEST POWERS
      suggestGuessUsed: false,
      suggestGuessActive: false,
      suggestSecretUsed: false,
      suggestSecretActive: false,
      // REVEAL HISTORY
      revealHistoryUsed: false,
      revealHistoryActive: false,
      // BLIND SPOT
      blindSpotUsed: false,
      blindSpotActive: false,
      blindSpotIndex: null,
      // STEALTH GUESS
      stealthGuessUsed: false,
      stealthGuessActive: false,
      // FORCE TIMER
      forceTimerUsed: false,
      forceTimerActive: false,
      forceTimerSetterPhase: false,
      forceTimerDeadline: null,
      // MAGIC MODE
      magicModeUsed: false,
      magicModeActive: false,
      magicModeJustUsed: false,
      // VOWEL REFRESH
      vowelRefreshUsed: false,
      vowelRefreshLetters: null,
      vowelRefreshPending: false,
      vowelRefreshActive: false,
      // ASSASSIN WORD
      assassinWordUsed: false,
      assassinWord: null,
      assassinWordActive: false,
      // UNIFIED REVEAL LETTER POWER (combines Row Master + Rare Bonus)
      revealLetter: {
        mode: null,            // "RARE" or "ROW" — set at match start
        ready: false,          // power is unlocked
        used: false,           // power has been consumed
        pendingReveal: null    // { index, letter, mode }
      },
      revealLetterActive: false,
    }
  };
}
module.exports = {  createInitialState};
