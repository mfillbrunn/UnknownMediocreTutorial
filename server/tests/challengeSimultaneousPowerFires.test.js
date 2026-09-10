// Regression test: a Challenge's forced power must actually activate on
// round one's OPENING move (the simultaneous phase), not just from turn
// two onward.
//
// Three separate gaps combined to break this:
//  1. maybeUsePower (core/ai/runAI.js) was only ever called from the
//     NORMAL-phase action closures, never the simultaneous-phase ones.
//  2. Even once called, isPowerAllowed's rules gate on state.turn, which
//     is null throughout the simultaneous phase (neither side "has a
//     turn" yet) -- every rule read that as "not allowed".
//  3. Even once eligible, the forced action used to go through
//     applyAIAction -> applyAction -> handleSimultaneousPhase, which has
//     no generic USE_ action dispatch at all (unlike handleNormalPhase) --
//     so the action silently no-opped and the power's apply() never ran.
//
// This exercises the real functions exactly as production calls them:
// computeAIActionForUser picks the setter's opening-move closure, which
// now calls maybeUsePower first; that must actually arm the power, and
// resolveSimultaneousRound's postScore call must then make it visibly
// mask the guesser's very first row.
const assert = require("assert");
const { createInitialState } = require("../core/stateFactory");
const runAI = require("../core/ai/runAI");
const powerEngine = require("../powers/powerEngineServer");
require("../powers/powers/countOnlyServer");
const { resolveSimultaneousRound } = require("../core/phases/simultaneous");

function buildRoom(state) {
  return {
    state,
    playersByUserId: {
      ai: { socketId: "ai-socket" },
      human: { socketId: "human-socket" }
    }
  };
}

function run() {
  const state = createInitialState();
  state.phase = "simultaneous";
  state.setter = "ai";
  state.guesser = "human";
  state.players = {
    ai: { role: "setter", userId: "ai" },
    human: { role: "guesser", userId: "human" }
  };
  state.singlePlayer = {
    enabled: true,
    humanUserId: "human",
    stage: { game: { rules: [], human: {} } },
    challenge: {
      enabled: true,
      id: "count-only",
      powerId: "countOnly",
      powerRole: "setter",
      powerTurns: 2,
      forcedUses: 0,
      remainingUses: 2
    }
  };

  const room = buildRoom(state);
  const io = { to: () => ({ emit: () => {} }) };
  const context = {
    io,
    powerEngine,
    WORDS: {
      guesses: [{ word: "SNAKE", probability: 1 }],
      secrets: [{ word: "CRANE", probability: 1 }]
    },
    ALLOWED_SECRETS: new Set(["CRANE"])
  };

  // computeAIActionForUser is the real production entry point (maybeRunAI
  // just wraps its result in a setTimeout) -- this exercises the setter's
  // actual opening-move closure, edited to call maybeUsePower first.
  const actionFn = runAI.computeAIActionForUser(room, "room1", context, "ai");
  assert.ok(actionFn, "computeAIActionForUser should return the setter's opening-move action");
  actionFn();

  assert.strictEqual(
    state.powers.countOnlyActive,
    true,
    "the forced power's apply() must actually have run during the simultaneous phase"
  );
  assert.strictEqual(
    state.singlePlayer.challenge.forcedUses,
    1,
    "forcedUses must count the opening move, not start counting from turn two"
  );
  assert.strictEqual(
    state.powerUsedThisTurn,
    true,
    "powerUsedThisTurn bookkeeping must be set, same as handleNormalPhase's USE_ branch does"
  );
  assert.ok(state.secret, "the setter's own secret-picking logic must still run after the forced power");

  state.pendingGuess = "SNAKE";
  state.simultaneousGuessSubmitted = true;
  resolveSimultaneousRound(room, state, "room1", context);

  const entry = state.history[state.history.length - 1];
  assert.ok(entry, "a history entry should have been committed");
  assert.strictEqual(
    entry.countOnlyApplied,
    true,
    "postScore's masking must reach the opening round's own history entry"
  );
  assert.deepStrictEqual(
    entry.fbGuesser,
    ["❓", "❓", "❓", "❓", "❓"],
    "the guesser-facing feedback on round one's opening move must already be masked"
  );
  assert.notDeepStrictEqual(
    entry.fb,
    entry.fbGuesser,
    "the setter's real feedback must differ from what the guesser is shown"
  );

  console.log(
    "PASS challengeSimultaneousPowerFires: a Challenge's forced power now actually activates and masks feedback on round one's opening simultaneous-phase move, not just from turn two onward"
  );
}

module.exports = { run };

if (require.main === module) {
  run();
}
