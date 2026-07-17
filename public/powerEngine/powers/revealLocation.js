// /powers/powers/revealLocation.js — Informant (guesser)
//
// Always-on, no button. The actual reveals arrive as GREEN extraConstraints
// (shown on the constraint row) plus a "greenLetterRevealed" popup, both
// driven server-side. Registered here only so it appears in the power info
// panel / Power Library, and to show a small status badge.
PowerEngine.register("revealLocation", {
  role: "guesser",
  tooltip: {
    title: window.POWER_METADATA.revealLocation.label,
    desc: window.POWER_METADATA.revealLocation.desc
  }
  // No renderButton: passive power.
});

InfoBadgeEngine.register((state, role) => {
  const indices = state.powers?.revealLocationIndices;
  if (!state.activePowers?.includes("revealLocation")) return null;
  if (!Array.isArray(indices) || indices.length === 0) return null;

  const meta = POWER_METADATA.revealLocation;
  const positions = indices
    .slice()
    .sort((a, b) => a - b)
    .map(i => i + 1)
    .join(", ");

  return {
    id: "revealLocation",
    emoji: meta.emoji,
    text: `${meta.label}: position${indices.length > 1 ? "s" : ""} ${positions}`,
    color: meta.color,
    priority: 11,
    screen: "guesser",
    details: meta.desc
  };
});
