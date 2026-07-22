class TutorialMode {
  constructor() {
    this.type = "tutorial";
  }

  initMatch(state) {
    state.roundIndex = 0;
    state.roundsTotal = 2;
    state.matchOver = false;

    // Stage 1 (default): the base-rules tutorial, no powers. Stage 2: a
    // short follow-up teaching exactly one guesser power and one setter
    // power. Set by lobby.js's PLAYER_READY handler from action.mode
    // ("tutorial" vs "tutorial2") before initMatch runs.
    state.tutorialStage = state.tutorialStage || 1;

    // Tutorial metadata — two forced turns per round, then the AI falls
    // back to normal beginner-difficulty play (runAI.js gates its scripted
    // branch on history.length < scriptedTurns).
    state.scriptedTurns = 2;

    // Round 1: human is guesser, tutorial AI is setter and keeps the
    // secret "CUMIN" across both scripted turns. Round 2: human is setter
    // — reuses the pre-existing secret pair (BLIMP, then switching to
    // LEMUR) and the AI's pre-existing guesses as the guesser. Stage 2
    // reuses the exact same words — same underlying game, just with the
    // two powers now in play — so it reads as a direct continuation.
    state.tutorialSecrets = ["BLIMP", "LEMUR"];
    state.tutorialGuesses = ["CHAMP", "CAIRN"];
    state.tutorialSecretsAI = ["CUMIN", "CUMIN"];
    state.tutorialGuessesAI = ["SMALL", "BLIND"];

    // A deliberately-inconsistent secret the setter round asks the player
    // to try, indexed like the arrays above (only turn index 1 uses it) so
    // they see the real "not consistent with prior feedback" rejection
    // before entering the real LEMUR switch. Doesn't reproduce the
    // feedback SMALL already got against BLIMP, so it fails the
    // consistency check even though it's a valid dictionary word.
    state.tutorialWrongSecretExamples = [null, "MUSHY"];

    // Stage 2 only: the one power taught on each side. Round 1 (human as
    // guesser) teaches revealGreen; round 2 (human as setter, after the
    // role swap) teaches countOnly — see onLobbyReady/onNextRound below.
    if (state.tutorialStage === 2) {
      state.tutorialPowerGuesser = "revealGreen";
      state.tutorialPowerSetter = "countOnly";

      // Stage 2's second guess is the AI's actual secret (CUMIN, from
      // tutorialSecretsAI above) rather than stage 1's CAIRN, so entering
      // it right after the Leak Info reveal wins the round immediately
      // instead of trailing into unscripted free play.
      state.tutorialGuesses = ["CHAMP", "CUMIN"];
    }

    state.timeControl.enabled = false;
    // No randomness
    state.shuffle = false;
    state.ranked = false;
  }
  onLobbyReady(state, setterPowers, guesserPowers) {
    if (state.tutorialStage === 2) {
      const sP = [state.tutorialPowerSetter];
      const gP = [state.tutorialPowerGuesser];
      state.initialPowers = { setter: sP, guesser: gP };
      state.activePowers = [...sP, ...gP];
      return;
    }

    // Stage 1: no powers — the first game teaches the base rules only.
    state.initialPowers = {
      setter: [],
      guesser: []
    };
    state.activePowers = [];
  }
    onRoundEnd(state) {
    // Stage 2 (the "Tutorial: Powers" follow-up): the round-summary screen
    // was already taught in stage 1 -- showing it again between round 1
    // and round 2 here is pure duplication, so skip straight into round 2
    // instead of pausing on it. gameOver.js's endGame() checks this flag
    // and calls nextRoundTransition.js's advanceToNextRound() directly.
    if (state.tutorialStage === 2 && state.roundIndex < state.roundsTotal - 1) {
      return { skipSummary: true };
    }

    // More rounds to play → round summary
    if (state.roundIndex < state.roundsTotal - 1) {
      return {
        view: "round",
        canNextRound: true
      };
    }

    // Final round → match summary
    state.matchOver = true;
    return {
      view: "match",
      canNextRound: false
    };
  }

  /**
   * Called when NEXT_ROUND is clicked during gameOver (round view).
   * Performs role swap and prepares next round.
   */
  onNextRound(state) {
    state.roundIndex += 1;

    const oldSetter = state.setter;
    const oldGuesser = state.guesser;

    state.setter = oldGuesser;
    state.guesser = oldSetter;

    // syncTurnOwners reads player.role, so we must update it here
    if (state.players?.[state.setter]) {
      state.players[state.setter].role = "setter";
    }
    if (state.players?.[state.guesser]) {
      state.players[state.guesser].role = "guesser";
    }

    // swap powers (same powers, reversed roles)
    state.activePowers = [
      ...state.initialPowers.guesser,
      ...state.initialPowers.setter
    ];

    return {
      phase: "simultaneous",
      resetRound: true
    };
  }

  isMatchOver(state) {
    return state.matchOver;
  }
}

module.exports = TutorialMode;
