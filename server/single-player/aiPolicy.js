// server/single-player/aiPolicy.js
//
// Resolves a scripted AI word for the current campaign attempt, or
// returns null to mean "use the normal AI" -- callers (server/core/ai/
// runAI.js, at its two opening-pick call sites) fall back to the existing
// aiLogic.pickSecret/pickGuess whenever this returns null, exactly the
// way the existing state._dailyOpeningGuess override already works.
//
// Uses the PERSISTED STAGE ATTEMPT NUMBER (state.singlePlayer.attemptNo),
// not the turn number: attempt 1 -> index 0, attempt 2 -> index 1, and so
// on; once the configured list is exhausted, normal AI takes over. Applies
// independently to AI Secretkeeper starting secrets (simultaneous-phase
// secret pick only -- a later same-round Keep/New pick is not a
// "starting" secret and is never overridden) and AI Guesser opening
// guesses (simultaneous-phase guess pick only).

"use strict";

function scriptedStartingSecret(state) {
  const sp = state.singlePlayer;
  if (!sp?.enabled) return null;

  // A fixed secret is useful for authored tutorials and story encounters.
  // It deliberately wins over the per-attempt list so every retry can use
  // the same answer without duplicating it an arbitrary number of times.
  const fixedSecret = sp.stage.game.ai?.fixedSetterSecret;
  if (fixedSecret) return String(fixedSecret).toUpperCase();

  const byAttempt = sp.stage.game.ai?.setterSecretsByAttempt || [];
  const scripted = byAttempt[(sp.attemptNo || 1) - 1];
  return scripted || null;
}

function scriptedOpeningGuess(state) {
  const sp = state.singlePlayer;
  if (!sp?.enabled) return null;

  const byAttempt = sp.stage.game.ai?.guesserOpeningGuessesByAttempt || [];
  const scripted = byAttempt[(sp.attemptNo || 1) - 1];
  return scripted || null;
}

// Optional later-turn scripting -- turnIndex is how many guesses have
// already landed in the current round (state.history.length). Independent
// of attempt number; absent/exhausted just means "use the normal AI" for
// that turn same as everywhere else here.
function scriptedTurnGuess(state, turnIndex) {
  const sp = state.singlePlayer;
  if (!sp?.enabled) return null;
  return sp.stage.game.ai?.guesserTurnScript?.[turnIndex] || null;
}

function scriptedTurnSecret(state, turnIndex) {
  const sp = state.singlePlayer;
  if (!sp?.enabled) return null;
  return sp.stage.game.ai?.setterSecretScript?.[turnIndex] || null;
}

module.exports = {
  scriptedStartingSecret,
  scriptedOpeningGuess,
  scriptedTurnGuess,
  scriptedTurnSecret
};
