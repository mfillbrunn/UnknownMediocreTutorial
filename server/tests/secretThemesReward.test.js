// Regression test for the Secret Themes guesser reward (Rare tier): reads
// the categories the secret belongs to at the moment it is taken, one time
// per round, and deliberately does NOT follow a later New secret.
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const engine = require("../powers/powerEngineServer.js");
require("../powers/powers/secretThemesServer.js");
const { guesserRewardPool } = require("../power-choice/powerChoiceServer");
const { themeLabelsForWord, MAX_THEMES } = require("../utils/secretThemes");
const { clearRoundPowerActivity } = require("../utils/clearRoundPowerActivity");

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
    history: [],
    powers: {},
    ...overrides
  };
}

function run() {
  // Every secret the game can actually pick resolves to at least one
  // label -- otherwise the card could be offered and then reveal nothing.
  {
    const secrets = fs
      .readFileSync(path.join(__dirname, "..", "wordlists", "allowed_secrets.txt"), "utf8")
      .split(/\r?\n/)
      .map(word => word.trim())
      .filter(Boolean);
    assert.ok(secrets.length > 0, "the secret list should not be empty");
    const uncovered = secrets.filter(word => themeLabelsForWord(word).length === 0);
    assert.deepStrictEqual(uncovered, [], "every legal secret must map to at least one theme");
    const overCap = secrets.filter(word => themeLabelsForWord(word).length > MAX_THEMES);
    assert.deepStrictEqual(overCap, [], `no secret may reveal more than ${MAX_THEMES} themes`);
  }

  // Flavor themes outrank the utility ones, so the most telling categories
  // are the ones that survive the cap.
  {
    assert.deepStrictEqual(themeLabelsForWord("crane"), ["Animal", "Things & Ideas"]);
    assert.deepStrictEqual(themeLabelsForWord("CRANE"), ["Animal", "Things & Ideas"], "lookup is case-insensitive");
    assert.deepStrictEqual(themeLabelsForWord("zzzzz"), [], "an unknown word reveals nothing");
    assert.deepStrictEqual(themeLabelsForWord(""), [], "an empty secret reveals nothing");
  }

  // Fires once, snapshotting the labels onto state for the readout tile
  // and the resolution log.
  {
    const state = makeState();
    const io = stubIo();
    const result = engine.applyPower("secretThemes", state, {}, "room-1", io);
    assert.notStrictEqual(result, false, "a fresh reading should fire");
    assert.strictEqual(state.powers.secretThemesUsed, true);
    assert.deepStrictEqual(state.powers.secretThemesRevealed, ["Animal", "Things & Ideas"]);
    assert.ok(
      io.emitted.some(entry => entry.event === "powerUsed" && entry.payload?.type === "secretThemes"),
      "announces itself as used"
    );
  }

  // One reading only: a second call refuses rather than re-reading.
  {
    const state = makeState({
      secret: "PIZZA",
      powers: { secretThemesUsed: true, secretThemesRevealed: ["Animal", "Things & Ideas"] }
    });
    const result = engine.applyPower("secretThemes", state, {}, "room-1", stubIo());
    assert.strictEqual(result, false, "an already-used reading must refuse to fire again");
    assert.deepStrictEqual(
      state.powers.secretThemesRevealed,
      ["Animal", "Things & Ideas"],
      "the original reading is left untouched"
    );
  }

  // The whole point of "current secret, not continuously": once the
  // Secretkeeper swaps to a New secret, nothing recomputes the labels.
  {
    const state = makeState({ secret: "PIZZA" });
    engine.applyPower("secretThemes", state, {}, "room-1", stubIo());
    const revealed = state.powers.secretThemesRevealed;
    assert.deepStrictEqual(revealed, ["Food", "Things & Ideas"]);

    state.secret = "TIGER";
    assert.deepStrictEqual(
      state.powers.secretThemesRevealed,
      revealed,
      "a new secret must not update an already-taken reading"
    );
  }

  // A secret with no themes can't be read, so the card refuses instead of
  // burning itself on an empty reveal.
  {
    const state = makeState({ secret: "ZZZZZ" });
    const result = engine.applyPower("secretThemes", state, {}, "room-1", stubIo());
    assert.strictEqual(result, false, "an unreadable secret must not consume the card");
    assert.strictEqual(state.powers.secretThemesUsed, undefined);
  }

  // Round-scoped: the next round has its own secret, so both the reading
  // and the used flag reset with every other round-scoped power result.
  {
    const state = makeState({
      powers: { secretThemesUsed: true, secretThemesRevealed: ["Animal"] },
      activePowers: []
    });
    clearRoundPowerActivity(state);
    assert.strictEqual(state.powers.secretThemesUsed, false, "the card is available again next round");
    assert.strictEqual(state.powers.secretThemesRevealed, null, "last round's reading does not carry over");
  }

  // Offered as a Rare guesser reward at every quest milestone.
  {
    for (const tier of [1, 2, 3]) {
      const pool = guesserRewardPool(tier);
      const option = pool.find(entry => entry.powerId === "secretThemes");
      assert.ok(option, `secretThemes is offered in the guesser reward pool at tier ${tier}`);
      assert.strictEqual(option.tier, 2, "secretThemes is Rare (tier 2)");
    }
  }

  console.log("PASS secretThemesReward: Secret Themes reads the current secret's categories once, refuses to re-read or follow a New secret, resets each round, and is offered as a Rare guesser reward");
}

module.exports = { run };

if (require.main === module) {
  run();
}
