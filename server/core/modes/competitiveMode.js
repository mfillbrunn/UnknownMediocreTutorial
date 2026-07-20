const BaseMode = require("./baseMode");
const { pickLetterProfileMode } = require("../../utils/letterProfile");
const { pickRandomQuestType, ensureQuestConditions } = require("../../powers/powers/questServer");

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

  // guesserQuest: optional forced quest type (Draft mode's pick). Falls
  // back to a random pick (Random mode, or anything else that doesn't go
  // through the draft).
  onLobbyReady(state, setterPowers, guesserPowers, guesserQuest) {
    state.initialPowers = {
      setter: setterPowers,
      guesser: guesserPowers
    };

    // Round 1 powers
    state.activePowers = [...setterPowers, ...guesserPowers];

    // Letter Profile's category (alphabet half / keyboard row / vowel-
    // consonant) is likewise picked once for the whole match — see
    // stateFactory.js's comment on letterProfileMode. postGame.js
    // save/restores it across the round-2 role swap the same way.
    if (guesserPowers.includes("letterProfile")) {
      state.powers.letterProfileMode = pickLetterProfileMode();
    }

    // Every guesser always has exactly one Quest for the match (see
    // questServer.js) -- chosen here the same way revealLetter.mode used
    // to be, preserved across the round-2 role swap by postGame.js.
    state.powers.quest.type = guesserQuest || pickRandomQuestType();
    ensureQuestConditions(state);
  }

  // "custom" mode: playerPowers is { [userId]: { setterPowers, guesserPowers } },
  // one entry per player, each already validated against the points budget.
  // Unlike onLobbyReady above, there's no single shared setter/guesser pool --
  // asymmetric by design, so state.initialPowers (role-keyed) doesn't apply
  // here. state.customPlayerPowers is the durable per-player record instead.
  onLobbyReadyCustom(state, playerPowers) {
    state.customPlayerPowers = playerPowers;
    state.activePowers = computeCustomActivePowers(state);

    // letterProfile needs its mode picked for the whole match. Any player
    // who included the power in their own guesserPowers might end up
    // holding the guesser seat at some point, so check across everyone's
    // loadout rather than just the current round's guesser.
    const anyGuesserPowers = Object.values(playerPowers).flatMap(
      (p) => p?.guesserPowers || []
    );

    if (anyGuesserPowers.includes("letterProfile")) {
      state.powers.letterProfileMode = pickLetterProfileMode();
    }

    // Same as onLobbyReady -- every guesser always has a Quest.
    state.powers.quest.type = pickRandomQuestType();
    ensureQuestConditions(state);
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
