// /game-engine/validation.js

/**
 * Validate a word — must be length 5 and in allowed list.
 */
export function isValidWord(w, allowedList) {
  if (!w || w.length !== 5) return false;
  if (!allowedList || allowedList.length === 0) return true; // no list loaded = allow anything
  return allowedList.includes(w.toLowerCase());
}

/**
 * Load a word list from raw text (one word per line).
 */
export function parseWordlist(raw) {
  return raw
    .split(/\r?\n/)
    .map(w => w.trim().toLowerCase())
    .filter(w => w.length === 5);
}
