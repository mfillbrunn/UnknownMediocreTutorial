// /powers/powers/alphabetCompass.js — Alphabet Compass (guesser reward)
//
// No button: it only ever arrives as a Power Choice reward and fires on
// the spot (server/powers/powers/alphabetCompassServer.js). The board
// itself draws the arrows (ui/history.js); this just labels the turn so
// the arrows read as a power, not a glitch.
InfoBadgeEngine.register((state, role) => {
  if (role !== "guesser" || !state.powers?.alphabetCompassActive) return null;
  const meta = POWER_METADATA.alphabetCompass;
  return {
    id: "alphabetCompass",
    emoji: meta.emoji,
    text: `${meta.label}: ← earlier · → later`,
    color: meta.color,
    priority: 20,
    screen: "guesser"
  };
});
