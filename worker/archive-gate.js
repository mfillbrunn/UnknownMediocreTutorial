// worker/archive-gate.js: the one bit of server code on the Unstruck site.
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

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
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
