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
    state.tutorialSecret = ["BLIMP", "BLIMP", "LEMUR"]
    state.tutorialGuesses = ["CRAVE", "BUSTY", "RODNY"];
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
}

module.exports = TutorialMode;
