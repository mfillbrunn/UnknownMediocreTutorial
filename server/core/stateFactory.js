// core/stateFactory.js

/**
 * Creates the initial game state for a room.
 */


function createInitialPowers(){
const powers = {
// HIDE TILE
      hideTileUsed: false, // one-time use per match, see POWER_RULES.js
      hideTilePendingIndex: null, // tile index the setter picked, applied to the next-scored entry
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
      fakeFeedbackScramble : false,
      // Bet Miss
      betMissActive : false,
      betMissUsed : false,
      betMissNumber : null,
      // REVEAL GREEN
      revealGreenUsed: false,
      revealGreenUses: 0, // charges spent — 2 charges total, see POWER_RULES.js
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
      suggestGuessUses: 0, // charges spent — 2 charges total, see POWER_RULES.js
      suggestGuessActive: false,
      suggestSecretUsed: false,
      suggestSecretUses: 0, // charges spent — 2 charges total, see POWER_RULES.js
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
      //reveal Penalty (Marked Weakness) -- the setter claims a letter is
      // (or isn't) in the secret; the guesser accepts or calls the claim a
      // bluff. Always resolved immediately, never at game end.
      revealPenaltyUsed: false,      // boolean (once per round) -- claim made
      revealPenaltyLetter: null,     // string (e.g. "A") -- claimed to be IN the secret
      revealPenaltyResolved: false,  // true once the guesser has responded
      revealPenaltyResult: null,     // "accepted" | "wrongCall" | "bluffCaught"
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
      // LETTER PROBE (test 5 letters -> count present in secret)
      letterProbeUsed: false,
      letterProbeResult: null,
      // WIRETAP (passive remaining-count always on; once-per-round active
      // ability, bullet/blitz only, makes the count update live as the
      // guesser drafts a guess). wiretapUsed is per-round (reset each round
      // via createInitialPowers). wiretapActive lasts only the activated
      // turn (cleared by clearActivePowers on the guesser's next submit).
      wiretapUsed: false,
      wiretapActive: false,
      // INFORMANT (fixed-position peek). revealLocationPeekIndex is the
      // position currently being peeked (stays fixed until it becomes a
      // real green, then moves). revealLocationPeek = {index, letter} is
      // the live reveal shown to the guesser (redacted from the setter).
      revealLocationPeekIndex: null,
      revealLocationPeek: null,
      // DOUBLE GUESS (Double Tap): two guesses submitted at once. The setter
      // sees only one (doubleGuessShownFirst says whether that shown word is
      // g1), reacts with a normal Keep/New decision, and BOTH are then scored
      // against the setter's final secret. doubleGuessPending marks that a
      // resolution is owed on the next SET_SECRET; doubleGuessHidden holds the
      // word the setter never sees (redacted from them in safeState).
      doubleGuessUsed: false,
      doubleGuessPending: false,
      doubleGuessHidden: null,
      doubleGuessShownFirst: null,
      // LETTER PROFILE (always-on guesser power). Mode is chosen ONCE for
      // the whole match (competitiveMode.js's onLobbyReady), preserved
      // across the round-2 role swap by postGame.js exactly like
      // revealLetter.mode below. letterProfileGuesserStat is the guesser's
      // per-turn reveal (computed in letterProfileServer.js's turnStart
      // hook from the real secret, redacted from the setter in safeState —
      // the setter has their own live equivalent computed from their own
      // draft/secret instead).
      letterProfileMode: null,
      letterProfileGuesserStat: null,
      // LETTER LOCKOUT (setter power). letterLockoutUsedLetters is the
      // match-scoped pool of letters the setter has already banned
      // (persisted across the round-2 role swap by postGame.js, same
      // pattern as revealLetter.mode — a repeat pick isn't allowed).
      // letterLockoutBanned is the single letter currently in effect for
      // the guesser's upcoming guess; cleared the instant that guess is
      // validated and submitted (normalTransitions.js's clearRoundState).
      letterLockoutUsedLetters: [],
      letterLockoutBanned: null,
      // DELAYED INTEL (setter power). One-time use per round: activated
      // during the setter's own turn, it delays only the round about to be
      // decided (the guesser won't see its feedback until they've
      // submitted their NEXT guess) -- not every round for the rest of the
      // match. delayedIntelRoundIndex is the state.history index of that
      // one delayed round (see utils/delayedFeedback.js).
      delayedIntelUsed: false,
      delayedIntelRoundIndex: null,
      // UNIFIED REVEAL LETTER POWER (combines Row Master + Rare Bonus)
      revealLetter: {
        ready: false,          // power is unlocked
        used: false,           // power has been consumed
        pendingReveal: null,    // { index, letter, mode }
      mode : null
      },
      revealLetterActive: false,
      // QUEST (always-on guesser mechanic, see questServer.js). type is
      // chosen once per match by CompetitiveMode and preserved across the
      // round-2 role swap by postGame.js -- ready/used/conditions reset
      // every round like the rest of state.powers. conditions is only
      // used by the FIELDREPORT quest type, regenerated fresh each round.
      quest: {
        type: null,
        ready: false,
        used: false,
        oneAway: false,
        claimedEarly: false,
        conditions: null
      },
      questActive: false
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
    customPowersMode: false, // NEW: "custom" power-selection mode (per-player loadouts)
    customPlayerPowers: null, // NEW: { [userId]: { setterPowers, guesserPowers } }, durable for the match
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
