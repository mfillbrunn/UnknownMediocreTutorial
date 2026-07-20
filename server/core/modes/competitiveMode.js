const BaseMode = require("./baseMode");
const { pickLetterProfileMode } = require("../../utils/letterProfile");

// "custom" mode's per-round active pool: whichever powers the CURRENT
// setter chose as their setter powers, plus whichever powers the CURRENT
// guesser chose as their guesser powers -- each player's loadout follows
// them across the round-2 role swap the same way state.initialPowers does
// for the symmetric modes, just keyed by userId instead of by role.
function computeCustomActivePowers(state) {
  const setterPool = state.customPlayerPowers?.[state.setter]?.setterPowers || [];
  const guesserPool = state.customPlayerPowers?.[state.guesser]?.guesserPowers || [];
  return [...setterPool, ...guesserPool];
}

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

    // revealLetter has several mutually-exclusive unlock conditions
    // (ROW / RARE / ALPHA / DOUBLES / CHAIN) — pick one for the whole
    // match here so it's set before the first turnStart() check ever
    // runs. postGame.js already saves/restores state.powers.revealLetter
    // .mode across the round-2 role swap, so whichever mode is picked
    // here is what both players see.
    if (guesserPowers.includes("revealLetter")) {
      const REVEAL_LETTER_MODES = ["ROW", "RARE", "ALPHA", "DOUBLES", "CHAIN"];
      state.powers.revealLetter.mode =
        REVEAL_LETTER_MODES[Math.floor(Math.random() * REVEAL_LETTER_MODES.length)];
    }

    // Letter Profile's category (alphabet half / keyboard row / vowel-
    // consonant) is likewise picked once for the whole match — see
    // stateFactory.js's comment on letterProfileMode. postGame.js
    // save/restores it across the round-2 role swap the same way.
    if (guesserPowers.includes("letterProfile")) {
      state.powers.letterProfileMode = pickLetterProfileMode();
    }
  }

  // "custom" mode: playerPowers is { [userId]: { setterPowers, guesserPowers } },
  // one entry per player, each already validated against the points budget.
  // Unlike onLobbyReady above, there's no single shared setter/guesser pool --
  // asymmetric by design, so state.initialPowers (role-keyed) doesn't apply
  // here. state.customPlayerPowers is the durable per-player record instead.
  onLobbyReadyCustom(state, playerPowers) {
    state.customPlayerPowers = playerPowers;
    state.activePowers = computeCustomActivePowers(state);

    // revealLetter/letterProfile each need one mode picked for the whole
    // match. Any player who included the power in their own guesserPowers
    // might end up holding the guesser seat at some point, so check across
    // everyone's loadout rather than just the current round's guesser.
    const anyGuesserPowers = Object.values(playerPowers).flatMap(
      (p) => p?.guesserPowers || []
    );

    if (anyGuesserPowers.includes("revealLetter")) {
      const REVEAL_LETTER_MODES = ["ROW", "RARE", "ALPHA", "DOUBLES", "CHAIN"];
      state.powers.revealLetter.mode =
        REVEAL_LETTER_MODES[Math.floor(Math.random() * REVEAL_LETTER_MODES.length)];
    }

    if (anyGuesserPowers.includes("letterProfile")) {
      state.powers.letterProfileMode = pickLetterProfileMode();
    }
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

    state.activePowers = state.customPowersMode
      ? computeCustomActivePowers(state)
      : [...state.initialPowers.guesser, ...state.initialPowers.setter];

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
