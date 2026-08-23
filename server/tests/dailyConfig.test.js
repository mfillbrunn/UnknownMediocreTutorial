// Regression test (REFINEMENT_SPEC section 8): every player attempting a
// given date's Daily Challenge must get the same authoritative
// configuration, and the server must not trust a client-supplied override
// for any of it. getDailyConfig(date, ...) is the deterministic seed this
// whole guarantee rests on (see server/utils/dailyConfig.js) -- this
// covers the seed itself; lobby.js's ADD_AI/SET_DAILY_POWERS handlers are
// what apply this same rule to the AI difficulty and power loadout on top
// of it (both recompute from getDailyConfig(action.dailyDate/date)
// instead of trusting action.difficulty/setterPowers/guesserPowers).
const assert = require("assert");
const { getDailyConfig } = require("../utils/dailyConfig");

const ALLOWED_SECRETS = ["APPLE", "GRAPE", "MANGO", "PEACH", "LEMON", "BERRY", "MELON"];
const ALLOWED_GUESSES = [...ALLOWED_SECRETS, "TRACE", "STARE", "CRANE"];

function run() {
  const dateA = "2026-08-23";
  const dateB = "2026-08-24";

  // 1. Two independent calls for the same date (standing in for two
  // different players/rooms) produce a deeply equal configuration.
  const first = getDailyConfig(dateA, ALLOWED_SECRETS, ALLOWED_GUESSES);
  const second = getDailyConfig(dateA, ALLOWED_SECRETS, ALLOWED_GUESSES);
  assert.deepStrictEqual(first, second, "same date must produce a deeply equal configuration every time");

  // 2. Repeated calls are stable -- calling it a third time doesn't drift.
  const third = getDailyConfig(dateA, ALLOWED_SECRETS, ALLOWED_GUESSES);
  assert.deepStrictEqual(first, third, "repeated calls on the same date must stay stable");

  // 3. An adjacent date produces a different configuration (the exact
  // field doesn't matter, just that the day's puzzle actually differs).
  const otherDay = getDailyConfig(dateB, ALLOWED_SECRETS, ALLOWED_GUESSES);
  assert.notDeepStrictEqual(first, otherDay, "an adjacent date must produce a different configuration");

  // aiDifficulty specifically must be one of the three valid levels and
  // stable across calls -- this is the field lobby.js's ADD_AI handler
  // uses to override any client-supplied action.difficulty.
  assert.ok([1, 2, 3].includes(first.aiDifficulty), "aiDifficulty must be a valid level");
  assert.strictEqual(first.aiDifficulty, second.aiDifficulty, "aiDifficulty must be stable for the same date");

  console.log("PASS dailyConfig: same-date calls are deeply equal and stable, adjacent dates differ");
}

module.exports = { run };

if (require.main === module) {
  run();
}
