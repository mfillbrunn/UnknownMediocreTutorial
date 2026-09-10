// utils/secretThemes.js — theme lookup behind the "Secret Themes" guesser
// reward.
//
// wordlists/cuddle_secret_themes.json maps every word in
// wordlists/allowed_secrets.txt to one or more theme ids plus a display
// label per theme. It was generated for Cuddle, but it is keyed off that
// same shared secret list (all 3233 words, explicitly mapped), which is
// where multiplayer secrets come from too — so it covers every secret this
// mode can produce.
//
// Only ever returns display labels, never the word itself: callers hand the
// result straight to the guesser.

const fs = require("fs");
const path = require("path");

// A handful of secrets carry up to seven themes. Showing all of them would
// turn one Rare card into most of the answer, and would not fit the compact
// readout the card renders into, so only the most telling few are revealed.
const MAX_THEMES = 3;

let cache = null;

function load() {
  if (cache) return cache;
  try {
    const raw = fs.readFileSync(
      path.join(__dirname, "..", "wordlists", "cuddle_secret_themes.json"),
      "utf8"
    );
    const data = JSON.parse(raw);
    cache = { themes: data?.themes || {}, wordThemes: data?.wordThemes || {} };
  } catch {
    // A missing or malformed word list must not take the room down: the
    // reward simply stops being offered (themeLabelsForWord returns []).
    cache = { themes: {}, wordThemes: {} };
  }
  return cache;
}

// Flavor themes ("Animal", "Fire") say far more about the secret than the
// five utility ones ("Things & Ideas", "Descriptive", "General"), so they
// take the available slots first and utility themes only fill what's left.
function themeLabelsForWord(word) {
  const { themes, wordThemes } = load();
  const ids = wordThemes[String(word || "").toLowerCase()];
  if (!Array.isArray(ids)) return [];
  return ids
    .filter(id => themes[id]?.label)
    .sort((a, b) => (themes[a].kind === "flavor" ? 0 : 1) - (themes[b].kind === "flavor" ? 0 : 1))
    .slice(0, MAX_THEMES)
    .map(id => themes[id].label);
}

module.exports = { MAX_THEMES, themeLabelsForWord };
