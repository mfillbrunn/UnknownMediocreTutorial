// core/stateFactory.js

/**
 * Creates the initial game state for a room.
 */


function createInitialPowers(){
const powers = {
// HIDE TILE
      hideTileUsed: false,
      hideTilePendingCount: 0,
      hideTileActive: 0,
      // BLIND GUESS
      blindGuessUsed: false,
      blindGuessArmed: false,
      blindGuessActive: false,
      //Roulette
      rouletteSecretUsed: false,
      rouletteSecretActive: false,
      rouletteSecretFeasible : null,
      // FORCE GUESS
      forceGuessUsed: false,
      forceGuess: null,          // active constraint
      forceGuessOptions: null,    // temporary options shown in setter modal
      forceGuessActive: false,
      // REVEAL GREEN
      fakeFeedbackActive : false,
      fakeFeedbackUsed : false,
      fakeFeedbackSecret : false,
      // Bet Miss
      betMissActive : false,
      betMissUsed : false,
      betMissNumber : null,
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
      countOnlyRound: -1,
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
      //Nonsense 
      nonsenseActive: false,
      nonsenseLastTurn: false,
      nonsenseUsed: false,
      //reveal Penalty
      revealPenaltyUsed: false,      // boolean (once per match)
      revealPenaltyActive: false,    // boolean (this round)
      revealPenaltyLetter: null,    // string (e.g. "A")
      // ASSASSIN WORD
      assassinWordUsed: false,
      assassinWord: null,
      assassinWordActive: false,
      assassinWordassassinated : false,
      assassinPoints: false,
      // FIELD REPORT (3-condition partial/full reveal)
      fieldReportUsed: false,
      fieldReportActive: false,
      fieldReportConditions: null,
      // UNIFIED REVEAL LETTER POWER (combines Row Master + Rare Bonus)
      revealLetter: {
        ready: false,          // power is unlocked
        used: false,           // power has been consumed
        pendingReveal: null,    // { index, letter, mode }
      mode : null
      },
      revealLetterActive: false
};
      return powers;
}
function createInitialState() {
   const state = {
    phase: "lobby",
    players: {},
    hostUserId: null,
         setter: null,
         guesser: null,
    turn: null,
    powerCount: 2,       // NEW: number chosen in lobby
    activePowers: [],  // NEW: each player’s random secrets
   timeUsed: {},
      roundTimeouts: {},
      timeRemaining: {},
         timeExpired: null, // userId | null
      timeoutLoser: null, // userId | null
      activeTimer: null, // userId | "both" | null
  // --- MODE / MATCH CONTROL (NEW, GENERIC) ---
    mode: null,          // instance of mode controller
    rankMode: "bullet",
    matchMeta: {},       // owned entirely by the mode
    ranked : false,
    shuffle: false,
    draftMode: true,
         isTutorial: false,
         devMode: false,
    gameOverView: "match",
    canNextRound: false,
    conceded: false,
    matchRounds: [],
    ///TIMER
    timeControl: {
    initialSeconds: 300,  // default 5 min
    incrementSeconds: 2,
      enabled: true,
      roundSeconds: 90,
      mode: "round",
      preset: "bullet"
      },      
    roundStartTime:null,
    isTimerRunning: false,
    //AI
    aiSecretChanged: false,
         aiDifficulty: 1,
         aiSecretChangeCount: 0,
    secret: "",
    pendingGuess: "",
    guessCount: 0,
    gameOver: false,
    extraConstraints: [],    
    history: [],
    simultaneousGuessSubmitted: false,
    simultaneousSecretSubmitted: false,
    powerUsedThisTurn: false,   
         simultaneousAllWrong: false,
    _pendingPowerEvents: [],
    powers: createInitialPowers()
  };
  return state;
}


module.exports = {  createInitialState, createInitialPowers};
