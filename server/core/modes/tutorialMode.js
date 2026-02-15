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
    const sP =  ["hideTile",  "confuseColors"];
    const gP = ["revealGreen",  "nonsense"];
    state.initialPowers = {
      setter: sP,
      guesser: gP
    };
    // Round 1 powers
    state.activePowers = [...sP, ...gP];
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
}

module.exports = TutorialMode;
