// /powerEngine/QUEST_METADATA.js
//
// Guesser Quests: an always-on, openly-visible (both players see it)
// route to a free green letter. ROW/RARE/ALPHA/DOUBLES/CHAIN are the exact
// unlock conditions the old revealLetter power's variants used;
// HARDMODE/FIELDREPORT and the six ALTERNATING..VOWELSHORTAGE types
// below are new. See server/powers/powers/questServer.js for the matching
// server-side logic.
// examples: 2-3 real, dictionary-valid guesses that satisfy the quest's
// condition on their own (or, for ROW/CHAIN/VOWELSHORTAGE, as a short
// sequence) -- shown in the Powers screen's Guesser Quests tab so players
// can see what "counts" without needing to play a live round. Omitted for
// HARDMODE and FIELDREPORT: both depend on state that's generated fresh
// each round (prior feedback, randomized conditions), so no fixed word
// list could actually demonstrate them.
window.QUEST_METADATA = {
  ROW: {
    label: "Full Sweep",
    desc: "Use every letter in one keyboard row (top, home, or bottom) across your guesses.",
    emoji: "⌨️",
    color: "#16A34A",
    examples: ["ROUTE", "POWER", "QUIET"]
  },
  RARE: {
    label: "High-Value Target",
    desc: "Use at least 5 of Q, J, X, Z, W, K, V across your guesses.",
    emoji: "💎",
    color: "#16A34A",
    examples: ["QUACK", "VIXEN", "WACKY"]
  },
  ALPHA: {
    label: "In Order",
    desc: "Submit 3 guesses whose letters are in strict alphabetical order: A -> Z.",
    emoji: "🔤",
    color: "#16A34A",
    examples: ["ABHOR", "CHOPS", "DIRTY"]
  },
  DOUBLES: {
    label: "Double Trouble",
    desc: "Submit 3 guesses with distinct double letters (e.g. SPEED, GLOSS, MAMMY — no repeating the same doubled letter).",
    emoji: "👯",
    color: "#16A34A",
    examples: ["SPEED", "GLOSS", "MAMMY"]
  },
  CHAIN: {
    label: "Word Chain",
    desc: "Submit guesses that each start with the last letter of your previous guess.",
    emoji: "🔗",
    color: "#16A34A",
    examples: ["TOWER", "RADIO", "OCEAN"]
  },
  HARDMODE: {
    label: "Hard Mode Streak",
    desc: "Submit 4 guesses (including your simultaneous-round opener) that are Hard Mode legal — each guess must be consistent with all prior feedback.",
    emoji: "🎯",
    color: "#16A34A"
  },
  FIELDREPORT: {
    label: "Field Report",
    desc: "3 conditions are shown below. Every condition your guesses satisfy (across all your guesses) adds to a running total — reach 6 for an early yellow letter, 8 for the full green.",
    emoji: "📋",
    color: "#16A34A"
  },
  ALTERNATING: {
    label: "Zigzag",
    desc: "Submit 3 guesses that strictly alternate consonant/vowel (e.g. CVCVC or VCVCV).",
    emoji: "🌀",
    color: "#16A34A",
    examples: ["MAGIC", "DEBIT", "LEMON"]
  },
  BOOKENDS: {
    label: "Bookends",
    desc: "Submit 3 guesses whose first and last letter are identical (e.g. AxxxA, LxxxL).",
    emoji: "📚",
    color: "#16A34A",
    examples: ["SEEDS", "LEVEL", "STATS"]
  },
  REVERSEALPHA: {
    label: "Reverse Order",
    desc: "Submit 3 guesses whose letters are in strict descending alphabetical order: Z -> A.",
    emoji: "🔃",
    color: "#16A34A",
    examples: ["TRIED", "PLIED", "TONED"]
  },
  HALF_AM: {
    label: "A to M",
    desc: "Submit 3 guesses using only letters A through M.",
    emoji: "🅰️",
    color: "#16A34A",
    examples: ["CABLE", "MAGIC", "IDEAL"]
  },
  HALF_NZ: {
    label: "N to Z",
    desc: "Submit 3 guesses using only letters N through Z.",
    emoji: "🆉",
    color: "#16A34A",
    examples: ["STONY", "SPORT", "TRUST"]
  },
  VOWELSHORTAGE: {
    label: "Vowel Shortage",
    desc: "Submit 4 guesses that each contain only one vowel.",
    emoji: "🏜️",
    color: "#16A34A",
    examples: ["TRUST", "CRISP", "GHOST", "PLANT"]
  }
};
