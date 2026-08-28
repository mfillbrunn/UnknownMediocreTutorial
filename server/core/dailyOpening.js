// server/core/dailyOpening.js
//
// Daily Challenge (REFINEMENT_SPEC section 3): the AI always opens with the
// day's fixed word (aiOpeningGuess when it's guessing, aiOpeningSecret when
// it's the Secretkeeper) regardless of whether the HUMAN's opening word is
// predefined that day. When the human's own opening word for their role
// this round IS predefined (config.humanOpeningGuess/humanOpeningSecret),
// there's nothing left for either side to actually submit -- both openings
// are already fixed, so the round is resolved immediately, once, using the
// exact same scoring/history/turn-transition code a normal submission goes
// through (see simultaneous.js's resolveSimultaneousRound), rather than
// asking the player to re-type a word that was never really a choice.
//
// When the human's word ISN'T predefined that day, this is a complete
// no-op: the player picks freely in the simultaneous phase like any other
// match, and the AI still opens with its own fixed word (see runAI.js).
const { resolveSimultaneousRound } = require("./phases/simultaneous");

function humanRoleThisRound(state) {
  const human = Object.values(state.players || {}).find((p) => !p.isAI);
  return human?.role || null;
}

function maybeResolveDailyOpening(room, state, roomId, context) {
  if (!state.isDaily || state.phase !== "simultaneous") return;
  // Already submitted (a reconnect replaying this hook, or a genuinely
  // freely-chosen opening already in flight) -- never double-resolve.
  if (state.simultaneousSecretSubmitted || state.simultaneousGuessSubmitted) return;

  const config = state._dailyConfig;
  if (!config) return;

  const role = humanRoleThisRound(state);
  if (!role) return;

  const predefinedWord =
    role === "guesser" ? config.humanOpeningGuess : config.humanOpeningSecret;
  if (!predefinedWord) return;

  const secret = role === "setter" ? predefinedWord : config.aiOpeningSecret;
  const guess = role === "guesser" ? predefinedWord : config.aiOpeningGuess;
  if (!secret || !guess) return;

  const { io, powerEngine } = context;

  state.secret = secret;
  state.pendingGuess = guess;
  state.guessCount += 1;
  state.simultaneousSecretSubmitted = true;
  state.simultaneousGuessSubmitted = true;

  // Same hook a real SUBMIT_GUESS fires -- quest progress must be
  // knowable from this opening guess exactly like any other, not skipped
  // because it was auto-resolved.
  powerEngine.onGuessSubmitted(state, guess, roomId, io);

  resolveSimultaneousRound(room, state, roomId, context);
}

module.exports = { maybeResolveDailyOpening };
