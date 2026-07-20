// server/powers/POWER_POINTS.js
//
// Point costs for the "custom" power-selection mode (see
// server/core/phases/lobby.js's customPowersMode branch). A loadout
// combination may include up to 3 setter powers and up to 3 guesser powers,
// with combined cost capped at 10 points. Costs are half-point precise.
//
// These are INITIAL values — estimated from this session's AI-vs-AI
// simulation results plus judgment about each power's mechanic (how much
// information/tempo it denies or grants, how reliably it can be exploited,
// whether it's once-per-match vs repeatable vs always-on). They are a
// starting point pending further simulation-based tuning, not a final
// balance pass.

const SETTER_POWER_POINTS = {
  hideTile: 2,          // Hide Evidence — 2 charges, hides 1 tile for a round
  suggestSecret: 1,     // Profiler Insight — helper only, no AI payoff
  confuseColors: 2.5,   // Jam Signals — all green/yellow read as blue for a round
  countOnly: 2.5,       // Redact Report — strips position info for a round
  blindSpot: 2.5,       // Create Dead Zone — hides 1 tile for the rest of the round
  vowelRefresh: 1,      // Signal Refresh — niche, situational vowel reset
  forceGuess: 2,        // Force a Move — random restriction on next guess
  blindGuess: 3,        // Total Blackout — hides ALL feedback for a guess
  fakeFeedback: 3,      // Falsify Intel — guesser sees a real + a fake feedback
  revealPenalty: 2,     // Marked Weakness — bonus points when the revealed letter is true
  delayedIntel: 3.5,    // Delayed Intel — feedback shown one round late, whole match
  letterLockout: 3.5    // Letter Lockout — bans a letter every turn, whole match
};

const GUESSER_POWER_POINTS = {
  suggestGuess: 1,      // Analyst Tip — 2 charges, helper only, no AI payoff
  rouletteSecret: 3,    // Break Cover — spy's next secret is forced random
  forceTimer: 1.5,      // Time Pressure — short clock on spy's next secret
  revealHistory: 3,     // Solve Cold Case — reveals + potentially reusable old secret
  stealthGuess: 1.5,    // Move in Shadows — hides a guess from the spy
  revealGreen: 2.5,     // Leak Info — 2 charges, reveals a live letter position
  freezeSecret: 1.5,    // Lockdown — spy can't change secret next round
  magicMode: 3.5,       // Inside Job — turns every yellow green next round
  revealLetter: 2,       // Confirm Lead — guaranteed green via a hidden challenge
  nonsense: 2,           // Signal Scramble — a guess can be a non-word
  betMiss: 1.5,          // Risky Maneuver — bet on miss count for a free green
  fieldReport: 2.5,      // Field Report — hidden conditions for a free yellow/green
  wiretap: 1.5,          // Wiretap — passive remaining-count + live tap in bullet/blitz
  letterProbe: 1.5,      // Recon Sweep — test 5 letters, learn how many are present
  revealLocation: 3,     // Informant — always-on passive position reveal
  doubleGuess: 3.5,      // Double Tap — two guesses at once, feedback on both
  letterProfile: 1.5     // Letter Profile — always-on passive category breakdown
};

const POWER_POINTS = { ...SETTER_POWER_POINTS, ...GUESSER_POWER_POINTS };

const MAX_LOADOUT_POINTS = 10;
const MAX_POWERS_PER_ROLE = 3;

function getPowerPoints(powerId) {
  return POWER_POINTS[powerId] ?? null;
}

function loadoutCost(powerIds) {
  return (powerIds || []).reduce((sum, id) => sum + (POWER_POINTS[id] || 0), 0);
}

function isLoadoutValid(setterPowers, guesserPowers) {
  const s = Array.isArray(setterPowers) ? setterPowers : [];
  const g = Array.isArray(guesserPowers) ? guesserPowers : [];
  if (s.length > MAX_POWERS_PER_ROLE || g.length > MAX_POWERS_PER_ROLE) return false;
  if (s.some((id) => !(id in SETTER_POWER_POINTS))) return false;
  if (g.some((id) => !(id in GUESSER_POWER_POINTS))) return false;
  if (new Set(s).size !== s.length || new Set(g).size !== g.length) return false;
  return loadoutCost([...s, ...g]) <= MAX_LOADOUT_POINTS;
}

module.exports = {
  POWER_POINTS,
  SETTER_POWER_POINTS,
  GUESSER_POWER_POINTS,
  MAX_LOADOUT_POINTS,
  MAX_POWERS_PER_ROLE,
  getPowerPoints,
  loadoutCost,
  isLoadoutValid
};
