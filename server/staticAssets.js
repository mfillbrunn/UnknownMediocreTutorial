// server/staticAssets.js
//
// Serves the page's scripts, stylesheets and markup compressed and cached.
//
// The page loads ~190 scripts and ~55 stylesheets (about 4.3 MB of text).
// express.static sent them uncompressed with `max-age=0`, so every visit
// downloaded or re-checked each one. Here:
//   - text files go out brotli- or gzip-compressed (compressed once per
//     file version and kept in memory);
//   - index.html is served with every local script and stylesheet URL
//     stamped `h=<hash of the file's contents>`, so a file is cached for a
//     year (`immutable`) and an edited file gets a new URL by itself;
//   - anything requested without that stamp (and index.html itself) is
//     revalidated every time, by ETag.
// Everything else (images, audio, fonts) is left to express.static.

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const crypto = require("crypto");

const TYPES = {
  ".js": "application/javascript; charset=UTF-8",
  ".css": "text/css; charset=UTF-8",
  ".html": "text/html; charset=UTF-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=UTF-8"
};
const YEAR = "public, max-age=31536000, immutable";

function createStaticAssets(publicDir) {
  const root = path.resolve(publicDir);
  const assets = new Map();

  // A file's current version: its bytes, hash and compressed forms (made
  // on first use). Null when it isn't a servable file under public/.
  function asset(absolute) {
    let stat;
    try { stat = fs.statSync(absolute); } catch (_error) { return null; }
    if (!stat.isFile()) return null;
    const known = assets.get(absolute);
    if (known && known.mtimeMs === stat.mtimeMs && known.size === stat.size) return known;
    const raw = fs.readFileSync(absolute);
    const entry = {
      mtimeMs: stat.mtimeMs,
      size: stat.size,
      raw,
      hash: crypto.createHash("md5").update(raw).digest("hex").slice(0, 12),
      br: null,
      gz: null
    };
    assets.set(absolute, entry);
    return entry;
  }

  function resolve(urlPath) {
    let decoded;
    try { decoded = decodeURIComponent(urlPath); } catch (_error) { return null; }
    const absolute = path.resolve(root, "." + decoded);
    return absolute === root || absolute.startsWith(root + path.sep) ? absolute : null;
  }

  // index.html with every local .js/.css URL stamped with its file's hash.
  let page = null;
  function stampedIndex() {
    const absolute = path.join(root, "index.html");
    const source = asset(absolute);
    if (!source) return null;
    const html = source.raw.toString("utf8");
    const parts = [];
    const stamped = html.replace(/(\s(?:src|href)=")([^"]+)(")/g, (match, before, url, after) => {
      if (/^(?:[a-z]+:|\/\/|#|data:)/i.test(url)) return match;
      const [pathPart, query = ""] = url.split("?");
      if (!/\.(?:js|css)$/i.test(pathPart)) return match;
      const file = resolve(pathPart.startsWith("/") ? pathPart : "/" + pathPart);
      const entry = file && asset(file);
      if (!entry) return match;
      parts.push(entry.hash);
      return before + pathPart + "?" + (query ? query + "&" : "") + "h=" + entry.hash + after;
    });
    const signature = source.hash + ":" + parts.join(",");
    if (!page || page.signature !== signature) {
      const raw = Buffer.from(stamped, "utf8");
      page = { signature, raw, hash: crypto.createHash("md5").update(raw).digest("hex").slice(0, 12), br: null, gz: null };
    }
    return page;
  }

  function encodingFor(req) {
    const accepted = String(req.headers["accept-encoding"] || "");
    if (/\bbr\b/.test(accepted)) return "br";
    if (/\bgzip\b/.test(accepted)) return "gz";
    return "";
  }

  function body(entry, encoding) {
    if (encoding === "br") {
      if (!entry.br) {
        entry.br = zlib.brotliCompressSync(entry.raw, {
          params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 9, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: entry.raw.length }
        });
      }
      return entry.br;
    }
    if (encoding === "gz") {
      if (!entry.gz) entry.gz = zlib.gzipSync(entry.raw, { level: 9 });
      return entry.gz;
    }
    return entry.raw;
  }

  function send(req, res, entry, type, cacheControl) {
    const encoding = encodingFor(req);
    const etag = `"${entry.hash}${encoding ? "-" + encoding : ""}"`;
    res.setHeader("Content-Type", type);
    res.setHeader("Cache-Control", cacheControl);
    res.setHeader("Vary", "Accept-Encoding");
    res.setHeader("ETag", etag);
    if (req.headers["if-none-match"] === etag) {
      res.statusCode = 304;
      res.end();
      return;
    }
    const data = body(entry, encoding);
    if (encoding) res.setHeader("Content-Encoding", encoding === "br" ? "br" : "gzip");
    res.setHeader("Content-Length", data.length);
    if (req.method === "HEAD") { res.end(); return; }
    res.end(data);
  }

  function sendIndex(req, res) {
    const entry = stampedIndex();
    if (!entry) return false;
    send(req, res, entry, TYPES[".html"], "no-cache");
    return true;
  }

  function middleware(req, res, next) {
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    if (req.path === "/" || req.path === "/index.html") {
      if (!sendIndex(req, res)) next();
      return;
    }
    const type = TYPES[path.extname(req.path).toLowerCase()];
    if (!type) return next();
    const absolute = resolve(req.path);
    const entry = absolute && asset(absolute);
    if (!entry) return next();
    send(req, res, entry, type, req.query && req.query.h ? YEAR : "no-cache");
  }

  // Compresses everything the page links to ahead of the first visitor,
  // one file per turn of the event loop so the server stays responsive.
  function warm() {
    const entry = stampedIndex();
    if (!entry) return;
    const files = [];
    entry.raw.toString("utf8").replace(/\s(?:src|href)="([^"?]+\.(?:js|css))\?[^"]*h=[0-9a-f]+"/gi, (match, url) => {
      const file = resolve(url.startsWith("/") ? url : "/" + url);
      if (file) files.push(file);
      return match;
    });
    body(entry, "br");
    body(entry, "gz");
    (function next() {
      const file = files.shift();
      if (!file) return;
      try {
        const item = asset(file);
        if (item) { body(item, "br"); body(item, "gz"); }
      } catch (_error) { /* compressed on first request instead */ }
      setImmediate(next);
    }());
  }

  return { middleware, sendIndex, warm };
}

module.exports = { createStaticAssets };
