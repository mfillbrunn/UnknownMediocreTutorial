// server/cuddle/wordFrequency.js — Cuddle's answers, most common first.
//
// GET /api/cuddle/secret-order: allowed_secrets.txt sorted by how common
// each word is (the Frequency column of allowed_words.txt and
// allowed_words_modern.txt; a word with no count goes last). Cuddle draws
// its answers from the top of this list on Standard and further down on
// Hard (public/cuddle/cuddle-word-frequency.js).
const fs = require("fs");
const path = require("path");

function frequencies() {
  const counts = new Map();
  ["allowed_words.txt", "allowed_words_modern.txt"].forEach(name => {
    const file = path.join(__dirname, "../wordlists", name);
    if (!fs.existsSync(file)) return;
    const lines = fs.readFileSync(file, "utf8").trim().split(/\r?\n/);
    lines.shift();
    lines.forEach(line => {
      const cols = line.split("\t");
      const word = String(cols[0] || "").trim().toUpperCase();
      const count = Number(cols[1]) || 0;
      if (word && count > (counts.get(word) || 0)) counts.set(word, count);
    });
  });
  return counts;
}

function registerCuddleWordFrequencyRoutes(app, { allowedSecrets = [] } = {}) {
  const counts = frequencies();
  const order = allowedSecrets
    .map(word => String(word).toUpperCase())
    .sort((a, b) => (counts.get(b) || 0) - (counts.get(a) || 0) || a.localeCompare(b));
  app.get("/api/cuddle/secret-order", (req, res) => {
    res.set("Cache-Control", "public, max-age=3600");
    res.json(order);
  });
}

module.exports = { registerCuddleWordFrequencyRoutes };
