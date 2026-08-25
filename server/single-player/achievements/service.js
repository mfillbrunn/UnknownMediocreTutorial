// server/single-player/achievements/service.js
//
// Achievements are independent of campaign progress -- a multiplayer match
// or a power use bumps the same counters a campaign stage does. Every
// public method here is fail-closed the same way progressRepository.js is:
// a storage error is swallowed and logged, never thrown, so a failure here
// can never crash or block the game event that triggered it.
//
// achievement_event_receipts (user_id, event_id) is the idempotency guard
// for events that DO have a natural, stable id (a specific campaign stage
// completing, a specific multiplayer match ending) -- a duplicate call with
// the same eventId is a guaranteed no-op. Power-use events have no such
// natural id (there's nothing to dedupe against; each guarded hook call
// already corresponds to exactly one real power use), so those get a
// unique eventId per call and the receipt row there is an audit trail, not
// a dedupe key.

"use strict";

const { COUNTER_ACHIEVEMENTS } = require("./definitions");

class AchievementService {
  constructor(supabase) {
    this.supabase = supabase;
  }

  // Returns true if this event hasn't been recorded before (and reserves
  // it), false if it's a duplicate or the receipt couldn't be written.
  async _reserveEvent(userId, eventId, eventType, payload) {
    if (!this.supabase || !userId || !eventId) return false;
    try {
      const { error } = await this.supabase
        .from("achievement_event_receipts")
        .insert({ user_id: userId, event_id: eventId, event_type: eventType, payload: payload || {} });
      if (error) {
        if (error.code === "23505") return false;
        throw error;
      }
      return true;
    } catch (err) {
      console.warn("[achievements] receipt insert failed:", err?.message || err);
      return false;
    }
  }

  async _bumpCounter(userId, counterKey, incrementBy) {
    try {
      const { data: existing, error: selectError } = await this.supabase
        .from("user_achievement_counters")
        .select("counter_value")
        .eq("user_id", userId)
        .eq("counter_key", counterKey)
        .maybeSingle();
      if (selectError) throw selectError;

      const nextValue = (existing?.counter_value || 0) + incrementBy;
      const { error: upsertError } = await this.supabase
        .from("user_achievement_counters")
        .upsert(
          { user_id: userId, counter_key: counterKey, counter_value: nextValue },
          { onConflict: "user_id,counter_key" }
        );
      if (upsertError) throw upsertError;
      return nextValue;
    } catch (err) {
      console.warn("[achievements] counter bump failed:", err?.message || err);
      return null;
    }
  }

  async _applyProgress(userId, achievementId, value) {
    try {
      const { data: def, error: defError } = await this.supabase
        .from("achievement_definitions")
        .select("target_value")
        .eq("id", achievementId)
        .eq("active", true)
        .maybeSingle();
      if (defError) throw defError;
      if (!def) return;

      const { data: existing, error: selectError } = await this.supabase
        .from("user_achievements")
        .select("unlocked_at")
        .eq("user_id", userId)
        .eq("achievement_id", achievementId)
        .maybeSingle();
      if (selectError) throw selectError;
      if (existing?.unlocked_at) return;

      const nextProgress = Math.min(value, def.target_value);
      const row = {
        user_id: userId,
        achievement_id: achievementId,
        progress_value: nextProgress,
        unlocked_at: nextProgress >= def.target_value ? new Date().toISOString() : null
      };
      const { error: upsertError } = await this.supabase
        .from("user_achievements")
        .upsert(row, { onConflict: "user_id,achievement_id" });
      if (upsertError) throw upsertError;
    } catch (err) {
      console.warn("[achievements] progress apply failed:", err?.message || err);
    }
  }

  async _recordCounterEvent({ userId, eventId, eventType, counterKey, incrementBy = 1, payload }) {
    if (!this.supabase || !userId) return;
    const reserved = await this._reserveEvent(userId, eventId, eventType, payload);
    if (!reserved) return;

    const nextValue = await this._bumpCounter(userId, counterKey, incrementBy);
    if (nextValue === null) return;

    const achievementId = COUNTER_ACHIEVEMENTS[counterKey];
    if (achievementId) await this._applyProgress(userId, achievementId, nextValue);
  }

  async onCampaignStageCompleted({ userId, stageId, campaignComplete }) {
    if (!campaignComplete) return;
    await this._recordCounterEvent({
      userId,
      eventId: `campaign_complete:${userId}`,
      eventType: "campaign_complete",
      counterKey: "campaigns_completed",
      payload: { stageId }
    });
  }

  async onPowerUsed({ userId, isCampaign }) {
    await this._recordCounterEvent({
      userId,
      eventId: `power_used:${userId}:${Date.now()}:${Math.random().toString(36).slice(2)}`,
      eventType: "power_used",
      counterKey: "powers_used",
      payload: { isCampaign: !!isCampaign }
    });
  }

  async onMultiplayerMatchCompleted({ userId, matchId }) {
    await this._recordCounterEvent({
      userId,
      eventId: `multiplayer_match:${userId}:${matchId}`,
      eventType: "multiplayer_match_completed",
      counterKey: "multiplayer_matches_completed",
      payload: { matchId }
    });
  }
}

module.exports = { AchievementService };
