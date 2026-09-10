// /powers/powers/secretThemesRevealServer.js — Theme Dossier (guesser
// power, Power Choice Rare reward). Same shape as secretThemesServer.js —
// a pure turnStart readout, re-read every turn so a mid-round secret swap
// is reflected rather than shown stale — but reveals EVERY theme the
// secret belongs to instead of just the single most specific one.
//
// Unlike Secret Themes' whole-match unlock, this grant does not survive
// past the round it was picked in (see clearRoundPowerActivity.js) — the
// stronger, one-time reveal trades match-long duration for completeness.
//
// Deliberately excluded from the reward pool whenever the guesser already
// holds the persistent Secret Themes grant (see powerChoiceServer.js's
// powerOptionApplicable) — that grant already shows a label every turn, so
// stacking this on top would just hand over strictly more information for
// the same card slot with no real choice being made.
//
// state.powers.secretThemesRevealLabels is redacted from the setter in
// safeState.js.
const engine = require("../powerEngineServer.js");
const { allThemeLabelsForWord } = require("../../utils/secretThemes");

engine.registerPower("secretThemesReveal", {
  turnStart(state, role) {
    if (role !== state.guesser) return;
    if (state.phase !== "normal") return;
    if (!state.activePowers?.includes("secretThemesReveal")) return;
    if (!state.secret || state.secret.length !== 5) return;

    state.powers.secretThemesRevealLabels = allThemeLabelsForWord(state.secret);
  }
});
