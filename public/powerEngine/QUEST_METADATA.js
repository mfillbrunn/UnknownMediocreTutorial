// /powerEngine/QUEST_METADATA.js
//
// Guesser Quests: an always-on, openly-visible (both players see it)
// route to a free green letter. ROW/RARE/ALPHA/DOUBLES/CHAIN are the exact
// unlock conditions the old revealLetter power's variants used;
// HARDMODE/FIELDREPORT and the six ALTERNATING..VOWELPROGRESSION types
// below are new. See server/powers/powers/questServer.js for the matching
// server-side logic.
window.QUEST_METADATA = {
  ROW: {
    label: "Full Sweep",
    desc: "Use every letter in one keyboard row (top, home, or bottom) across your guesses.",
    emoji: "⌨️",
    color: "#16A34A"
  },
  RARE: {
    label: "High-Value Target",
    desc: "Use at least 4 of Q, J, X, Z, W, K, V across your guesses.",
    emoji: "💎",
    color: "#16A34A"
  },
  ALPHA: {
    label: "In Order",
    desc: "Submit 3 guesses whose letters are in strict alphabetical order (e.g. ABHOR).",
    emoji: "🔤",
    color: "#16A34A"
  },
  DOUBLES: {
    label: "Double Trouble",
    desc: "Submit 3 guesses with distinct double letters (e.g. SPEED, GLOSS, MAMMY — no repeating the same doubled letter).",
    emoji: "👯",
    color: "#16A34A"
  },
  CHAIN: {
    label: "Word Chain",
    desc: "Submit guesses that each start with the last letter of your previous guess.",
    emoji: "🔗",
    color: "#16A34A"
  },
  HARDMODE: {
    label: "Hard Mode Streak",
    desc: "Submit 4 guesses (including your simultaneous-round opener) that are Hard Mode legal — each guess must keep every green letter in place and reuse every yellow letter revealed so far.",
    emoji: "🎯",
    color: "#16A34A"
  },
  FIELDREPORT: {
    label: "Field Report",
    desc: "3 conditions are shown below. Submit 3 guesses that each meet at least 2 of the 3.",
    emoji: "📋",
    color: "#16A34A"
  },
  ALTERNATING: {
    label: "Zigzag",
    desc: "Submit 3 guesses that strictly alternate consonant/vowel (e.g. MAGIC, DEBIT).",
    emoji: "🌀",
    color: "#16A34A"
  },
  BOOKENDS: {
    label: "Bookends",
    desc: "Submit 3 guesses whose first and last letter are identical (e.g. SEEDS, LEVEL).",
    emoji: "📚",
    color: "#16A34A"
  },
  REVERSEALPHA: {
    label: "Reverse Order",
    desc: "Submit 3 guesses whose letters are in strict descending alphabetical order (e.g. ZYXWV).",
    emoji: "🔃",
    color: "#16A34A"
  },
  HALF_AM: {
    label: "A to M",
    desc: "Submit 3 guesses using only letters A through M.",
    emoji: "🅰️",
    color: "#16A34A"
  },
  HALF_NZ: {
    label: "N to Z",
    desc: "Submit 3 guesses using only letters N through Z.",
    emoji: "🆉",
    color: "#16A34A"
  },
  VOWELPROGRESSION: {
    label: "Vowel Ladder",
    desc: "Submit a guess with exactly 1 vowel, then (later) one with 2, then 3, then 4 — in that order.",
    emoji: "🪜",
    color: "#16A34A"
  }
};
