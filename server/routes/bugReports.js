// server/routes/bugReports.js — "Report a bug" submissions.
//
// Goes through the server (rather than a direct client insert) for two
// reasons: the service-role Supabase client here can write without needing
// a public insert policy on the table, and guests — who have no Supabase
// session at all — can still file a report.
//
// Expects a table like:
//
//   create table public.bug_reports (
//     id           bigint generated always as identity primary key,
//     created_at   timestamptz not null default now(),
//     message      text not null,
//     contact      text,
//     reporter_id  text,          -- profile uuid, or a "guest-..." id
//     reporter_name text,
//     is_guest     boolean not null default false,
//     room_id      text,
//     page         text,
//     user_agent   text,
//     app_state    jsonb          -- small, non-sensitive context blob
//   );
//
// Nothing here trusts the client beyond the text it typed: every field is
// length-capped before it is stored, so a rewritten client can't use this
// as an unbounded write into the database.

const MAX_MESSAGE = 4000;
const MAX_SHORT_FIELD = 300;
const MAX_USER_AGENT = 500;

// One report every few seconds per connection is plenty for a human
// filling in a form; anything faster is a stuck retry loop or abuse.
const RATE_LIMIT_MS = 5000;
const recentSubmissions = new Map();

function clampText(value, limit) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, limit);
}

function rateLimited(key) {
  const now = Date.now();
  const last = recentSubmissions.get(key) || 0;
  if (now - last < RATE_LIMIT_MS) return true;
  recentSubmissions.set(key, now);

  // The map only ever holds recent senders; drop anything past the window
  // so a long-running server doesn't accumulate an entry per visitor.
  if (recentSubmissions.size > 500) {
    for (const [entryKey, at] of recentSubmissions) {
      if (now - at > RATE_LIMIT_MS) recentSubmissions.delete(entryKey);
    }
  }
  return false;
}

function registerBugReportRoutes(app, { supabase } = {}) {
  app.post("/api/bug-report", async (req, res) => {
    const body = req.body || {};

    const message = clampText(body.message, MAX_MESSAGE);
    if (!message) {
      return res.status(400).json({ ok: false, error: "Please describe the bug." });
    }

    const senderKey = req.ip || "unknown";
    if (rateLimited(senderKey)) {
      return res
        .status(429)
        .json({ ok: false, error: "That was just sent — give it a few seconds." });
    }

    const row = {
      message,
      contact: clampText(body.contact, MAX_SHORT_FIELD),
      reporter_id: clampText(body.reporterId, MAX_SHORT_FIELD),
      reporter_name: clampText(body.reporterName, MAX_SHORT_FIELD),
      is_guest: body.isGuest === true,
      room_id: clampText(body.roomId, MAX_SHORT_FIELD),
      page: clampText(body.page, MAX_SHORT_FIELD),
      user_agent: clampText(req.get("user-agent"), MAX_USER_AGENT),
      app_state: body.appState && typeof body.appState === "object" ? body.appState : null
    };

    // No Supabase configured (local dev without credentials): log the
    // report so it isn't silently swallowed, and tell the client it
    // landed -- there is nothing the person filing it can do about the
    // server's storage setup.
    if (!supabase) {
      console.log("[bug-report] (no Supabase configured)", row);
      return res.json({ ok: true, stored: false });
    }

    try {
      const { error } = await supabase.from("bug_reports").insert(row);
      if (error) throw error;
      return res.json({ ok: true, stored: true });
    } catch (error) {
      // Still log the whole report: a failed insert must not lose what
      // someone took the trouble to write.
      console.error("[bug-report] insert failed:", error?.message || error, row);
      return res
        .status(500)
        .json({ ok: false, error: "Could not save that report. Please try again." });
    }
  });
}

module.exports = { registerBugReportRoutes };
