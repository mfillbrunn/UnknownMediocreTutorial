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

    // Round 1 powers
    state.activePowers = [...setterPowers, ...guesserPowers];
  }

  onRoundEnd(state) {
    if (state.roundIndex < state.roundsTotal - 1) {
      return {
        view: "round",
        canNextRound: true
      };
    }

    state.matchOver = true;
    return {
      view: "match",
      canNextRound: false
    };
  }

  onNextRound(state) {
    state.roundIndex += 1;

    const oldSetter = state.setter;
    const oldGuesser = state.guesser;

    state.setter = oldGuesser;
    state.guesser = oldSetter;

    if (state.players?.[state.setter]) {
      state.players[state.setter].role = "setter";
    }
    if (state.players?.[state.guesser]) {
      state.players[state.guesser].role = "guesser";
    }

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
