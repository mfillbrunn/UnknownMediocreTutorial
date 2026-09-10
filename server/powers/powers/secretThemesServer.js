// /powers/powers/secretThemesServer.js — Secret Themes (guesser power,
// Power Choice Rare reward). Always-on, no activation: shows the single
// most specific category the secret currently belongs to, recomputed at
// every turn start rather than snapshotted — the same shape as
// letterProfile's Secret Vowel Count.
//
// Recomputing is the point rather than an implementation detail. The
// Secretkeeper may swap to a New secret mid-round, and a snapshot taken
// when the card was picked would quietly go on describing a word that is
// no longer the answer. Re-reading keeps the label honest, and a label
// that changes between turns is itself the tell that a swap just happened.
//
// Gated on state.guesser the same way letterProfileServer.js is: turn and
// secret are finalized together before the broadcast that follows (see
// transitionAfterSecret / simultaneous.js's early turnStart call), so
// reading here cannot leak a secret the guesser hasn't reached yet.
//
// state.powers.secretThemesLabel is redacted from the setter in
// safeState.js.
const engine = require("../powerEngineServer.js");
const { topThemeLabelForWord } = require("../../utils/secretThemes");

engine.registerPower("secretThemes", {
  turnStart(state, role) {
    if (role !== state.guesser) return;
    if (state.phase !== "normal") return;
    if (!state.activePowers?.includes("secretThemes")) return;
    if (!state.secret || state.secret.length !== 5) return;

    state.powers.secretThemesLabel = topThemeLabelForWord(state.secret);
  }
});
