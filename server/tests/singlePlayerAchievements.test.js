// AchievementService (server/single-player/achievements/service.js) is the
// one place that writes achievement/counter rows, and it has to be
// idempotent -- a duplicate event (a retried campaign-completion write, a
// multiplayer match somehow reported twice) must never double-count. This
// exercises it against a tiny in-memory fake of the Supabase query builder
// surface it actually calls (select/eq/maybeSingle/insert/upsert), rather
// than a real database -- dependency-free, matching this project's other
// tests.
const assert = require("assert");
const { AchievementService } = require("../single-player/achievements/service");
const { COUNTER_ACHIEVEMENTS } = require("../single-player/achievements/definitions");

function createFakeSupabase() {
  const tables = {
    achievement_event_receipts: new Map(),
    user_achievement_counters: new Map(),
    user_achievements: new Map(),
    achievement_definitions: new Map([
      ["campaign_complete", { id: "campaign_complete", target_value: 1, active: true }],
      ["multiplayer_10_games", { id: "multiplayer_10_games", target_value: 10, active: true }],
      ["use_20_powers", { id: "use_20_powers", target_value: 20, active: true }]
    ])
  };

  function from(table) {
    const rows = tables[table];
    const filters = [];
    const builder = {
      select() {
        return builder;
      },
      eq(col, val) {
        filters.push([col, val]);
        return builder;
      },
      insert(row) {
        if (table === "achievement_event_receipts") {
          const key = `${row.user_id}:${row.event_id}`;
          if (rows.has(key)) return Promise.resolve({ error: { code: "23505", message: "duplicate key" } });
          rows.set(key, row);
          return Promise.resolve({ error: null });
        }
        rows.set(`${row.user_id}:${Date.now()}:${Math.random()}`, row);
        return Promise.resolve({ error: null });
      },
      upsert(row, opts) {
        const onConflict = (opts?.onConflict || "").split(",");
        const key = onConflict.map(col => row[col]).join(":");
        rows.set(key, { ...(rows.get(key) || {}), ...row });
        return Promise.resolve({ error: null });
      },
      maybeSingle() {
        for (const row of rows.values()) {
          if (filters.every(([col, val]) => row[col] === val)) {
            return Promise.resolve({ data: row, error: null });
          }
        }
        return Promise.resolve({ data: null, error: null });
      }
    };
    return builder;
  }

  return { from, _tables: tables };
}

async function run() {
  // ---- 0. The code-side counter->achievement map must match what the
  // migration seeds (the real source of truth lives in
  // supabase/migrations/202608250001_single_player_campaign.sql).
  assert.deepStrictEqual(COUNTER_ACHIEVEMENTS, {
    campaigns_completed: "campaign_complete",
    multiplayer_matches_completed: "multiplayer_10_games",
    powers_used: "use_20_powers"
  });

  // ---- 1. Power-use counting accumulates, and unlocks once the target
  // (20) is reached -- not before.
  const supabase1 = createFakeSupabase();
  const service1 = new AchievementService(supabase1);

  for (let i = 0; i < 19; i++) {
    await service1.onPowerUsed({ userId: "u1", isCampaign: false });
  }
  let counterRow = supabase1._tables.user_achievement_counters.get("u1:powers_used");
  assert.strictEqual(counterRow.counter_value, 19, "19 power uses must leave the counter at 19");
  let achievementRow = supabase1._tables.user_achievements.get("u1:use_20_powers");
  assert.ok(!achievementRow?.unlocked_at, "19/20 must not unlock the achievement yet");

  await service1.onPowerUsed({ userId: "u1", isCampaign: true });
  counterRow = supabase1._tables.user_achievement_counters.get("u1:powers_used");
  assert.strictEqual(counterRow.counter_value, 20);
  achievementRow = supabase1._tables.user_achievements.get("u1:use_20_powers");
  assert.ok(achievementRow?.unlocked_at, "reaching 20 must unlock use_20_powers");
  assert.strictEqual(achievementRow.progress_value, 20);

  // Further power uses must not un-unlock or otherwise corrupt the row.
  await service1.onPowerUsed({ userId: "u1", isCampaign: false });
  achievementRow = supabase1._tables.user_achievements.get("u1:use_20_powers");
  assert.ok(achievementRow.unlocked_at, "the achievement must stay unlocked after the target is exceeded");

  // ---- 2. Campaign completion is idempotent per user -- a duplicate
  // "campaign complete" event (same natural event id) must not double the
  // counter.
  const supabase2 = createFakeSupabase();
  const service2 = new AchievementService(supabase2);

  await service2.onCampaignStageCompleted({ userId: "u2", stageId: "chapter-1-2", campaignComplete: true });
  await service2.onCampaignStageCompleted({ userId: "u2", stageId: "chapter-1-2", campaignComplete: true });
  const campaignCounter = supabase2._tables.user_achievement_counters.get("u2:campaigns_completed");
  assert.strictEqual(campaignCounter.counter_value, 1, "a duplicate campaign-complete event must not double-count");
  const campaignAchievement = supabase2._tables.user_achievements.get("u2:campaign_complete");
  assert.ok(campaignAchievement.unlocked_at, "campaign_complete (target 1) must unlock on the first real event");

  // A non-completing stage result must never touch the counter at all.
  await service2.onCampaignStageCompleted({ userId: "u2", stageId: "chapter-1-1", campaignComplete: false });
  const campaignCounterAfter = supabase2._tables.user_achievement_counters.get("u2:campaigns_completed");
  assert.strictEqual(campaignCounterAfter.counter_value, 1, "campaignComplete:false must be a complete no-op");

  // ---- 3. Multiplayer match completion is idempotent per (user, matchId)
  // -- reporting the same match twice must not double-count either, but a
  // genuinely different match must.
  const supabase3 = createFakeSupabase();
  const service3 = new AchievementService(supabase3);

  await service3.onMultiplayerMatchCompleted({ userId: "u3", matchId: "match-1" });
  await service3.onMultiplayerMatchCompleted({ userId: "u3", matchId: "match-1" });
  let mpCounter = supabase3._tables.user_achievement_counters.get("u3:multiplayer_matches_completed");
  assert.strictEqual(mpCounter.counter_value, 1, "reporting the same matchId twice must not double-count");

  await service3.onMultiplayerMatchCompleted({ userId: "u3", matchId: "match-2" });
  mpCounter = supabase3._tables.user_achievement_counters.get("u3:multiplayer_matches_completed");
  assert.strictEqual(mpCounter.counter_value, 2, "a genuinely different match must still increment");

  // Two different users' counters must never cross-contaminate.
  await service3.onMultiplayerMatchCompleted({ userId: "u4", matchId: "match-1" });
  const u4Counter = supabase3._tables.user_achievement_counters.get("u4:multiplayer_matches_completed");
  assert.strictEqual(u4Counter.counter_value, 1, "a different user reporting the same matchId must count independently");
  mpCounter = supabase3._tables.user_achievement_counters.get("u3:multiplayer_matches_completed");
  assert.strictEqual(mpCounter.counter_value, 2, "u3's counter must be unaffected by u4's event");

  // ---- 4. A storage failure (no supabase client) must fail closed --
  // never throw.
  const offlineService = new AchievementService(null);
  await assert.doesNotReject(() => offlineService.onPowerUsed({ userId: "u5", isCampaign: false }));

  console.log("PASS singlePlayerAchievements: counters accumulate and unlock at target, duplicate events are idempotent per user, and storage failure never throws");
}

module.exports = { run };

if (require.main === module) {
  run();
}
