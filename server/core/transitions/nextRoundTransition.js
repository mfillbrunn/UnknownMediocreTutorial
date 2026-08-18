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
const { ensureQuestConditions, pickTwoRandomQuestTypes } = require("../../powers/powers/questServer");
const spyChargeServer = require(  "../../powers/powers/spyChargeServer");
// Performs the round-to-round transition (role swap via mode.onNextRound,
// round-scoped state reset, timer restart).
function advanceToNextRound(room, state, roomId, context) {
  const { startGameTimer } = require("../timeouts/timeoutController");
  const io = context.io;

  // Captured BEFORE mode.onNextRound (below) performs the actual role
  // swap, so it still reads as the OLD guesser -- compared against
  // state.guesser afterward to tell whether this round's guesser is
  // actually a different player (see the quest-choice block below).
  const prevGuesser = state.guesser;

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

  // Power Choice: which "always-on" powers (Informant, Letter Profile,
  // Letter Lockout) either role has permanently unlocked via a reward
  // card. This is the actual source of truth Power Choice's own
  // initializeRound rebuilds state.activePowers from every action, so
  // unlike the three saves above (each gated on the power already being
  // in this round's activePowers) this one is unconditional -- resetting
  // it to empty here would silently take the reward away the moment the
  // next round started.
  const savedPowerChoicePersistentGrants = state.powers.powerChoicePersistentGrants;

  // Quest type used to just carry straight over like revealLetter.mode
  // still does (see below) -- but round 2's guesser is a DIFFERENT player
  // (the standard 2-round match always swaps setter/guesser), so simply
  // restoring round 1's quest meant both guessers played the exact same
  // one all match. Saved here anyway for the tutorial/no-swap fallback
  // below. Conditions (FIELDREPORT quest only) are NOT saved here on
  // purpose: they're regenerated fresh each round below.
  const savedQuestType = state.powers.quest?.type;
  const guesserChanged = state.guesser !== prevGuesser;

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

  if (savedPowerChoicePersistentGrants) {
    state.powers.powerChoicePersistentGrants = savedPowerChoicePersistentGrants;
  }

  // Tutorial rounds are scripted (e.g. the Quest tutorial hard-codes RARE
  // via TutorialMode.seedQuestTutorialRound) -- a random pick-between-two
  // would just clobber the lesson, so tutorials (and the theoretical case
  // of a mode whose guesser DOESN'T change round to round) keep the old
  // straight carry-over. Every other match offers the new guesser an
  // actual choice instead of inheriting round 1's quest.
  if (state.isTutorial || !guesserChanged) {
    state.powers.quest.type = savedQuestType || null;
  ensureQuestConditions(state);
    state.powers.quest.pendingChoice = null;
  } else {
    // Daily Challenge: same two options for every player attempting
    // today's puzzle (deterministically seeded, see dailyConfig.js) --
    // everyone else gets a fresh random pair.
    const choices = Array.isArray(state._dailyQuestRound2Choices) && state._dailyQuestRound2Choices.length === 2
      ? state._dailyQuestRound2Choices
      : pickTwoRandomQuestTypes();

    if (state.players?.[state.guesser]?.isAI) {
      // No real decision to model for the AI -- just take one at random,
      // same "nothing to deliberate" reasoning as every other AI pick in
      // this codebase (draft.js's AI auto-pick, runAI.js's
      // maybeClaimQuest) -- resolved immediately rather than waiting on
      // an action the AI would never send.
      state.powers.quest.type = choices[Math.floor(Math.random() * choices.length)];
      state.powers.quest.pendingChoice = null;
      ensureQuestConditions(state);
    } else {
      state.powers.quest.type = null;
      state.powers.quest.pendingChoice = choices;
    }
  }

  // Unconditional (moved out of the quest-type branching above) -- this
  // has to (re)run for every round transition, not just the
  // tutorial/no-swap case, since it's keyed off state.setter, which
  // mode.onNextRound already swapped by this point. Round 2's setter is
  // normally a DIFFERENT player than round 1's (the standard 2-round
  // match always swaps), and this was previously only reached on the
  // no-swap branch -- leaving the new setter's spyCharge state stuck at
  // resetRoundState's default { enabled: false, ... } for the entire
  // round, so the charge meter and hint letter never showed up for
  // whichever player started the match as the guesser.
  spyChargeServer.initializeForRound(state);

  state.phase = res.phase || "simultaneous";
  state.gameOver = false;
  state.gameOverView = "match";
  state.canNextRound = false;

  // The per-power "Try it" tutorial seeds round 2 with a mid-match
  // scenario (see TutorialMode.seedPowerTutorialRound) instead of
  // starting fresh -- has to run after resetRoundState above, which would
  // otherwise wipe out anything seeded any earlier (e.g. from onNextRound
  // itself). Overrides state.phase (to "normal") and possibly state.turn
  // on top of the defaults just set above; a no-op for every other mode/
  // stage.
  state.mode?.afterRoundReset?.(state);

  if (state.timeControl?.enabled) {
    state.paused = false;
    state.isTimerRunning = false;
    state.roundStartTime = Date.now();
    startGameTimer(room, state, roomId, context);
  }

  emitLobbyEvent(io, roomId, { type: "hideLobby" });
  emitRoomState(roomId, room, io);

  // Some seeded scenarios (a guesser-power tutorial's receiving side) put
  // the AI on the move the instant this round starts, before any human
  // action exists to trigger the usual "run the AI ~1s after a player
  // acts" path (see socketHandlers.js's gameAction handler) -- without an
  // explicit kick here, the AI watchdog interval would still catch it, but
  // only after up to several seconds of the screen looking frozen.
  if (state.turn && state.players?.[state.turn]?.isAI) {
    setTimeout(() => {
      try {
        context.maybeRunAI?.(room, roomId, context);
      } catch (err) {
        console.error("maybeRunAI crashed after round transition:", err);
      }
    }, 800);
  }
}

module.exports = { advanceToNextRound };
