function resetRoundState(state) {
  state.secret = "";
  state.currentSecret = "";
  state.pendingGuess = "";
  state.guessCount = 0;
  state.history = [];
  state.extraConstraints= [];
  state.turn = null;
  state.simultaneousGuessSubmitted = false;
  state.simultaneousSecretSubmitted = false;
  state.powerUsedThisTurn = false;
  state.timeUsed.A = 0;
  state.timeUsed.B = 0;
  state.powersUsedThisRoundGuesser = [];
  state.powersUsedThisRoundSetter = [];
  state.powers.countOnlyRound= 0;
  state.powers.countOnlyWord = "";
    state.powers.blindSpotUsed = false;
    state.powers.blindSpotIndex = null;

  // clear transient power effects
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
      forceGuessActive: false,    
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
      countOnlyRound: 0,
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
      // ASSASSIN WORD
      assassinWordUsed: false,
      assassinWord: null,
      assassinWordActive: false,
      assassinated : false,
      assassinPoints: false,
      // UNIFIED REVEAL LETTER POWER (combines Row Master + Rare Bonus)
      revealLetter: {
        mode: null,            // "RARE" or "ROW" — set at match start
        ready: false,          // power is unlocked
        used: false,           // power has been consumed
        pendingReveal: null    // { index, letter, mode }
      },
      revealLetterActive: false,
    }

  
}

module.exports = resetRoundState;
