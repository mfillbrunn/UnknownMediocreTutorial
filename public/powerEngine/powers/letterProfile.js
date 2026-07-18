// /powers/powers/letterProfile.js — Letter Profile (guesser)
//
// Always-on, no button — active from the start of the match, no per-turn
// activation. The category (alphabet half / keyboard row / vowel-
// consonant) and the resulting breakdown are rendered as dedicated status
// boxes (see public/client/letterProfile.js) rather than a transient
// popup, matching Informant's always-visible badge treatment.
PowerEngine.register("letterProfile", {
  role: "guesser",
  tooltip: {
    title: window.POWER_METADATA.letterProfile.label,
    desc: window.POWER_METADATA.letterProfile.desc
  }
  // No renderButton: passive power.
});
