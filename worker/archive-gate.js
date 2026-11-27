// worker/archive-gate.js: the server code on the Unstruck site (the archive
// gate here, and the leaderboard's /api/ in leaderboard.js).
//
// The game itself is plain files (dist/unstruck), served straight by
// Cloudflare. This Worker only runs for addresses that aren't one of those
// files, which is how /archive reaches it: the archive page is NOT among the
// site's files. It's bundled in here (dist/archive.html, made by
// scripts/build-unstruck.js), so the only way to get it is past this check.
//
// The password is a Cloudflare secret named ARCHIVE_PASSWORD (Workers &
// Pages > play > Settings > Variables and Secrets). Any username works.
// Without the secret set, the archive stays shut.

import archivePage from "../dist/archive.html";
import { handleApi, Leaderboard, netTag, easternDate } from "./leaderboard.js";

// The leaderboard's Durable Object class has to be exported from here.
export { Leaderboard };

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname.startsWith("/api/")) return handleApi(request, env);
    if (pathname === "/admin" || pathname === "/admin/") return admin(request, env);
    if (pathname !== "/archive" && pathname !== "/archive/") {
      return page(404, "Page not found", `<p>There's nothing here.</p>`);
    }
    // A Secret or a plain-text variable named ARCHIVE_PASSWORD both work.
    const password = (env.ARCHIVE_PASSWORD || "").trim();
    if (!password) {
      return page(503, "The archive isn't open yet", `<p>The archive's password hasn't been set up on Cloudflare yet.</p>
        <p class="small">For the site's owner: in Cloudflare, open Workers &amp; Pages &rarr; play &rarr; Settings &rarr; <b>Variables and Secrets</b> (not the one under Build), add a <b>Secret</b> named <b>ARCHIVE_PASSWORD</b>, and deploy.</p>`);
    }
    if (!passwordOk(request, password)) {
      return page(401, "Archive password needed", `<p>The archive needs a password. Reload the page to enter it (any username works).</p>`,
        { "WWW-Authenticate": 'Basic realm="Unstruck archive", charset="UTF-8"' });
    }
    return new Response(archivePage, {
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex" }
    });
  }
};

// A small web page (not plain text, which some phone browsers download
// instead of showing).
function page(status, title, body, headers = {}) {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">
<title>${title} – Unstruck</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0e1520;color:#eef1f5;
font:16px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;padding:24px;box-sizing:border-box}
main{max-width:360px;text-align:center}h1{font-size:22px;margin:0 0 12px}.small{font-size:14px;opacity:.75}
a{color:#8ec5ff}</style></head><body><main><h1>${title}</h1>${body}<p><a href="/">Play today's Unstruck &rarr;</a></p></main></body></html>`;
  return new Response(html, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", ...headers } });
}

// The browser's sign-in box sends "username:password" in the Authorization header.
function passwordOk(request, password) {
  const header = request.headers.get("Authorization") || "";
  if (!header.startsWith("Basic ")) return false;
  let given;
  try {
    const decoded = new TextDecoder().decode(Uint8Array.from(atob(header.slice(6)), c => c.charCodeAt(0)));
    given = decoded.slice(decoded.indexOf(":") + 1);
  } catch (e) {
    return false;
  }
  return sameText(given, password);
}

// Compares in the same time whatever the input, so the password can't be
// guessed letter by letter from how quickly a wrong one is refused.
function sameText(a, b) {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] || 0) ^ (y[i] || 0);
  return diff === 0;
}

// ---- /admin: the leaderboard's scores, for the site's owner ----------------
// Same password as the archive. Shows the last three days with a short tag
// for each browser and each network, so one person posting from several
// browsers stands out, and a button to remove a score.
async function admin(request, env) {
  const password = (env.ARCHIVE_PASSWORD || "").trim();
  if (!password || !passwordOk(request, password)) {
    return page(401, "Admin password needed", `<p>Use the archive password (any username).</p>`,
      { "WWW-Authenticate": 'Basic realm="Unstruck admin", charset="UTF-8"' });
  }
  const stub = env.LEADERBOARD.get(env.LEADERBOARD.idFromName("global"));
  const url = new URL(request.url);
  if (request.method === "POST") {
    const form = await request.formData();
    await stub.adminRemove(String(form.get("day")), String(form.get("device")));
    return Response.redirect(`${url.origin}/admin`, 303);
  }
  const days = [easternDate(), easternDate(-1), easternDate(-2)];
  const data = await stub.adminList(days);
  const esc = t => String(t).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const time = ms => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`;
  // Old rows kept the raw address; tag those the same way as new ones.
  const net = async ip => (await netTag(ip)).slice(0, 6);
  // Which browsers and networks show up on more than one score (any day).
  const all = Object.values(data).flat();
  const nets = {};
  for (const r of all) { r.net = await net(r.ip); nets[r.net] = (nets[r.net] || 0) + 1; }
  let html = "";
  for (const day of days) {
    const rows = data[day];
    html += `<h2>${day} <small>${rows.length} scores</small></h2><table><tr><th>#</th><th>Name</th><th>Grids</th><th>Guesses</th><th>Time</th><th>Browser</th><th>Network</th><th>Sent (ET)</th><th></th></tr>`;
    rows.forEach((r, i) => {
      const fast = r.timeMs / r.guesses < 5000;
      const sent = new Date(r.at).toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" });
      html += `<tr class="${fast ? "fast" : ""}${r.ranked ? "" : " off"}"><td>${i + 1}</td><td>${esc(r.name || "—")}${r.ranked ? "" : ' <span class="tag">not ranked</span>'}</td><td>${esc(r.grids)}</td><td>${r.guesses}</td><td>${time(r.timeMs)}</td>
        <td><code>${esc(r.device.slice(0, 6))}</code></td><td><code class="${nets[r.net] > 1 ? "dup" : ""}">${r.net}</code></td><td>${sent}</td>
        <td><form method="post" onsubmit="return confirm('Remove this score?')"><input type="hidden" name="day" value="${day}"><input type="hidden" name="device" value="${esc(r.device)}"><button>Remove</button></form></td></tr>`;
    });
    html += "</table>";
  }
  const body = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Unstruck admin</title>
<style>body{margin:0;padding:16px;background:#1b1a18;color:#f1ece2;font:14px/1.4 -apple-system,Segoe UI,Roboto,Arial,sans-serif}h1{font-size:20px}h2{font-size:16px;margin:22px 0 6px}small{opacity:.6;font-weight:400}
table{border-collapse:collapse;width:100%;font-size:13px}td,th{padding:5px 6px;border-bottom:1px solid #34312d;text-align:left;white-space:nowrap}th{opacity:.6;font-weight:600}
tr.fast td{background:rgba(229,72,77,.18)}tr.off td{opacity:.55}.tag{font-size:11px;background:#57524b;padding:1px 5px;border-radius:4px}code{font-size:12px}code.dup{background:#e8b83a;color:#1c1b19;padding:1px 4px;border-radius:4px}button{background:#e5484d;color:#fff;border:0;border-radius:6px;padding:4px 8px}
.key{opacity:.7;font-size:13px}.wrap{overflow-x:auto}</style></head><body><h1>Unstruck leaderboard: last 3 days</h1>
<p class="key">Red rows: under 5 seconds per guess. A yellow network tag: that network sent more than one score in these 3 days (one person on several browsers, or a shared home or office network). Browser is the same 6 letters every day for the same browser. Not ranked: a new browser on a network that sent a score in the 30 minutes before (kept off the public board automatically).</p>
<div class="wrap">${html}</div></body></html>`;
  return new Response(body, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
}
