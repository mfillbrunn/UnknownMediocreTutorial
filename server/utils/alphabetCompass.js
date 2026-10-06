// Alphabet Compass readings (guesser Power Choice reward, Rare).
//
// Once picked, the reward lasts until the word is guessed: one tile of
// every guess on the board -- earlier rows and every row still to come --
// shows a compass arrow against the CURRENT secret: "L" when the secret's
// letter in that position comes earlier in the alphabet than the guessed
// letter, "R" when it comes later. The tile is never a green one, and
// each row keeps its tile (state.powers.alphabetCompassPicks) while its
// arrow is re-read whenever the secret may have moved. The client never
// holds the secret, so the readings are computed here.

// One reading per tile: "L" (secret letter is earlier), "R" (later), "G".
function compassReading(secret, guess) {
  const target = String(secret || "").toUpperCase();
  const word = String(guess || "").toUpperCase();
  return Array.from({ length: 5 }, (_unused, index) => {
    const want = target[index];
    const got = word[index];
    if (!want || !got) return null;
    if (want === got) return "G";
    return want < got ? "L" : "R";
  });
}

// Rebuilds state.powers.alphabetCompassRows -- one entry per history row
// with a guess, in board order, each with a single "L"/"R" and nulls.
function refreshCompass(state, random = Math.random) {
  const powers = state && state.powers;
  if (!powers || !powers.alphabetCompassActive || !state.secret) return;
  const picks = Array.isArray(powers.alphabetCompassPicks) ? powers.alphabetCompassPicks.slice() : [];
  powers.alphabetCompassRows = (state.history || [])
    .filter(entry => entry?.guess)
    .map((entry, row) => {
      const reading = compassReading(state.secret, entry.guess);
      let pick = picks[row];
      if (!Number.isInteger(pick) || pick < 0 || !reading[pick] || reading[pick] === "G") {
        const open = reading.map((value, index) => (value && value !== "G" ? index : -1)).filter(index => index >= 0);
        pick = open.length ? open[Math.floor(random() * open.length)] : -1;
        picks[row] = pick;
      }
      return reading.map((value, index) => (index === pick ? value : null));
    });
  powers.alphabetCompassPicks = picks;
}

module.exports = { compassReading, refreshCompass };
