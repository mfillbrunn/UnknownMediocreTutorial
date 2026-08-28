// Regression tests for the Developer screen's "Reset & Rerandomize Daily
// Challenge" tool: dailySeedOverride.js (a per-date salt that changes what
// getDailyConfig(date, ...) deterministically produces, without touching
// any OTHER date) and dailyTracking.js's resetDailyResultsForDate (wipes
// every player's record for a date so it can be claimed again).
const assert = require("assert");
const { getDailyConfig } = require("../utils/dailyConfig");
const {
  getDailySeedSalt,
  rerollDailySeed,
  clearDailySeedOverride
} = require("../utils/dailySeedOverride");
const {
  claimDailyAttempt,
  markDailyCompleted,
  getDailyStatus,
  resetDailyResultsForDate
} = require("../core/dailyTracking");

const S = ["APPLE", "GRAPE", "MANGO", "PEACH", "LEMON", "BERRY", "MELON", "CRANE", "SLATE", "TRACE"];
const G = [...S, "STARE", "PLAYA", "CHALK", "RAMEN", "WREAK", "OVARY"];

function makeInMemorySupabase() {
  const rows = new Map(); // `${user_id}:${date}` -> row
  const rowKey = (userId, date) => `${userId}:${date}`;
  return {
    _rows: rows,
    from() {
      return {
        insert(row) {
          return {
            select() {
              return {
                async single() {
                  const k = rowKey(row.user_id, row.date);
                  if (rows.has(k)) {
                    return { data: null, error: { code: "23505" } };
                  }
                  rows.set(k, { ...row });
                  return { data: { ...row }, error: null };
                }
              };
            }
          };
        },
        upsert(row) {
          const k = rowKey(row.user_id, row.date);
          rows.set(k, { ...(rows.get(k) || {}), ...row });
          return Promise.resolve({ error: null });
        },
        select() {
          return {
            eq(field1, val1) {
              return {
                async maybeSingle() {
                  const row = [...rows.values()].find(r => r[field1] === val1);
                  return { data: row || null, error: null };
                },
                eq(field2, val2) {
                  return {
                    async maybeSingle() {
                      const row = [...rows.values()].find(r => r[field1] === val1 && r[field2] === val2);
                      return { data: row || null, error: null };
                    }
                  };
                }
              };
            }
          };
        },
        update(patch) {
          return {
            eq(field1, val1) {
              return {
                eq(field2, val2) {
                  return {
                    eq(field3, val3) {
                      for (const row of rows.values()) {
                        if (row[field1] === val1 && row[field2] === val2 && row[field3] === val3) {
                          Object.assign(row, patch);
                        }
                      }
                      return Promise.resolve({ error: null });
                    }
                  };
                }
              };
            }
          };
        },
        delete() {
          return {
            eq(field, val) {
              for (const [k, row] of [...rows.entries()]) {
                if (row[field] === val) rows.delete(k);
              }
              return Promise.resolve({ error: null });
            }
          };
        }
      };
    }
  };
}

function run() {
  const date = "2027-05-01";
  const otherDate = "2027-05-02";

  try {
    // -- 1. No override -> stable, original config. --
    assert.strictEqual(getDailySeedSalt(date), "", "a date with no override must have an empty salt");
    const original = getDailyConfig(date, S, G);
    assert.deepStrictEqual(getDailyConfig(date, S, G), original, "repeated calls with no override must stay identical");

    // -- 2. Rerolling changes the date's config, and ONLY that date's. --
    const otherBefore = getDailyConfig(otherDate, S, G);
    const salt = rerollDailySeed(date);
    assert.ok(salt, "rerollDailySeed must return a non-empty salt");
    assert.strictEqual(getDailySeedSalt(date), salt, "getDailySeedSalt must return the salt just set");

    const rerolled = getDailyConfig(date, S, G);
    assert.strictEqual(rerolled.date, date, "the returned date field must stay the real calendar date, not the salted seed key");
    assert.notDeepStrictEqual(rerolled, original, "rerolling must actually change the date's configuration");
    assert.deepStrictEqual(getDailyConfig(otherDate, S, G), otherBefore, "rerolling one date must never affect a different date's configuration");

    // Rerolling again produces yet another distinct config (not the same
    // "rerolled" one, and not back to "original").
    const salt2 = rerollDailySeed(date);
    assert.notStrictEqual(salt2, salt, "a second reroll must pick a different salt");
    const rerolled2 = getDailyConfig(date, S, G);
    assert.notDeepStrictEqual(rerolled2, rerolled, "a second reroll must actually change the configuration again");

    // -- 3. Clearing the override reverts exactly to the original. --
    clearDailySeedOverride(date);
    assert.strictEqual(getDailySeedSalt(date), "", "clearing the override must reset the salt to empty");
    assert.deepStrictEqual(getDailyConfig(date, S, G), original, "clearing the override must reproduce the exact original configuration");

    console.log("PASS dailyChallengeDevReset part 1: rerolling changes only the targeted date's config, deterministically, and clearing reverts it exactly");
  } finally {
    clearDailySeedOverride(date);
    clearDailySeedOverride(otherDate);
  }
}

async function runAsync() {
  run();

  // -- 4. resetDailyResultsForDate wipes every row for a date and leaves
  // other dates alone (Supabase-backed path). --
  {
    const supabase = makeInMemorySupabase();
    const date = "2027-05-03";
    const otherDate = "2027-05-04";

    await claimDailyAttempt({ supabase, userId: "userA", date, roomId: "roomA" });
    await claimDailyAttempt({ supabase, userId: "userB", date, roomId: "roomB" });
    await markDailyCompleted({
      supabase,
      userId: "userB",
      date,
      result: { playMode: "setter", setterScore: 5, guesserScore: 0, scoreDifference: 5, time: 60, won: true, tie: false, difficulty: 2 }
    });
    await claimDailyAttempt({ supabase, userId: "userA", date: otherDate, roomId: "roomC" });
    const aliveRooms = { roomC: { status: "alive" } };

    const beforeReset = await getDailyStatus({ supabase, rooms: {}, userId: "userB", date });
    assert.strictEqual(beforeReset.status, "completed", "test setup: userB must show completed before reset");

    await resetDailyResultsForDate({ supabase, date });

    const afterResetA = await getDailyStatus({ supabase, rooms: {}, userId: "userA", date });
    const afterResetB = await getDailyStatus({ supabase, rooms: {}, userId: "userB", date });
    assert.strictEqual(afterResetA.status, "none", "resetDailyResultsForDate must clear every player's row for that date (userA)");
    assert.strictEqual(afterResetB.status, "none", "resetDailyResultsForDate must clear every player's row for that date (userB, was completed)");

    const otherDateStatus = await getDailyStatus({ supabase, rooms: aliveRooms, userId: "userA", date: otherDate });
    assert.strictEqual(otherDateStatus.status, "in-progress", "resetDailyResultsForDate must never touch a different date's rows");

    // A wiped date can be claimed again.
    const reclaim = await claimDailyAttempt({ supabase, userId: "userA", date, roomId: "roomA2" });
    assert.strictEqual(reclaim.ok, true, "a date reset by resetDailyResultsForDate must be claimable again");
  }

  // -- 5. resetDailyResultsForDate also clears the in-memory fallback
  // (no supabase configured) without touching a different date's keys. --
  {
    const date = "2027-05-05";
    const otherDate = "2027-05-06";

    const claim = await claimDailyAttempt({ supabase: null, userId: "userX", date, roomId: "roomX" });
    assert.strictEqual(claim.ok, true);
    await claimDailyAttempt({ supabase: null, userId: "userX", date: otherDate, roomId: "roomY" });

    const reclaimBeforeReset = await claimDailyAttempt({ supabase: null, userId: "userX", date, roomId: "roomX2" });
    assert.strictEqual(reclaimBeforeReset.ok, false, "test setup: a second claim before reset must be rejected");

    await resetDailyResultsForDate({ supabase: null, date });

    const reclaimAfterReset = await claimDailyAttempt({ supabase: null, userId: "userX", date, roomId: "roomX3" });
    assert.strictEqual(reclaimAfterReset.ok, true, "resetDailyResultsForDate must clear the in-memory fallback too, allowing a fresh claim");

    const otherStatus = await getDailyStatus({ supabase: null, rooms: {}, userId: "userX", date: otherDate });
    assert.strictEqual(otherStatus.status, "in-progress", "resetDailyResultsForDate (in-memory) must never touch a different date");
  }

  console.log("PASS dailyChallengeDevReset part 2: resetDailyResultsForDate wipes every player's record for the targeted date only, Supabase-backed and in-memory alike");
}

module.exports = { run: runAsync };

if (require.main === module) {
  runAsync();
}
