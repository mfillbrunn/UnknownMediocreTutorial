// server/single-player/campaignMode.js
//
// SinglePlayerMode implements the exact same mode contract as
// CompetitiveMode/TutorialMode (server/core/modes/baseMode.js), so the
// existing engine (gameOver.js, nextRoundTransition.js, ...) drives a
// campaign match through state.mode exactly like any other match. It is
// deliberately pure: every power/quest/role decision it makes reads from
// a plan precomputed once at session start (sessionService.js, the only
// place that touches the database or stage config directly) and stashed
// at state.singlePlayer._plan -- never fetched here.

"use strict";

const BaseMode = require("../core/modes/baseMode");
const { pickRandomQuestType, ensureQuestConditions } = require("../powers/powers/questServer");


function clearRoundQuest(state) {
  const quest = state.powers?.quest;
  if (!quest) return;
  quest.type = null;
  quest.pendingChoice = null;
  quest.ready = false;
  quest.used = true;
  quest.oneAway = false;
  quest.claimedEarly = false;
  quest.conditions = null;
  quest.rareLetters = null;
  quest.vowelTarget = null;
  state.powers.questActive = false;
}

function configureRoundQuest(state, round) {
  const questConfig = state.singlePlayer.stage.game.quests || {};
  if (questConfig.disabled === true) {
    clearRoundQuest(state);
    return;
  }

  state.powers.quest.type = round.questType || pickRandomQuestType();
  ensureQuestConditions(state);
}

class SinglePlayerMode extends BaseMode {
  initMatch(state) {
    const plan = state.singlePlayer._plan;
    state.roundIndex = 0;
    state.roundsTotal = plan.rounds.length;
    state.matchOver = false;
  }

  onLobbyReady(state) {
    const plan = state.singlePlayer._plan;
    const round = plan.rounds[state.roundIndex];

    state.initialPowers = { setter: round.setterPowers, guesser: round.guesserPowers };
    state.activePowers = [...round.setterPowers, ...round.guesserPowers];

    configureRoundQuest(state, round);
  }

  onRoundEnd(state) {
    if (state.roundIndex < state.roundsTotal - 1) {
      return { view: "round", canNextRound: true };
    }
    state.matchOver = true;
    return { view: "match", canNextRound: false };
  }

  onNextRound(state) {
    state.roundIndex += 1;
    const plan = state.singlePlayer._plan;
    const round = plan.rounds[state.roundIndex];

    // Explicit assignment from the precomputed plan, not a blind swap --
    // a "both" stage's round 2 role assignment is authored (via
    // game.firstRole), not inferred.
    state.setter = round.setterUserId;
    state.guesser = round.guesserUserId;
    if (state.players?.[state.setter]) state.players[state.setter].role = "setter";
    if (state.players?.[state.guesser]) state.players[state.guesser].role = "guesser";

    this.onLobbyReady(state);

    return { phase: "simultaneous", resetRound: true };
  }

  isMatchOver(state) {
    return state.matchOver;
  }
}

module.exports = SinglePlayerMode;
