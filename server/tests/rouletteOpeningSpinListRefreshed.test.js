// Regression test: Break Cover (rouletteSecret) used during the opening
// simultaneous move -- which only a Challenge's forced power can do --
// builds its spin list while history is still empty, i.e. every secret.
// The spin applies to the Secretkeeper's next decision, after the opening
// row, so the list must be narrowed to words consistent with that row;
// otherwise the spinner mostly lands on words the server rejects.
const assert = require("assert");
const { createInitialState } = require("../core/stateFactory");
const { resolveSimultaneousRound } = require("../core/phases/simultaneous");
const { isConsistentWithHistory } = require("../game-engine/history");
const powerEngine = require("../powers/powerEngineServer");

function run() {
  const secrets = ["CRANE", "BRAVE", "GRADE", "SLATE", "PLANE", "FLAME", "SHAME", "TRADE"];
  const previous = global.ALLOWED_SECRETS;
  global.ALLOWED_SECRETS = secrets;
  try {
    const state = createInitialState();
    state.phase = "simultaneous";
    state.setter = "ai";
    state.guesser = "human";
    state.players = {
      ai: { role: "setter", userId: "ai" },
      human: { role: "guesser", userId: "human" }
    };
    state.secret = "CRANE";
    state.pendingGuess = "FLAME";
    state.simultaneousSecretSubmitted = true;
    state.simultaneousGuessSubmitted = true;
    state.powers.rouletteSecretActive = true;
    state.powers.rouletteSecretFeasible = [...secrets];

    const room = { state, playersByUserId: { ai: {}, human: {} } };
    const context = {
      io: { to: () => ({ emit: () => {} }), emit: () => {} },
      powerEngine
    };
    resolveSimultaneousRound(room, state, "room1", context);

    assert.strictEqual(state.phase, "normal", "test setup: the opening should have resolved");
    const feasible = state.powers.rouletteSecretFeasible;
    assert.ok(feasible.length > 0 && feasible.length < secrets.length, `spin list should be narrowed, got ${JSON.stringify(feasible)}`);
    for (const word of feasible) {
      assert.ok(isConsistentWithHistory(state.history, word, state), `${word} is in the spin list but breaks the opening row`);
    }
    assert.ok(feasible.includes("CRANE"), "the current secret is still legal and must stay in the list");
  } finally {
    global.ALLOWED_SECRETS = previous;
  }

  console.log("PASS rouletteOpeningSpinListRefreshed: Break Cover fired on the opening move spins only words consistent with the opening row");
}

module.exports = { run };

if (require.main === module) {
  run();
}
