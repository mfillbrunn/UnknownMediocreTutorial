// /powers/powers/revealLocation.js — Informant (guesser)
//
// Always-on, no button. The informant peeks one unknown position and shows
// the guesser the current secret's letter there (server-side, private to
// the guesser via state.powers.revealLocationPeek). Rendered as a status
// badge; the position stays fixed until the guesser turns it green, then
// the server moves the peek elsewhere.
PowerEngine.register("revealLocation", {
  role: "guesser",
  tooltip: {
    title: window.POWER_METADATA.revealLocation.label,
    desc: window.POWER_METADATA.revealLocation.desc
  }
  // No renderButton: passive power.
});

InfoBadgeEngine.register((state, role) => {
  if (!state.activePowers?.includes("revealLocation")) return null;
  const peek = state.powers?.revealLocationPeek;
  if (!peek || typeof peek.index !== "number" || !peek.letter) return null;

  const meta = POWER_METADATA.revealLocation;
  return {
    id: "revealLocation",
    emoji: meta.emoji,
    text: `${meta.label}: position ${peek.index + 1} = ${peek.letter}`,
    color: meta.color,
    priority: 11,
    screen: "guesser",
    details: meta.desc
  };
});
