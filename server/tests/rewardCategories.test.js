// Regression test: every reward option Power Choice can actually offer must
// map to a real category (see server/power-choice/rewardCategories.js).
// "utility" is a neutral fallback only -- if a known reward silently lands
// there, this test is the thing that's supposed to catch it.
const assert = require("assert");
const {
  setterRewardPool,
  guesserRewardPool,
  fixedOptions
} = require("../power-choice/powerChoiceServer");

function run() {
  const options = [
    ...setterRewardPool(),
    ...[1, 2, 3].flatMap(tier => guesserRewardPool(tier)),
    ...fixedOptions("guesser", 2)
  ];

  assert.ok(options.length > 0, "reward pools returned no options to check");

  for (const option of options) {
    const label = option.kind === "power" ? option.powerId : option.id;
    assert.ok(
      option.category && option.category !== "utility",
      `reward "${label}" has no real category (got ${JSON.stringify(option.category)})`
    );
  }

  console.log(`PASS rewardCategories: ${options.length} reward options all have a real category`);
}

module.exports = { run };

if (require.main === module) {
  run();
}
