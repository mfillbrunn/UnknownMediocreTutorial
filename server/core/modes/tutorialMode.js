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
    state.tutorialGuesses = ["CRANE", "BUSTY", "ALERT"];
    state.tutorialSecretsAI = "DORKY";
    state.tutorialGuessesAI = ["SMALL", "GASSY", "BLINK"];

    // No randomness
    state.shuffle = false;
    state.ranked = false;
  }

  onLobbyReady(state, setterPowers, guesserPowers) {
    // Force fixed tutorial powers
    state.activePowers = [
      "revealGreen",
      "nonsense"
    ];

    state.powerCount = state.activePowers.length;
  }

  beforeGuess(state, guess) {
    if (state.tutorial.step < state.tutorial.scriptedTurns) {
      const expected = state.tutorialGuesses[state.tutorial.step];
      if (guess !== expected) {
        return {
          ok: false,
          error: "Follow the tutorial hint"
        };
      }
    }
    return { ok: true };
  }

  afterGuess(state) {
    if (state.tutorial.step < state.tutorial.scriptedTurns) {
      state.tutorial.step++;
    }
  }

  isScripted(state) {
    return state.tutorial.step < state.tutorial.scriptedTurns;
  }
}

module.exports = TutorialMode;
