// Regression test for the "reward selection is broken" bug: the reward
// chooser (public/client/power-choice-mode.js) used to disable every card
// on click and never learn whether the pick was actually accepted, because
// the generic gameAction ack only reports transport success, not this
// handler's own validation outcome (see socketHandlers.js). A rejected
// POWER_CHOICE_SELECT must emit a dedicated "powerChoiceSelectRejected"
// event so the client can re-enable its card grid, and must never mutate
// or consume the pending choice it rejected.
const assert = require("assert");
const { handleAction } = require("../power-choice/powerChoiceServer");

function makeHarness(pendingChoiceOverrides = {}) {
  const events = [];
  const io = {
    to(socketId) {
      return {
        emit(event, payload) {
          events.push({ socketId, event, payload });
        }
      };
    }
  };

  const room = {
    playersByUserId: {
      "guesser-1": { socketId: "sock-guesser-1" }
    }
  };

  const state = {
    gameMode: "powerChoice",
    isTutorial: false,
    isDaily: false,
    devMode: false,
    roundIndex: 0,
    setter: "setter-1",
    guesser: "guesser-1",
    powers: {},
    powerChoice: {
      roundIndex: 0,
      pendingChoice: {
        id: "choice-1",
        ownerUserId: "guesser-1",
        role: "guesser",
        revision: 0,
        options: [
          { id: "opt-real", kind: "power", powerId: "suggestGuess", title: "Analyst Tip" }
        ],
        ...pendingChoiceOverrides
      }
    }
  };

  return { events, io, room, state };
}

function run() {
  // Case 1: optionId doesn't exist in the current offer ("Select one of
  // the three cards.") -- e.g. a stale click racing a refresh.
  {
    const { events, io, room, state } = makeHarness();
    const handled = handleAction(
      room,
      state,
      { type: "POWER_CHOICE_SELECT", userId: "guesser-1", choiceId: "choice-1", optionId: "opt-does-not-exist" },
      "room-1",
      { io }
    );
    assert.strictEqual(handled, true, "handleAction should report the action as handled");

    const rejected = events.find(e => e.event === "powerChoiceSelectRejected");
    assert.ok(rejected, "an unknown optionId must emit powerChoiceSelectRejected");
    assert.strictEqual(rejected.socketId, "sock-guesser-1");
    assert.deepStrictEqual(rejected.payload, { choiceId: "choice-1", optionId: "opt-does-not-exist" });

    const errored = events.find(e => e.event === "errorMessage");
    assert.ok(errored, "an unknown optionId must still show the player-facing error toast");

    assert.ok(state.powerChoice.pendingChoice, "a rejected pick must not clear the pending choice");
    assert.strictEqual(state.powerChoice.pendingChoice.id, "choice-1");
    assert.strictEqual(
      state.powerChoice.pendingChoice.options.length,
      1,
      "a rejected pick must not consume/alter the still-current offer"
    );
  }

  // Case 2: stale offer id entirely (e.g. a click that raced a refresh
  // which replaced the whole pending choice, not just its options).
  {
    const { events, io, room, state } = makeHarness();
    const handled = handleAction(
      room,
      state,
      { type: "POWER_CHOICE_SELECT", userId: "guesser-1", choiceId: "choice-0-stale", optionId: "opt-real" },
      "room-1",
      { io }
    );
    assert.strictEqual(handled, true);

    const rejected = events.find(e => e.event === "powerChoiceSelectRejected");
    assert.ok(rejected, "a stale choiceId must emit powerChoiceSelectRejected");
    assert.deepStrictEqual(rejected.payload, { choiceId: "choice-0-stale", optionId: "opt-real" });
    assert.strictEqual(
      state.powerChoice.pendingChoice.id,
      "choice-1",
      "the real, still-current pending choice must be untouched by a stale-id rejection"
    );
  }

  console.log("PASS rewardSelectionRejection: rejected POWER_CHOICE_SELECT emits powerChoiceSelectRejected and leaves the pending choice untouched");
}

module.exports = { run };

if (require.main === module) {
  run();
}
