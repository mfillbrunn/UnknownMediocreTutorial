// server/single-player/progressRepository.js
//
// The ONLY place campaign/achievement code talks to Supabase. Every method
// is idempotent where the operation calls for it (ensureProfile, unlocks,
// reward application) and fails closed: a storage error never throws --
// it resolves { ok: false, code: "CAMPAIGN_STORAGE_UNAVAILABLE", error }
// so a caller can show "campaign unavailable" without taking multiplayer
// or the rest of the app down with it. Always uses the service-role
// client already sitting on the server context; never trusts a client-
// supplied userId as sufficient authority for a write (see sessionService.js
// for the token-verification step that establishes the authenticated id
// this repository is then handed).

"use strict";

const UNAVAILABLE = { ok: false, code: "CAMPAIGN_STORAGE_UNAVAILABLE" };

function fail(error) {
  return { ...UNAVAILABLE, error: error?.message || String(error) };
}

class ProgressRepository {
  constructor(supabase) {
    this.supabase = supabase;
  }

  // Idempotent: relies on the DB trigger (sp_seed_profile_defaults) to
  // seed stage-1 unlock + starter powers the first time a profile row is
  // actually inserted. A profile that already exists is left untouched.
  async ensureProfile(userId) {
    if (!this.supabase) return UNAVAILABLE;
    try {
      const { data: existing, error: selectError } = await this.supabase
        .from("single_player_profiles")
        .select("user_id")
        .eq("user_id", userId)
        .maybeSingle();
      if (selectError) throw selectError;
      if (existing) return { ok: true, created: false };

      const { error: insertError } = await this.supabase
        .from("single_player_profiles")
        .insert({ user_id: userId })
        .select()
        .single();
      // A concurrent request may have inserted first -- unique violation
      // on user_id is a success, not a failure, for an idempotent ensure.
      if (insertError && insertError.code !== "23505") throw insertError;
      return { ok: true, created: !insertError };
    } catch (error) {
      return fail(error);
    }
  }

  async getCampaignSnapshot(userId) {
    if (!this.supabase) return UNAVAILABLE;
    try {
      const [profile, unlocks, progress, powerUnlocks, achievements, counters] = await Promise.all([
        this.supabase.from("single_player_profiles").select("*").eq("user_id", userId).maybeSingle(),
        this.supabase.from("single_player_stage_unlocks").select("*").eq("user_id", userId),
        this.supabase.from("single_player_stage_progress").select("*").eq("user_id", userId),
        this.supabase.from("single_player_power_unlocks").select("*").eq("user_id", userId),
        this.supabase.from("achievement_definitions").select("*").eq("active", true),
        this.supabase.from("user_achievements").select("*").eq("user_id", userId)
      ]);
      for (const result of [profile, unlocks, progress, powerUnlocks, achievements, counters]) {
        if (result.error) throw result.error;
      }
      return {
        ok: true,
        profile: profile.data,
        unlocks: unlocks.data || [],
        progress: progress.data || [],
        powerUnlocks: powerUnlocks.data || [],
        achievementDefinitions: achievements.data || [],
        userAchievements: counters.data || []
      };
    } catch (error) {
      return fail(error);
    }
  }

  async getUnlockedPowersByRole(userId) {
    if (!this.supabase) return { guesser: [], setter: [] };
    try {
      const { data, error } = await this.supabase
        .from("single_player_power_unlocks")
        .select("role, power_id")
        .eq("user_id", userId);
      if (error) throw error;
      const byRole = { guesser: [], setter: [] };
      for (const row of data || []) {
        if (byRole[row.role]) byRole[row.role].push(row.power_id);
      }
      return byRole;
    } catch {
      return { guesser: [], setter: [] };
    }
  }

  // Conflict-safe attempt numbering: the unique (user_id, stage_id,
  // attempt_no) constraint means a racing duplicate insert fails instead
  // of silently overwriting a prior attempt's row -- retried once with the
  // next number on that specific conflict.
  async beginAttempt({ userId, stageId, stageVersion }) {
    if (!this.supabase) return UNAVAILABLE;
    try {
      const { count, error: countError } = await this.supabase
        .from("single_player_sessions")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("stage_id", stageId);
      if (countError) throw countError;

      let attemptNo = (count || 0) + 1;
      for (let tries = 0; tries < 3; tries++) {
        const { data, error } = await this.supabase
          .from("single_player_sessions")
          .insert({
            user_id: userId,
            stage_id: stageId,
            stage_version: stageVersion,
            attempt_no: attemptNo,
            status: "pre_story"
          })
          .select()
          .single();
        if (!error) return { ok: true, session: data, attemptNo };
        if (error.code === "23505") { attemptNo += 1; continue; }
        throw error;
      }
      return fail(new Error("Could not allocate a unique attempt number"));
    } catch (error) {
      return fail(error);
    }
  }

  async saveCheckpoint({ sessionId, status, engineCheckpoint, publicResult }) {
    if (!this.supabase) return UNAVAILABLE;
    try {
      const patch = { updated_at: new Date().toISOString() };
      if (status) patch.status = status;
      if (engineCheckpoint !== undefined) patch.engine_checkpoint = engineCheckpoint;
      if (publicResult !== undefined) patch.public_result = publicResult;
      if (status === "completed" || status === "abandoned" || status === "failed") {
        patch.completed_at = new Date().toISOString();
      }
      const { error } = await this.supabase
        .from("single_player_sessions")
        .update(patch)
        .eq("id", sessionId);
      if (error) throw error;
      return { ok: true };
    } catch (error) {
      return fail(error);
    }
  }

  // Idempotent per (user, stage, choiceId) via the table's primary key --
  // a repeat submit of the same choiceId just updates the stored option.
  async saveStoryChoice({ userId, stageId, choiceId, optionId, payload }) {
    if (!this.supabase) return UNAVAILABLE;
    try {
      const { error } = await this.supabase
        .from("single_player_story_choices")
        .upsert({
          user_id: userId,
          stage_id: stageId,
          choice_id: choiceId,
          option_id: optionId,
          choice_payload: payload || {}
        }, { onConflict: "user_id,stage_id,choice_id" });
      if (error) throw error;
      return { ok: true };
    } catch (error) {
      return fail(error);
    }
  }

  // Records score/stars for an attempt. Only raises best_stars/best_score
  // when the new result is actually better -- replaying a completed stage
  // can improve the record but never regress it.
  async recordAttemptResult({ userId, stageId, stageVersion, completed, score, stars, objectiveResults }) {
    if (!this.supabase) return UNAVAILABLE;
    try {
      const { data: existing, error: selectError } = await this.supabase
        .from("single_player_stage_progress")
        .select("*")
        .eq("user_id", userId)
        .eq("stage_id", stageId)
        .maybeSingle();
      if (selectError) throw selectError;

      const now = new Date().toISOString();
      const nextBestStars = Math.max(existing?.best_stars || 0, completed ? stars : 0);
      const nextBestScore = completed
        ? Math.max(existing?.best_score ?? 0, score)
        : (existing?.best_score ?? null);

      const row = {
        user_id: userId,
        stage_id: stageId,
        stage_version: stageVersion,
        status: completed ? "completed" : (existing?.status === "completed" ? "completed" : "in_progress"),
        attempts: (existing?.attempts || 0) + 1,
        best_stars: nextBestStars,
        best_score: nextBestScore,
        last_score: score,
        objective_results: objectiveResults || {},
        first_started_at: existing?.first_started_at || now,
        last_played_at: now,
        completed_at: completed ? (existing?.completed_at || now) : existing?.completed_at || null
      };

      const { error: upsertError } = await this.supabase
        .from("single_player_stage_progress")
        .upsert(row, { onConflict: "user_id,stage_id" });
      if (upsertError) throw upsertError;

      const isNewBest = completed && (
        !existing ||
        stars > (existing.best_stars || 0) ||
        (stars === (existing.best_stars || 0) && score > (existing.best_score ?? -Infinity))
      );

      return { ok: true, isNewBest, previousBestStars: existing?.best_stars || 0, previousBestScore: existing?.best_score ?? null };
    } catch (error) {
      return fail(error);
    }
  }

  // Idempotent via the (user_id, stage_id) primary key -- unlocking an
  // already-unlocked stage is a no-op, not a duplicate row.
  async unlockStage({ userId, stageId, sourceStageId }) {
    if (!this.supabase) return UNAVAILABLE;
    try {
      const { error } = await this.supabase
        .from("single_player_stage_unlocks")
        .upsert(
          { user_id: userId, stage_id: stageId, source_stage_id: sourceStageId || null },
          { onConflict: "user_id,stage_id", ignoreDuplicates: true }
        );
      if (error) throw error;
      return { ok: true };
    } catch (error) {
      return fail(error);
    }
  }

  // Idempotent via the (user_id, role, power_id) primary key.
  async unlockPower({ userId, role, powerId, sourceStageId, sourceChoiceId }) {
    if (!this.supabase) return UNAVAILABLE;
    try {
      const { error } = await this.supabase
        .from("single_player_power_unlocks")
        .upsert(
          { user_id: userId, role, power_id: powerId, source_stage_id: sourceStageId || null, source_choice_id: sourceChoiceId || null },
          { onConflict: "user_id,role,power_id", ignoreDuplicates: true }
        );
      if (error) throw error;
      return { ok: true };
    } catch (error) {
      return fail(error);
    }
  }

  // Applies a stage's `rewards` block exactly once for this attempt.
  // reward_results on the progress row is the ledger: if it already has an
  // entry for this attemptNo, every reward in it was already applied, so
  // this is a pure no-op (replaying a completed stage can't duplicate an
  // unlock or repeat a one-time choice).
  async applyStageRewardsOnce({ userId, stageId, attemptNo, rewards, chosenOption }) {
    if (!this.supabase) return UNAVAILABLE;
    try {
      const { data: existing, error: selectError } = await this.supabase
        .from("single_player_stage_progress")
        .select("reward_results")
        .eq("user_id", userId)
        .eq("stage_id", stageId)
        .maybeSingle();
      if (selectError) throw selectError;

      const rewardLedger = existing?.reward_results || {};
      if (rewardLedger[String(attemptNo)]) {
        return { ok: true, alreadyApplied: true };
      }

      for (const unlock of rewards?.unlockPowers || []) {
        await this.unlockPower({ userId, role: unlock.role, powerId: unlock.powerId, sourceStageId: stageId });
      }
      if (chosenOption) {
        await this.unlockPower({
          userId,
          role: chosenOption.role,
          powerId: chosenOption.powerId,
          sourceStageId: stageId,
          sourceChoiceId: chosenOption.choiceId
        });
      }
      for (const nextStageId of rewards?.unlockStages || []) {
        await this.unlockStage({ userId, stageId: nextStageId, sourceStageId: stageId });
      }
      if (rewards?.setFlags && Object.keys(rewards.setFlags).length) {
        const { data: profile } = await this.supabase
          .from("single_player_profiles")
          .select("campaign_flags")
          .eq("user_id", userId)
          .maybeSingle();
        const nextFlags = { ...(profile?.campaign_flags || {}), ...rewards.setFlags };
        await this.supabase
          .from("single_player_profiles")
          .update({ campaign_flags: nextFlags })
          .eq("user_id", userId);
      }

      rewardLedger[String(attemptNo)] = { appliedAt: new Date().toISOString() };
      const { error: updateError } = await this.supabase
        .from("single_player_stage_progress")
        .update({ reward_results: rewardLedger })
        .eq("user_id", userId)
        .eq("stage_id", stageId);
      if (updateError) throw updateError;

      return { ok: true, alreadyApplied: false };
    } catch (error) {
      return fail(error);
    }
  }

  async abandonSession(sessionId) {
    if (!this.supabase) return UNAVAILABLE;
    try {
      const { error } = await this.supabase
        .from("single_player_sessions")
        .update({ status: "abandoned", completed_at: new Date().toISOString() })
        .eq("id", sessionId)
        .neq("status", "completed");
      if (error) throw error;
      return { ok: true };
    } catch (error) {
      return fail(error);
    }
  }

  async getCampaignFlags(userId) {
    if (!this.supabase) return {};
    try {
      const { data } = await this.supabase
        .from("single_player_profiles")
        .select("campaign_flags")
        .eq("user_id", userId)
        .maybeSingle();
      return data?.campaign_flags || {};
    } catch {
      return {};
    }
  }
}

module.exports = { ProgressRepository };
