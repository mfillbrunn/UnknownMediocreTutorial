// Regression test: the match summary's "Total time" (state.timeSpentMs,
// banked by bankTurnTime in core/rooms.js) used to skip the simultaneous
// opening entirely, so it never matched the per-round clocks. Each player
// is on the clock during the opening until they submit their own move.
const assert = require("assert");
const { bankTurnTime } = require("../core/rooms");

function run() {
  const realNow = Date.now;
  let now = 1_000_000;
  Date.now = () => now;
  try {
    const state = {
      phase: "simultaneous",
      setter: "S",
      guesser: "G",
      turn: null,
      simultaneousSecretSubmitted: false,
      simultaneousGuessSubmitted: false
    };

    bankTurnTime(state); // opening starts: both on the clock

    now += 4000; // setter locks in a secret after 4s
    state.simultaneousSecretSubmitted = true;
    bankTurnTime(state);

    now += 3000; // guesser sends the opening guess after 7s -> normal phase
    state.simultaneousGuessSubmitted = true;
    state.phase = "normal";
    state.turn = "G";
    bankTurnTime(state);

    now += 5000; // guesser's next guess -> setter's turn
    state.turn = "S";
    bankTurnTime(state);

    now += 2000; // setter decides -> round over
    state.phase = "gameOver";
    state.turn = null;
    bankTurnTime(state);

    assert.strictEqual(state.timeSpentMs.S, 4000 + 2000, "setter: 4s opening + 2s decision");
    assert.strictEqual(state.timeSpentMs.G, 7000 + 5000, "guesser: 7s opening + 5s guess");
    assert.deepStrictEqual(state._turnClocks, {}, "no clock may keep running once the round is over");
  } finally {
    Date.now = realNow;
  }

  console.log("PASS openingTurnTimeCounted: total time bills each player for the simultaneous opening until they submit, then per turn");
}

module.exports = { run };

if (require.main === module) {
  run();
}
