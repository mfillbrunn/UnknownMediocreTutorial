const { endGame } = require("./gameOver");
const { checkSecret, checkGuess } = require("../../game-engine/validation");
const { isPowerAllowed } = require("../../powers/POWER_RULES");
const POWER_METADATA = require("../../powers/powerMetadata");
const { transitionAfterGuess, transitionAfterSecret, clearRoundState, startForceTimer } = require("../transitions/normalTransitions");
const { advanceToNextRound } = require("../transitions/nextRoundTransition");
const { emitRoomState } = require("../rooms");
const { scoreGuess } = require("../../game-engine/scoring");
const { clearForceTimer } = require("../../utils/forceTimer");
const questServer = require("../../powers/powers/questServer");
const spyChargeServer = require(  "../../powers/powers/spyChargeServer");
const revealPenaltyServer = require("../../powers/powers/revealPenaltyServer");
const singlePlayerHooks = require("../../single-player/hooks");

function handleNormalPhase(room, state, action, roomId, context) {
  const io = context.io;
  const { powerEngine } = context;
  const userId = action.userId;

  if (!userId) return;

  // Per-power "Try it" tutorial only: the seeded round (see
  // tutorialMode.js's seedPowerTutorialRound) is deliberately left
  // unscripted after the one demonstrated exchange, so there's no
  // guaranteed win to trigger the normal role-swap-into-receiving flow on
  // its own. tutorial-ui.js sends this the moment it sees that exchange
  // finish, to move straight into round 2 instead of waiting on (or
  // scripting) a real win. Reuses the exact same role-swap + reseed path a
  // genuine round-end takes, just without endGame()'s side effects (score,
  // elo, DB writes) -- nothing was actually won here.
  if (action.type === "TUTORIAL_SKIP_TO_RECEIVING") {
    if (state.isTutorial && state.tutorialStage === "power") {
      advanceToNextRound(room, state, roomId, context);
    }
    return;
  }

  // Concede
  if (action.type === "CONCEDE") {
    if (userId === state.guesser) {
      state.guessCount += 10;
    }
    endGame(state, roomId, io, room, context);
    return;
  }

  // Quest claim: tapping the guesser's quest badge. Covers both reward
  // states -- the real green letter once the quest is ready, or (one
  // guess earlier) the early-yellow trade that forfeits it -- questServer
  // decides which applies from state.powers.quest itself. Not gated on a
  // pending guess (it's a standing option on the badge, not a normal
  // power activation), but IS gated on whose turn it is -- see
  // attemptQuestClaim's own comment.
  if (action.type === "USE_QUEST") {
    if (questServer.attemptQuestClaim(state, userId, roomId, io)) {
      emitRoomState(roomId, room, io);
    }
    return;
  }

  // Setter Quest reward: tapping the setter's quest badge once progress
  // hits 2/2 -- resets the feedback for one chosen letter across the whole
  // round, exactly like Hide Evidence, then resets progress back to 0.
  // Same standing-option shape as USE_QUEST above -- not gated by
  // state.powerUsedThisTurn, so it never competes with the setter's other,
  // separately-drafted power for the same turn's budget.
if (
    action.type ===
    "USE_SPY_CHARGE_RESET"
  ) {
    if (
      spyChargeServer.attemptReset(
        state,
        userId,
        action.letter,
        roomId,
        io,
        context.ALLOWED_SECRETS
      )
    ) {
      emitRoomState(
        roomId,
        room,
        io
      );
    }

    return;
  }

  // Marked Weakness: the guesser's response to the setter's claim -- accept
  // it, or call it a bluff. Same standing-option shape as USE_QUEST above --
  // not tied to whose turn it is, resolved immediately (see
  // revealPenaltyServer.js).
  if (action.type === "USE_REVEAL_PENALTY_ACCEPT") {
    if (revealPenaltyServer.resolveClaim(state, userId, roomId, io, true)) {
      emitRoomState(roomId, room, io);
    }
    return;
  }

  if (action.type === "USE_REVEAL_PENALTY_CALL") {
    if (revealPenaltyServer.resolveClaim(state, userId, roomId, io, false)) {
      emitRoomState(roomId, room, io);
    }
    return;
  }

  // Double Tap: the guesser fires two guesses at once. See applyDoubleGuess
  // below for what it actually does -- extracted so Power Choice's reward
  // system can fire it immediately with a real payload too (see
  // powerChoiceServer.js's applyChoice), not just from this per-turn path.
  if (
    action.type === "USE_DOUBLE_GUESS" &&
    userId === state.guesser &&
    !state.pendingGuess
  ) {
    applyDoubleGuess(state, action, roomId, io, room, context);
    return;
  }

  // Guesser submit
  if (
    !state.pendingGuess &&
    action.type === "SUBMIT_GUESS" &&
    userId === state.guesser
  ) {
    const res = checkGuess({
      guess: action.guess,
      state,
      allowedGuesses: context.ALLOWED_GUESSES
    });

    if (!res.ok) {
      io.to(room.playersByUserId?.[userId]?.socketId).emit("errorMessage", res.error);
      return;
    }

    const guess = action.guess.toUpperCase();
    state.guessCount += 1;

    if (state.roundStartTime && state.timeUsed?.[state.guesser] != null) {
      state.timeUsed[state.guesser] += Math.floor((Date.now() - state.roundStartTime) / 1000);
    }
    state.roundStartTime = Date.now();

    transitionAfterGuess({
      room,
      state,
      guess,
      roomId,
      context,
      io
    });
    return;
  }

  // Setter submit
  if (
    state.pendingGuess &&
    state.turn === state.setter &&
    userId === state.setter &&
    (action.type === "SET_SECRET_NEW" || action.type === "SET_SECRET_SAME")
  ) {
    // Break Cover (rouletteSecret) forces the setter's NEXT secret to be a
    // random new one -- it explicitly overrides the simultaneous-round lock
    // below rather than colliding with it, so a guesser using the power
    // during a locked round doesn't leave the setter stuck unable to
    // satisfy either constraint (can't submit NEW per the lock, but forced
    // to per the power).
    if (
      state.simultaneousAllWrong &&
      action.type === "SET_SECRET_NEW" &&
      !state.powers?.rouletteSecretActive
    ) {
      const setterSocketId =
  room.playersByUserId
    ?.[userId]
    ?.socketId;

if (setterSocketId) {
  io.to(setterSocketId).emit(
    "errorMessage",
    "The opening guess missed every letter, so your secret is locked for this round."
  );
}
      return;
    }
    const secret =
      action.type === "SET_SECRET_NEW"
        ? action.secret.toUpperCase()
        : state.secret;

    const res = checkSecret({
      secret,
      state,
      allowedSecrets: context.ALLOWED_SECRETS
    });

    if (!res.ok) {
      io.to(room.playersByUserId?.[userId]?.socketId).emit("errorMessage", res.error);
      return;
    }

    if (powerEngine.beforeSetterSecretChange(state, action)) return;

    if (
      state.powers.assassinWord &&
      secret.toUpperCase() === state.powers.assassinWord.toUpperCase()
    ) {
      io.to(room.playersByUserId?.[userId]?.socketId).emit(
        "errorMessage",
        "Secret cannot match assassin word!"
      );
      return;
    }
    // Which accepted decision this is, captured now -- before
    // transitionAfterSecret/resolveDoubleGuess run finalizeFeedback/
    // clearRoundState below and clear freezeActive/simultaneousAllWrong.
    const keptCurrentSecret =
      action.type === "SET_SECRET_SAME" ||
      secret === String(state.secret || "").toUpperCase();

    const wasHiddenGuessDecision = !!state.powers.doubleGuessPending;
    const wasFrozenKeepDecision = !!state.powers?.freezeActive && keptCurrentSecret;
    const wasOpeningLockedKeep = !!state.simultaneousAllWrong && keptCurrentSecret;

    // These accepted decisions always earn exactly one normal base star
    // and never a bonus, regardless of switch quality:
    //   - Hidden Guess, NEW or KEEP
    //   - an accepted KEEP while Freeze Secret is active
    //   - the forced/default KEEP after the all-gray opening
    // Everything else still goes through the real cover-strength rating.
    const fixedOneStarDecision =
      wasHiddenGuessDecision ||
      wasFrozenKeepDecision ||
      wasOpeningLockedKeep;

    const spyChargeAward = fixedOneStarDecision
      ? spyChargeServer.createFlatDecisionAward(state, 1)
      : spyChargeServer.evaluateSecretChange(
          state,
          secret,
          context.ALLOWED_SECRETS
        );


    // Stats bookkeeping (My Games stats screen): capture the very first
    // secret this round regardless of action type -- that's the round's
    // "starting secret" -- and count every time the setter actually swaps
    // to a different word afterward. Both read out of state in gameOver.js
    // when the round gets archived.
    if (state.initialSecretThisRound == null) {
      state.initialSecretThisRound = secret;
    }
  if (
        action.type === "SET_SECRET_NEW" &&
        secret !== state.secret
      ) {
        state.secretChangeCount =
          (state.secretChangeCount || 0) + 1;
      }

    if (state.roundStartTime && state.timeUsed?.[state.setter] != null) {
      state.timeUsed[state.setter] += Math.floor((Date.now() - state.roundStartTime) / 1000);
    }
    state.roundStartTime = Date.now();

    // Double Tap resolution: the setter has just committed their final secret
    // (Keep or New). Score BOTH the shown and hidden guesses against it and
    // return the combined feedback to the guesser.
    if (state.powers.doubleGuessPending) {
      resolveDoubleGuess({ room, state, secret, roomId, context, io, spyChargeAward });
      return;
    }

    transitionAfterSecret({
      room,
      state,
      secret,
      roomId,
      context,
      io,
      spyChargeAward
    });
    return;
  }

  // Powers
  if (action.type.startsWith("USE_")) {
    const powerId = normalizePowerId(action.type);

    // isPowerAllowed() only checks whose TURN it is, not who is actually
    // calling — without this, any connected player (or a mistimed AI
    // action) could trigger the other role's power as long as the game
    // happened to be in that role's turn.
    const requiredRole = POWER_METADATA[powerId]?.role;
    const callerRole = room.state.players?.[userId]?.role;
    const callerOwnsThisPower = !requiredRole || callerRole === requiredRole;

    // Custom mode: powers aren't a shared per-role pool -- each player only
    // has whatever's in their OWN loadout for their current role, even
    // though state.activePowers (used for generic bookkeeping) is the union
    // of both players' pools. Without this check either player could fire a
    // power only their opponent actually picked.
    const callerHasThisPowerInLoadout =
      !state.customPowersMode ||
      (state.customPlayerPowers?.[userId]?.[`${callerRole}Powers`] || []).includes(powerId);

    if (
      callerOwnsThisPower &&
      callerHasThisPowerInLoadout &&
      !spyChargeServer.isPowerLocked(
        state,
        powerId
      ) &&
      !state.powerUsedThisTurn &&
      isPowerAllowed(powerId, state)
    ) {
      const applied = powerEngine.applyPower(powerId, state, action, roomId, io, room);
      if (applied !== false) {
        state.powerUsedThisTurn = true;
        singlePlayerHooks.recordPowerUse(state, powerId, userId);
      }
    }

    emitRoomState(roomId, room, io);
    return;
  }
}

// Double Tap: the guesser fires two guesses at once. The setter is shown
// only ONE of them (random) as a normal pending guess and reacts with their
// usual Keep/New decision — they know the power fired, but not the hidden
// word. Scoring happens AFTER the setter commits: both guesses are scored
// against the setter's FINAL secret (see resolveDoubleGuess below), then
// the combined feedback goes back to the guesser.
//
// Extracted out of handleNormalPhase's own USE_DOUBLE_GUESS branch so
// Power Choice's reward system can call this directly with a real
// {guess1, guess2} payload the instant the Double Tap card is picked (see
// powerChoiceServer.js's applyChoice) -- Power Choice fires it immediately
// rather than granting standing access to fire it later, so this is the
// single source of truth both paths share. Returns true if it actually
// fired (immediate win or handed off to the setter), false if rejected
// (already used, invalid guess, wrong turn, etc.) -- the per-turn caller
// in handleNormalPhase ignores the return value since either way nothing
// else should run for this action; applyChoice uses it the same way
// engine.applyPower's own `false` return already signals "didn't apply".
function applyDoubleGuess(state, action, roomId, io, room, context) {
  const userId = action.userId;
  const socketId = room.playersByUserId?.[userId]?.socketId ?? null;
  if (
    !state.activePowers?.includes("doubleGuess") ||
    state.powers.doubleGuessUsed ||
    state.powerUsedThisTurn ||
    state.turn !== state.guesser
  ) {
    return false;
  }

  const g1 = (action.guess1 || "").toUpperCase();
  const g2 = (action.guess2 || "").toUpperCase();
  for (const g of [g1, g2]) {
    const chk = checkGuess({ guess: g, state, allowedGuesses: context.ALLOWED_GUESSES });
    if (!chk.ok) {
      if (socketId) io.to(socketId).emit("errorMessage", chk.error);
      return false;
    }
  }

  state.powers.doubleGuessUsed = true;
  state.powerUsedThisTurn = true;

  // Immediate win: if either word already matches the current secret, the
  // game ends now — the setter never gets to react, exactly as a normal
  // correct guess ends the round before the Keep/New decision.
  const secretNow = (state.secret || "").toUpperCase();
  if (g1 === secretNow || g2 === secretNow) {
    const fb1 = scoreGuess(secretNow, g1);
    const fb2 = scoreGuess(secretNow, g2);
    // Drain power-use events queued this turn (mirrors finalizeFeedback.js)
    // onto the first entry -- otherwise a power used earlier this turn
    // would vanish from the log the instant Double Tap wins immediately.
    const powerEvents = Array.isArray(state._pendingPowerEvents)
      ? [...state._pendingPowerEvents]
      : [];
    state._pendingPowerEvents = [];
    const mk = (guess, fb, events) => ({
      guess,
      fb,
      fbGuesser: [...fb],
      extraInfo: null,
      finalSecret: secretNow,
      roundIndex: state.history.length,
      powerEvents: events,
      doubleGuessApplied: true,
      doubleGuessHidden: false
    });
    state.history.push(mk(g1, fb1, powerEvents), mk(g2, fb2, []));
    // Both guesses are recorded and scored, but Double Tap is spending a
    // single turn — only the first (as if it were a normal guess) counts
    // toward the score, or the power would just be a strictly worse way
    // to guess than never using it.
    state.guessCount += 1;

    io.to(roomId).emit("powerUsed", { type: "doubleGuess" });
    if (socketId) {
      io.to(socketId).emit("doubleGuessResult", {
        guesses: [
          { guess: g1, fb: [...fb1] },
          { guess: g2, fb: [...fb2] }
        ]
      });
    }
    io.to(roomId).emit("secretFound");
    endGame(state, roomId, io, room, context);
    return true;
  }

  // Random which one the setter gets to see. The shown word becomes the
  // pending guess; the other is stashed until resolution.
  const shownIsFirst = Math.random() < 0.5;
  const shown = shownIsFirst ? g1 : g2;
  const hidden = shownIsFirst ? g2 : g1;

  state.powers.doubleGuessPending = true;
  state.powers.doubleGuessHidden = hidden;
  state.powers.doubleGuessShownFirst = shownIsFirst;

  state.pendingGuess = shown;
  // Only the first (as if it were a normal guess) counts toward the
  // score — see the immediate-win branch above for why.
  state.guessCount += 1;

  if (state.roundStartTime && state.timeUsed?.[state.guesser] != null) {
    state.timeUsed[state.guesser] += Math.floor((Date.now() - state.roundStartTime) / 1000);
  }
  state.roundStartTime = Date.now();

  io.to(roomId).emit("powerUsed", { type: "doubleGuess" });
  io.to(roomId).emit("guessSubmitted");

  // The guesser just acted, resolving any Force Timer that was pressuring
  // them -- same as the normal SUBMIT_GUESS path (transitionAfterGuess).
  clearForceTimer(roomId, state);

  // Hand the turn to the setter for their Keep/New decision. Reuse the
  // normal post-guess transition bookkeeping (clears round-scoped powers,
  // flips the turn, advances the timer) — but skip the win-check, since
  // nothing is scored until the setter commits their secret.
  clearRoundState(state, "guesser");

  context.powerEngine.turnStart(state, state.turn, roomId, io);
  emitRoomState(roomId, room, io);
  return true;
}

// Double Tap resolution. Called from the setter's SET_SECRET handler once
// doubleGuessPending is set: the setter has committed their final secret, so
// both the shown (pendingGuess) and hidden guesses are now scored against it.
// The two entries are pushed in stable g1/g2 order (so row order leaks nothing
// about which was shown), the hidden one is masked from the setter in
// safeState, and the guesser receives both real feedbacks. The round ends if
// either guess equals the final secret.
function resolveDoubleGuess({ room, state, secret, roomId, context, io, spyChargeAward = null }) {
  const finalSecret = (secret || "").toUpperCase();
  const shown = (state.pendingGuess || "").toUpperCase();
  const hidden = (state.powers.doubleGuessHidden || "").toUpperCase();
  const shownFirst = state.powers.doubleGuessShownFirst;

  const fbShown = scoreGuess(finalSecret, shown);
  const fbHidden = scoreGuess(finalSecret, hidden);

  state.secret = finalSecret;
  state.simultaneousAllWrong = false;

  const mkEntry = (guess, fb, isHidden, events) => ({
    guess,
    fb,
    fbGuesser: [...fb],
    extraInfo: null,
    finalSecret,
    roundIndex: state.history.length,
    powerEvents: events,
    doubleGuessApplied: true,
    doubleGuessHidden: isHidden
  });

  // Drain power-use events queued since the last entry (mirrors
  // finalizeFeedback.js) onto whichever entry lands first in history order,
  // so a power used earlier this turn doesn't vanish from the log once
  // Double Tap resolves.
  const powerEvents = Array.isArray(state._pendingPowerEvents)
    ? [...state._pendingPowerEvents]
    : [];
  state._pendingPowerEvents = [];

  const eShown = mkEntry(shown, fbShown, false, shownFirst ? powerEvents : []);
  const eHidden = mkEntry(hidden, fbHidden, true, shownFirst ? [] : powerEvents);
  if (shownFirst) state.history.push(eShown, eHidden);
  else state.history.push(eHidden, eShown);

  // The setter has now committed an accepted final secret for Hidden
  // Guess. Award exactly one normal star before any possible game-over
  // return below -- do not call commitAward anywhere else in this
  // resolution.
  if (spyChargeAward) {
    spyChargeServer.commitAward(state, spyChargeAward, room, io);
  }

  // Clear the Double Tap resolution state.
  state.powers.doubleGuessPending = false;
  state.powers.doubleGuessHidden = null;
  state.powers.doubleGuessShownFirst = null;
  state.pendingGuess = "";

  // Win if EITHER guess matched the setter's final secret.
  if (shown === finalSecret || hidden === finalSecret) {
    io.to(roomId).emit("secretFound");
    endGame(state, roomId, io, room, context);
    return;
  }

  io.to(roomId).emit("secretPlanted");

  // Combined feedback back to the guesser (private), in stable g1/g2 order.
  const socketId = room.playersByUserId?.[state.guesser]?.socketId ?? null;
  if (socketId) {
    const guesses = shownFirst
      ? [{ guess: shown, fb: [...fbShown] }, { guess: hidden, fb: [...fbHidden] }]
      : [{ guess: hidden, fb: [...fbHidden] }, { guess: shown, fb: [...fbShown] }];
    io.to(socketId).emit("doubleGuessResult", { guesses });
  }

  // Hand back to the guesser (advances the setter's timer, flips the turn).
  clearRoundState(state, "setter");

  if (state.powers.forceTimerArmed) {
    startForceTimer(roomId, room, state, io, context);
  }

  context.powerEngine.turnStart(state, state.turn, roomId, io);
  emitRoomState(roomId, room, io);
}

function normalizePowerId(type) {
  const raw = type.replace("USE_", "").toLowerCase();
  return raw.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

module.exports = {
  handleNormalPhase,
  // Exported for server/power-choice/powerChoiceServer.js -- lets the
  // Double Tap reward card fire the exact same logic immediately with a
  // real {guess1, guess2} payload instead of just granting standing
  // access to this per-turn action type.
  applyDoubleGuess
};
