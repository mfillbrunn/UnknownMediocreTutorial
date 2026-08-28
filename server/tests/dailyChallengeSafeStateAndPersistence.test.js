// Regression tests for two Daily Challenge bugs:
//
// 1. safeState.js must strip state._dailyConfig before it ever reaches a
//    client -- it carries the AI Secretkeeper's actual fixed secret for
//    the day, every future round's precomputed quest objects (exact Field
//    Report conditions, RARE letters, etc.), and the entire reward
//    schedule (exact option ids/order, plus the AI's deterministic
//    picks). Leaking it would let a player read ahead at today's answers.
//
// 2. dailyTracking.js's markDailyCompleted/getDailyStatus must not lose a
//    completion outright when the live database hasn't had the playMode
//    migration (supabase/migrations/202608280001_daily_challenge_playmode.sql)
//    applied yet -- that migration is a manual SQL step, not something
//    this codebase can run for itself, so writing/reading the new
//    play_mode/first_role/setter_score/guesser_score/score_difference
//    columns has to degrade to the legacy columns instead of failing the
//    whole completion (which otherwise means the game "wasn't recorded"
//    and the same date could be re-claimed, and never shows up in
//    rankings).
const assert = require("assert");
const { buildSafeStateForPlayer } = require("../utils/safeState");
const { markDailyCompleted, getDailyStatus } = require("../core/dailyTracking");

function baseDailyState() {
  return {
    phase: "normal",
    gameOver: false,
    turn: "p1",
    setter: "AI",
    guesser: "p1",
    isDaily: true,
    dailyDate: "2026-08-27",
    _dailyDate: "2026-08-27",
    _dailyConfig: {
      date: "2026-08-27",
      playMode: "both",
      firstRole: "guesser",
      aiDifficulty: 2,
      humanOpeningGuess: null,
      humanOpeningSecret: null,
      aiOpeningGuess: "SLATE",
      aiOpeningSecret: "CHALK",
      questsByRound: [[{ type: "RARE", letters: ["Q", "X"] }]],
      rewardOffers: { setter: [{ rarity: "common", optionIds: ["a", "b", "c"] }], guesser: [] },
      aiPickIndex: { setter: [0], guesser: [] }
    },
    players: {
      p1: { userId: "p1", role: "guesser", isAI: false },
      AI: { userId: "AI", role: "setter", isAI: true }
    },
    powers: { quest: {} },
    history: [],
    secret: "",
    pendingGuess: "",
    activePowers: [],
    extraConstraints: []
  };
}

// A fake Supabase client standing in for a live database that hasn't had
// the playMode migration applied yet: any write/read touching the new
// columns fails with an "undefined_column" error, exactly like a real
// Postgres/PostgREST response would.
function makeSchemaLaggingSupabase() {
  const rows = new Map();
  const NEW_COLUMNS = ["play_mode", "first_role", "setter_score", "guesser_score", "score_difference"];

  return {
    from() {
      return {
        upsert(row) {
          const touchesNewColumns = NEW_COLUMNS.some(col => col in row);
          if (touchesNewColumns) {
            return Promise.resolve({
              error: { code: "42703", message: 'column "play_mode" of relation "daily_results" does not exist' }
            });
          }
          const k = `${row.user_id}:${row.date}`;
          rows.set(k, { ...(rows.get(k) || {}), ...row });
          return Promise.resolve({ error: null });
        },
        select(columns) {
          const touchesNewColumns = NEW_COLUMNS.some(col => columns.includes(col));
          return {
            eq(field1, val1) {
              return {
                eq(field2, val2) {
                  return {
                    async maybeSingle() {
                      if (touchesNewColumns) {
                        return {
                          data: null,
                          error: { code: "42703", message: 'column "play_mode" does not exist' }
                        };
                      }
                      for (const row of rows.values()) {
                        if (row[field1] === val1 && row[field2] === val2) {
                          return { data: row, error: null };
                        }
                      }
                      return { data: null, error: null };
                    }
                  };
                }
              };
            }
          };
        }
      };
    }
  };
}

function run() {
  // -- 1. safeState.js strips _dailyConfig for every viewer --
  {
    const state = baseDailyState();
    const safeForGuesser = buildSafeStateForPlayer(state, "p1", []);
    const safeForSetterSeat = buildSafeStateForPlayer(state, "AI", []);
    assert.ok(!("_dailyConfig" in safeForGuesser), "safeState must strip _dailyConfig for the guesser's view");
    assert.ok(!("_dailyConfig" in safeForSetterSeat), "safeState must strip _dailyConfig for the setter's view");
    // _dailyDate alone (already public via /api/daily) is fine to keep.
    assert.strictEqual(safeForGuesser.dailyDate, "2026-08-27", "the plain dailyDate field is not sensitive and may stay");
  }

  console.log("PASS dailyChallengeSafeStateAndPersistence part 1: safeState.js never leaks _dailyConfig");
}

async function runAsync() {
  run();

  // -- 2. markDailyCompleted still records a completion when the
  // playMode columns don't exist yet, and getDailyStatus can still read
  // it back as "completed" instead of "none". --
  {
    const supabase = makeSchemaLaggingSupabase();
    await markDailyCompleted({
      supabase,
      userId: "p1",
      date: "2026-08-27",
      result: {
        playMode: "both",
        firstRole: "guesser",
        setterScore: 4,
        guesserScore: 2,
        scoreDifference: 2,
        time: 123,
        won: true,
        tie: false,
        difficulty: 2
      }
    });

    const status = await getDailyStatus({ supabase, rooms: {}, userId: "p1", date: "2026-08-27" });
    assert.strictEqual(status.status, "completed", "a completion must still be recorded and readable even when the playMode columns don't exist yet");
    assert.strictEqual(status.result.score, 4, "the legacy score column must still be populated from setterScore");
    assert.strictEqual(status.result.opponentScore, 2, "the legacy opponent_score column must still be populated from guesserScore");
    assert.strictEqual(status.result.won, true);
    assert.strictEqual(status.result.playMode, null, "the playMode-aware field itself is null on a legacy-fallback row -- it was never written, not silently guessed at");
  }

  console.log("PASS dailyChallengeSafeStateAndPersistence part 2: a completion is still recorded and readable when the playMode migration hasn't been applied yet");
}

module.exports = { run: runAsync };

if (require.main === module) {
  runAsync();
}
