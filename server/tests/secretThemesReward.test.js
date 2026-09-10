// Regression test for the Secret Themes guesser power (Legendary Power
// Choice reward): an always-on readout of the single most specific category the
// CURRENT secret belongs to, re-read every turn start so it tracks a
// mid-round secret swap instead of going stale.
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const engine = require("../powers/powerEngineServer.js");
require("../powers/powers/secretThemesServer.js");
const { guesserRewardPool } = require("../power-choice/powerChoiceServer");
const { topThemeLabelForWord } = require("../utils/secretThemes");
const { clearRoundPowerActivity } = require("../utils/clearRoundPowerActivity");
const { buildSafeStateForPlayer } = require("../utils/safeState");

function makeState(overrides = {}) {
  return {
    secret: "CRANE",
    phase: "normal",
    guesser: "g1",
    activePowers: ["secretThemes"],
    history: [],
    powers: {},
    ...overrides
  };
}

const turnStart = (state, role = state.guesser) =>
  engine.powers.secretThemes.turnStart(state, role, "room-1", null);

function run() {
  // Every secret the game can actually pick resolves to a label --
  // otherwise the readout would sit blank for a whole round.
  {
    const secrets = fs
      .readFileSync(path.join(__dirname, "..", "wordlists", "allowed_secrets.txt"), "utf8")
      .split(/\r?\n/)
      .map(word => word.trim())
      .filter(Boolean);
    assert.ok(secrets.length > 0, "the secret list should not be empty");
    const uncovered = secrets.filter(word => !topThemeLabelForWord(word));
    assert.deepStrictEqual(uncovered, [], "every legal secret must map to a theme label");
  }

  // Exactly one label, and a flavor category outranks a utility one so the
  // most telling category is the one shown.
  {
    assert.strictEqual(topThemeLabelForWord("crane"), "Animal", "flavor beats the utility 'Things & Ideas'");
    assert.strictEqual(topThemeLabelForWord("CRANE"), "Animal", "lookup is case-insensitive");
    assert.strictEqual(topThemeLabelForWord("about"), "General", "a utility label is used when nothing better exists");
    assert.strictEqual(topThemeLabelForWord("zzzzz"), null, "an unknown word reads nothing");
    assert.strictEqual(topThemeLabelForWord(""), null, "an empty secret reads nothing");
  }

  // Reads on the guesser's turn start.
  {
    const state = makeState();
    turnStart(state);
    assert.strictEqual(state.powers.secretThemesLabel, "Animal");
  }

  // The whole point of making it continuous: a New secret is picked up on
  // the next turn instead of leaving a stale reading on screen. A label
  // that changes is the guesser's tell that a swap happened.
  {
    const state = makeState({ secret: "PIZZA" });
    turnStart(state);
    assert.strictEqual(state.powers.secretThemesLabel, "Food");

    state.secret = "TIGER";
    turnStart(state);
    assert.strictEqual(state.powers.secretThemesLabel, "Animal", "the reading follows the swapped secret");
  }

  // Only for the guesser, only while granted, only in normal play.
  {
    const setterTurn = makeState();
    turnStart(setterTurn, "s1");
    assert.strictEqual(setterTurn.powers.secretThemesLabel, undefined, "does not read on the setter's turn");

    const ungranted = makeState({ activePowers: [] });
    turnStart(ungranted);
    assert.strictEqual(ungranted.powers.secretThemesLabel, undefined, "does not read without the grant");

    const offPhase = makeState({ phase: "reveal" });
    turnStart(offPhase);
    assert.strictEqual(offPhase.powers.secretThemesLabel, undefined, "does not read outside normal play");
  }

  // Round-scoped value (the grant itself persists and re-reads next round).
  {
    const state = makeState({ powers: { secretThemesLabel: "Animal" } });
    clearRoundPowerActivity(state);
    assert.strictEqual(state.powers.secretThemesLabel, null, "last round's reading does not carry over");
  }

  // Private to the guesser: the setter must not receive the readout.
  // state.players is keyed by userId (see safeState's viewerRole lookup) --
  // an array here would silently resolve to no role at all and make both
  // assertions below pass for the wrong reason.
  {
    const base = () => makeState({
      setter: "s1",
      players: { g1: { role: "guesser" }, s1: { role: "setter" } },
      powers: { secretThemesLabel: "Animal" }
    });
    assert.strictEqual(
      buildSafeStateForPlayer(base(), "g1", []).powers.secretThemesLabel,
      "Animal",
      "the guesser receives their own readout"
    );
    assert.strictEqual(
      buildSafeStateForPlayer(base(), "s1", []).powers.secretThemesLabel,
      undefined,
      "the setter never receives the guesser's readout"
    );
  }

  // Offered as a Legendary guesser reward at every quest milestone.
  {
    for (const tier of [1, 2, 3]) {
      const pool = guesserRewardPool(tier);
      const option = pool.find(entry => entry.powerId === "secretThemes");
      assert.ok(option, `secretThemes is offered in the guesser reward pool at tier ${tier}`);
      assert.strictEqual(option.tier, 3, "secretThemes is Legendary (tier 3)");
      assert.ok(/from now on/i.test(option.description), "the card reads as a standing unlock, not a one-off");
    }
  }

  console.log("PASS secretThemesReward: Secret Themes shows the current secret's category every turn, follows a swapped secret, stays private to the guesser, resets each round, and is offered as a Legendary guesser reward");
}

module.exports = { run };

if (require.main === module) {
  run();
}
