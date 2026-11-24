// worker/leaderboard.js: today's global leaderboard for the Daily.
//
// No accounts. Each browser makes up a random device id (kept in its own
// storage) and sends its first finish of the day: the guesses per grid and
// the time. A name is optional; without one the score shows without a name.
// Everything lives in one Durable Object with its own small SQLite database
// (created by the deploy itself: see "migrations" in wrangler.jsonc).
//
// The game runs in the browser, so a determined player could send a made-up
// score. The checks here keep that honest-ish: scores must add up, times
// must be humanly possible, one score per device per day (the first one),
// and only so many new scores per network address per day.

import { DurableObject } from "cloudflare:workers";

const MAX_PER_IP_PER_DAY = 8;
const TOP = 20;
const MIN_MS_PER_GRID = 4000; // nobody reads 16 words, guesses and confirms in under 4s
const MAX_MS = 6 * 60 * 60 * 1000;

// Today in US Eastern time, like the game.
function easternDate(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 86400000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

// ---- Names: short, plain, and nothing rude ---------------------------------
// Matched anywhere in the name (no innocent word contains these)...
const ANYWHERE = [
  "fuck", "fuk", "fck", "shit", "cunt", "bitch", "nigg", "niga", "fagot", "fagg", "whore", "slut", "porn", "dildo",
  "blowjob", "handjob", "asshole", "pussy", "penis", "vagina", "retard", "kike", "wetback", "tranny", "hitler",
  "molest", "pedo", "jizz", "orgasm", "fellat", "wank", "twat", "killyourself", "bollock", "sexy"
];
// ...and these only as a whole word (they hide inside ordinary names:
// Marseille, Analise, Cumberland, Dickens, Hancock, Scunthorpe).
const WHOLE = [
  "sex", "sexy", "cum", "tit", "tits", "boob", "boobs", "dick", "cock", "fag", "spic", "chink", "gook", "dyke", "nazi",
  "rape", "kys", "nonce", "coon", "paki", "beaner", "anal", "horny", "milf", "nude", "naked", "clit", "shag", "arse",
  "ass", "bastard", "kkk", "isis", "hoe", "thot", "nig"
];
const LEET = { 0: "o", 1: "i", 3: "e", 4: "a", 5: "s", 7: "t", 8: "b", "@": "a", "$": "s", "!": "i", "|": "i" };
const unleet = text => text.toLowerCase().replace(/[0-9@$!|]/g, c => LEET[c] || c);
const squash = text => unleet(text).replace(/[^a-z]/g, "").replace(/(.)\1+/g, "$1");
const SQ_ANYWHERE = ANYWHERE.map(squash);
const SQ_WHOLE = new Set(WHOLE.map(squash));
export function cleanName(raw) {
  const name = String(raw || "").normalize("NFKC").replace(/\s+/g, " ").trim();
  if (!name) return { name: "" };
  if (name.length > 16) return { error: "Keep it to 16 characters." };
  if (!/^[\p{L}\p{N} ._'-]+$/u.test(name)) return { error: "Letters, numbers and spaces only." };
  if (/https?|www|\.(com|net|org|io|gg)\b/i.test(name)) return { error: "No links, please." };
  const flat = squash(name);
  const words = unleet(name).split(/[^a-z]+/).filter(Boolean).map(w => w.replace(/(.)\1+/g, "$1"));
  const rude = SQ_ANYWHERE.some(w => flat.includes(w)) || words.some(w => SQ_WHOLE.has(w)) || SQ_WHOLE.has(flat);
  return rude ? { error: "Please pick a different name." } : { name };
}

// ---- The board --------------------------------------------------------------
export class Leaderboard extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS scores (
      day TEXT NOT NULL, device TEXT NOT NULL, guesses INTEGER NOT NULL, time_ms INTEGER NOT NULL,
      grids TEXT NOT NULL, ip TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (day, device))`);
    this.sql.exec(`CREATE INDEX IF NOT EXISTS scores_rank ON scores (day, guesses, time_ms)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS names (device TEXT PRIMARY KEY, name TEXT NOT NULL)`);
  }

  submit({ day, device, grids, timeMs }, ip) {
    if (day !== easternDate() && day !== easternDate(-1)) return { error: "That day isn't open." };
    if (!Array.isArray(grids) || grids.length !== 3 || !grids.every(n => Number.isInteger(n) && n >= 1 && n <= 16)) return { error: "Bad score." };
    if (!Number.isInteger(timeMs) || timeMs < MIN_MS_PER_GRID * 3 || timeMs > MAX_MS) return { error: "Bad time." };
    const have = this.sql.exec(`SELECT 1 FROM scores WHERE day = ? AND device = ?`, day, device).toArray();
    if (have.length) return { ok: true, already: true };
    const fromIp = this.sql.exec(`SELECT COUNT(*) AS n FROM scores WHERE day = ? AND ip = ?`, day, ip).one().n;
    if (fromIp >= MAX_PER_IP_PER_DAY) return { error: "Too many scores from here today." };
    const guesses = grids.reduce((a, b) => a + b, 0);
    this.sql.exec(`INSERT INTO scores (day, device, guesses, time_ms, grids, ip, at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      day, device, guesses, timeMs, grids.join(","), ip, Date.now());
    // Old days go after a while; the board is about today.
    this.sql.exec(`DELETE FROM scores WHERE day < ?`, easternDate(-14));
    return { ok: true };
  }

  setName(device, raw) {
    const { name, error } = cleanName(raw);
    if (error) return { error };
    if (name) this.sql.exec(`INSERT INTO names (device, name) VALUES (?, ?) ON CONFLICT(device) DO UPDATE SET name = excluded.name`, device, name);
    else this.sql.exec(`DELETE FROM names WHERE device = ?`, device);
    return { ok: true, name };
  }

  board(day, device) {
    const rows = this.sql.exec(`SELECT s.device, s.guesses, s.time_ms AS timeMs, s.grids, n.name FROM scores s
      LEFT JOIN names n ON n.device = s.device WHERE s.day = ? ORDER BY s.guesses, s.time_ms, s.at LIMIT ?`, day, TOP).toArray();
    const total = this.sql.exec(`SELECT COUNT(*) AS n FROM scores WHERE day = ?`, day).one().n;
    const strip = (r, rank) => ({ rank, name: r.name || "", guesses: r.guesses, timeMs: r.timeMs, grids: r.grids.split(",").map(Number), me: r.device === device });
    const top = rows.map((r, i) => strip(r, i + 1));
    let me = top.find(r => r.me) || null;
    if (!me && device) {
      const mine = this.sql.exec(`SELECT s.device, s.guesses, s.time_ms AS timeMs, s.grids, s.at, n.name FROM scores s
        LEFT JOIN names n ON n.device = s.device WHERE s.day = ? AND s.device = ?`, day, device).toArray()[0];
      if (mine) {
        const ahead = this.sql.exec(`SELECT COUNT(*) AS n FROM scores WHERE day = ? AND (guesses < ? OR (guesses = ? AND (time_ms < ? OR (time_ms = ? AND at < ?))))`,
          day, mine.guesses, mine.guesses, mine.timeMs, mine.timeMs, mine.at).one().n;
        me = strip(mine, ahead + 1);
      }
    }
    const nameRow = device ? this.sql.exec(`SELECT name FROM names WHERE device = ?`, device).toArray()[0] : null;
    return { day, total, top, me, name: nameRow?.name || "" };
  }
}

// ---- The API: /api/board, /api/score, /api/name ---------------------------
const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
});
const deviceOk = d => typeof d === "string" && /^[a-z0-9]{16,40}$/.test(d);

export async function handleApi(request, env) {
  const url = new URL(request.url);
  const stub = env.LEADERBOARD.get(env.LEADERBOARD.idFromName("global"));
  const ip = request.headers.get("CF-Connecting-IP") || "local";
  try {
    if (url.pathname === "/api/board" && request.method === "GET") {
      const day = url.searchParams.get("day") || easternDate();
      const device = url.searchParams.get("device") || "";
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return json({ error: "Bad day." }, 400);
      return json(await stub.board(day, deviceOk(device) ? device : ""));
    }
    if (request.method !== "POST") return json({ error: "Not found." }, 404);
    if ((request.headers.get("Content-Length") || 0) > 2000) return json({ error: "Too big." }, 413);
    const body = await request.json().catch(() => null);
    if (!body || !deviceOk(body.device)) return json({ error: "Bad request." }, 400);
    if (url.pathname === "/api/score") {
      const res = await stub.submit(body, ip);
      return json(res, res.error ? 400 : 200);
    }
    if (url.pathname === "/api/name") {
      const res = await stub.setName(body.device, body.name);
      return json(res, res.error ? 400 : 200);
    }
    return json({ error: "Not found." }, 404);
  } catch (e) {
    return json({ error: "Something went wrong." }, 500);
  }
}
