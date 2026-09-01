// Regression tests for the Fully Deterministic Daily Challenge's config
// generator (REFINEMENT_SPEC sections 2 and 8): every player attempting a
// given date must get an identical configuration, every field is drawn
// from its own namespaced RNG stream so a new field can't shift an
// existing one, and the public API's whitelist never leaks a hidden
// server-only answer.
const assert = require("assert");
const { getDailyConfig } = require("../utils/dailyConfig");
const { buildPublicDailyView } = require("../utils/dailyPublicView");

const S = ["APPLE", "GRAPE", "MANGO", "PEACH", "LEMON", "BERRY", "MELON", "CRANE", "SLATE", "TRACE"];
const G = [...S, "STARE", "PLAYA", "CHALK", "RAMEN", "WREAK", "OVARY"];

const SAMPLE_DATES = Array.from({ length: 40 }, (_, i) =>
  `2028-${String(1 + Math.floor(i / 28)).padStart(2, "0")}-${String(1 + (i % 28)).padStart(2, "0")}`
);

function run() {
  // 1. Same date -> deeply identical config, every time, for anyone.
  const a = getDailyConfig("2026-08-27", S, G);
  const b = getDailyConfig("2026-08-27", S, G);
  const c = getDailyConfig("2026-08-27", S, G);
  assert.deepStrictEqual(a, b, "same date must produce a deeply identical config");
  assert.deepStrictEqual(a, c, "repeated calls must stay stable, not just the first two");

  // 2. Every day now always plays both sides.
  const modesSeen = new Set(SAMPLE_DATES.map(date => getDailyConfig(date, S, G).playMode));
  assert.deepStrictEqual([...modesSeen], ["both"], "playMode must always be 'both' now -- no day rolls a single-side challenge");

  for (const date of SAMPLE_DATES) {
    const cfg = getDailyConfig(date, S, G);

    assert.strictEqual(cfg.playMode, "both", `${date}: playMode must always be 'both'`);
    assert.ok(["setter", "guesser"].includes(cfg.firstRole), `${date}: firstRole must always be a valid role`);
    assert.ok([1, 2, 3].includes(cfg.aiDifficulty), `${date}: aiDifficulty must be 1/2/3`);

    // 3. Human opening values are always predefined -- exactly one 5-letter
    // word, never null and never an array -- for both roles, every day.
    for (const field of ["humanOpeningGuess", "humanOpeningSecret"]) {
      const value = cfg[field];
      assert.ok(
        typeof value === "string" && /^[A-Z]{5}$/.test(value),
        `${date}: ${field} must always be a single 5-letter uppercase word, got ${JSON.stringify(value)}`
      );
    }

    // AI opening guess/secret are always concrete (deterministic) words
    // when a word list is supplied.
    assert.ok(/^[A-Z]{5}$/.test(cfg.aiOpeningGuess), `${date}: aiOpeningGuess must be a real word`);
    assert.ok(/^[A-Z]{5}$/.test(cfg.aiOpeningSecret), `${date}: aiOpeningSecret must be a real word`);

    // A predefined opening word must never be identical to the OPPOSING
    // side's fixed opening word for that same round -- that would resolve
    // the round in an unplayed, unwinnable/unloseable instant.
    if (cfg.humanOpeningGuess) {
      assert.notStrictEqual(
        cfg.humanOpeningGuess,
        cfg.aiOpeningSecret,
        `${date}: predefined humanOpeningGuess must never equal aiOpeningSecret`
      );
    }
    if (cfg.humanOpeningSecret) {
      assert.notStrictEqual(
        cfg.humanOpeningSecret,
        cfg.aiOpeningGuess,
        `${date}: predefined humanOpeningSecret must never equal aiOpeningGuess`
      );
    }

    // Reward offers: exactly 3 milestones per role, each with exactly 3
    // unique option ids and one rarity.
    for (const role of ["setter", "guesser"]) {
      const offers = cfg.rewardOffers[role];
      assert.strictEqual(offers.length, 3, `${date}: ${role} must have exactly 3 reward offers`);
      for (const offer of offers) {
        assert.ok(["common", "rare", "legendary"].includes(offer.rarity), `${date}: reward offer rarity must be valid`);
        assert.strictEqual(offer.optionIds.length, 3, `${date}: every reward offer must have exactly 3 option ids`);
        assert.strictEqual(
          new Set(offer.optionIds).size,
          3,
          `${date}: a reward offer's 3 option ids must be unique`
        );
      }
      assert.strictEqual(cfg.aiPickIndex[role].length, 3, `${date}: aiPickIndex must have one entry per milestone`);
      for (const index of cfg.aiPickIndex[role]) {
        assert.ok(index >= 0 && index <= 2, `${date}: aiPickIndex entries must be a valid 0-2 card index`);
      }
    }

    // Quests: 2 rounds precomputed, 3 quest objects each, every quest a
    // full object (not just a bare type string).
    assert.strictEqual(cfg.questsByRound.length, 2, `${date}: questsByRound must precompute both possible rounds`);
    for (const roundQuests of cfg.questsByRound) {
      assert.strictEqual(roundQuests.length, 3, `${date}: each round must precompute exactly 3 quests`);
      for (const quest of roundQuests) {
        assert.ok(quest && typeof quest.type === "string", `${date}: every quest must be a full object with a type`);
        assert.ok(typeof quest.description === "string" && quest.description.length > 0, `${date}: every quest must have a description`);
      }
    }
  }

  // 4. Public API view never exposes the AI Secretkeeper's actual secret,
  // or any hidden future quest/reward detail -- only the explicit
  // whitelist.
  const cfgForView = getDailyConfig("2026-08-27", S, G);
  const view = buildPublicDailyView(cfgForView);
  const allowedKeys = new Set([
    "date", "playMode", "firstRole", "aiDifficulty",
    "humanOpeningGuess", "humanOpeningSecret", "aiOpeningGuess",
    "rewardsFixed", "refreshDisabled"
  ]);
  for (const key of Object.keys(view)) {
    assert.ok(allowedKeys.has(key), `public daily view must never include an unexpected field: ${key}`);
  }
  assert.ok(!("aiOpeningSecret" in view), "public daily view must never expose aiOpeningSecret");
  assert.ok(!("questsByRound" in view), "public daily view must never expose questsByRound");
  assert.ok(!("rewardOffers" in view), "public daily view must never expose rewardOffers");
  assert.ok(!("aiPickIndex" in view), "public daily view must never expose aiPickIndex");
  assert.strictEqual(view.aiOpeningGuess, cfgForView.aiOpeningGuess, "aiOpeningGuess IS safe to expose and must be present");

  // 5. Namespace isolation: fields that don't depend on the word lists at
  // all (mode/first-role/difficulty/quests/rewards) must be unaffected by
  // which word lists are passed in -- proving those streams are truly
  // independent of the streams that DO consume the lists (opening words).
  const withLists = getDailyConfig("2026-08-27", S, G);
  const withoutLists = getDailyConfig("2026-08-27", null, null);
  assert.strictEqual(withLists.playMode, withoutLists.playMode, "playMode must not depend on word lists");
  assert.strictEqual(withLists.firstRole, withoutLists.firstRole, "firstRole must not depend on word lists");
  assert.strictEqual(withLists.aiDifficulty, withoutLists.aiDifficulty, "aiDifficulty must not depend on word lists");
  assert.deepStrictEqual(withLists.rewardOffers, withoutLists.rewardOffers, "rewardOffers must not depend on word lists");
  assert.deepStrictEqual(withLists.aiPickIndex, withoutLists.aiPickIndex, "aiPickIndex must not depend on word lists");
  assert.deepStrictEqual(withLists.questsByRound, withoutLists.questsByRound, "questsByRound must not depend on word lists");

  console.log(`PASS dailyChallengeConfig: ${SAMPLE_DATES.length} dates deterministic/valid, playMode always 'both' with both opening words always predefined, public view whitelist enforced, namespace isolation holds`);
}

module.exports = { run };

if (require.main === module) {
  run();
}
