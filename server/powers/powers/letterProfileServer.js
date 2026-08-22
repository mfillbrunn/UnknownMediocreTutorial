// powers/powers/letterProfileServer.js
//
// Always-on guesser power (no activation) — "Secret Vowel Count" (internal
// id stays letterProfile). Always shows how many of the secret's 5 letters
// are vowels -- a single number, recomputed fresh every turn start rather
// than kept fixed, matching Informant's re-derive pattern.
//
// The actual count is only safe to show the guesser once it's genuinely
// their turn (state.turn updates and state.secret gets finalized
// atomically before the broadcast that follows — see
// transitionAfterSecret/simultaneous.js's early turnStart call — so gating
// on state.guesser here can't leak a secret the guesser hasn't "earned"
// yet).
//
// state.powers.letterProfileGuesserStat is redacted from the setter in
// safeState.js (the setter has their own live equivalent computed from
// their own draft/secret — see safeState.js and socketHandlers.js's
// setterDraftSecret handler).

const engine = require("../powerEngineServer");
const { computeLetterProfileStats } = require("../../utils/letterProfile");

engine.registerPower("letterProfile", {
  turnStart(state, role) {
    if (role !== state.guesser) return;
    if (state.phase !== "normal") return;
    if (!state.activePowers?.includes("letterProfile")) return;
    if (!state.secret || state.secret.length !== 5) return;

    state.powers.letterProfileGuesserStat = computeLetterProfileStats(
      state.secret,
      "vowels"
    );
  }
});
