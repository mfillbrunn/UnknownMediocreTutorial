// Regression test for Theme Dossier (secretThemesReveal): the one-round,
// all-themes counterpart to the Secret Themes guesser power. Same
// re-read-every-turn shape as secretThemesReward.test.js's Secret Themes
// coverage, but reveals EVERY theme the secret belongs to instead of just
// the single most specific one, is offered as a Rare (not Legendary)
// reward, and its grant does not survive past the round it was picked in.
//
// Also covers the mutual exclusion the reward was built with: never offer
// this card to a guesser who already holds the persistent Secret Themes
// grant, since that grant already gives a standing readout for the rest
// of the match and this one-shot reveal would just add strictly more
// information on top for the same card slot.
const assert = require("assert");
const engine = require("../powers/powerEngineServer.js");
require("../powers/powers/secretThemesRevealServer.js");
const {
  guesserRewardPool,
  optionApplicable,
  powerOption
} = require("../power-choice/powerChoiceServer");
const { allThemeLabelsForWord, topThemeLabelForWord } = require("../utils/secretThemes");
const { clearRoundPowerActivity } = require("../utils/clearRoundPowerActivity");
const { buildSafeStateForPlayer } = require("../utils/safeState");

function makeState(overrides = {}) {
  return {
    secret: "CRANE",
    phase: "normal",
    guesser: "g1",
    activePowers: ["secretThemesReveal"],
    history: [],
    powers: {},
    ...overrides
  };
}

const turnStart = (state, role = state.guesser) =>
  engine.powers.secretThemesReveal.turnStart(state, role, "room-1", null);

function grantState(overrides = {}) {
  return makeState({
    powers: {
      powerChoicePersistentGrants: { setter: [], guesser: [] }
    },
    ...overrides
  });
}

function run() {
  // Reveals every theme, not just the top one -- and the top one is always
  // included, first, since flavor labels are still listed before utility.
  {
    const all = allThemeLabelsForWord("abbey");
    assert.ok(all.length > 1, "a multi-theme word should surface more than one label");
    assert.strictEqual(all[0], topThemeLabelForWord("abbey"), "the single-label pick still leads the full list");
  }
  assert.deepStrictEqual(allThemeLabelsForWord("zzzzz"), [], "an unknown word reads nothing");
  assert.deepStrictEqual(allThemeLabelsForWord(""), [], "an empty secret reads nothing");

  // Reads on the guesser's turn start, as an array.
  {
    const state = makeState();
    turnStart(state);
    assert.ok(Array.isArray(state.powers.secretThemesRevealLabels));
    assert.ok(state.powers.secretThemesRevealLabels.includes("Animal"));
  }

  // Tracks a mid-round secret swap instead of going stale, same as Secret
  // Themes.
  {
    const state = makeState({ secret: "PIZZA" });
    turnStart(state);
    assert.ok(state.powers.secretThemesRevealLabels.includes("Food"));

    state.secret = "TIGER";
    turnStart(state);
    assert.ok(state.powers.secretThemesRevealLabels.includes("Animal"), "the reading follows the swapped secret");
    assert.ok(!state.powers.secretThemesRevealLabels.includes("Food"), "the stale reading does not linger");
  }

  // Only for the guesser, only while granted, only in normal play.
  {
    const setterTurn = makeState();
    turnStart(setterTurn, "s1");
    assert.strictEqual(setterTurn.powers.secretThemesRevealLabels, undefined, "does not read on the setter's turn");

    const ungranted = makeState({ activePowers: [] });
    turnStart(ungranted);
    assert.strictEqual(ungranted.powers.secretThemesRevealLabels, undefined, "does not read without the grant");

    const offPhase = makeState({ phase: "reveal" });
    turnStart(offPhase);
    assert.strictEqual(offPhase.powers.secretThemesRevealLabels, undefined, "does not read outside normal play");
  }

  // Round-scoped: unlike Secret Themes' grant (which survives round end
  // and just re-reads next round), Theme Dossier's grant itself must be
  // stripped at round end -- it does not carry into round two.
  {
    const state = grantState({
      powers: {
        secretThemesRevealLabels: ["Animal", "Nature"],
        powerChoicePersistentGrants: {
          setter: [],
          guesser: [{ powerId: "secretThemesReveal", userId: "g1" }]
        }
      }
    });
    clearRoundPowerActivity(state);
    assert.strictEqual(state.powers.secretThemesRevealLabels, null, "last round's reading does not carry over");
    assert.deepStrictEqual(
      state.powers.powerChoicePersistentGrants.guesser,
      [],
      "the grant itself is stripped at round end, unlike Secret Themes'"
    );
    assert.ok(
      !state.activePowers.includes("secretThemesReveal"),
      "activePowers no longer carries the round-scoped grant either"
    );
  }

  // Private to the guesser: the setter must not receive the readout.
  {
    const base = () => makeState({
      setter: "s1",
      players: { g1: { role: "guesser" }, s1: { role: "setter" } },
      powers: { secretThemesRevealLabels: ["Animal", "Nature"] }
    });
    assert.deepStrictEqual(
      buildSafeStateForPlayer(base(), "g1", []).powers.secretThemesRevealLabels,
      ["Animal", "Nature"],
      "the guesser receives their own readout"
    );
    assert.strictEqual(
      buildSafeStateForPlayer(base(), "s1", []).powers.secretThemesRevealLabels,
      undefined,
      "the setter never receives the guesser's readout"
    );
  }

  // Offered as a Rare guesser reward, phrased as this-round-only rather
  // than a standing "from now on" unlock.
  {
    for (const tier of [1, 2, 3]) {
      const pool = guesserRewardPool(tier);
      const option = pool.find(entry => entry.powerId === "secretThemesReveal");
      assert.ok(option, `secretThemesReveal is offered in the guesser reward pool at tier ${tier}`);
      assert.strictEqual(option.tier, 2, "secretThemesReveal is Rare (tier 2), one tier below Secret Themes");
      assert.ok(/this round only/i.test(option.description), "the card reads as round-scoped, not a standing unlock");
    }
  }

  // Mutual exclusion: never offered to a guesser who already holds the
  // persistent Secret Themes grant.
  {
    const withSecretThemes = grantState({
      powers: {
        powerChoicePersistentGrants: {
          setter: [],
          guesser: [{ powerId: "secretThemes", userId: "g1" }]
        }
      }
    });
    assert.strictEqual(
      optionApplicable(withSecretThemes, powerOption("secretThemesReveal")),
      false,
      "Theme Dossier must not be offered once the persistent Secret Themes grant is already active"
    );

    // A different player newly holding the guesser seat hasn't earned
    // either grant, so it should still be offered to them.
    const differentGuesser = grantState({
      guesser: "g2",
      powers: {
        powerChoicePersistentGrants: {
          setter: [],
          guesser: [{ powerId: "secretThemes", userId: "g1" }]
        }
      }
    });
    assert.strictEqual(
      optionApplicable(differentGuesser, powerOption("secretThemesReveal")),
      true,
      "a different guesser who never earned Secret Themes should still be offered Theme Dossier"
    );

    // Re-granting the same one-shot reveal to a guesser who already holds
    // it this round would also be a no-op -- same "already unlocked"
    // guard as the other three PERSISTENT_POWER_IDS cases.
    const alreadyHasReveal = grantState({
      powers: {
        powerChoicePersistentGrants: {
          setter: [],
          guesser: [{ powerId: "secretThemesReveal", userId: "g1" }]
        }
      }
    });
    assert.strictEqual(
      optionApplicable(alreadyHasReveal, powerOption("secretThemesReveal")),
      false,
      "Theme Dossier must not be offered twice to the same guesser in one round"
    );

    // The reverse direction was NOT asked for: holding the one-round
    // Theme Dossier grant must not block the persistent Secret Themes
    // card from still being offered.
    const withReveal = grantState({
      powers: {
        powerChoicePersistentGrants: {
          setter: [],
          guesser: [{ powerId: "secretThemesReveal", userId: "g1" }]
        }
      }
    });
    assert.strictEqual(
      optionApplicable(withReveal, powerOption("secretThemes")),
      true,
      "holding Theme Dossier must not block Secret Themes from being offered"
    );
  }

  console.log("PASS secretThemesRevealReward: Theme Dossier reveals every theme of the current secret each turn, follows a swapped secret, stays private to the guesser, does not survive round end unlike Secret Themes, and is never offered alongside the persistent Secret Themes grant");
}

module.exports = { run };

if (require.main === module) {
  run();
}
