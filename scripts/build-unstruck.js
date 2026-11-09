// scripts/build-unstruck.js — assembles Unstruck as a self-contained static
// site in dist/unstruck/, for Cloudflare Pages (or any static host).
//
//   node scripts/build-unstruck.js
//
// The game itself lives in public/ (client/daily-pick.js, css/daily-pick.css,
// unstruck/) and is shared with the main site; this only copies it into one
// folder with local paths, and points the link-preview tags at the site's
// address (SITE_URL, default https://playunstruck.mkfillbrunn.workers.dev) because most apps
// only show a preview image from a full https:// address.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const root = path.join(__dirname, "..");
const pub = path.join(root, "public");
const out = path.join(root, "dist", "unstruck");
const site = (process.env.SITE_URL || "https://playunstruck.mkfillbrunn.workers.dev").replace(/\/+$/, "");

// Files copied as they are: [from (in public/), to (in the site)].
const files = [
  ["client/daily-pick.js", "game.js"],
  ["css/daily-pick.css", "game.css"],
  ["unstruck/unstruck.css", "unstruck.css"],
  ["wordlists/daily-pick-words.txt", "words.txt"],
  ["assets/unstruck/unstruck-logo.svg", "logo.svg"],
  ["unstruck/og-image.png", "og-image.png"],
  ["unstruck/apple-touch-icon.png", "apple-touch-icon.png"]
];

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

const version = {};
for (const [from, to] of files) {
  const data = fs.readFileSync(path.join(pub, from));
  fs.writeFileSync(path.join(out, to), data);
  // A short content hash, so browsers fetch a file again only when it changed.
  version[to] = crypto.createHash("sha1").update(data).digest("hex").slice(0, 8);
}

// The page: same as public/unstruck/index.html, with every path local.
let html = fs.readFileSync(path.join(pub, "unstruck/index.html"), "utf8");
const swaps = [
  [/href="\.\.\/assets\/unstruck\/unstruck-logo\.svg"/, `href="logo.svg?v=${version["logo.svg"]}"`],
  [/href="unstruck\.css\?v=[^"]*"/, `href="unstruck.css?v=${version["unstruck.css"]}"`],
  [/href="\.\.\/css\/daily-pick\.css\?v=[^"]*"/, `href="game.css?v=${version["game.css"]}"`],
  [/src="\.\.\/client\/daily-pick\.js\?v=[^"]*" data-words="[^"]*"/, `src="game.js?v=${version["game.js"]}" data-words="words.txt?v=${version["words.txt"]}"`],
  [/<meta property="og:image" content="[^"]*">/, `<meta property="og:image" content="${site}/og-image.png">\n  <meta property="og:url" content="${site}/">`],
  [/<meta name="twitter:image" content="[^"]*">/, `<meta name="twitter:image" content="${site}/og-image.png">`]
];
for (const [pattern, replacement] of swaps) {
  if (!pattern.test(html)) throw new Error(`build-unstruck: couldn't find ${pattern} in public/unstruck/index.html`);
  html = html.replace(pattern, replacement);
}
fs.writeFileSync(path.join(out, "index.html"), html);

// Cache: the page itself always fresh, everything else (versioned) for a year.
fs.writeFileSync(path.join(out, "_headers"), [
  "/",
  "  Cache-Control: no-cache",
  "/index.html",
  "  Cache-Control: no-cache",
  "/*.js",
  "  Cache-Control: public, max-age=31536000",
  "/*.css",
  "  Cache-Control: public, max-age=31536000",
  ""
].join("\n"));

console.log(`Unstruck built in ${path.relative(root, out)} for ${site}`);
