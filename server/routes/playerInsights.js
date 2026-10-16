// server/routes/playerInsights.js — play tracking and "Did you have fun?"
//
// Two kinds of rows, both written with the service-role Supabase client
// (same reasoning as bugReports.js: guests have no Supabase session, and the
// tables need no public insert policy):
//
//   POST /api/play-run   one row per run/match, upserted as it goes
//                        (start -> progress -> end), so a run someone simply
//                        walks away from still has its time recorded.
//   POST /api/feedback   one row per answered "Did you have fun?" prompt.
//
// The tables (and handy summary views) are in server/sql/player_insights.sql.
// Every field is whitelisted and length-capped: a rewritten client can't use
// these as an unbounded write into the database.

const GAMES = new Set(["vowelplay", "cuddle"]);
const RUN_EVENTS = new Set(["start", "progress", "end"]);
const MAX_LONG_TEXT = 4000;
const MAX_SHORT_TEXT = 120;
const MAX_ID = 200;
// A run longer than this is a tab left open, not play.
const MAX_SECONDS = 24 * 60 * 60;

// Every questionnaire answer the client may send, and the values it may take.
const ANSWER_CHOICES = {
  understand: ["yes", "mostly", "no"],
  easyToPlay: ["yes", "mostly", "no"],
  complexity: ["too_simple", "just_right", "too_complicated"],
  difficulty: ["too_easy", "just_right", "too_hard"],
  animations: ["yes", "okay", "no"],
  style: ["yes", "okay", "no"],
  playStyle: ["yes", "okay", "no"],
  recommend: ["yes", "maybe", "no"]
};

function clampText(value, limit) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, limit) : null;
}

function clampSeconds(value) {
  const number = Math.round(Number(value));
  if (!Number.isFinite(number) || number < 0) return null;
  return Math.min(number, MAX_SECONDS);
}

// A small flat object of short scalars only -- never a nested blob.
function clampDetails(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const out = {};
  for (const [key, raw] of Object.entries(value).slice(0, 20)) {
    const name = String(key).slice(0, 40);
    if (typeof raw === "number" && Number.isFinite(raw)) out[name] = raw;
    else if (typeof raw === "boolean") out[name] = raw;
    else if (typeof raw === "string") out[name] = raw.slice(0, MAX_SHORT_TEXT);
  }
  return Object.keys(out).length ? out : null;
}

function cleanAnswers(value) {
  const out = {};
  if (!value || typeof value !== "object") return out;
  for (const [key, allowed] of Object.entries(ANSWER_CHOICES)) {
    if (allowed.includes(value[key])) out[key] = value[key];
  }
  return out;
}

function identity(body) {
  return {
    player_id: clampText(body.playerId, MAX_ID),
    device_id: clampText(body.deviceId, MAX_ID),
    is_guest: body.isGuest !== false
  };
}

// A per-sender budget of requests in a rolling minute: plenty for real play
// (a run sends a handful), cheap protection against a stuck loop.
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

function registerPlayerInsightRoutes(app, { supabase } = {}) {
  const runLimited = makeLimiter(30);
  const feedbackLimited = makeLimiter(6);
  // A missing table or bad credentials would otherwise log on every request.
  let runErrorLogged = false;

  app.post("/api/play-run", async (req, res) => {
    const body = req.body || {};
    const game = GAMES.has(body.game) ? body.game : null;
    const event = RUN_EVENTS.has(body.event) ? body.event : null;
    const runId = clampText(body.runId, MAX_ID);
    if (!game || !event || !runId) return res.status(400).json({ ok: false });
    if (runLimited(req.ip || "unknown")) return res.status(429).json({ ok: false });

    const now = new Date().toISOString();
    const row = {
      game,
      run_id: runId,
      ...identity(body),
      mode: clampText(body.mode, MAX_SHORT_TEXT),
      active_seconds: clampSeconds(body.activeSeconds),
      wall_seconds: clampSeconds(body.wallSeconds),
      details: clampDetails(body.details),
      last_seen_at: now
    };
    if (event === "start") row.started_at = now;
    if (event === "end") {
      row.ended_at = now;
      row.outcome = clampText(body.outcome, MAX_SHORT_TEXT) || "ended";
    }
    // Upserts only overwrite the columns sent, so leave out what's unknown
    // rather than clobbering an earlier value with null.
    for (const key of Object.keys(row)) {
      if (row[key] === null) delete row[key];
    }

    if (!supabase) return res.json({ ok: true, stored: false });
    try {
      const { error } = await supabase.from("play_runs").upsert(row, { onConflict: "game,run_id" });
      if (error) throw error;
      return res.json({ ok: true, stored: true });
    } catch (error) {
      if (!runErrorLogged) {
        runErrorLogged = true;
        console.error("[play-run] upsert failed (logged once):", error?.message || error);
      }
      return res.status(500).json({ ok: false });
    }
  });

  app.post("/api/feedback", async (req, res) => {
    const body = req.body || {};
    const game = GAMES.has(body.game) ? body.game : null;
    if (!game) return res.status(400).json({ ok: false, error: "Unknown game." });

    const hadFun = body.hadFun === true ? true : body.hadFun === false ? false : null;
    const answers = cleanAnswers(body.answers);
    const row = {
      game,
      run_id: clampText(body.runId, MAX_ID),
      ...identity(body),
      had_fun: hadFun,
      fun_reason: clampText(body.funReason, MAX_LONG_TEXT),
      had_bugs: body.hadBugs === true ? true : body.hadBugs === false ? false : null,
      bug_details: clampText(body.bugDetails, MAX_LONG_TEXT),
      ...Object.fromEntries(Object.entries(ANSWER_CHOICES).map(([key]) => [toColumn(key), answers[key] || null])),
      ideas: clampText(body.ideas, MAX_LONG_TEXT),
      mode: clampText(body.mode, MAX_SHORT_TEXT),
      outcome: clampText(body.outcome, MAX_SHORT_TEXT),
      run_details: clampDetails(body.details),
      user_agent: clampText(req.get("user-agent"), 500)
    };

    if (row.had_fun === null && !row.fun_reason && !row.bug_details && !row.ideas && !Object.keys(answers).length) {
      return res.status(400).json({ ok: false, error: "Nothing to send yet." });
    }
    if (feedbackLimited(req.ip || "unknown")) {
      return res.status(429).json({ ok: false, error: "That was just sent — give it a moment." });
    }

    if (!supabase) {
      console.log("[feedback] (no Supabase configured)", row);
      return res.json({ ok: true, stored: false });
    }
    try {
      const { error } = await supabase.from("game_feedback").insert(row);
      if (error) throw error;
      return res.json({ ok: true, stored: true });
    } catch (error) {
      // Log the whole row: a failed insert must not lose what someone wrote.
      console.error("[feedback] insert failed:", error?.message || error, row);
      return res.status(500).json({ ok: false, error: "Could not save that. Please try again." });
    }
  });
}

// understand -> understand, easyToPlay -> easy_to_play, playStyle -> play_style
function toColumn(key) {
  return key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}

module.exports = { registerPlayerInsightRoutes, ANSWER_CHOICES };
