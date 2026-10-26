// server/routes/cuddleRankings.js — Cuddle's global rankings.
//
//   POST /api/cuddle/score     one row per finished Standard or Hard run
//                              (re-sending the same run id does nothing).
//   GET  /api/cuddle/rankings  the best runs for a difficulty, one per
//                              player (their best), highest score first.
//
// Rows live in public.cuddle_scores (server/sql/cuddle_rankings.sql),
// written and read with the service-role client. The score comes from the
// player's own browser, so the board is a friendly one, not a tamper-proof
// one; fields are whitelisted and clamped all the same.

const DIFFICULTIES = new Set(["medium", "hard"]);
const MAX_ID = 200;
const MAX_NAME = 24;
const MAX_SCORE = 1_000_000;
const BOARD_SIZE = 20;

function clampText(value, limit) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, limit) : null;
}

function clampInt(value, min, max) {
  const number = Math.round(Number(value));
  if (!Number.isFinite(number)) return null;
  return Math.max(min, Math.min(max, number));
}

function makeLimiter(perMinute) {
  const hits = new Map();
  return function limited(key) {
    const now = Date.now();
    const recent = (hits.get(key) || []).filter(at => now - at < 60_000);
    if (recent.length >= perMinute) {
      hits.set(key, recent);
      return true;
    }
    recent.push(now);
    hits.set(key, recent);
    if (hits.size > 2000) {
      for (const [entryKey, times] of hits) {
        if (!times.some(at => now - at < 60_000)) hits.delete(entryKey);
      }
    }
    return false;
  };
}

function registerCuddleRankingRoutes(app, { supabase } = {}) {
  const postLimited = makeLimiter(10);
  const getLimited = makeLimiter(30);
  let errorLogged = false;
  const logOnce = (where, error) => {
    if (errorLogged) return;
    errorLogged = true;
    console.error(`[cuddle-rankings] ${where} failed (logged once):`, error?.message || error);
  };

  app.post("/api/cuddle/score", async (req, res) => {
    const body = req.body || {};
    const runId = clampText(body.runId, MAX_ID);
    const playerId = clampText(body.playerId, MAX_ID);
    const difficulty = DIFFICULTIES.has(body.difficulty) ? body.difficulty : null;
    const score = clampInt(body.score, 0, MAX_SCORE);
    if (!runId || !playerId || !difficulty || score === null) return res.status(400).json({ ok: false });
    if (postLimited(req.ip || "unknown")) return res.status(429).json({ ok: false });
    if (!supabase) return res.json({ ok: true, stored: false });

    const row = {
      run_id: runId,
      player_id: playerId,
      name: clampText(body.name, MAX_NAME) || "Guest",
      is_guest: body.isGuest !== false,
      difficulty,
      ascension: difficulty === "hard" ? clampInt(body.ascension, 0, 20) || 0 : 0,
      score,
      stages: clampInt(body.stages, 0, 99) || 0,
      won: body.won === true,
      seed: clampText(body.seed, 32)
    };
    try {
      const { error } = await supabase.from("cuddle_scores").upsert(row, { onConflict: "run_id", ignoreDuplicates: true });
      if (error) throw error;
      return res.json({ ok: true, stored: true });
    } catch (error) {
      logOnce("insert", error);
      return res.status(500).json({ ok: false });
    }
  });

  app.get("/api/cuddle/rankings", async (req, res) => {
    const difficulty = DIFFICULTIES.has(req.query.difficulty) ? req.query.difficulty : "medium";
    if (getLimited(req.ip || "unknown")) return res.status(429).json({ ok: false });
    if (!supabase) return res.json({ ok: true, available: false, rows: [] });
    try {
      // Enough rows to keep each player's best once duplicates are folded.
      const { data, error } = await supabase
        .from("cuddle_scores")
        .select("player_id, name, score, stages, won, ascension, created_at")
        .eq("difficulty", difficulty)
        .order("score", { ascending: false })
        .limit(BOARD_SIZE * 10);
      if (error) throw error;
      const seen = new Set();
      const rows = [];
      for (const item of data || []) {
        if (seen.has(item.player_id)) continue;
        seen.add(item.player_id);
        rows.push({
          name: item.name,
          score: item.score,
          stages: item.stages,
          won: item.won,
          ascension: item.ascension,
          at: item.created_at,
          // Lets the browser mark its own row without exposing ids.
          mine: typeof req.query.player === "string" && req.query.player === item.player_id
        });
        if (rows.length >= BOARD_SIZE) break;
      }
      return res.json({ ok: true, available: true, rows });
    } catch (error) {
      logOnce("read", error);
      return res.json({ ok: true, available: false, rows: [] });
    }
  });
}

module.exports = { registerCuddleRankingRoutes };
