// core/transitions/nextRoundTransition.js
//
// Split out of postGame.js so both postGame.js (the player-clicked
// NEXT_ROUND path) and gameOver.js (the tutorial-only "skip the round
// summary screen" path, see tutorialMode.js's onRoundEnd res.skipSummary)
// can call the same round-transition logic. gameOver.js requires this
// file, and this file needs timeoutController.js's startGameTimer --  but
// timeoutController.js itself requires gameOver.js (for endGame), so a
// top-level require here would form a require cycle and risk getting an
// incomplete timeoutController export depending on load order. Requiring
// it lazily inside the function instead defers that require until the
// function actually runs (well after every module has finished loading),
// which sidesteps the cycle entirely.

const { emitLobbyEvent } = require("../../utils/emitLobby");
const resetRoundState = require("../../utils/resetRoundState");
const { emitRoomState } = require("../rooms");
const { ensureQuestConditions } = require("../../powers/powers/questServer");

// Performs the round-to-round transition (role swap via mode.onNextRound,
// round-scoped state reset, timer restart).
function advanceToNextRound(room, state, roomId, context) {
  const { startGameTimer } = require("../timeouts/timeoutController");
  const io = context.io;

  const res = state.mode?.onNextRound?.(state) || {
    phase: "simultaneous",
    resetRound: true
  };

  let savedRevealLetterMode;
  if (state.activePowers.includes("revealLetter")) {
    savedRevealLetterMode = state.powers.revealLetter.mode;
  }

  let savedLetterProfileMode;
  if (state.activePowers.includes("letterProfile")) {
    savedLetterProfileMode = state.powers.letterProfileMode;
  }

  // Letter Lockout: the "not yet picked by him" pool belongs to the
  // setter POSITION across the whole match, not to whichever specific
  // player happens to hold it in a given round — round 2's setter (the
  // round-1 guesser, post role-swap) must not be able to re-ban a
  // letter round 1's setter already spent.
  let savedLetterLockoutUsedLetters;
  if (state.activePowers.includes("letterLockout")) {
    savedLetterLockoutUsedLetters = state.powers.letterLockoutUsedLetters;
  }

  // Quest type is match-scoped like revealLetter.mode used to be --
  // always present now (every guesser has one), not gated on
  // activePowers. Conditions (FIELDREPORT quest only) are NOT saved
  // here on purpose: they're regenerated fresh each round below.
  const savedQuestType = state.powers.quest?.type;

  resetRoundState(room, state, roomId, context);

  if (state.activePowers.includes("revealLetter")) {
    state.powers.revealLetter.mode = savedRevealLetterMode;
  }

  if (state.activePowers.includes("letterProfile")) {
    state.powers.letterProfileMode = savedLetterProfileMode;
  }

  if (state.activePowers.includes("letterLockout")) {
    state.powers.letterLockoutUsedLetters = savedLetterLockoutUsedLetters;
  }

  state.powers.quest.type = savedQuestType || null;
  ensureQuestConditions(state);

  state.phase = res.phase || "simultaneous";
  state.gameOver = false;
  state.gameOverView = "match";
  state.canNextRound = false;

  if (state.timeControl?.enabled) {
    state.paused = false;
    state.isTimerRunning = false;
    state.roundStartTime = Date.now();
    startGameTimer(room, state, roomId, context);
  }

  emitLobbyEvent(io, roomId, { type: "hideLobby" });
  emitRoomState(roomId, room, io);
}

module.exports = { advanceToNextRound };
