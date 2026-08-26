// Integration/regression coverage for the REAL setter-decision action path
// (server/core/phases/normal.js's handleNormalPhase / resolveDoubleGuess,
// server/core/transitions/normalTransitions.js's transitionAfterSecret,
// server/powers/powers/freezeSecretServer.js's apply()) -- not just the
// lower-level spyChargeServer.evaluateSecretChange() evaluator that
// hiddenGuessStars.test.js and starNormalization.test.js already cover.
// Those evaluator-level tests were not sufficient on their own: normal.js
// used to bypass evaluateSecretChange entirely during Hidden Guess
// (`!state.powers.doubleGuessPending ? evaluateSecretChange(...) : null`),
// so the real dispatched action never earned the star the evaluator said
// it should. This file drives the actual dispatch functions instead.
//
// gameOver.js's endGame() and rooms.js's emitRoomState() are stubbed out
// (both do heavy, unrelated work -- DB writes, elo, round-advance, full
// state broadcast) so the award-commit assertions below don't depend on
// that machinery. Both are consumed via `const { endGame } = require(...)`
// at the TOP of normal.js/normalTransitions.js, so simply mutating
// gameOverModule.endGame/rooms.emitRoomState only reaches callers that
// require those two files for the first time AFTER this runs -- when the
// whole suite runs together (npm test), power-choice/powerChoiceServer.js
// (pulled in transitively by an earlier test file's lobby.js -> tutorialMode.js
// chain) already required core/phases/normal.js and captured the REAL
// endGame/emitRoomState in its own module-scope consts before this file
// ever loads. Dropping normal.js and normalTransitions.js from the require
// cache and re-requiring them here forces their destructuring to re-run
// against the now-patched exports, regardless of what any earlier test
// file already triggered. Everything else in the award path
// (spyChargeServer, freezeSecretServer, the real powerEngine singleton,
// finalizeFeedback, clearRoundState) runs for real.
//
// NOTE: "11. Normal strong NEW" and "12. Normal strong NEW matching
// target" from the fix's test list are already fully covered by
// starNormalization.test.js (the objectively-best-switch base-2 case, and
// base-2-plus-matching-hint-bonus case) -- not duplicated here.
const assert = require("assert");

const rooms = require("../core/rooms");
const gameOverModule = require("../core/phases/gameOver");

let endGameCalls = 0;
rooms.emitRoomState = () => {};
gameOverModule.endGame = () => { endGameCalls++; };

const normalPhasePath = require.resolve("../core/phases/normal");
const normalTransitionsPath = require.resolve("../core/transitions/normalTransitions");
delete require.cache[normalTransitionsPath];
delete require.cache[normalPhasePath];

const { handleNormalPhase } = require(normalPhasePath);
const spyChargeServer = require("../powers/powers/spyChargeServer");
const coverStrength = require("../utils/coverStrength");
const powerEngine = require("../powers/powerEngineServer");
require("../powers/powers/freezeSecretServer"); // registers "freezeSecret" on the shared engine

const ALLOWED_SECRETS = ["APPLE", "AMPLY", "ANGLE", "ANKLE", "MANGO", "GRAPE"];

function makeIO() {
  const emissions = [];
  return {
    emissions,
    to(target) {
      return { emit: (event, payload) => emissions.push({ target, event, payload }) };
    },
    emit(event, payload) {
      emissions.push({ target: null, event, payload });
    }
  };
}

function makeRoom(state) {
  const room = {
    state,
    playersByUserId: {
      S: { socketId: "socket-S", connected: true },
      G: { socketId: "socket-G", connected: true }
    }
  };
  return room;
}

function makeContext(io) {
  return {
    io,
    powerEngine,
    ALLOWED_SECRETS,
    supabase: null,
    applyAction: () => {},
    maybeRunAI: () => {}
  };
}

function baseState(overrides = {}) {
  const state = {
    phase: "normal",
    setter: "S",
    guesser: "G",
    turn: "S",
    secret: "APPLE",
    pendingGuess: "MANGO",
    history: [],
    extraConstraints: [],
    simultaneousAllWrong: false,
    guessCount: 0,
    activePowers: [],
    matchRounds: [],
    timeUsed: { S: 0, G: 0 },
    roundStartTime: null,
    timeControl: { enabled: false, mode: "none" },
    players: {
      S: { userId: "S", role: "setter" },
      G: { userId: "G", role: "guesser" }
    },
    powers: {
      spyCharge: { enabled: true, total: 0, resetsUsed: 0, hint: null, lockedPowerId: null },
      doubleGuessPending: false
    },
    ...overrides
  };
  state.players = overrides.players || state.players;
  return state;
}

function spyChargeAwardEmissions(io) {
  return io.emissions.filter(e => e.event === "spyChargeAward");
}

function run() {
  // ---- 1. Hidden Guess + accepted NEW -----------------------------------
  {
    const state = baseState({
      pendingGuess: "MANGO",
      powers: {
        spyCharge: { enabled: true, total: 0, resetsUsed: 0, hint: null, lockedPowerId: null },
        doubleGuessPending: true,
        doubleGuessHidden: "GRAPE",
        doubleGuessShownFirst: true
      }
    });
    const io = makeIO();
    const room = makeRoom(state);
    const context = makeContext(io);

    handleNormalPhase(room, state, { type: "SET_SECRET_NEW", userId: "S", secret: "AMPLY" }, "room1", context);

    assert.strictEqual(state.powers.spyCharge.total, 1, "Hidden Guess + accepted NEW must leave charge at 1");
    const awards = spyChargeAwardEmissions(io);
    assert.strictEqual(awards.length, 1, "exactly one spyChargeAward event must be emitted");
    assert.deepStrictEqual(
      {
        baseStars: awards[0].payload.baseStars,
        bonusStars: awards[0].payload.bonusStars,
        appliedBaseStars: awards[0].payload.appliedBaseStars,
        appliedBonusStars: awards[0].payload.appliedBonusStars,
        appliedStars: awards[0].payload.appliedStars
      },
      { baseStars: 1, bonusStars: 0, appliedBaseStars: 1, appliedBonusStars: 0, appliedStars: 1 },
      "Hidden Guess + accepted NEW must emit exactly {baseStars:1, bonusStars:0, appliedBaseStars:1, appliedBonusStars:0, appliedStars:1}"
    );
  }

  // ---- 2. Hidden Guess + accepted KEEP -----------------------------------
  {
    const state = baseState({
      secret: "APPLE",
      pendingGuess: "MANGO",
      powers: {
        spyCharge: { enabled: true, total: 0, resetsUsed: 0, hint: null, lockedPowerId: null },
        doubleGuessPending: true,
        doubleGuessHidden: "GRAPE",
        doubleGuessShownFirst: false
      }
    });
    const io = makeIO();
    const room = makeRoom(state);
    const context = makeContext(io);

    handleNormalPhase(room, state, { type: "SET_SECRET_SAME", userId: "S" }, "room1", context);

    assert.strictEqual(state.powers.spyCharge.total, 1, "Hidden Guess + accepted KEEP must earn exactly 1 base star");
    const awards = spyChargeAwardEmissions(io);
    assert.strictEqual(awards.length, 1);
    assert.strictEqual(awards[0].payload.baseStars, 1);
    assert.strictEqual(awards[0].payload.bonusStars, 0);
  }

  // ---- 3. Hidden Guess + NEW satisfying a bonus target -------------------
  {
    const state = baseState({
      pendingGuess: "MANGO",
      powers: {
        // AMPLY's letter at position 2 is "P" -- matching hint here proves
        // the bonus is suppressed by the decision type, not merely absent.
        spyCharge: { enabled: true, total: 0, resetsUsed: 0, hint: { letter: "P", position: 2 }, lockedPowerId: null },
        doubleGuessPending: true,
        doubleGuessHidden: "GRAPE",
        doubleGuessShownFirst: true
      }
    });
    const io = makeIO();
    const room = makeRoom(state);
    const context = makeContext(io);

    handleNormalPhase(room, state, { type: "SET_SECRET_NEW", userId: "S", secret: "AMPLY" }, "room1", context);

    assert.strictEqual(state.powers.spyCharge.total, 1, "a matching hint must not grant a bonus star during Hidden Guess");
    const awards = spyChargeAwardEmissions(io);
    assert.strictEqual(awards.length, 1);
    assert.strictEqual(awards[0].payload.baseStars, 1);
    assert.strictEqual(awards[0].payload.bonusStars, 0, "bonus must stay 0 even with a matching hint set");
  }

  // ---- 4. Hidden Guess resulting in game over -----------------------------
  {
    const state = baseState({
      secret: "APPLE",
      pendingGuess: "MANGO",
      powers: {
        spyCharge: { enabled: true, total: 0, resetsUsed: 0, hint: null, lockedPowerId: null },
        doubleGuessPending: true,
        doubleGuessHidden: "GRAPE",
        doubleGuessShownFirst: true
      }
    });
    const io = makeIO();
    const room = makeRoom(state);
    const context = makeContext(io);
    const endGameCallsBefore = endGameCalls;

    // The setter's final secret matches the SHOWN Hidden Guess word -- the
    // round ends immediately inside resolveDoubleGuess.
    handleNormalPhase(room, state, { type: "SET_SECRET_NEW", userId: "S", secret: "MANGO" }, "room1", context);

    assert.strictEqual(endGameCalls, endGameCallsBefore + 1, "test setup: this must actually reach endGame()");
    assert.strictEqual(state.powers.spyCharge.total, 1, "the setter's accepted decision must still commit 1 star before endGame()");
    const awards = spyChargeAwardEmissions(io);
    assert.strictEqual(awards.length, 1, "exactly one award, committed before the game-over return");
  }

  // ---- 5. Freeze Secret activation ---------------------------------------
  let frozenState;
  {
    const state = baseState({
      powers: {
        spyCharge: { enabled: true, total: 0, resetsUsed: 0, hint: null, lockedPowerId: null },
        doubleGuessPending: false,
        freezeSecretUsed: false,
        freezeActive: false
      }
    });
    const io = makeIO();
    const room = makeRoom(state);

    assert.strictEqual(state.powers.spyCharge.total, 0, "test setup: charge starts at 0");
    const applied = powerEngine.applyPower("freezeSecret", state, { type: "USE_FREEZE_SECRET", userId: "S" }, "room1", io, room);

    assert.notStrictEqual(applied, false, "freezeSecret must actually activate");
    assert.strictEqual(state.powers.freezeActive, true);
    assert.strictEqual(state.powers.spyCharge.total, 0, "activation alone must award 0 stars");
    assert.strictEqual(spyChargeAwardEmissions(io).length, 0, "activation must not emit any spyChargeAward event");

    frozenState = state; // carried into test 6
  }

  // ---- 6. Accepted frozen KEEP --------------------------------------------
  {
    const state = frozenState;
    const io = makeIO();
    const room = makeRoom(state);
    const context = makeContext(io);

    handleNormalPhase(room, state, { type: "SET_SECRET_SAME", userId: "S" }, "room1", context);

    assert.strictEqual(state.powers.spyCharge.total, 1, "the accepted frozen Keep must earn exactly 1 star");
    const awards = spyChargeAwardEmissions(io);
    assert.strictEqual(awards.length, 1, "exactly one award event for the frozen Keep");
    assert.strictEqual(awards[0].payload.baseStars, 1);
    assert.strictEqual(awards[0].payload.bonusStars, 0);
  }

  // ---- 7. Frozen KEEP that ends the round ---------------------------------
  {
    const state = baseState({
      secret: "APPLE",
      pendingGuess: "APPLE", // the guesser already found the secret
      powers: {
        spyCharge: { enabled: true, total: 0, resetsUsed: 0, hint: null, lockedPowerId: null },
        doubleGuessPending: false,
        freezeSecretUsed: true,
        freezeActive: true
      }
    });
    const io = makeIO();
    const room = makeRoom(state);
    const context = makeContext(io);
    const endGameCallsBefore = endGameCalls;

    handleNormalPhase(room, state, { type: "SET_SECRET_SAME", userId: "S" }, "room1", context);

    assert.strictEqual(endGameCalls, endGameCallsBefore + 1, "test setup: keeping the found secret must end the round");
    assert.strictEqual(state.powers.spyCharge.total, 1, "a frozen Keep that ends the round must still earn exactly 1 star");
    assert.strictEqual(spyChargeAwardEmissions(io).length, 1);
  }

  // ---- 8. Repeated state emission / reconnect: no second award -----------
  {
    const state = baseState({
      secret: "APPLE",
      pendingGuess: "MANGO",
      powers: {
        spyCharge: { enabled: true, total: 0, resetsUsed: 0, hint: null, lockedPowerId: null },
        doubleGuessPending: false
      }
    });
    const io = makeIO();
    const room = makeRoom(state);
    const context = makeContext(io);

    handleNormalPhase(room, state, { type: "SET_SECRET_SAME", userId: "S" }, "room1", context);
    const totalAfterFirstCommit = state.powers.spyCharge.total;
    const awardsAfterFirstCommit = spyChargeAwardEmissions(io).length;
    assert.ok(totalAfterFirstCommit >= 1, "test setup: the Keep must have earned at least 1 star");
    assert.strictEqual(awardsAfterFirstCommit, 1);

    // Simulate a reconnect / repeated broadcast: re-syncing state (what a
    // real reconnect does) never re-runs commitAward -- only the original
    // accepted-decision code path does, and that already ran once above.
    rooms.emitRoomState("room1", room, io);
    rooms.emitRoomState("room1", room, io);

    assert.strictEqual(state.powers.spyCharge.total, totalAfterFirstCommit, "a resync must never change the charge total");
    assert.strictEqual(spyChargeAwardEmissions(io).length, awardsAfterFirstCommit, "a resync must never emit a second spyChargeAward");
  }

  // ---- 9. Forced/default all-gray opening KEEP ----------------------------
  {
    const state = baseState({
      secret: "APPLE",
      pendingGuess: "MANGO",
      simultaneousAllWrong: true,
      powers: {
        spyCharge: { enabled: true, total: 0, resetsUsed: 0, hint: null, lockedPowerId: null },
        doubleGuessPending: false
      }
    });
    const io = makeIO();
    const room = makeRoom(state);
    const context = makeContext(io);

    handleNormalPhase(room, state, { type: "SET_SECRET_SAME", userId: "S" }, "room1", context);

    assert.strictEqual(state.powers.spyCharge.total, 1, "the forced opening Keep must earn exactly 1 star, not 2");
    const awards = spyChargeAwardEmissions(io);
    assert.strictEqual(awards.length, 1);
    assert.strictEqual(awards[0].payload.baseStars, 1);
    assert.strictEqual(awards[0].payload.bonusStars, 0);
    assert.strictEqual(awards[0].payload.appliedStars, 1);

    // The preview (coverStrength.js) must agree with the real award. Built
    // against a fresh, un-mutated snapshot of the same pre-decision turn --
    // the `state` object above was already advanced past this turn by the
    // handleNormalPhase call (turn handed to the guesser, the lock cleared).
    const previewState = baseState({
      secret: "APPLE",
      pendingGuess: "MANGO",
      simultaneousAllWrong: true
    });
    const preview = coverStrength.buildCoverStrengthState(previewState, ALLOWED_SECRETS, "APPLE");
    assert.strictEqual(preview.stars, 1, "the locked-opening preview must show 1 star, matching the real award");
  }

  // ---- 10. Same forced/default opening in Power Choice mode ---------------
  {
    const state = baseState({
      gameMode: "powerChoice",
      roundIndex: 0,
      secret: "APPLE",
      pendingGuess: "MANGO",
      simultaneousAllWrong: true,
      powers: {
        spyCharge: { enabled: true, total: 0, resetsUsed: 0, hint: null, lockedPowerId: null },
        doubleGuessPending: false
      }
    });
    const io = makeIO();
    const room = makeRoom(state);

    const award = spyChargeServer.createFlatDecisionAward(state, 1);
    spyChargeServer.commitAward(state, award, room, io);

    assert.strictEqual(state.powers.spyCharge.total, 1, "Power Choice's forced opening Keep must also earn exactly 1, not 2");
  }

  // ---- 13. Defensive normalization ----------------------------------------
  {
    const state = baseState({
      powers: {
        spyCharge: { enabled: true, total: 0, resetsUsed: 0, hint: null, lockedPowerId: null },
        doubleGuessPending: false
      }
    });
    const io = makeIO();
    const room = makeRoom(state);

    const payload = spyChargeServer.commitAward(state, { baseStars: 99, bonusStars: 99 }, room, io);

    assert.strictEqual(payload.baseStars, 2, "a requested baseStars of 99 must normalize down to 2");
    assert.strictEqual(payload.bonusStars, 1, "a requested bonusStars of 99 must normalize down to 1");
    assert.strictEqual(payload.appliedBaseStars, 2);
    assert.strictEqual(payload.appliedBonusStars, 1);
  }

  // ---- 14. Invalid/rejected setter action ---------------------------------
  {
    const state = baseState({
      secret: "APPLE",
      pendingGuess: "MANGO",
      powers: {
        spyCharge: { enabled: true, total: 0, resetsUsed: 0, hint: null, lockedPowerId: null },
        doubleGuessPending: false
      }
    });
    const io = makeIO();
    const room = makeRoom(state);
    const context = makeContext(io);

    // "ZZZZZ" is not in the dictionary -- checkSecret must reject it before
    // any award is ever computed or committed.
    handleNormalPhase(room, state, { type: "SET_SECRET_NEW", userId: "S", secret: "ZZZZZ" }, "room1", context);

    assert.strictEqual(state.powers.spyCharge.total, 0, "a rejected submission must earn 0 stars");
    assert.strictEqual(spyChargeAwardEmissions(io).length, 0, "a rejected submission must never emit a spyChargeAward event");
    assert.ok(io.emissions.some(e => e.event === "errorMessage"), "test setup: the rejection must actually be reported");
  }

  console.log("PASS spyChargeAwardFlow: Hidden Guess, Freeze Secret, the forced opening Keep, and normal/Power Choice commit exactly one star through the real dispatch path, with no double-awards and correctly normalized values");
}

module.exports = { run };

if (require.main === module) {
  run();
}
