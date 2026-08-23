// Regression test (REFINEMENT_SPEC section 7): Informant (revealLocation)
// must deactivate the moment a round ends, not just at the next role swap.
// clearRoundPowerActivity(state) is the central finalizer every round-ending
// path calls via endGame() (gameOver.js) -- guess-limit, forfeit/disconnect,
// AI resolution, and timeout all route through the same function, so
// exercising it directly here covers all of those paths at once.
const assert = require("assert");
const { clearRoundPowerActivity } = require("../utils/clearRoundPowerActivity");
const { initializeRound } = require("../power-choice/powerChoiceServer");

function makeState() {
  return {
    gameMode: "powerChoice",
    isTutorial: false,
    roundIndex: 0,
    setter: "playerA",
    guesser: "playerB",
    activePowers: ["revealLocation"],
    extraConstraints: [],
    history: [],
    powerChoice: null,
    powers: {
      revealLocationPeekIndex: 2,
      revealLocationPeek: { index: 2, letter: "A" },
      powerChoicePersistentGrants: {
        setter: [],
        guesser: [{ powerId: "revealLocation", userId: "playerB" }]
      }
    }
  };
}

function run() {
  // Round 1: playerB (guesser) has an active Informant peek.
  const state = makeState();
  assert.strictEqual(state.powers.revealLocationPeek.letter, "A", "sanity: peek is set before round end");
  assert.ok(
    state.powers.powerChoicePersistentGrants.guesser.some(g => g.powerId === "revealLocation"),
    "sanity: grant is present before round end"
  );

  // The round ends -- e.g. playerB guessed the secret. endGame() (gameOver.js)
  // calls clearRoundPowerActivity(state) for every round-ending path.
  clearRoundPowerActivity(state);

  assert.strictEqual(state.powers.revealLocationPeek, null, "cached peek is cleared on round end");
  assert.strictEqual(state.powers.revealLocationPeekIndex, null, "cached peek index is cleared on round end");
  assert.ok(
    !state.powers.powerChoicePersistentGrants.guesser.some(g => g.powerId === "revealLocation"),
    "the persistent grant itself is cleared on round end, not just the cached peek"
  );
  assert.ok(
    !state.activePowers.includes("revealLocation"),
    "revealLocation is dropped from activePowers immediately at round end"
  );

  // Round 2 initializes (even with playerB remaining the guesser, since a
  // round end -- not just a role swap -- is what ends Informant now).
  state.roundIndex = 1;
  initializeRound(state);

  assert.ok(
    !state.activePowers.includes("revealLocation"),
    "Informant does not come back when round 2 initializes"
  );

  console.log("PASS informantRoundScope: Informant deactivates on round end, stays inactive into round 2");
}

module.exports = { run };

if (require.main === module) {
  run();
}
