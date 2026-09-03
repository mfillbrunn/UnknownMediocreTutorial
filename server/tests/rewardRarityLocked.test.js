// Regression test: Power Choice reward offers must roll rarity ONCE per
// offering, then draw all `limit` displayed cards from that same rarity --
// never a mix of Common/Rare/Legendary in one offer. Also pins down the
// exact tier composition of the setter's real reward pool, since that's
// data easy to accidentally miscount when re-tiering cards by hand.
const assert = require("assert");
// Registers "confuseColors" on the shared power engine -- powerChoiceServer's
// eligibility check requires a real registered apply() before it will even
// consider a "power" kind option, and nothing else in this test's require
// graph loads server/index.js's big power-registration list.
require("../powers/powers/confuseColorsServer");
const {
  rewardPickRarityOptions,
  setterRewardPool,
  guesserRewardPool
} = require("../power-choice/powerChoiceServer");

// A real, always-cheaply-eligible power (fresh state, never used) repeated
// under fake ids/tiers -- lets the test control exactly how many cards
// exist per tier without having to satisfy every real card's own
// eligibility precondition (a fadeable green, a smudgeable yellow, etc.).
function fakeOptionsByTier(perTier = 3) {
  const options = [];
  for (const tier of [1, 2, 3]) {
    for (let n = 0; n < perTier; n++) {
      options.push({
        id: `fake-tier${tier}-${n}`,
        kind: "power",
        powerId: "confuseColors",
        tier
      });
    }
  }
  return options;
}

function run() {
  const state = { gameMode: "powerChoice", powers: {} };
  const options = fakeOptionsByTier(3);

  // Milestone 3's probabilities (0.30/0.30/0.40) give every tier a real
  // chance -- run enough draws that seeing all three rarities at least
  // once is a near-certainty if the roll is genuinely randomized per tier.
  const seenTiers = new Set();
  for (let i = 0; i < 300; i++) {
    const picked = rewardPickRarityOptions(state, options, 3, 3, [], "setter");
    assert.strictEqual(picked.length, 3, "a full-tier draw returns exactly `limit` cards");

    const tiers = new Set(picked.map(o => o.tier));
    assert.strictEqual(tiers.size, 1, `all ${picked.length} cards in one offer must share a single rarity, got tiers ${[...tiers]}`);

    const ids = new Set(picked.map(o => o.id));
    assert.strictEqual(ids.size, picked.length, "cards within one offer must be unique");

    for (const option of picked) {
      assert.ok(option.rarity && option.rarityLabel && option.rarityMetal, "each picked card is decorated with rarity metadata");
    }

    seenTiers.add([...tiers][0]);
  }
  assert.strictEqual(seenTiers.size, 3, `expected all 3 rarities to come up across 300 rolls, only saw tiers ${[...seenTiers]}`);

  // A rarity short on eligible cards (fewer than `limit`) is excluded from
  // the roll entirely, in favor of a rarity that CAN fill every slot --
  // never rolled and then padded out with a second rarity's cards.
  {
    const shortState = { gameMode: "powerChoice", powers: {} };
    const shortOptions = [
      ...fakeOptionsByTier(3).filter(o => o.tier !== 1),
      { id: "fake-tier1-only", kind: "power", powerId: "confuseColors", tier: 1 }
    ];
    for (let i = 0; i < 50; i++) {
      const picked = rewardPickRarityOptions(shortState, shortOptions, 1, 3, [], "setter");
      assert.strictEqual(picked.length, 3, "the short tier must not shrink the offer -- a full rarity fills it instead");
      const tiers = new Set(picked.map(o => o.tier));
      assert.strictEqual(tiers.size, 1, "still exactly one rarity per offer");
      assert.ok(!tiers.has(1), "tier 1 has only 1 eligible card here, so it can never be the rolled rarity for a full 3-card draw");
    }
  }

  // Pin down the exact tier composition specified for the Secretkeeper's
  // reward pool -- catches an accidental mis-tier the next time a card
  // moves between Common/Rare/Legendary.
  {
    const pool = setterRewardPool();
    const byTier = { 1: [], 2: [], 3: [] };
    for (const option of pool) byTier[option.tier].push(option.title);

    assert.deepStrictEqual(
      new Set(byTier[1]),
      new Set(["Erase Two Clues", "Erase a Yellow", "Yellow Smudge", "Trade a Yellow", "Blue Mode", "Count Only", "Fake Feedback", "Feedback Lie", "Force Timer"]),
      "Common tier membership"
    );
    assert.deepStrictEqual(
      new Set(byTier[2]),
      new Set(["Fade a Green", "Trade a Green", "Blind Guess", "Delayed Feedback"]),
      "Rare tier membership"
    );
    assert.deepStrictEqual(
      new Set(byTier[3]),
      new Set(["Add a Point", "Blind Spot", "Vowel Refresh", "Refresh the Row"]),
      "Legendary tier membership"
    );
  }

  // Same pin-down for the Guesser's reward pool (at milestone 2, so Time
  // Rewind's tier-conditional inclusion is present too).
  {
    const pool = guesserRewardPool(2);
    const byTier = { 1: [], 2: [], 3: [] };
    for (const option of pool) byTier[option.tier].push(option.title);

    assert.deepStrictEqual(
      new Set(byTier[1]),
      new Set(["Yellow Intel", "Rule Out Two", "Peek Letter", "Silly Word", "Guess Tip"]),
      "Common tier membership"
    );
    assert.deepStrictEqual(
      new Set(byTier[2]),
      new Set(["Freeze Secret", "Time Rewind", "Secret Vowel Count", "Roulette Secret", "Recon Sweep"]),
      "Rare tier membership"
    );
    assert.deepStrictEqual(
      new Set(byTier[3]),
      new Set(["Remove a Point", "Informant", "First Letter Reveal", "Magic Mode"]),
      "Legendary tier membership"
    );
  }

  console.log("PASS rewardRarityLocked: one rarity is rolled per offering and every card in it shares that rarity, is unique, and is eligible; both pools' tier composition matches spec");
}

module.exports = { run };

if (require.main === module) {
  run();
}
