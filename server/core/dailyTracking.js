const activeRooms = new Map();
const completions = new Map();

function key(userId, date) {
  return `${userId}:${date}`;
}

function resultFromRow(row) {
  if (!row) {
    return null;
  }

  return {
    // Legacy fields -- still populated for every row (old and new) so
    // any surviving reader of the pre-playMode shape keeps working.
    // score/opponentScore always mirror setterScore/guesserScore.
    score:
      row.score || 0,

    opponentScore:
      row.opponent_score || 0,

    won:
      !!row.won,

    tie:
      !!row.tie,

    // REFINEMENT_SPEC section 9: playMode-aware result fields. Null on any
    // row written before this migration -- callers fall back to the
    // legacy score/opponentScore/won/tie above for those.
    playMode:
      row.play_mode || null,

    firstRole:
      row.first_role || null,

    setterScore:
      row.setter_score ?? row.score ?? 0,

    guesserScore:
      row.guesser_score ?? row.opponent_score ?? 0,

    scoreDifference:
      row.score_difference ??
      (row.setter_score ?? row.score ?? 0) - (row.guesser_score ?? row.opponent_score ?? 0),

    time:
      row.time_seconds || 0,

    difficulty:
      row.difficulty || null,

    abandoned:
      row.status === "abandoned"
  };
}

async function claimDailyAttempt({
  supabase,
  userId,
  date,
  roomId,
  difficulty
}) {
  if (
    !userId ||
    !date ||
    !roomId
  ) {
    return {
      ok: false,
      error:
        "Missing Daily Challenge information"
    };
  }

  if (!supabase) {
    const k = key(userId, date);

    if (
      activeRooms.has(k) ||
      completions.has(k)
    ) {
      return {
        ok: false,
        code:
          "DAILY_ALREADY_STARTED"
      };
    }

    activeRooms.set(k, roomId);

    return {
      ok: true,
      status: "in-progress"
    };
  }

  const {
    data,
    error
  } = await supabase
    .from("daily_results")
    .insert({
      user_id: userId,
      date,
      room_id: roomId,
      difficulty:
        difficulty || null,

      status: "in_progress",

      score: 0,
      opponent_score: 0,
      time_seconds: 0,
      won: false,
      tie: false,

      started_at:
        new Date().toISOString(),

      completed_at: null
    })
    .select(
      "user_id,date,status,room_id"
    )
    .single();

  if (!error) {
    return {
      ok: true,
      status: "in-progress",
      roomId:
        data?.room_id || roomId
    };
  }

  /*
   * PostgreSQL unique-violation code. The user has
   * already claimed today's attempt.
   */
  if (error.code === "23505") {
    const {
      data: existing
    } = await supabase
      .from("daily_results")
      .select(
        "status,room_id"
      )
      .eq("user_id", userId)
      .eq("date", date)
      .maybeSingle();

    return {
      ok: false,
      code:
        "DAILY_ALREADY_STARTED",

      status:
        existing?.status ||
        "completed",

      roomId:
        existing?.room_id ||
        null
    };
  }

  throw error;
}

async function markDailyCompleted({
  supabase,
  userId,
  date,
  result
}) {
  if (!userId || !date) {
    return;
  }

  if (!supabase) {
    completions.set(
      key(userId, date),
      result || null
    );

    activeRooms.delete(
      key(userId, date)
    );

    return;
  }

  const legacyRow = {
    user_id: userId,
    date,

    status: "completed",
    room_id: null,

    // Legacy columns -- kept in sync with setter/guesser score so any
    // reader of the pre-playMode shape (including this same table's
    // OLDER rows) still sees a sensible score/opponent_score/won/tie.
    score:
      result?.score ?? result?.setterScore ?? 0,

    opponent_score:
      result?.opponentScore ?? result?.guesserScore ?? 0,

    won:
      !!result?.won,

    tie:
      !!result?.tie,

    time_seconds:
      Math.round(
        result?.time || 0
      ),

    difficulty:
      result?.difficulty || null,

    completed_at:
      new Date().toISOString()
  };

  const playModeRow = {
    ...legacyRow,

    // REFINEMENT_SPEC section 9: playMode-aware result columns.
    play_mode:
      result?.playMode || null,

    first_role:
      result?.firstRole || null,

    setter_score:
      result?.setterScore ?? null,

    guesser_score:
      result?.guesserScore ?? null,

    score_difference:
      result?.scoreDifference ?? null
  };

  const { error } = await supabase
    .from("daily_results")
    .upsert(playModeRow, { onConflict: "user_id,date" });

  if (!error) {
    return;
  }

  // The play_mode/first_role/setter_score/guesser_score/score_difference
  // columns come from a migration (supabase/migrations/
  // 202608280001_daily_challenge_playmode.sql) that has to be applied by
  // hand against the live database -- until that's actually been run,
  // writing those columns fails outright and would otherwise lose the
  // WHOLE completion (never marking the row "completed" at all, letting
  // the player re-claim the same date and never showing up in rankings).
  // Retry with just the legacy columns so a completion is still recorded
  // even before that migration lands; the playMode-aware fields simply
  // stay null on this row until it's rewritten by a client that isn't
  // hitting this fallback.
  console.warn(
    "[daily] full-schema completion write failed, retrying with legacy columns only:",
    error
  );

  const { error: legacyError } = await supabase
    .from("daily_results")
    .upsert(legacyRow, { onConflict: "user_id,date" });

  if (legacyError) {
    throw legacyError;
  }
}

async function markDailyAbandoned({
  supabase,
  userId,
  date
}) {
  if (!userId || !date) {
    return;
  }

  if (!supabase) {
    completions.set(
      key(userId, date),
      {
        abandoned: true
      }
    );

    activeRooms.delete(
      key(userId, date)
    );

    return;
  }

  const {
    error
  } = await supabase
    .from("daily_results")
    .update({
      status: "abandoned",
      room_id: null,
      completed_at:
        new Date().toISOString()
    })
    .eq("user_id", userId)
    .eq("date", date)
    /*
     * Never overwrite an already completed result when
     * the player later leaves its summary screen.
     */
    .eq("status", "in_progress");

  if (error) {
    throw error;
  }
}

async function getDailyStatus({
  supabase,
  rooms,
  userId,
  date
}) {
  if (!userId || !date) {
    return {
      status: "none"
    };
  }

  if (!supabase) {
    const k = key(userId, date);

    if (completions.has(k)) {
      return {
        status: "completed",
        result:
          completions.get(k)
      };
    }

    const roomId =
      activeRooms.get(k);

    return roomId
      ? {
          status: "in-progress",
          roomId
        }
      : {
          status: "none"
        };
  }

  let data;
  {
    const legacyColumns = "status,room_id,score,opponent_score,time_seconds,won,tie,difficulty";
    const playModeColumns = `${legacyColumns},play_mode,first_role,setter_score,guesser_score,score_difference`;

    const full = await supabase
      .from("daily_results")
      .select(playModeColumns)
      .eq("user_id", userId)
      .eq("date", date)
      .maybeSingle();

    if (!full.error) {
      data = full.data;
    } else {
      // Same not-yet-migrated fallback as markDailyCompleted above -- a
      // completion recorded before the playMode migration landed (or one
      // written by this same fallback) still has to be readable, not just
      // writable, or the player would see "you haven't played today" and
      // be able to reclaim a date they already completed.
      console.warn(
        "[daily] full-schema status read failed, retrying with legacy columns only:",
        full.error
      );

      const legacy = await supabase
        .from("daily_results")
        .select(legacyColumns)
        .eq("user_id", userId)
        .eq("date", date)
        .maybeSingle();

      if (legacy.error) {
        throw legacy.error;
      }
      data = legacy.data;
    }
  }

  if (!data) {
    return {
      status: "none"
    };
  }

  if (data.status === "in_progress") {
    const room =
      data.room_id
        ? rooms?.[data.room_id]
        : null;

    if (
      room &&
      room.status === "alive"
    ) {
      return {
        status: "in-progress",
        roomId: data.room_id
      };
    }

    /*
     * The server restarted or the room was deleted.
     * The attempt still counts, but cannot be resumed
     * because room state is currently in memory only.
     */
    await markDailyAbandoned({
      supabase,
      userId,
      date
    });

    return {
      status: "completed",
      result: {
        abandoned: true
      }
    };
  }

  return {
    status: "completed",
    result:
      resultFromRow(data)
  };
}

module.exports = {
  claimDailyAttempt,
  markDailyCompleted,
  markDailyAbandoned,
  getDailyStatus
};
