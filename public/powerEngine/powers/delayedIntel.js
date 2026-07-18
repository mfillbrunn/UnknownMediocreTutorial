// /powers/powers/delayedIntel.js — Delayed Intel (setter)
//
// Always-on, no button, no per-turn interaction from the setter either —
// active purely as a standing rule for the whole match. The guesser's
// history tiles, constraint row, keyboard coloring, and Wiretap count are
// all masked server-side (see server/utils/delayedFeedback.js and its
// call sites) so there's nothing for this file to compute; it exists so
// the power shows up in the in-round power info panel like every other
// registered power.
PowerEngine.register("delayedIntel", {
  role: "setter",
  tooltip: {
    title: window.POWER_METADATA.delayedIntel.label,
    desc: window.POWER_METADATA.delayedIntel.desc
  }
  // No renderButton: passive power.
});
