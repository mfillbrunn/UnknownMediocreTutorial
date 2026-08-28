// server/core/modes/dailyMode.js
//
// Daily Challenge's round-count/role-order behavior, layered on top of
// CompetitiveMode rather than filling CompetitiveMode itself with
// daily-specific branches (see REFINEMENT_SPEC section 1). Every other
// mechanic -- reward-choice, quests, powers -- is CompetitiveMode's own
// Power Choice integration (see power-choice/powerChoiceServer.js, which
// patches CompetitiveMode.prototype directly and applies equally to
// DailyMode since it's a subclass); DailyMode only needs to know how many
// rounds a given day's playMode plays.
//
// playMode "both": exactly 2 rounds, human plays each role once. Uses
// CompetitiveMode's stock onRoundEnd/onNextRound completely unmodified --
// roundsTotal=2 already makes onRoundEnd offer "Next Round" after round 1
// and end the match after round 2, and onNextRound already swaps setter/
// guesser. Which role the human starts as (firstRole) is decided BEFORE
// mode.initMatch runs, by lobby.js's ADD_AI handler setting player roles
// directly from the day's config -- nothing for this class to do about it.
//
// playMode "setter"/"guesser": exactly 1 round, no Next Round button. Just
// setting roundsTotal=1 already produces this for free: onRoundEnd's own
// `roundIndex < roundsTotal - 1` check (0 < 0) is false immediately after
// round 1, so it returns matchOver=true / canNextRound=false without this
// class needing to override onRoundEnd or onNextRound at all.
const CompetitiveMode = require("./competitiveMode");

const ROUNDS_BY_PLAY_MODE = { both: 2, setter: 1, guesser: 1 };

class DailyMode extends CompetitiveMode {
  initMatch(state) {
    super.initMatch(state);
    const playMode = state._dailyConfig?.playMode || "both";
    state.roundsTotal = ROUNDS_BY_PLAY_MODE[playMode] || 2;
  }
}

module.exports = DailyMode;
