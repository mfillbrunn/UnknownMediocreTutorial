const BaseMode = require("./baseMode");

class CompetitiveMode extends BaseMode {
  initMatch(state) {
    state.roundIndex = 0;
    state.roundsTotal = 2;
    state.matchOver = false;

    state.initialSetter = state.setter;
    state.initialGuesser = state.guesser;
  }

  onLobbyReady(state, setterPowers, guesserPowers) {
    state.initialPowers = {
      setter: setterPowers,
      guesser: guesserPowers
    };

    state.activePowers = [...setterPowers, ...guesserPowers];
  }

  onRoundEnd(state) {
    if (state.roundIndex < state.roundsTotal - 1) {
      return { nextPhase: "roundSummary" };
    }

    state.matchOver = true;
    return { nextPhase: "gameOver" };
  }

  onNextRound(state) {
    state.roundIndex += 1;

    // swap roles
    [state.setter, state.guesser] = [state.guesser, state.setter];

    // swap powers
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

module.exports = CompetitiveMode;
