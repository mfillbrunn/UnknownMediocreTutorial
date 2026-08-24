// Regression test: Bet Miss ("betMiss") must never be offered to a new
// player through any generation path -- Power Choice reward pools (used by
// normal, AI, tutorial, and Daily Challenge matches alike), the random
// power-tier pools, or the Daily Challenge starting-loadout picker. A
// guarded legacy handler may still resolve an already-active old game
// (see server/powers/powers/betMissServer.js), but nothing here should be
// able to hand a fresh player the id "betMiss" ever again.
const assert = require("assert");
const {
  setterRewardPool,
  guesserRewardPool,
  fixedOptions
} = require("../power-choice/powerChoiceServer");
const { RANDOM_POWER_POOLS, POWER_TIERS } = require("../power-choice/powerTiers");
const { getDailyConfig } = require("../utils/dailyConfig");

function run() {
  const rewardOptions = [
    ...setterRewardPool(),
    ...[1, 2, 3].flatMap(tier => guesserRewardPool(tier)),
    ...fixedOptions("guesser", 2)
  ];
  assert.ok(rewardOptions.length > 0, "reward pools returned no options to check");

  for (const option of rewardOptions) {
    const id = option.kind === "power" ? option.powerId : option.id;
    assert.notStrictEqual(
      id,
      "betMiss",
      "Bet Miss must not appear in any Power Choice reward pool (normal/AI/tutorial/Daily Challenge all draw from this)"
    );
  }

  assert.ok(
    !RANDOM_POWER_POOLS.guesser.includes("betMiss"),
    "Bet Miss must not appear in RANDOM_POWER_POOLS.guesser"
  );
  assert.ok(
    !("betMiss" in POWER_TIERS),
    "Bet Miss must not have a live tier/role entry in POWER_TIERS"
  );

  // Daily Challenge's deterministic starting loadout -- sample several
  // dates since the picker is seeded per-date, not a single fixed list.
  const sampleDates = [
    "2026-01-01", "2026-03-15", "2026-06-30", "2026-09-09", "2026-12-25"
  ];
  for (const dateStr of sampleDates) {
    const config = getDailyConfig(dateStr, null, null);
    assert.ok(
      !config.guesserPowers.includes("betMiss") && !config.setterPowers.includes("betMiss"),
      `Bet Miss must not appear in the Daily Challenge (${dateStr}) starting loadout`
    );
  }

  console.log(
    `PASS betMissExcluded: ${rewardOptions.length} reward options, RANDOM_POWER_POOLS, POWER_TIERS, and ${sampleDates.length} Daily Challenge dates all exclude Bet Miss`
  );
}

module.exports = { run };

if (require.main === module) {
  run();
}
