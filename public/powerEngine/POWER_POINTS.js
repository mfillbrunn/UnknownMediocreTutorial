// public/powerEngine/POWER_POINTS.js
//
// Client-side mirror of server/powers/POWER_POINTS.js — kept in sync
// manually, same convention as DEV_SETTER_POWERS/DEV_GUESSER_POWERS in
// client/dev-powers.js. Used by the Power Loadouts builder UI to show
// costs and enforce the budget before ever hitting the server.

window.SETTER_POWER_POINTS = {
  hideTile: 2,
  suggestSecret: 1,
  confuseColors: 2.5,
  countOnly: 2.5,
  blindSpot: 2.5,
  vowelRefresh: 1,
  forceGuess: 2,
  blindGuess: 3,
  fakeFeedback: 3,
  revealPenalty: 2,
  delayedIntel: 3.5,
  letterLockout: 3.5
};

window.GUESSER_POWER_POINTS = {
  suggestGuess: 1,
  rouletteSecret: 3,
  forceTimer: 1.5,
  revealHistory: 3,
  stealthGuess: 1.5,
  revealGreen: 2.5,
  freezeSecret: 1.5,
  magicMode: 3.5,
  revealLetter: 2,
  nonsense: 2,
  betMiss: 1.5,
  fieldReport: 2.5,
  wiretap: 1.5,
  letterProbe: 1.5,
  revealLocation: 3,
  doubleGuess: 3.5,
  letterProfile: 1.5
};

window.POWER_POINTS = { ...window.SETTER_POWER_POINTS, ...window.GUESSER_POWER_POINTS };

window.MAX_LOADOUT_POINTS = 10;
window.MAX_POWERS_PER_ROLE = 3;

window.loadoutCost = function (powerIds) {
  return (powerIds || []).reduce((sum, id) => sum + (window.POWER_POINTS[id] || 0), 0);
};

window.isLoadoutValid = function (setterPowers, guesserPowers) {
  const s = Array.isArray(setterPowers) ? setterPowers : [];
  const g = Array.isArray(guesserPowers) ? guesserPowers : [];
  if (s.length > window.MAX_POWERS_PER_ROLE || g.length > window.MAX_POWERS_PER_ROLE) return false;
  if (s.some((id) => !(id in window.SETTER_POWER_POINTS))) return false;
  if (g.some((id) => !(id in window.GUESSER_POWER_POINTS))) return false;
  if (new Set(s).size !== s.length || new Set(g).size !== g.length) return false;
  return window.loadoutCost([...s, ...g]) <= window.MAX_LOADOUT_POINTS;
};
