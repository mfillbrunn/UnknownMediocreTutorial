const { createInitialPowers } = require("../core/stateFactory");
const { resetRoundTimer } = require("./Timer");

function resetRoundState(room, state, roomId, context) {
  state.secret = "";
  state.pendingGuess = "";
  // A leftover draft (typed, or filled by Secret Word Helper) from the
  // round that just ended must not survive into the next one -- without
  // this it's still sitting on `state` when the next round's setter role
  // gets assigned, e.g. via a role swap, and safeState.js doesn't redact
  // setterDraft, so the new setter (last round's guesser) would see the
  // previous setter's leftover word pre-filled as their own.
  state.setterDraft = "";
  state.gameOver = false;
  state.guessCount = 0;
  state.history = [];
  // Stats bookkeeping for this round: the very first secret the setter
  // commits to (before any later SET_SECRET_NEW changes it) and how many
  // times they change it -- both read out in gameOver.js when the round
  // gets archived into state.matchRounds for the My Games stats screen.
  state.initialSecretThisRound = null;
  state.secretChangeCount = 0;
  state.extraConstraints = [];
  state.turn = null;
  state.simultaneousGuessSubmitted = false;
  state.simultaneousSecretSubmitted = false;
  state.powerUsedThisTurn = false;
  state.roundStartTime = null;
  state.timeoutLoser = null;
  // Round-scoped: an all-black opening guess locks the setter into keeping
  // that secret for the rest of THAT round. Left unset here, it survived
  // into the next round (and any role swap with it), incorrectly locking
  // the new setter's secret entry before they'd even had a guess to react to.
  state.simultaneousAllWrong = false;

  state._pendingPowerEvents = [];

  state.timeUsed ||= {};
  state.roundTimeouts ||= {};
  state.timeRemaining ||= {};

  for (const userId of Object.keys(state.players || {})) {
    state.timeUsed[userId] = 0;
    state.roundTimeouts[userId] = 0;
  }

  // clear transient power effects
  state.powers = createInitialPowers();

  if (state.timeControl?.enabled) {
    resetRoundTimer(state);
    state.activeTimer = "both";
  } else {
    state.activeTimer = null;
  }
}

module.exports = resetRoundState;
