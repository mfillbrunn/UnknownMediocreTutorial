// /powerEngine/QUEST_METADATA.js
//
// Guesser Quests: an always-on, openly-visible (both players see it)
// route to a free green letter. 5 of the 7 objective types are the exact
// unlock conditions the old revealLetter power's variants used; the
// remaining 2 are new (HARDMODE, FIELDREPORT). See
// server/powers/powers/questServer.js for the matching server-side logic.
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
  }
};
