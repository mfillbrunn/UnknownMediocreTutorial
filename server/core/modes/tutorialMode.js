class TutorialMode {
  constructor() {
    this.type = "tutorial";
  }

  initMatch(state) {
    // Tutorial metadata
    state.tutorial = {
      step: 0,
      scriptedTurns: 3
    };

    // Fixed secret & guesses
    state.tutorialSecret = ["BLIMP", "BLIMP", "LEMUR"]
    state.tutorialGuesses = ["CRAVE", "BUSTY", "RODNY"];
    state.tutorialSecretsAI = "DORKY";
    state.tutorialGuessesAI = ["SMALL", "GOQKY", "BLIND"];

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
