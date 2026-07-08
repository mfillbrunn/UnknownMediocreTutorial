class TutorialMode {
  constructor() {
    this.type = "tutorial";
  }

  initMatch(state) {
    state.roundIndex = 0;
    state.roundsTotal = 2;
    state.matchOver = false;
    
    // Tutorial metadata
    state.scriptedTurns = 3;

    // Fixed secret & guesses
    state.tutorialSecrets = ["BLIMP", "BLIMP", "LEMUR"]
    state.tutorialGuesses = ["DRAPE", "BESTI", "RODNY"];
    state.tutorialSecretsAI = ["DORKY", "DORKY", "DORKY"];
    state.tutorialGuessesAI = ["SMALL", "GOQKY", "BLIND"];
    state.timeControl.enabled = false;
    // No randomness
    state.shuffle = false;
    state.ranked = false;
  }
  onLobbyReady(state, setterPowers, guesserPowers) {
    const sP =  ["hideTile",  "countOnly"];
    const gP = ["revealGreen",  "nonsense"];
    state.initialPowers = {
      setter: sP,
      guesser: gP
    };
    // Round 1 powers
    state.activePowers = [...sP, ...gP];
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
