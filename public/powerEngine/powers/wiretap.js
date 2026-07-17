// /powers/powers/wiretap.js
//
// Always-on guesser power — no button, no activation. Registered only so
// it shows up in the power info panel and Power Library. The actual effect
// (the "Possible: N" box) is driven from state.guesserRemainingBox, built
// server-side in safeState and rendered by renderGuesserRemainingBox().
PowerEngine.register("wiretap", {
  role: "guesser",
  tooltip: {
    title: window.POWER_METADATA.wiretap.label,
    desc: window.POWER_METADATA.wiretap.desc
  }
  // No renderButton: this power is passive, so it never creates a button.
});
