// utils/secretThemes.js — theme lookup behind the "Secret Themes" guesser
// power.
//
// wordlists/cuddle_secret_themes.json maps every word in
// wordlists/allowed_secrets.txt to one or more theme ids plus a display
// label per theme. It was generated for Cuddle, but it is keyed off that
// same shared secret list (all 3233 words, explicitly mapped), which is
// where multiplayer secrets come from too — so it covers every secret this
// mode can produce.
//
// Only ever returns a display label, never the word itself: callers hand
// the result straight to the guesser.

const fs = require("fs");
const path = require("path");

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
    // power simply stops being offered (topThemeLabelForWord returns null).
    cache = { themes: {}, wordThemes: {} };
  }
  return cache;
}

// Exactly one label, because this is a standing readout rather than a
// one-time dump: a word carrying seven themes would otherwise hand over
// most of the answer on the turn it's granted.
//
// Flavor themes ("Animal", "Fire") say far more about the secret than the
// five utility ones ("Things & Ideas", "Descriptive", "General"), so the
// most specific one available wins and a utility label is only the answer
// when a word has nothing better. Ties resolve to the order the word list
// gives, which is stable per word — so the label only ever changes when
// the secret itself does.
function topThemeLabelForWord(word) {
  const { themes, wordThemes } = load();
  const ids = wordThemes[String(word || "").toLowerCase()];
  if (!Array.isArray(ids)) return null;
  const labelled = ids.filter(id => themes[id]?.label);
  const best = labelled.find(id => themes[id].kind === "flavor") || labelled[0];
  return best ? themes[best].label : null;
}

// Every label a word carries, for the one-shot "Theme Dossier" reveal
// (secretThemesRevealServer.js) — unlike topThemeLabelForWord, handing over
// everything at once is the entire point of that card. Same flavor-before-
// utility ordering so the most telling label still reads first in the list.
function allThemeLabelsForWord(word) {
  const { themes, wordThemes } = load();
  const ids = wordThemes[String(word || "").toLowerCase()];
  if (!Array.isArray(ids)) return [];
  const labelled = ids.filter(id => themes[id]?.label);
  const flavor = labelled.filter(id => themes[id].kind === "flavor");
  const utility = labelled.filter(id => themes[id].kind !== "flavor");
  return [...flavor, ...utility].map(id => themes[id].label);
}

module.exports = { topThemeLabelForWord, allThemeLabelsForWord };
