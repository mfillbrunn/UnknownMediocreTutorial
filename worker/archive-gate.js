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
    if (pathname !== "/archive" && pathname !== "/archive/") return new Response("Not found", { status: 404 });
    if (!env.ARCHIVE_PASSWORD) return new Response("The archive isn't open yet.", { status: 503, headers: { "Cache-Control": "no-store" } });
    if (!passwordOk(request, env.ARCHIVE_PASSWORD)) {
      return new Response("This page needs the archive password.", {
        status: 401,
        headers: { "WWW-Authenticate": 'Basic realm="Unstruck archive", charset="UTF-8"', "Cache-Control": "no-store" }
      });
    }
    return new Response(archivePage, {
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex" }
    });
  }
};

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
