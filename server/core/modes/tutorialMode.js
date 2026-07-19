class TutorialMode {
  constructor() {
    this.type = "tutorial";
  }

  initMatch(state) {
    state.roundIndex = 0;
    state.roundsTotal = 2;
    state.matchOver = false;

    // Tutorial metadata — two forced turns per round, then the AI falls
    // back to normal beginner-difficulty play (runAI.js gates its scripted
    // branch on history.length < scriptedTurns).
    state.scriptedTurns = 2;

    // Round 1: human is guesser, tutorial AI is setter and keeps the
    // secret "CUMIN" across both scripted turns. Round 2: human is setter
    // — reuses the pre-existing secret pair (BLIMP, then switching to
    // LEMUR) and the AI's pre-existing guesses as the guesser.
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
    state.timeControl.enabled = false;
    // No randomness
    state.shuffle = false;
    state.ranked = false;
  }
  onLobbyReady(state, setterPowers, guesserPowers) {
    // No powers in the tutorial — the first game teaches the base rules only.
    state.initialPowers = {
      setter: [],
      guesser: []
    };
    state.activePowers = [];
  }
    onRoundEnd(state) {
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
