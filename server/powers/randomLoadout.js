// server/powers/randomLoadout.js
//
// Random loadout generation for the "custom" power-selection mode's AI
// opponents (and as a fallback for any human who reaches Ready without
// picking a saved combination). Picks up to 3 setter + 3 guesser powers
// whose combined cost lands on 9.5 or 10 points -- as close to the budget
// cap as possible without exceeding it.

const {
  SETTER_POWER_POINTS,
  GUESSER_POWER_POINTS,
  MAX_LOADOUT_POINTS,
  MAX_POWERS_PER_ROLE,
  loadoutCost
} = require("./POWER_POINTS");

function shuffle(arr) {
  const copy = arr.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function randomSubsetUpTo(ids, maxCount) {
  const shuffled = shuffle(ids);
  const count = Math.floor(Math.random() * (maxCount + 1));
  return shuffled.slice(0, count);
}

function pickRandomAILoadout() {
  const setterIds = Object.keys(SETTER_POWER_POINTS);
  const guesserIds = Object.keys(GUESSER_POWER_POINTS);
  const target = MAX_LOADOUT_POINTS - 0.5; // 9.5, the softer of the two targets

  let best = null;

  for (let attempt = 0; attempt < 2000; attempt++) {
    const setterPowers = randomSubsetUpTo(setterIds, MAX_POWERS_PER_ROLE);
    const guesserPowers = randomSubsetUpTo(guesserIds, MAX_POWERS_PER_ROLE);
    const cost = loadoutCost([...setterPowers, ...guesserPowers]);

    if (cost === MAX_LOADOUT_POINTS || cost === target) {
      return { setterPowers, guesserPowers };
    }

    if (cost <= MAX_LOADOUT_POINTS && (!best || cost > best.cost)) {
      best = { setterPowers, guesserPowers, cost };
    }
  }

  return best
    ? { setterPowers: best.setterPowers, guesserPowers: best.guesserPowers }
    : { setterPowers: [], guesserPowers: [] };
}

module.exports = { pickRandomAILoadout };
