// /game-engine/validation.js — UNIVERSAL VERSION

function isValidWord(w, allowedList) {
  if (!w || w.length !== 5) return false;
  if (!allowedList || allowedList.length === 0) return true;
  return allowedList.includes(w.toLowerCase());
}

function parseWordlist(raw) {
  return raw
    .split(/\r?\n/)
    .map(w => w.trim().toLowerCase())
    .filter(w => w.length === 5);
}

if (typeof window !== "undefined") {
  window.isValidWord = isValidWord;
  window.parseWordlist = parseWordlist;
}

if (typeof module !== "undefined") {
  module.exports = { isValidWord, parseWordlist };
}
