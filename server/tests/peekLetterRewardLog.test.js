// Regression test for the Peek Letter (revealGreen) reward's action-log line.
// Taken as a Power Choice reward, the power fires through the generic
// USE_POWER path, which returns nothing -- which letter/position it picked
// only exists as apply()'s own side effect on state. Without reading that
// back, the resolution log could only say the card was taken ("Peek Letter
// activated for this turn."), so the guesser never saw the actual result in
// their log the way Time Rewind and First Letter Reveal already showed
// theirs.
const assert = require("assert");
require("../powers/powers/revealGreenServer.js");
const { applyChoice, powerOption } = require("../power-choice/powerChoiceServer");

function stubIo() {
  const emitted = [];
  return {
    emitted,
    to: () => ({
      emit(event, payload) {
        emitted.push({ event, payload });
      }
    })
  };
}

function makeState(overrides = {}) {
  return {
    secret: "CRANE",
    phase: "normal",
    turn: "guesser-id",
    setter: "setter-id",
    guesser: "guesser-id",
    history: [],
    extraConstraints: [],
    activePowers: [],
    powers: {},
    powerChoice: {
      spy: { usedPowerIds: [] },
      inspector: { usedPowerIds: [] },
      temporaryPowerIds: [],
      resolutionLog: []
    },
    ...overrides
  };
}

function run() {
  // The reward resolves, and its log line names the revealed letter and its
  // 1-based position instead of the generic "activated for this turn".
  {
    const state = makeState();
    const io = stubIo();
    const option = powerOption("revealGreen", 1);
    const choice = { ownerUserId: "guesser-id", role: "guesser", threshold: 1, tier: 1 };

    const applied = applyChoice(state, option, choice, null, "room-1", io, {}, null);
    assert.notStrictEqual(applied, false, "Peek Letter should resolve as a reward");

    const logged = state.powerChoice.resolutionLog.at(-1);
    assert.ok(logged, "the reward writes a resolution log entry");
    assert.strictEqual(logged.role, "guesser", "the entry is attributed to the guesser");

    const pos = state.revealGreenInfo.pos;
    const letter = state.revealGreenInfo.letter;
    assert.ok(Number.isInteger(pos) && letter, "the power recorded what it revealed");
    assert.strictEqual(
      logged.detailText,
      `Revealed ${letter.toUpperCase()} in position ${pos + 1}.`,
      "the log line reports the peeked letter and position"
    );
    assert.ok(
      !/activated for this turn/i.test(logged.detailText),
      "the generic power fallback text must not be what the guesser sees"
    );

    // The revealed letter really is the secret's letter at that position --
    // a log line that reported the wrong tile would be worse than none.
    assert.strictEqual(
      state.secret[pos].toUpperCase(),
      letter.toUpperCase(),
      "the logged letter matches the secret at the logged position"
    );
  }

  // Every position already known green: apply() refuses, so the pick is
  // rejected outright and nothing is logged (the player picks another card).
  {
    const state = makeState({
      history: [{ guess: "CRANE", fbGuesser: ["🟩", "🟩", "🟩", "🟩", "🟩"] }]
    });
    const option = powerOption("revealGreen", 1);
    const choice = { ownerUserId: "guesser-id", role: "guesser", threshold: 1, tier: 1 };
    const applied = applyChoice(state, option, choice, null, "room-1", stubIo(), {}, null);
    assert.strictEqual(applied, false, "with nothing left to reveal the pick is rejected");
    assert.strictEqual(
      state.powerChoice.resolutionLog.length,
      0,
      "a rejected pick writes no log line"
    );
  }

  console.log("PASS peekLetterRewardLog: the Peek Letter reward reports the letter and position it revealed in the action log, and a pick with nothing left to reveal is still rejected without logging");
}

module.exports = { run };

if (require.main === module) {
  run();
}
