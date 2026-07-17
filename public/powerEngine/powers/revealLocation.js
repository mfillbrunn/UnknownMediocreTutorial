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
  //
  // The peeked position + letter is rendered persistently in the guesser's
  // remaining-words box (see renderGuesserRemainingBox) — right alongside the
  // "words left" count — rather than as a transient popup or a thin badge.
});
