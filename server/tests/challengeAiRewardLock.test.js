// Regression test: a Challenge match hands its AI opponent exactly one
// named power, repeated for a fixed number of turns (see runAI.js's
// maybeUsePower challenge branch) -- but the ordinary Power Choice
// milestone system runs underneath every single-player match regardless,
// so without a guard the AI could still cross a star/quest threshold and
// pick up an extra, unrelated reward on top of its one mandated power.
// maybeOpenChoice must never open a reward offer for the AI while it
// occupies the challenge's powerRole, even after the forced power turns
// are exhausted -- but must behave normally for everyone else (the human
// in that same role, or the AI in the OTHER role).
const assert = require("assert");
const { initializeRound, maybeOpenChoice } = require("../power-choice/powerChoiceServer");

function baseState(overrides = {}) {
  const state = {
    gameMode: "powerChoice",
    isTutorial: false,
    isDaily: false,
    devMode: false,
    roundIndex: 0,
    phase: "normal",
    gameOver: false,
    history: [],
    knownPresent: [],
    knownAbsent: [],
    revealedPositions: [],
    guessCount: 0,
    powers: {},
    players: {
      AI: { userId: "AI", role: "setter", isAI: true },
      human: { userId: "human", role: "guesser", isAI: false }
    },
    setter: "AI",
    guesser: "human",
    turn: "AI",
    ...overrides
  };
  initializeRound(state);
  return state;
}

function run() {
  // Case 1: the AI holds the challenge's powered role -- no offer, even
  // though a milestone is sitting in the queue ready to open.
  {
    const state = baseState({
      singlePlayer: {
        enabled: true,
        stage: { game: { powerPolicy: { rewardsUseUnlocks: false } } },
        challenge: { enabled: true, powerRole: "setter", powerId: "someTestPower" }
      }
    });
    state.powerChoice.spy.queuedMilestones = [4];

    maybeOpenChoice(state);

    assert.strictEqual(
      state.powerChoice.pendingChoice,
      null,
      "the AI's powered role must never be offered a reward choice in a challenge"
    );
    assert.deepStrictEqual(
      state.powerChoice.spy.queuedMilestones,
      [4],
      "the queued milestone must be left alone, not silently consumed"
    );
  }

  // Case 2: same challenge, but a role-swap round has handed the powered
  // role to the HUMAN -- the block only ever targets the AI, so the human
  // must still get their reward normally.
  {
    const state = baseState({
      players: {
        human: { userId: "human", role: "setter", isAI: false },
        AI: { userId: "AI", role: "guesser", isAI: true }
      },
      setter: "human",
      guesser: "AI",
      turn: "human",
      singlePlayer: {
        enabled: true,
        stage: { game: { powerPolicy: { rewardsUseUnlocks: false } } },
        challenge: { enabled: true, powerRole: "setter", powerId: "someTestPower" }
      }
    });
    state.powerChoice.spy.queuedMilestones = [4];

    maybeOpenChoice(state);

    assert.ok(
      state.powerChoice.pendingChoice,
      "the human occupying the powered role must still be offered a reward choice"
    );
    assert.strictEqual(state.powerChoice.pendingChoice.ownerUserId, "human");
  }

  // Case 3: same challenge, AI is on its turn but in the OTHER (non-
  // powered) role -- normal reward offers must still reach it there.
  {
    const state = baseState({
      players: {
        human: { userId: "human", role: "setter", isAI: false },
        AI: { userId: "AI", role: "guesser", isAI: true }
      },
      setter: "human",
      guesser: "AI",
      turn: "AI",
      singlePlayer: {
        enabled: true,
        stage: { game: { powerPolicy: { rewardsUseUnlocks: false } } },
        challenge: { enabled: true, powerRole: "setter", powerId: "someTestPower" }
      }
    });
    state.powerChoice.inspector.queuedMilestones = [2];

    maybeOpenChoice(state);

    assert.ok(
      state.powerChoice.pendingChoice,
      "the AI must still be offered a reward choice in a role the challenge doesn't restrict"
    );
    assert.strictEqual(state.powerChoice.pendingChoice.ownerUserId, "AI");
  }

  // Case 4: outside a challenge entirely (an ordinary single-player run),
  // the AI must be completely unaffected.
  {
    const state = baseState({
      singlePlayer: { enabled: true, stage: { game: { powerPolicy: { rewardsUseUnlocks: false } } } }
    });
    state.powerChoice.spy.queuedMilestones = [4];

    maybeOpenChoice(state);

    assert.ok(
      state.powerChoice.pendingChoice,
      "outside a challenge, the AI's normal reward offers must be untouched"
    );
  }

  console.log("PASS challengeAiRewardLock: a challenge's AI opponent never gets an extra reward choice while holding the powered role, in every other case reward offers are unaffected");
}

module.exports = { run };

if (require.main === module) {
  run();
}
