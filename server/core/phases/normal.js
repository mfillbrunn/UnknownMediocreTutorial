const { endGame } = require("./gameOver");
const { checkSecret, checkGuess } = require("../../game-engine/validation");
const { isPowerAllowed } = require("../../powers/POWER_RULES");
const POWER_METADATA = require("../../powers/powerMetadata");
const { transitionAfterGuess, transitionAfterSecret, clearRoundState, startForceTimer } = require("../transitions/normalTransitions");
const { advanceToNextRound } = require("../transitions/nextRoundTransition");
const { emitRoomState } = require("../rooms");
const { scoreGuess } = require("../../game-engine/scoring");
const { clearForceTimer } = require("../../utils/forceTimer");
const { computeRemainingNew } = require("../../utils/remainingWords");
const questServer = require("../../powers/powers/questServer");
const revealPenaltyServer = require("../../powers/powers/revealPenaltyServer");

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
  // decides which applies from state.powers.quest itself. Not tied to
  // whose turn it is or a pending guess; it's a standing option on the
  // badge, not a normal power activation.
  if (action.type === "USE_QUEST") {
    if (questServer.attemptQuestClaim(state, userId, roomId, io)) {
      emitRoomState(roomId, room, io);
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

  // Double Tap: the guesser fires two guesses at once. The setter is shown
  // only ONE of them (random) as a normal pending guess and reacts with their
  // usual Keep/New decision — they know the power fired, but not the hidden
  // word. Scoring happens AFTER the setter commits: both guesses are scored
  // against the setter's FINAL secret (see resolveDoubleGuess in the setter
  // block below), then the combined feedback goes back to the guesser.
  if (
    action.type === "USE_DOUBLE_GUESS" &&
    userId === state.guesser &&
    !state.pendingGuess
  ) {
    const socketId = room.playersByUserId?.[userId]?.socketId ?? null;
    if (
      !state.activePowers?.includes("doubleGuess") ||
      state.powers.doubleGuessUsed ||
      state.powerUsedThisTurn ||
      state.turn !== state.guesser
    ) {
      return;
    }

    const g1 = (action.guess1 || "").toUpperCase();
    const g2 = (action.guess2 || "").toUpperCase();
    for (const g of [g1, g2]) {
      const chk = checkGuess({ guess: g, state, allowedGuesses: context.ALLOWED_GUESSES });
      if (!chk.ok) {
        if (socketId) io.to(socketId).emit("errorMessage", chk.error);
        return;
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
      const mk = (guess, fb) => ({
        guess,
        fb,
        fbGuesser: [...fb],
        extraInfo: null,
        finalSecret: secretNow,
        roundIndex: state.history.length,
        powerEvents: [],
        doubleGuessApplied: true,
        doubleGuessHidden: false
      });
      state.history.push(mk(g1, fb1), mk(g2, fb2));
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
      return;
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
      io.to(action.playerId).emit("errorMessage", "All feedback was wrong — you must keep the same secret this round.");
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

    // Reward nudge: when the setter actually changes their secret (as
    // opposed to keeping it), show them privately how much more (or less)
    // ambiguous the new pick leaves things vs. what keeping the old secret
    // would have, both evaluated against this same pending guess. This is
    // the exact old/new pair already live in their remaining-words box
    // (getRemainingWordInfo in remainingWords.js) -- just captured at the
    // moment of commit rather than continuously while typing. Only fires
    // on an actual improvement (more remaining secrets = harder for the
    // guesser), and only to the setter's own socket -- never broadcast, so
    // it can't leak anything to the guesser.
    if (action.type === "SET_SECRET_NEW") {
      const oldCount = computeRemainingNew(state.secret, state, context.ALLOWED_SECRETS);
      const newCount = computeRemainingNew(secret, state, context.ALLOWED_SECRETS);
      if (oldCount != null && newCount != null && newCount > oldCount) {
        const setterSocketId = room.playersByUserId?.[state.setter]?.socketId;
        if (setterSocketId) {
          io.to(setterSocketId).emit("secretChangeReward", { diff: newCount - oldCount });
        }
      }
    }

    // Stats bookkeeping (My Games stats screen): capture the very first
    // secret this round regardless of action type -- that's the round's
    // "starting secret" -- and count every time the setter actually swaps
    // to a different word afterward. Both read out of state in gameOver.js
    // when the round gets archived.
    if (state.initialSecretThisRound == null) {
      state.initialSecretThisRound = secret;
    }
    if (action.type === "SET_SECRET_NEW" && secret !== state.secret) {
      state.secretChangeCount = (state.secretChangeCount || 0) + 1;
    }

    if (state.roundStartTime && state.timeUsed?.[state.setter] != null) {
      state.timeUsed[state.setter] += Math.floor((Date.now() - state.roundStartTime) / 1000);
    }
    state.roundStartTime = Date.now();

    // Double Tap resolution: the setter has just committed their final secret
    // (Keep or New). Score BOTH the shown and hidden guesses against it and
    // return the combined feedback to the guesser.
    if (state.powers.doubleGuessPending) {
      resolveDoubleGuess({ room, state, secret, roomId, context, io });
      return;
    }

    transitionAfterSecret({
      room,
      state,
      secret,
      roomId,
      context,
      io
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
      !state.powerUsedThisTurn &&
      isPowerAllowed(powerId, state)
    ) {
      const applied = powerEngine.applyPower(powerId, state, action, roomId, io, room);
      if (applied !== false) {
        state.powerUsedThisTurn = true;
      }
    }

    emitRoomState(roomId, room, io);
    return;
  }
}

// Double Tap resolution. Called from the setter's SET_SECRET handler once
// doubleGuessPending is set: the setter has committed their final secret, so
// both the shown (pendingGuess) and hidden guesses are now scored against it.
// The two entries are pushed in stable g1/g2 order (so row order leaks nothing
// about which was shown), the hidden one is masked from the setter in
// safeState, and the guesser receives both real feedbacks. The round ends if
// either guess equals the final secret.
function resolveDoubleGuess({ room, state, secret, roomId, context, io }) {
  const finalSecret = (secret || "").toUpperCase();
  const shown = (state.pendingGuess || "").toUpperCase();
  const hidden = (state.powers.doubleGuessHidden || "").toUpperCase();
  const shownFirst = state.powers.doubleGuessShownFirst;

  const fbShown = scoreGuess(finalSecret, shown);
  const fbHidden = scoreGuess(finalSecret, hidden);

  state.secret = finalSecret;
  state.simultaneousAllWrong = false;

  const mkEntry = (guess, fb, isHidden) => ({
    guess,
    fb,
    fbGuesser: [...fb],
    extraInfo: null,
    finalSecret,
    roundIndex: state.history.length,
    powerEvents: [],
    doubleGuessApplied: true,
    doubleGuessHidden: isHidden
  });

  const eShown = mkEntry(shown, fbShown, false);
  const eHidden = mkEntry(hidden, fbHidden, true);
  if (shownFirst) state.history.push(eShown, eHidden);
  else state.history.push(eHidden, eShown);

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
  handleNormalPhase
};
